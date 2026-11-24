// The news builder's pure parts (tools/news/lib.mjs): reading feeds, choosing
// an edition, the fun fact, and which days are kept. No network.
// Needs the builder's own packages: cd tools/news && npm ci
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FIX = path.join(__dirname, "fixtures", "news");
let lib, PLAN, uz;
before(async () => {
  lib = await import("../tools/news/lib.mjs");
  uz = await import("../tools/news/uzbek.mjs");
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

// Plenty of stories for every topic in the plan: articles from two sources,
// and videos where the plan wants them.
function plenty() {
  return PLAN.flatMap((p) => [
    ...make(p.topic, `${p.topic}A`, 5),
    ...make(p.topic, `${p.topic}B`, 5),
    ...(p.videos ? make(p.topic, `${p.topic}V`, 3, { video: true }) : [])
  ]);
}

test("an edition is eighteen stories: each topic's share, with videos where planned", () => {
  const items = lib.pickEdition(plenty(), { plan: PLAN, now: NOW });
  assert.equal(items.length, 18);
  const count = (pred) => items.filter(pred).length;
  for (const p of PLAN) assert.equal(count((s) => s.topic === p.topic), p.count, p.topic);
  for (const p of PLAN) assert.equal(count((s) => s.topic === p.topic && s.video), p.videos, `${p.topic} videos`);
  assert.equal(count((s) => s.side === "light"), 4);
  assert.equal(count((s) => s.side === "serious"), 5);
  for (const side of ["trending", "uzbekistan", "football"]) assert.equal(count((s) => s.side === side), 3, side);
  // Sources take turns: world's two articles come from both sources.
  assert.deepEqual(items.filter((s) => s.topic === "world" && !s.video).map((s) => s.source).sort(), ["worldA", "worldB"]);
  assert.equal(new Set(items.map((s) => s.id)).size, 18, "ids are unique");
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
  const candidates = plenty().filter((s) => s.topic !== "animals" || s.source === "animalsA").filter((s) => s.topic !== "animals" || s.title.endsWith(" 1"));
  const items = lib.pickEdition(candidates, { plan: PLAN, now: NOW });
  assert.equal(items.length, 18);
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

test("Google Trends: the most searched first, each with a story about it", () => {
  const stories = lib.parseFeed(fs.readFileSync(path.join(FIX, "trends.xml"), "utf8"), { topic: "trending", name: "Google Trends" });
  assert.equal(stories.length, 2);
  const [top] = stories;
  assert.equal(top.title, "Barcelona win the derby & go top of the league");
  assert.equal(top.url, "https://sport.example.com/barcelona-derby");
  assert.equal(top.source, "Sport Example");
  assert.deepEqual(top.trend, { query: "barcelona", traffic: "500K+" });
  assert.equal(top.image, "https://encrypted-tbn1.gstatic.com/images?q=tbn:news");
  assert.equal(top.publishedAt, "2026-11-24T04:40:00.000Z");
  assert.equal(lib.trafficOf("500K+"), 500000);
  assert.equal(lib.trafficOf("2M+"), 2000000);
  // Picked by searches, not by time: the smaller trend is newer here but comes second.
  const later = new Date("2026-11-24T06:00:00Z");
  const picked = lib.pickEdition([{ ...stories[1], publishedAt: "2026-11-24T05:00:00.000Z" }, top], { plan: PLAN, now: later });
  assert.deepEqual(picked.map((s) => s.trend.query), ["barcelona", "weather"]);
  assert.ok(!("rank" in picked[0]), "ranking isn't written to the edition");
});

test("Google News: the publisher, not Google, is the source; fallbacks come last", () => {
  const [story] = lib.parseFeed(fs.readFileSync(path.join(FIX, "google-news.xml"), "utf8"), { topic: "uzbekistan", name: "Google News", lang: "uz", fallback: true });
  assert.equal(story.title, "Toshkentda yangi metro bekati ochildi");
  assert.equal(story.source, "Kun.uz");
  assert.equal(story.lang, "uz");
  assert.equal(story.summary, "", "the link list that repeats the title isn't a summary");
  const own = make("uzbekistan", "Daryo", 3, { start: NOW.getTime() - 5 * 864e5 });
  const picked = lib.pickEdition([{ ...story, publishedAt: new Date(NOW.getTime() - 36e5).toISOString() }, ...own], { plan: PLAN, now: NOW });
  assert.deepEqual(picked.slice(0, 3).map((s) => s.source), ["Daryo", "Daryo", "Daryo"], "older stories from a main source win over a newer fallback");
  assert.ok(!("fallback" in picked[0]));
  const few = lib.pickEdition([{ ...story, publishedAt: NOW.toISOString() }, ...own.slice(0, 2)], { plan: PLAN, now: NOW });
  assert.equal(few.filter((s) => s.source === "Kun.uz").length, 1, "used when the main sources run short");
});

// A pretend translator: upper-cases each text, keeping blank lines between them.
const upper = async (t) => t.toUpperCase();

test("translations go in batches and come back in the right places", async () => {
  const calls = [];
  const texts = ["one", "", "two", "three ".repeat(15).trim(), "four"];
  const out = await lib.translateTexts(texts, async (t) => (calls.push(t), upper(t)), { max: 120 });
  assert.deepEqual(out, ["ONE", "", "TWO", "THREE ".repeat(15).trim(), "FOUR"]);
  assert.equal(calls.length, 1, `${calls.length} requests for 4 texts`);
  const small = [];
  await lib.translateTexts(texts, async (t) => (small.push(t), upper(t)), { max: 40 });
  assert.ok(small.length > 1, "smaller batches take more requests");
});

test("a batch that comes back merged is retried one text at a time", async () => {
  const merge = async (t) => t.toUpperCase().replace(/\n\s*\n/g, " ");
  const out = await lib.translateTexts(["a", "b", "c"], merge);
  assert.deepEqual(out, ["A", "B", "C"]);
});

test("a text that can't be translated is left out, never shifted", async () => {
  const flaky = async (t) => {
    if (t.includes("bad")) throw new Error("no");
    return t.toUpperCase();
  };
  const out = await lib.translateTexts(["good", "bad", "fine"], flaky);
  assert.deepEqual(out, ["GOOD", null, "FINE"]);
  const long = `${"word ".repeat(60)}. ${"more ".repeat(60)}`.trim();
  const [split] = await lib.translateTexts([long], upper, { max: 200 });
  assert.equal(split, long.toUpperCase().replace(/\s+/g, " "), "a very long text is cut in two and joined");
});

test("a story's translation keeps its shape; a half-translated article is dropped", async () => {
  const story = { title: "Title", summary: "Sum", body: ["P1", "P2"] };
  assert.deepEqual(await lib.translateStory(story, (texts) => lib.translateTexts(texts, upper)), { title: "TITLE", summary: "SUM", body: ["P1", "P2"].map((p) => p.toUpperCase()) });
  const partial = (texts) => lib.translateTexts(texts, async (t) => (t === "P2" ? Promise.reject(new Error("x")) : t.includes("P2") ? t.replace("P2", "") : upper(t)));
  const tr = await lib.translateStory(story, partial);
  assert.equal(tr.title, "TITLE");
  assert.ok(!("body" in tr), "no body rather than half of one");
  assert.equal(await lib.translateStory(story, async () => [null, null, null, null]), null);
});

test("Uzbek in the usual Latin spelling, from Cyrillic or the proposed alphabet", () => {
  const t = uz.toUzbekLatin;
  assert.equal(t("Тошкент ҳайвонот боғи Цезарь лақабли орангутанда"), "Toshkent hayvonot bogʻi Sezar laqabli orangutanda");
  assert.equal(t("ЎЗБЕКИСТОН ва Шавкат Мирзиёев"), "OʻZBEKISTON va Shavkat Mirziyoyev");
  assert.equal(t("Ер юзида елка ва бет, эълон"), "Yer yuzida yelka va bet, eʼlon");
  assert.equal(t("AQŞ kongressmenlari Putinni kiritmaslikni söradi, uruşi"), "AQSh kongressmenlari Putinni kiritmaslikni soʻradi, urushi");
  assert.equal(t("O'zbekiston, o‘tadimi, moʼjiza"), "Oʻzbekiston, oʻtadimi, moʼjiza", "apostrophes, but not the tutuq belgisi");
  assert.equal(t("Concert in Paris"), "Concert in Paris");
});

test("an RSS 1.0 (RDF) feed, as DW publishes", () => {
  const xml = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel><title>DW</title></channel>
    <item><title>Summit ends with a deal</title><link>https://www.dw.com/en/a-1</link><description>Leaders agreed.</description><dc:date>2026-11-23T10:00:00Z</dc:date></item>
  </rdf:RDF>`;
  const [s] = lib.parseFeed(xml, { topic: "world", name: "DW" });
  assert.equal(s.title, "Summit ends with a deal");
  assert.equal(s.url, "https://www.dw.com/en/a-1");
  assert.equal(s.publishedAt, "2026-11-23T10:00:00.000Z");
});

test("a <source> without an address (a photo credit, say) isn't taken for the publisher", () => {
  const xml = `<rss version="2.0"><channel><item><title>Hostages in Cartagena</title><link>https://www.france24.com/en/a</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate><source>© Photographer, AP</source></item></channel></rss>`;
  const [s] = lib.parseFeed(xml, { topic: "world", name: "France 24" });
  assert.equal(s.source, "France 24");
});
