// The news builder's pure parts (tools/news/lib.mjs): reading feeds, choosing
// an edition, the fun fact, and which days are kept. No network.
// Needs the builder's own packages: cd tools/news && npm ci
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FIX = path.join(__dirname, "fixtures", "news");
let lib, PLAN;
before(async () => {
  lib = await import("../tools/news/lib.mjs");
  ({ PLAN } = await import("../tools/news/sources.mjs"));
});

const NOW = new Date("2026-11-24T01:17:00Z");

test("an RSS feed becomes plain stories: text cleaned, best picture, dates", () => {
  const stories = lib.parseFeed(fs.readFileSync(path.join(FIX, "rss.xml"), "utf8"), { topic: "world", name: "Example" });
  assert.equal(stories.length, 3);
  const [first, , third] = stories;
  assert.equal(first.title, 'Leaders meet for "crucial" climate talks');
  assert.equal(first.summary, "Talks begin in Geneva & run all week.");
  assert.equal(first.url, "https://www.example.com/news/world-1?at_medium=RSS");
  assert.equal(first.image, "https://ichef.bbci.co.uk/ace/standard/800/cpsprodpb/abc/live/x.jpg", "BBC pictures are asked for wider");
  assert.equal(first.publishedAt, "2026-11-23T09:30:00.000Z");
  assert.equal(first.video, null);
  assert.equal(third.image, "https://img.example.com/big.jpg", "the widest media:content");
  assert.equal(third.topic, "world");
  assert.equal(third.source, "Example");
});

test("a YouTube channel feed becomes video stories that play from YouTube", () => {
  const stories = lib.parseFeed(fs.readFileSync(path.join(FIX, "youtube.xml"), "utf8"), { topic: "animals", name: "Pets" });
  assert.equal(stories.length, 2);
  assert.deepEqual(stories[0].video, { provider: "youtube", id: "dQw4w9WgXcQ" });
  assert.equal(stories[0].url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(stories[0].image, "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  assert.equal(stories[0].summary, "They became best friends. Subscribe for more!");
});

test("a source's match keeps only the stories it fits", () => {
  const stories = lib.parseFeed(fs.readFileSync(path.join(FIX, "rss.xml"), "utf8"), { topic: "animals", name: "Sci", match: /climate/i });
  assert.deepEqual(stories.map((s) => s.title), ['Leaders meet for "crucial" climate talks']);
});

test("a broken feed gives no stories instead of failing the run", () => {
  assert.deepEqual(lib.parseFeed("<html>not a feed", { topic: "world", name: "X" }), []);
});

// Stories for one topic and source, n of them, an hour apart from `start`.
function make(topic, source, n, { video = false, start = NOW.getTime() - 36e5, prefix = `${topic}-${source}` } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    topic,
    source,
    title: `${prefix} story ${i + 1}`,
    url: `https://${source.toLowerCase().replace(/\W/g, "")}.example/${prefix}-${i + 1}`,
    summary: "",
    image: null,
    publishedAt: new Date(start - i * 36e5).toISOString(),
    video: video ? { provider: "youtube", id: `${prefix}${i}`.replace(/\W/g, "").padEnd(11, "x").slice(0, 11) } : null
  }));
}

test("an edition is nine stories: each topic's share, with videos where planned", () => {
  const candidates = [
    ...make("world", "A", 5), ...make("world", "B", 5), ...make("world", "VA", 3, { video: true }),
    ...make("tech", "C", 5), ...make("tech", "VC", 3, { video: true }),
    ...make("funny", "D", 5), ...make("funny", "E", 5),
    ...make("animals", "F", 5), ...make("animals", "VF", 3, { video: true })
  ];
  const items = lib.pickEdition(candidates, { plan: PLAN, now: NOW });
  assert.equal(items.length, 9);
  const count = (pred) => items.filter(pred).length;
  for (const p of PLAN) assert.equal(count((s) => s.topic === p.topic), p.count, p.topic);
  for (const p of PLAN) assert.equal(count((s) => s.topic === p.topic && s.video), p.videos, `${p.topic} videos`);
  assert.equal(count((s) => s.side === "light"), 4);
  assert.equal(count((s) => s.side === "serious"), 5);
  // Sources take turns: world's two articles come from A and B.
  assert.deepEqual(items.filter((s) => s.topic === "world" && !s.video).map((s) => s.source).sort(), ["A", "B"]);
  assert.equal(new Set(items.map((s) => s.id)).size, 9, "ids are unique");
});

test("stories older than a week, already shown, or live streams are left out", () => {
  const old = make("world", "A", 2, { start: NOW.getTime() - 8 * 864e5, prefix: "old" });
  const shown = make("world", "A", 1, { prefix: "shown" });
  const live = { ...make("world", "V", 1, { video: true, prefix: "live" })[0], title: "LIVE: the summit" };
  const ok = make("world", "B", 1, { start: NOW.getTime() - 6 * 864e5, prefix: "ok" });
  const used = new Set(lib.keysOf(shown[0]));
  const items = lib.pickEdition([...old, ...shown, live, ...ok], { plan: PLAN, used, now: NOW });
  assert.deepEqual(items.map((s) => s.title), ["ok story 1"]);
});

test("the same story from two sources appears once", () => {
  const a = make("world", "A", 1, { prefix: "same" })[0];
  const b = { ...a, source: "B", url: "https://b.example/other-address" };
  const items = lib.pickEdition([a, b], { plan: PLAN, now: NOW });
  assert.equal(items.length, 1);
});

test("a topic short of stories hands its places to its own side first", () => {
  const candidates = [...make("world", "A", 10), ...make("tech", "C", 10), ...make("funny", "D", 10), ...make("animals", "F", 1)];
  const items = lib.pickEdition(candidates, { plan: PLAN, now: NOW });
  assert.equal(items.length, 9);
  assert.equal(items.filter((s) => s.side === "light").length, 4, "funny fills the animals gap");
  assert.equal(items.filter((s) => s.topic === "funny").length, 3);
});

test("the fun fact is a new one each day, with the built-in list as the fallback", () => {
  const offered = [{ text: "Repeated fact from yesterday, quite long." }, { text: "A <b>fresh</b> fact that nobody has seen." }];
  assert.equal(lib.pickFact(offered, { usedFacts: new Set(["Repeated fact from yesterday, quite long."]), fallback: [], date: "2026-11-24" }).text, "A fresh fact that nobody has seen.");
  const fallback = ["Fact one is here.", "Fact two is here.", "Fact three is here."];
  const a = lib.pickFact([], { fallback, date: "2026-11-24" });
  const b = lib.pickFact([], { fallback, date: "2026-11-25" });
  assert.notEqual(a.text, b.text, "next day, next fact");
  const c = lib.pickFact([], { fallback, usedFacts: new Set([a.text]), date: "2026-11-24" });
  assert.notEqual(c.text, a.text, "skips one used this week");
});

test("seven days are kept, counting today; older editions are deleted", () => {
  const days = ["2026-11-24", "2026-11-23", "2026-11-18", "2026-11-17", "2026-11-10", "index"];
  const { keep, drop } = lib.daysToKeep(days, "2026-11-24");
  assert.deepEqual(keep, ["2026-11-24", "2026-11-23", "2026-11-18"]);
  assert.deepEqual(drop.sort(), ["2026-11-10", "2026-11-17"]);
});

test("the edition date follows the chosen time zone", () => {
  const late = new Date("2026-11-24T21:30:00Z");
  assert.equal(lib.editionDate(late, "UTC"), "2026-11-24");
  assert.equal(lib.editionDate(late, "Asia/Tashkent"), "2026-11-25");
});

test("article text: enough paragraphs to read, or nothing", () => {
  assert.equal(lib.paragraphsFrom(["Short.", "Advertisement"]), null);
  const long = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} ${"words ".repeat(20)}`);
  const out = lib.paragraphsFrom([...long, "Subscribe to our newsletter"]);
  assert.equal(out.length, 8);
  assert.ok(!out.some((p) => /Subscribe/.test(p)));
});
