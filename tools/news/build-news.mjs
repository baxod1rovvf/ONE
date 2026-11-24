// Builds today's news edition for Core: news/<date>.json, plus news/index.json
// listing the days kept. Editions older than seven days are deleted.
// Run daily by .github/workflows/news.yml; by hand: npm ci && node build-news.mjs
//
// Environment:
//   NEWS_TZ     time zone that decides the edition's date (default UTC)
//   NEWS_FORCE  "1" rebuilds today's edition even if it exists
//   NEWS_DIR    where editions go (default: news/ at the repo root)
import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { PLAN, SOURCES, youtubeFeed, FACT_TODAY, FACT_RANDOM } from "./sources.mjs";
import { FACTS } from "./facts.mjs";
import { parseFeed, pickEdition, pickFact, editionDate, daysToKeep, keysOf, paragraphsFrom, upgradeImage, cleanText } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.NEWS_DIR ? path.resolve(process.env.NEWS_DIR) : path.join(HERE, "..", "..", "news");
const TZ = process.env.NEWS_TZ || "UTC";
const FORCE = process.env.NEWS_FORCE === "1";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const log = (...a) => console.log(...a);

async function get(url, { timeout = 15e3, accept = "*/*" } = {}) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function readJSON(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function readFeeds() {
  const results = await Promise.all(
    SOURCES.map(async (src) => {
      const url = src.youtube ? youtubeFeed(src.youtube) : src.url;
      try {
        const xml = await (await get(url, { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" })).text();
        const stories = parseFeed(xml, src);
        log(`  ok    ${src.topic.padEnd(8)} ${src.name}${src.youtube ? " (YouTube)" : ""}: ${stories.length}`);
        return stories;
      } catch (e) {
        log(`  FAIL  ${src.topic.padEnd(8)} ${src.name}${src.youtube ? " (YouTube)" : ""}: ${e.message} — ${url}`);
        return [];
      }
    })
  );
  return results.flat();
}

// The article's own text, so it can be read inside Core, and its picture
// when the feed had none. Missing either is fine: the summary and the link
// to the original still work.
async function readArticle(story) {
  try {
    const html = await (await get(story.url, { accept: "text/html" })).text();
    const dom = new JSDOM(html, { url: story.url, virtualConsole: new VirtualConsole() });
    const doc = dom.window.document;
    const og = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
    const image = og && og.getAttribute("content");
    const article = new Readability(doc).parse();
    let body = null;
    if (article && article.content) {
      const frag = new JSDOM(article.content, { virtualConsole: new VirtualConsole() }).window.document;
      body = paragraphsFrom([...frag.querySelectorAll("p, h2, h3, li, blockquote")].filter((el) => !el.querySelector("p, li")).map((el) => el.textContent));
    }
    dom.window.close();
    return { body, image: image && /^https:\/\//.test(image) ? upgradeImage(image) : null };
  } catch (e) {
    log(`  (no article text for ${story.url}: ${e.message})`);
    return { body: null, image: null };
  }
}

async function offeredFacts() {
  const out = [];
  for (const [i, url] of [FACT_TODAY, FACT_RANDOM, FACT_RANDOM, FACT_RANDOM].entries()) {
    try {
      const f = await (await get(url, { accept: "application/json" })).json();
      if (f && f.text) out.push({ text: f.text, url: f.source_url || f.permalink || null, source: f.source || null });
    } catch (e) {
      if (i === 0) log(`  fact service: ${e.message}`);
      break;
    }
  }
  return out;
}

async function main() {
  const now = new Date();
  const date = editionDate(now, TZ);
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, `${date}.json`);
  let wrote = false;
  if (existsSync(file) && !FORCE) {
    log(`The ${date} edition already exists. Set NEWS_FORCE=1 to rebuild it.`);
  } else {
    // What earlier editions in the past week already showed.
    const files = (await readdir(DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${date}.json`);
    const used = new Set();
    const usedFacts = new Set();
    for (const f of files) {
      const ed = await readJSON(path.join(DIR, f));
      if (!ed) continue;
      for (const s of ed.items || []) keysOf(s).forEach((k) => used.add(k));
      if (ed.fact && ed.fact.text) usedFacts.add(ed.fact.text);
    }

    log("Feeds:");
    const candidates = await readFeeds();
    const items = pickEdition(candidates, { plan: PLAN, used, now });
    log(`Picked ${items.length} of ${candidates.length} stories.`);
    if (!items.length) throw new Error("No stories could be read from any source; nothing written.");

    for (const story of items) {
      if (story.video) continue;
      const { body, image } = await readArticle(story);
      story.body = body;
      if (!story.image && image) story.image = image;
      if (!story.summary && body) story.summary = cleanText(body[0]).slice(0, 320);
    }

    const fact = pickFact(await offeredFacts(), { usedFacts, fallback: FACTS, date });
    const edition = {
      date,
      generatedAt: now.toISOString(),
      fact,
      items: items.map((s) => ({
        id: s.id,
        side: s.side,
        topic: s.topic,
        title: s.title,
        summary: s.summary || "",
        body: s.body || null,
        image: s.image || null,
        url: s.url,
        source: s.source,
        publishedAt: s.publishedAt,
        video: s.video || null
      }))
    };
    await writeFile(file, JSON.stringify(edition, null, 1) + "\n");
    wrote = true;
    log(`Wrote ${path.relative(process.cwd(), file)}:`);
    for (const s of edition.items) log(`  [${s.side}/${s.topic}] ${s.video ? "▶ " : ""}${s.title} — ${s.source}${s.body ? "" : " (summary only)"}`);
    log(`  Fun fact: ${fact ? fact.text : "(none)"}`);
  }

  // Keep the past seven days; list them for Core.
  const days = (await readdir(DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10));
  const { keep, drop } = daysToKeep(days, date);
  for (const d of drop) {
    await unlink(path.join(DIR, `${d}.json`));
    log(`Deleted the ${d} edition (older than a week).`);
  }
  const index = { updated: now.toISOString(), days: keep };
  const indexFile = path.join(DIR, "index.json");
  const prev = await readJSON(indexFile);
  if (wrote || !prev || JSON.stringify(prev.days) !== JSON.stringify(keep)) {
    await writeFile(indexFile, JSON.stringify(index, null, 1) + "\n");
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
