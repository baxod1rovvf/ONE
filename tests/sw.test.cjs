// Runs sw.js in Node against a fake network and cache, to check how it treats
// media range requests, the Keep-offline cache and other sites.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BODY = "0123456789";

function makeWorld({ offline = {}, media = {} } = {}) {
  const stores = { "one-quran-offline": new Map(Object.entries(offline)), "one-media": new Map(Object.entries(media)) };
  const puts = [];
  const fetched = [];
  const keyOf = (r) => (typeof r === "string" ? r : r.url);
  const store = (name) => {
    if (!stores[name]) stores[name] = new Map();
    const m = stores[name];
    return {
      match: async (r) => {
        const hit = m.get(keyOf(r));
        return hit ? hit.clone() : undefined;
      },
      put: async (r, res) => {
        puts.push({ cache: name, url: keyOf(r), status: res.status });
        m.set(keyOf(r), res);
      },
      addAll: async () => {},
      delete: async (r) => m.delete(keyOf(r))
    };
  };
  const caches = {
    open: async (name) => store(name),
    match: async (r) => {
      for (const m of Object.values(stores)) if (m.has(keyOf(r))) return m.get(keyOf(r)).clone();
      return undefined;
    },
    keys: async () => Object.keys(stores),
    delete: async (name) => delete stores[name]
  };
  // A media server that honours byte ranges.
  const fakeFetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : new Request(input, init);
    fetched.push({ url: req.url, range: req.headers.get("range") });
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.get("range") || "");
    if (!range) return new Response(BODY, { status: 200, headers: { "content-type": "audio/mpeg" } });
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : BODY.length - 1;
    return new Response(BODY.slice(start, end + 1), { status: 206, headers: { "content-range": `bytes ${start}-${end}/${BODY.length}`, "content-type": "audio/mpeg" } });
  };
  const handlers = {};
  const self = { location: { origin: "https://one.example" }, addEventListener: (type, fn) => (handlers[type] = fn), skipWaiting: () => {}, clients: { claim: () => {} } };
  const ctx = vm.createContext({ self, caches, fetch: fakeFetch, Response, Request, Headers, URL, console, Promise });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"), ctx);
  async function dispatch(url, headers = {}) {
    const waits = [];
    const event = {
      request: new Request(url, { headers }),
      responded: null,
      respondWith(p) {
        this.responded = Promise.resolve(p);
      },
      waitUntil(p) {
        waits.push(p);
      }
    };
    handlers.fetch(event);
    const res = event.responded ? await event.responded : null;
    await Promise.all(waits);
    return res;
  }
  return { dispatch, puts, fetched, stores };
}

const COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/Sound%20of%20rain.ogg";
const SURAH = "https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/1.mp3";

test("a media range request is never stored as a partial (206) response", async () => {
  const w = makeWorld();
  const res = await w.dispatch(COMMONS, { range: "bytes=0-" });
  assert.ok(res === null || res.status === 206 || res.status === 200);
  assert.equal(w.puts.filter((p) => p.status === 206).length, 0, JSON.stringify(w.puts));
});

test("a played recording is cached whole, then later range requests are answered from it", async () => {
  const w = makeWorld();
  await w.dispatch(COMMONS, { range: "bytes=0-" });
  assert.ok(w.puts.some((p) => p.url === COMMONS && p.status === 200), "whole file cached once played");
  const before = w.fetched.length;
  const res = await w.dispatch(COMMONS, { range: "bytes=2-5" });
  assert.equal(res.status, 206);
  assert.equal(await res.text(), "2345");
  assert.equal(res.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(w.fetched.length, before, "served without the network");
});

test("a surah kept offline answers range requests with the right slice", async () => {
  const w = makeWorld({ offline: { [SURAH]: new Response(BODY, { status: 200, headers: { "content-type": "audio/mpeg" } }) } });
  const res = await w.dispatch(SURAH, { range: "bytes=4-" });
  assert.equal(res.status, 206);
  assert.equal(await res.text(), "456789");
  assert.equal(res.headers.get("content-range"), "bytes 4-9/10");
});

test("other sites (like Supabase sync) are left alone", async () => {
  const w = makeWorld();
  const res = await w.dispatch("https://abcd.supabase.co/rest/v1/rpc/one_pull");
  assert.equal(res, null);
});
