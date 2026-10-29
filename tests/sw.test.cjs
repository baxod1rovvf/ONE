// Runs sw.js in Node against a fake network and cache, to check how it treats
// media range requests, the Keep-offline cache and other sites.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BODY = "0123456789";

function makeWorld({ offline = {}, media = {}, app = {} } = {}) {
  const stores = { "one-quran-offline": new Map(Object.entries(offline)), "one-media": new Map(Object.entries(media)), "one-v7": new Map(Object.entries(app)) };
  const opened = [];
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
    open: async (name) => (opened.push(name), store(name)),
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
  const self = { location: { origin: "https://one.example", href: "https://one.example/sw.js" }, addEventListener: (type, fn) => (handlers[type] = fn), skipWaiting: () => {}, clients: { claim: () => {} } };
  const ctx = vm.createContext({ self, caches, fetch: fakeFetch, Response, Request, Headers, URL, console, Promise });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"), ctx);
  // A page load has mode "navigate", which a Request can't be built with.
  async function dispatch(url, headers = {}, { navigate = false } = {}) {
    const waits = [];
    const base = new Request(url, { headers });
    const request = navigate ? new Proxy(base, { get: (t, k) => (k === "mode" ? "navigate" : typeof t[k] === "function" ? t[k].bind(t) : t[k]) }) : base;
    const event = {
      request,
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
  async function install() {
    const waits = [];
    handlers.install({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  }
  return { dispatch, install, puts, fetched, stores, opened };
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

// ---------- Starting from the saved copy ----------

const PAGE = "https://one.example/index.html";
const saved = (text) => new Response(text, { status: 200, headers: { "content-type": "text/html" } });

test("a page load is answered from the saved copy, without the network", async () => {
  const w = makeWorld({ app: { [PAGE]: saved("old") } });
  const res = await w.dispatch("https://one.example/", {}, { navigate: true });
  assert.equal(await res.text(), "old");
  assert.equal(w.fetched.length, 0);
});

test("a first visit loads the page from the network and saves it", async () => {
  const w = makeWorld();
  const res = await w.dispatch("https://one.example/index.html", {}, { navigate: true });
  assert.equal(await res.text(), BODY);
  assert.ok(w.puts.some((p) => p.cache === "one-v7" && p.url === PAGE), JSON.stringify(w.puts));
});

test("saved app files are used without a background fetch", async () => {
  const js = "https://one.example/games/games.js";
  const w = makeWorld({ app: { [js]: saved("games") } });
  const res = await w.dispatch(js);
  assert.equal(await res.text(), "games");
  assert.equal(w.fetched.length, 0);
});

test("fresh requests always reach the network and are not saved by the worker", async () => {
  const w = makeWorld({ app: { [PAGE]: saved("old") } });
  const res = await w.dispatch(PAGE, { "x-one-fresh": "1" });
  assert.equal(await res.text(), BODY);
  assert.equal(w.fetched.length, 1);
  assert.equal(w.puts.length, 0);
});

test("the app cache is one-v7", async () => {
  const w = makeWorld();
  await w.install();
  assert.ok(w.opened.includes("one-v7"), JSON.stringify(w.opened));
});
