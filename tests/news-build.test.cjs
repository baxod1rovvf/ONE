// The news builder's pure parts (tools/news/lib.mjs): reading feeds, choosing
// an edition, the fun fact, and which days are kept. No network.
// Needs the builder's own packages: cd tools/news && npm ci
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FIX = path.join(__dirname, "fixtures", "news");
let lib, PLAN, uz, fb, FACTS;
before(async () => {
  lib = await import("../tools/news/lib.mjs");
  uz = await import("../tools/news/uzbek.mjs");
  ({ PLAN } = await import("../tools/news/sources.mjs"));
  fb = await import("../tools/news/football.mjs");
  ({ FACTS } = await import("../tools/news/facts.mjs"));
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
  assert.equal(stories[0].summary, "They became best friends.", "without the \"subscribe\" line");
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
    video: video ? { provider: "youtube", id: ([...prefix].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36).slice(0, 6) + String(i).padStart(5, "0")).slice(0, 11) } : null
  }));
}

// A plan of several topics, for testing how the picker shares out places
// (the real plan, football only, is tested further down).
const TEST_PLAN = [
  { topic: "trending", side: "trending", count: 3, videos: 0 },
  { topic: "uzbekistan", side: "uzbekistan", count: 3, videos: 0 },
  { topic: "world", side: "serious", count: 3, videos: 1 },
  { topic: "tech", side: "serious", count: 2, videos: 1 },
  { topic: "funny", side: "light", count: 2, videos: 0 },
  { topic: "animals", side: "light", count: 2, videos: 1 }
];

// Plenty of stories for every topic in the plan: articles from two sources,
// and videos where the plan wants them.
function plenty() {
  return TEST_PLAN.flatMap((p) => [
    ...make(p.topic, `${p.topic}A`, 5),
    ...make(p.topic, `${p.topic}B`, 5),
    ...(p.videos ? make(p.topic, `${p.topic}V`, 3, { video: true }) : [])
  ]);
}

test("each topic gets its share, with videos where planned", () => {
  const items = lib.pickEdition(plenty(), { plan: TEST_PLAN, now: NOW });
  assert.equal(items.length, 15);
  const count = (pred) => items.filter(pred).length;
  for (const p of TEST_PLAN) assert.equal(count((s) => s.topic === p.topic), p.count, p.topic);
  for (const p of TEST_PLAN) assert.equal(count((s) => s.topic === p.topic && s.video), p.videos, `${p.topic} videos`);
  assert.equal(count((s) => s.side === "light"), 4);
  assert.equal(count((s) => s.side === "serious"), 5);
  for (const side of ["trending", "uzbekistan"]) assert.equal(count((s) => s.side === side), 3, side);
  // Sources take turns: world's two articles come from both sources.
  assert.deepEqual(items.filter((s) => s.topic === "world" && !s.video).map((s) => s.source).sort(), ["worldA", "worldB"]);
  assert.equal(new Set(items.map((s) => s.id)).size, 15, "ids are unique");
});

test("stories older than a week, already shown, or live streams are left out", () => {
  const old = make("world", "A", 2, { start: NOW.getTime() - 8 * 864e5, prefix: "old" });
  const shown = make("world", "A", 1, { prefix: "shown" });
  const live = { ...make("world", "V", 1, { video: true, prefix: "live" })[0], title: "LIVE: the summit" };
  const ok = make("world", "B", 1, { start: NOW.getTime() - 6 * 864e5, prefix: "ok" });
  const used = new Set(lib.keysOf(shown[0]));
  const items = lib.pickEdition([...old, ...shown, live, ...ok], { plan: TEST_PLAN, used, now: NOW });
  assert.deepEqual(items.map((s) => s.title), ["ok story 1"]);
});

test("the same story from two sources appears once", () => {
  const a = make("world", "A", 1, { prefix: "same" })[0];
  const b = { ...a, source: "B", url: "https://b.example/other-address" };
  const items = lib.pickEdition([a, b], { plan: TEST_PLAN, now: NOW });
  assert.equal(items.length, 1);
});

test("a topic short of stories hands its places to its own side first", () => {
  const candidates = plenty().filter((s) => s.topic !== "animals" || s.source === "animalsA").filter((s) => s.topic !== "animals" || s.title.endsWith(" 1"));
  const items = lib.pickEdition(candidates, { plan: TEST_PLAN, now: NOW });
  assert.equal(items.length, 15);
  assert.equal(items.filter((s) => s.side === "light").length, 4, "funny fills the animals gap");
  assert.equal(items.filter((s) => s.topic === "funny").length, 3);
});

test("the fun fact is the next one each day, never one from the past week", () => {
  const facts = [{ title: "One" }, { title: "Two" }, { title: "Three" }];
  const a = lib.factOfDay(facts, { date: "2026-11-24" });
  const b = lib.factOfDay(facts, { date: "2026-11-25" });
  assert.notEqual(a.title, b.title, "next day, next fact");
  const c = lib.factOfDay(facts, { used: new Set([a.title]), date: "2026-11-24" });
  assert.notEqual(c.title, a.title, "skips one shown this week");
});

test("every fun fact has a headline, a sentence and a Wikipedia article", () => {
  assert.ok(FACTS.length >= 60, `${FACTS.length} facts: two months without a repeat`);
  for (const f of FACTS) {
    assert.ok(f.title && f.title.length <= 60, `short headline: ${f.title}`);
    assert.ok(f.text && f.text.length >= 20 && f.text.length <= 200, `one or two sentences: ${f.title}`);
    assert.ok(f.wiki && !/^https?:/.test(f.wiki), `an article title: ${f.title}`);
  }
  assert.equal(new Set(FACTS.map((f) => f.title)).size, FACTS.length, "no fact twice");
});

test("the fact's photo: Wikipedia's original when sensible, else a wider thumbnail", () => {
  assert.equal(lib.wikiImage({ originalimage: { source: "https://upload.wikimedia.org/a.jpg", width: 1200 } }), "https://upload.wikimedia.org/a.jpg");
  assert.equal(lib.wikiImage({ originalimage: { source: "https://upload.wikimedia.org/huge.jpg", width: 6000 }, thumbnail: { source: "https://upload.wikimedia.org/thumb/x/320px-Horse.jpg" } }), "https://upload.wikimedia.org/thumb/x/960px-Horse.jpg");
  assert.equal(lib.wikiThumb({ thumbnail: { source: "https://upload.wikimedia.org/thumb/x/320px-Horse.jpg" } }), "https://upload.wikimedia.org/thumb/x/320px-Horse.jpg");
  assert.equal(lib.wikiImage({}), null);
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
  const picked = lib.pickEdition([{ ...stories[1], publishedAt: "2026-11-24T05:00:00.000Z" }, top], { plan: TEST_PLAN, now: later });
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
  const picked = lib.pickEdition([{ ...story, publishedAt: new Date(NOW.getTime() - 36e5).toISOString() }, ...own], { plan: TEST_PLAN, now: NOW });
  assert.deepEqual(picked.slice(0, 3).map((s) => s.source), ["Daryo", "Daryo", "Daryo"], "older stories from a main source win over a newer fallback");
  assert.ok(!("fallback" in picked[0]));
  const few = lib.pickEdition([{ ...story, publishedAt: NOW.toISOString() }, ...own.slice(0, 2)], { plan: TEST_PLAN, now: NOW });
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

// ---------- Football only ----------

test("an edition is 10 blocks: 6 moments (videos) and 4 news stories", () => {
  const candidates = [
    ...make("moments", "Premier League", 8, { video: true }),
    ...make("moments", "FIFA", 8, { video: true }),
    ...make("news", "BBC Sport", 5),
    ...make("news", "Kun.uz", 5)
  ];
  const items = lib.pickEdition(candidates, { plan: PLAN, now: NOW });
  assert.equal(items.length, 10);
  assert.equal(items.filter((s) => s.topic === "moments" && s.video).length, 6, "60% moments, all videos");
  assert.equal(items.filter((s) => s.topic === "news").length, 4, "40% news");
});

test("a classic goal can be weeks old; news must be from the past week", () => {
  const oldGoal = make("moments", "FIFA", 1, { video: true, start: NOW.getTime() - 40 * 864e5, prefix: "classic" });
  const tooOld = make("moments", "FIFA", 1, { video: true, start: NOW.getTime() - 70 * 864e5, prefix: "ancient" });
  const oldNews = make("news", "BBC Sport", 1, { start: NOW.getTime() - 10 * 864e5, prefix: "stale" });
  const items = lib.pickEdition([...oldGoal, ...tooOld, ...oldNews], { plan: PLAN, now: NOW });
  assert.deepEqual(items.map((s) => s.title), ["classic story 1"]);
});

test("a moment channel's other videos are only used when moments run short", async () => {
  const { MOMENT } = await import("../tools/news/sources.mjs");
  assert.ok(MOMENT.test("Top 10 Premier League goals of the season"));
  assert.ok(MOMENT.test("Ronaldinho skills that shocked the world"));
  assert.ok(!MOMENT.test("Pep Guardiola press conference"));
  const moments = make("moments", "FIFA", 3, { video: true, prefix: "goal" });
  const other = make("moments", "FIFA", 6, { video: true, prefix: "presser", start: NOW.getTime() }).map((s) => ({ ...s, fallback: true }));
  const news = make("news", "BBC Sport", 4);
  const items = lib.pickEdition([...other, ...moments, ...news], { plan: PLAN, now: NOW });
  const picked = items.filter((s) => s.topic === "moments").map((s) => s.title);
  assert.deepEqual(picked.slice(0, 3).sort(), ["goal story 1", "goal story 2", "goal story 3"], "real moments first, though older");
  assert.equal(picked.length, 6, "the rest filled from the other videos");
});

test("short titles: kind, year, player, team", () => {
  const t = (topic, title, summary = "") => fb.shortTitle({ topic, title, summary }, title);
  assert.equal(t("moments", "Messi's incredible solo goal vs Getafe 2007"), "Gol - 2007 - Messi");
  assert.equal(t("moments", "Every Thierry Henry goal vs Manchester United"), "Gol - Henry - Manchester United");
  assert.equal(t("moments", "Ronaldinho skills that shocked the world"), "Dribling - Ronaldinho", "Ronaldinho isn't also Ronaldo");
  assert.equal(t("news", "Wirtz joins Liverpool in £116m deal"), "Transfer - Wirtz - Liverpool");
  assert.equal(t("news", "Saka ruled out for six weeks with hamstring injury"), "Jarohat - Saka");
  assert.equal(t("news", "Arsenal 2-0 Tottenham: Gyokeres double"), "Natija - Arsenal - Tottenham", "a result names both teams");
  assert.equal(t("news", "Paxtakor Navbahorni 3:1 hisobida mag‘lub etdi"), "Natija - Paxtakor - Navbahor", "Uzbek endings");
  assert.equal(t("news", "Inter Miami sign new striker"), "Transfer - Inter Miami", "Inter Miami isn't also Inter");
  // No known name: the (Uzbek) title, shortened.
  const long = fb.shortTitle({ topic: "news", title: "Federation announces a new stadium plan for the capital city next year" }, "Federatsiya poytaxt uchun kelasi yili yangi stadion rejasini eʼlon qildi");
  assert.match(long, /^Yangilik - Federatsiya poytaxt uchun/);
  assert.ok(long.length <= 62, long);
});

test("video titles lose channel names, hashtags and emoji", () => {
  assert.equal(fb.cleanVideoTitle("WHAT A GOAL 😱 | Premier League #shorts"), "WHAT A GOAL");
  assert.equal(fb.cleanVideoTitle("Messi vs Getafe | Classic | FC Barcelona"), "Messi vs Getafe - Classic");
  assert.equal(lib.videoText("Messi scores a beauty.\nSubscribe: https://yt.com\nFollow us on Instagram\n#UCL"), "Messi scores a beauty.");
});

test("moments are mixed in among the news", () => {
  assert.deepEqual(fb.interleave([1, 2, 3, 4, 5, 6], ["a", "b", "c", "d"]), [1, "a", 2, "b", 3, 4, "c", 5, "d", 6]);
  assert.deepEqual(fb.interleave([1, 2], []), [1, 2]);
});

test("videos from the same site aren't taken for the same story", () => {
  const a = { topic: "moments", source: "FIFA", title: "Goal one", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", video: { provider: "youtube", id: "aaaaaaaaaaa" }, publishedAt: NOW.toISOString() };
  const b = { ...a, title: "Goal two", url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", video: { provider: "youtube", id: "bbbbbbbbbbb" } };
  assert.equal(lib.pickEdition([a, b], { plan: PLAN, now: NOW }).length, 2);
});

test("real titles from the first football edition", () => {
  const t = (topic, title, summary = "") => fb.shortTitle({ topic, title: fb.cleanVideoTitle(title), summary }, title);
  assert.equal(t("moments", "Austria Start Strong Against Debutants Jordan - 2026 World Cup EXTENDED HIGHLIGHTS", "All goals from Austria vs Jordan"), "Gol - 2026 - Austriya - Iordaniya");
  assert.equal(t("moments", "Amazing run by @AlejandroBalde_"), "Dribling - Balde", "a handle becomes a name");
  assert.equal(t("moments", "This looks like you‘re on the pitch when Mikey Moore scores a beauty"), "Gol - Mikey Moore");
  assert.equal(t("moments", "Inside Anfield: Liverpool 4-0 Man Utd - Tunnel scenes"), "Natija - Liverpool - Manchester United");
  assert.equal(t("news", "Papers: Chelsea will push to sign Bournemouth's Scott in January"), "Transfer - Chelsea - Bournemouth");
});

test("boxing and other sports in a football feed are left out", async () => {
  const { NOT_FOOTBALL } = await import("../tools/news/sources.mjs");
  const xml = `<rss version="2.0"><channel>
    <item><title>Hysa aims to win WBC title then take on Fury</title><link>https://sky.example/1</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>Saka back in training</title><link>https://sky.example/2</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const stories = lib.parseFeed(xml, { topic: "news", name: "Sky Sports", exclude: NOT_FOOTBALL });
  assert.deepEqual(stories.map((s) => s.title), ["Saka back in training"]);
});
