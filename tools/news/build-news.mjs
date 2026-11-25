// Builds today's football edition for Core: news/<date>.json, plus
// news/index.json listing the days kept. Editions older than seven days are
// deleted; news/seen.json remembers what was shown for longer, so a goal is
// never shown twice.
// Run daily by .github/workflows/news.yml; by hand: npm ci && node build-news.mjs
//
// Environment:
//   NEWS_TZ     time zone that decides the edition's date (default UTC)
//   NEWS_FORCE  "1" rebuilds today's edition even if it exists
//   NEWS_DIR    where editions go (default: news/ at the repo root)
//   NEWS_NO_TRANSLATE  "1" skips translating into Uzbek
import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import { PLAN, SOURCES, LANGS, youtubeFeed, wikiSummary } from "./sources.mjs";
import { FACTS } from "./facts.mjs";
import { toUzbekLatin } from "./uzbek.mjs";
import { cleanVideoTitle, shortTitle, kindOf, interleave } from "./football.mjs";
import { parseFeed, pickEdition, factOfDay, wikiImage, editionDate, daysToKeep, keysOf, paragraphsFrom, upgradeImage, cleanText, translateTexts, translateStory } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.NEWS_DIR ? path.resolve(process.env.NEWS_DIR) : path.join(HERE, "..", "..", "news");
const TZ = process.env.NEWS_TZ || "UTC";
const FORCE = process.env.NEWS_FORCE === "1";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Google Translate's free web address (the one browser extensions use): no
// key needed. Requests are spaced out, and after repeated failures the run
// stops translating, leaving stories in their own language.
function makeTranslator() {
  let failures = 0;
  let requests = 0;
  const chunk = async (text, from, to) => {
    if (failures >= 6) throw new Error("translation is unavailable for this run");
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t`;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (requests++) await sleep(200);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": UA },
          body: new URLSearchParams({ q: text }),
          signal: AbortSignal.timeout(20e3)
        });
        if (res.status === 429 || res.status >= 500) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const out = (Array.isArray(data) && Array.isArray(data[0]) ? data[0] : []).map((x) => (Array.isArray(x) && typeof x[0] === "string" ? x[0] : "")).join("");
        failures = 0;
        return out;
      } catch (e) {
        if (attempt === 2) {
          failures++;
          throw e;
        }
      }
    }
    failures++;
    throw new Error("translator busy");
  };
  return (from, to) => (texts) => translateTexts(texts, (t) => chunk(t, from, to));
}

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
// when the feed had none: Readability first, then the page's paragraphs,
// then (when the page can't even be parsed) the raw <p> tags. Missing both
// is fine: the summary and the link to the original still work.
async function readArticle(story) {
  let html;
  try {
    html = await (await get(story.url, { accept: "text/html" })).text();
  } catch (e) {
    log(`  (no article text for ${story.url}: ${e.message})`);
    return { body: null, image: null };
  }
  let body = null;
  let image = null;
  const blocks = (root) => [...root.querySelectorAll("p, h2, h3, li, blockquote")].filter((el) => !el.querySelector("p, li")).map((el) => el.textContent);
  try {
    const dom = new JSDOM(html, { url: story.url, virtualConsole: new VirtualConsole() });
    const doc = dom.window.document;
    const og = doc.querySelector('meta[property="og:image"], meta[name="twitter:image"]');
    image = og && og.getAttribute("content");
    try {
      const article = new Readability(doc.cloneNode(true)).parse();
      if (article && article.content) body = paragraphsFrom(blocks(new JSDOM(article.content, { virtualConsole: new VirtualConsole() }).window.document));
    } catch {}
    if (!body) {
      const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
      if (root) body = paragraphsFrom([...root.querySelectorAll("p")].map((p) => p.textContent));
    }
    dom.window.close();
  } catch {}
  if (!body) body = paragraphsFrom([...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => cleanText(m[1])));
  if (!body) log(`  (no article text for ${story.url})`);
  return { body, image: image && /^https:\/\//.test(image) ? upgradeImage(image) : null };
}

// The fact's photo and link, from the Wikipedia article it names.
async function factFromWikipedia(fact) {
  const page = `https://en.wikipedia.org/wiki/${encodeURIComponent(fact.wiki.replace(/ /g, "_"))}`;
  try {
    const summary = await (await get(wikiSummary(fact.wiki), { accept: "application/json" })).json();
    const url = summary && summary.content_urls && summary.content_urls.desktop && summary.content_urls.desktop.page;
    return { image: wikiImage(summary), url: url || page };
  } catch (e) {
    log(`  (no Wikipedia photo for "${fact.wiki}": ${e.message})`);
    return { image: null, url: page };
  }
}

// What was shown, by key, with the day: kept 120 days.
const SEEN_DAYS = 120;
async function readSeen(file, today) {
  const raw = (await readJSON(file)) || {};
  const keys = raw.keys && typeof raw.keys === "object" ? raw.keys : {};
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - SEEN_DAYS * 864e5).toISOString().slice(0, 10);
  const out = {};
  for (const [k, d] of Object.entries(keys)) if (typeof d === "string" && d >= oldest) out[k] = d;
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
    const seenFile = path.join(DIR, "seen.json");
    const seen = await readSeen(seenFile, date);
    // Today's own entries don't count when today's edition is rebuilt.
    const used = new Set(Object.keys(seen).filter((k) => seen[k] !== date));
    const usedFacts = new Set();
    for (const f of files) {
      const ed = await readJSON(path.join(DIR, f));
      if (!ed) continue;
      for (const s of ed.items || []) keysOf(s).forEach((k) => used.add(k));
      if (ed.fact && (ed.fact.key || ed.fact.title)) usedFacts.add(ed.fact.key || ed.fact.title);
    }

    log("Feeds:");
    const candidates = await readFeeds();
    // Moments mixed in among the news, so the page isn't six videos then four stories.
    const picked = pickEdition(candidates, { plan: PLAN, used, now });
    const items = interleave(picked.filter((s) => s.topic === "moments"), picked.filter((s) => s.topic !== "moments"));
    for (const story of items) if (story.video) story.title = cleanVideoTitle(story.title);
    log(`Picked ${items.length} of ${candidates.length} stories.`);
    if (!items.length) throw new Error("No stories could be read from any source; nothing written.");

    for (const story of items) {
      if (story.video) continue;
      const { body, image } = await readArticle(story);
      story.body = body;
      if (!story.image && image) story.image = image;
      if (!story.summary && body) story.summary = cleanText(body[0]).slice(0, 320);
    }

    // Uzbek in the usual Latin spelling, however a source writes it.
    const uzLatin = (t) => (t ? { ...t, ...(t.title ? { title: toUzbekLatin(t.title) } : {}), ...(t.summary ? { summary: toUzbekLatin(t.summary) } : {}), ...(t.body ? { body: t.body.map(toUzbekLatin) } : {}), ...(t.text ? { text: toUzbekLatin(t.text) } : {}) } : t);
    for (const story of items) if (story.lang === "uz") Object.assign(story, uzLatin(story));

    const chosen = factOfDay(FACTS, { used: usedFacts, date });
    const fact = chosen ? { key: chosen.title, title: chosen.title, text: chosen.text, source: "Wikipedia", ...(await factFromWikipedia(chosen)) } : null;

    // Every story and the fact in each of LANGS.
    if (process.env.NEWS_NO_TRANSLATE !== "1") {
      const translator = makeTranslator();
      let done = 0;
      let wanted = 0;
      for (const story of items) {
        story.tr = {};
        const from = story.lang === "auto" ? "auto" : story.lang || "en";
        for (const to of LANGS.filter((l) => l !== story.lang)) {
          wanted++;
          try {
            const tr = await translateStory(story, translator(from, to));
            if (tr) {
              story.tr[to] = to === "uz" ? uzLatin(tr) : tr;
              done++;
            }
          } catch (e) {
            log(`  (no ${to} translation for "${story.title}": ${e.message})`);
          }
        }
      }
      if (fact) {
        fact.lang = "en";
        fact.tr = {};
        for (const to of LANGS.filter((l) => l !== "en")) {
          const [title, text] = await translator("en", to)([fact.title, fact.text]).catch(() => [null, null]);
          if (title && text) fact.tr[to] = to === "uz" ? { title: toUzbekLatin(title), text: toUzbekLatin(text) } : { title, text };
        }
      }
      log(`Translated ${done} of ${wanted} story versions.`);
    }
    // Each block's short title, in Uzbek: "Gol - 2005 - Messi - Manchester United".
    for (const story of items) {
      const uzTitle = story.lang === "uz" ? story.title : (story.tr && story.tr.uz && story.tr.uz.title) || story.title;
      story.kind = kindOf(story);
      story.short = shortTitle(story, uzTitle);
    }
    const edition = {
      date,
      generatedAt: now.toISOString(),
      fact,
      items: items.map((s) => ({
        id: s.id,
        side: s.side,
        topic: s.topic,
        kind: s.kind,
        short: s.short,
        title: s.title,
        summary: s.summary || "",
        body: s.body || null,
        image: s.image || null,
        url: s.url,
        source: s.source,
        publishedAt: s.publishedAt,
        video: s.video || null,
        lang: s.lang || "en",
        ...(s.trend ? { trend: s.trend } : {}),
        tr: s.tr || {}
      }))
    };
    await writeFile(file, JSON.stringify(edition, null, 1) + "\n");
    wrote = true;
    for (const s of items) for (const k of keysOf(s)) seen[k] = date;
    await writeFile(seenFile, JSON.stringify({ updated: now.toISOString(), keys: seen }) + "\n");
    log(`Wrote ${path.relative(process.cwd(), file)}:`);
    for (const s of edition.items) log(`  [${s.topic}] ${s.video ? "▶ " : ""}${s.short}  ←  ${s.title} — ${s.source}${s.video || s.body ? "" : " (summary only)"} [${[s.lang, ...Object.keys(s.tr)].join(", ")}]`);
    log(`  Fun fact: ${fact ? `${fact.title}${fact.image ? "" : " (no photo)"}` : "(none)"}`);
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
