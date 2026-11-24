// The pure parts of the news builder: reading feeds, choosing an edition,
// and deciding which days to keep. No network and no files here, so all of
// it is tested with fixtures (tests/news-build.test.cjs).
import { XMLParser } from "fast-xml-parser";

export const KEEP_DAYS = 7;
const DAY = 864e5;
const SUMMARY_MAX = 320;

const ARRAYS = new Set(["item", "entry", "link", "media:content", "media:thumbnail", "category", "enclosure"]);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  isArray: (name) => ARRAYS.has(name)
});

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// Text of a value that may be HTML: tags dropped, entities decoded, spaces tidied.
export function cleanText(value) {
  const raw = textOf(value);
  if (!raw) return "";
  const noTags = raw
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(decodeEntities(noTags)).replace(/\s+/g, " ").trim();
}

// Cut at a word boundary, with an ellipsis, when longer than max.
export function shorten(text, max = SUMMARY_MAX) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

function textOf(v) {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === "object") return textOf(v["#text"]);
  return "";
}

function isoDate(v) {
  const s = textOf(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Wider pictures where the source offers them by address (BBC serves any width).
export function upgradeImage(url) {
  if (!url) return null;
  if (/^https?:\/\/ichef\.bbci\.co\.uk\//.test(url)) return url.replace(/\/(ace\/(?:standard|ws))\/\d{2,4}\//, "/$1/800/");
  return url;
}

function largest(list) {
  const imgs = (list || []).filter((m) => m && m["@_url"] && (!m["@_medium"] || m["@_medium"] === "image") && (!m["@_type"] || /^image\//.test(m["@_type"])));
  if (!imgs.length) return null;
  return imgs.reduce((a, b) => (Number(b["@_width"] || 0) > Number(a["@_width"] || 0) ? b : a))["@_url"];
}

function imageOf(item, html) {
  const fromMedia = largest(item["media:content"]) || largest(item["media:thumbnail"]) || largest(item["media:group"] && item["media:group"]["media:content"]);
  if (fromMedia) return fromMedia;
  const enc = (item.enclosure || []).find((e) => e && e["@_url"] && /^image\//.test(e["@_type"] || ""));
  if (enc) return enc["@_url"];
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(html || "");
  return img ? decodeEntities(img[1]) : null;
}

function linkOf(item) {
  const links = item.link || [];
  for (const l of links) {
    if (typeof l === "string" && l.trim()) return l.trim();
    if (l && typeof l === "object") {
      if (l["@_href"] && (!l["@_rel"] || l["@_rel"] === "alternate")) return l["@_href"];
      if (l["#text"]) return String(l["#text"]).trim();
    }
  }
  const guid = item.guid;
  const g = textOf(guid);
  return /^https?:\/\//.test(g) ? g : null;
}

// One feed (RSS 2.0 or Atom, YouTube channel feeds included) → plain stories.
export function parseFeed(xml, source) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  const items = (doc.rss && doc.rss.channel && doc.rss.channel.item) || (doc.feed && doc.feed.entry) || (doc["rdf:RDF"] && doc["rdf:RDF"].item) || [];
  const out = [];
  for (const item of items) {
    const title = cleanText(item.title);
    const url = linkOf(item);
    if (!title || !url) continue;
    const videoId = textOf(item["yt:videoId"]) || null;
    const group = item["media:group"] || {};
    const html = textOf(item["content:encoded"]) || textOf(item.content) || textOf(item.description) || textOf(item.summary) || textOf(group["media:description"]);
    const summary = shorten(cleanText(html));
    const image = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : upgradeImage(imageOf(item, html));
    out.push({
      topic: source.topic,
      source: source.name,
      title,
      url,
      summary: summary === title ? "" : summary,
      image: image && /^https:\/\//.test(image) ? image : null,
      publishedAt: isoDate(item.pubDate) || isoDate(item.published) || isoDate(item["dc:date"]) || isoDate(item.updated),
      video: videoId ? { provider: "youtube", id: videoId } : null
    });
  }
  return source.match ? out.filter((s) => source.match.test(`${s.title} ${s.summary}`)) : out;
}

// What makes two stories the same story: the same video, address, or headline.
export function keysOf(story) {
  const keys = [];
  if (story.video) keys.push(`yt:${story.video.id}`);
  if (story.url) keys.push(`url:${story.url.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase()}`);
  if (story.title) keys.push(`title:${story.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`);
  return keys;
}

// A short, stable id for a story (from its first key).
export function idOf(story) {
  const s = keysOf(story)[0] || story.title;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// Videos that are live streams or premieres can't be watched later as they were.
const NOT_WATCHABLE = /\b(live|livestream|premiere)\b/i;

// Choose the edition: for each topic in the plan, its share of stories from
// the last seven days that weren't in an earlier edition, newest first, each
// source taking turns so no single site fills a topic. A topic short of
// stories hands its places to the other topics on its side, then to any.
export function pickEdition(candidates, { plan, used = new Set(), now = new Date(), maxAgeDays = KEEP_DAYS } = {}) {
  const nowMs = now.getTime();
  const seen = new Set(used);
  const fresh = [];
  const sorted = [...candidates].sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  for (const s of sorted) {
    if (!s.publishedAt) continue;
    const age = nowMs - Date.parse(s.publishedAt);
    if (age > maxAgeDays * DAY || age < -36e5) continue;
    if (s.video && NOT_WATCHABLE.test(s.title)) continue;
    const keys = keysOf(s);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    fresh.push(s);
  }
  const taken = new Set();
  const byTopic = new Map(plan.map((p) => [p.topic, []]));
  const pool = (topic) => fresh.filter((s) => s.topic === topic && !taken.has(s));
  const take = (topic, story) => {
    taken.add(story);
    byTopic.get(topic).push(story);
  };
  // Newest story of each source in turn (then the second newest of each, …).
  const roundRobin = (list, n) => {
    const bySource = new Map();
    for (const s of list) {
      if (!bySource.has(s.source)) bySource.set(s.source, []);
      bySource.get(s.source).push(s);
    }
    const queues = [...bySource.values()];
    const out = [];
    while (out.length < n && queues.some((q) => q.length)) {
      for (const q of queues) if (q.length && out.length < n) out.push(q.shift());
    }
    return out;
  };
  const fill = (p, n) => {
    if (n <= 0) return 0;
    const have = byTopic.get(p.topic);
    const wantVideos = Math.max(0, (p.videos || 0) - have.filter((s) => s.video).length);
    const videos = roundRobin(pool(p.topic).filter((s) => s.video), Math.min(wantVideos, n));
    videos.forEach((s) => take(p.topic, s));
    const articles = roundRobin(pool(p.topic).filter((s) => !s.video), n - videos.length);
    articles.forEach((s) => take(p.topic, s));
    // Short of articles: more videos rather than an empty place.
    const extra = roundRobin(pool(p.topic), n - videos.length - articles.length);
    extra.forEach((s) => take(p.topic, s));
    return videos.length + articles.length + extra.length;
  };
  let missing = [];
  for (const p of plan) {
    const got = fill(p, p.count);
    if (got < p.count) missing.push({ side: p.side, n: p.count - got });
  }
  for (const m of missing) {
    for (const p of [...plan.filter((x) => x.side === m.side), ...plan.filter((x) => x.side !== m.side)]) {
      if (m.n <= 0) break;
      m.n -= fill(p, m.n);
    }
  }
  const out = [];
  for (const p of plan) {
    for (const s of byTopic.get(p.topic)) out.push({ id: idOf(s), side: p.side, ...s });
  }
  return out;
}

// The fun fact: the first offered fact not used in the past week, otherwise
// the next fallback fact in turn (by day of the year) that wasn't.
export function pickFact(offered, { usedFacts = new Set(), fallback = [], date }) {
  const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const usedNorm = new Set([...usedFacts].map(norm));
  for (const f of offered) {
    const text = f && cleanText(f.text);
    if (text && text.length >= 20 && text.length <= 400 && !usedNorm.has(norm(text))) return { text, url: f.url || null, source: f.source || null };
  }
  if (!fallback.length) return null;
  const d = new Date(`${date}T00:00:00Z`);
  const dayOfYear = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY);
  for (let i = 0; i < fallback.length; i++) {
    const text = fallback[(dayOfYear + i) % fallback.length];
    if (!usedNorm.has(norm(text))) return { text, url: null, source: null };
  }
  return { text: fallback[dayOfYear % fallback.length], url: null, source: null };
}

// The edition date (YYYY-MM-DD) for a moment, in a time zone.
export function editionDate(now, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Which saved days to keep (the newest KEEP_DAYS, counting today) and drop.
export function daysToKeep(days, today, keep = KEEP_DAYS) {
  const oldest = new Date(Date.parse(`${today}T00:00:00Z`) - (keep - 1) * DAY).toISOString().slice(0, 10);
  const valid = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  return {
    keep: valid.filter((d) => d >= oldest && d <= today).sort().reverse(),
    drop: valid.filter((d) => d < oldest)
  };
}

// Paragraphs of an article's readable text (from Readability's HTML), or
// null when there is too little to be worth reading in Core.
export function paragraphsFrom(texts, { minChars = 500, maxChars = 12000 } = {}) {
  const out = [];
  let total = 0;
  for (const t of texts) {
    const p = t.replace(/\s+/g, " ").trim();
    if (p.length < 2 || /^(advertisement|share this|sign up|subscribe|related:|read more)/i.test(p)) continue;
    if (out.length && out[out.length - 1] === p) continue;
    if (total + p.length > maxChars) break;
    out.push(p);
    total += p.length;
  }
  return total >= minChars ? out : null;
}
