// Where Core's daily news comes from: football only. Every source is a
// public RSS or Atom feed; YouTube channels are read through their public
// channel feeds, and their videos play inside Core from YouTube itself
// (nothing is downloaded).
//
// A source that fails (gone, renamed, blocked) is skipped and named in the
// run's log, so the edition is built from whatever is reachable that day.
// To add one: give it a topic from PLAN below and either a `url` (RSS/Atom)
// or a `youtube` channel id (the "UC…" part of a channel address).

// What one edition holds: 10 blocks, then the fun fact.
// - moments (60%): the most satisfying football: great goals, classic goals
//   from old matches, dribbles and skills. Videos up to 60 days old, never
//   shown twice (news/seen.json remembers them).
// - news (40%): transfers, results, injuries and the like, from the past week.
export const PLAN = [
  { topic: "moments", side: "football", label: "Moments", count: 6, videos: 6, maxAgeDays: 60 },
  { topic: "news", side: "football", label: "News", count: 4, videos: 0, maxAgeDays: 7 }
];

// Every story is shown in Uzbek: stories in other languages are translated.
export const LANGS = ["uz"];

// Titles that make a video a "moment" rather than a match report or a press
// conference. The moment channels' other videos are only used when there
// aren't enough moments that day.
export const MOMENT = /\b(goals?|golazo|screamer|worldie|volley|free[- ]?kicks?|bicycle|overhead|scissor|rabona|panenka|solo|skills?|dribbl\w*|nutmegs?|tricks?|magic|incredible|unbelievable|stunning|amazing|best|greatest|top ?\d+|iconic|legendary|classic|throwback|on this day|remember|compilation)\b/i;

// Words that mark an Uzbek story (Latin or Cyrillic) as football, for the
// general news feeds.
const FOOTBALL_UZ = /(futbol|terma jamoa|superliga|chempionlar ligasi|premyer-liga|transfer|darvozabon|Real Madrid|Barselona|Manchester|Liverpul|Arsenal|Chelsi|Bavariya|Yuventus|PSJ|Paxtakor|Navbahor|Nasaf|футбол|терма жамоа|суперлига|трансфер|дарвозабон|Пахтакор|Навбаҳор|Насаф)/i;

// Other sports that turn up in football feeds (Sky Sports puts boxing in its
// football feed). Stories that mention them are left out.
export const NOT_FOOTBALL = /\b(boxing|boxer|heavyweight|WBC|WBA|WBO|IBF|UFC|MMA|cricket|rugby|Formula 1|F1|Grand Prix|tennis|Wimbledon|golf|snooker|darts|NFL|NBA|NHL|cycling|Tour de France)\b/i;

// The Guardian isn't used: it refuses GitHub's servers with HTTP 403.
// `fallback: true` sources are only used when the others of a topic run short.
export const SOURCES = [
  // Moments: official channels that post goals, skills and classics.
  { topic: "moments", name: "Premier League", youtube: "UCG5qGWdu8nIRZqJ_GgDwQ-w", match: MOMENT },
  { topic: "moments", name: "FIFA", youtube: "UCpcTrCXblq78GZrTUTLWeBw", match: MOMENT },
  { topic: "moments", name: "LaLiga", youtube: "UCTv-XvfzLX3i4IGWAm4sbmA", match: MOMENT },
  { topic: "moments", name: "Bundesliga", youtube: "UC6UL29enLNe4mqwTfAyeNuw", match: MOMENT },
  { topic: "moments", name: "UEFA", youtube: "UCyGa1YEx9ST66rYrJTGIKOw", match: MOMENT },
  { topic: "moments", name: "FC Barcelona", youtube: "UC14UlmYlSNiQCBe9Eookf_A", match: MOMENT },
  { topic: "moments", name: "Real Madrid", youtube: "UCWV3obpZVGgJ3j9FVhEjF2Q", match: MOMENT },
  { topic: "moments", name: "Manchester United", youtube: "UC6yW44UGJJBvYTlfC7CRg2Q", match: MOMENT },
  { topic: "moments", name: "Liverpool FC", youtube: "UC9LQwHZoucFT94I2h6JOcjw", match: MOMENT },
  { topic: "moments", name: "Arsenal", youtube: "UCpryVRk_VDudG8SHXgWcG0w", match: MOMENT },
  { topic: "moments", name: "Manchester City", youtube: "UCkzCjdRMrW2vXLx8mvPVLdQ", match: MOMENT },
  { topic: "moments", name: "Chelsea FC", youtube: "UCU2PacFf99vhb3hNiYDmxww", match: MOMENT },
  // The same channels' other videos (highlights and the like), only when short.
  { topic: "moments", name: "Premier League", youtube: "UCG5qGWdu8nIRZqJ_GgDwQ-w", fallback: true },
  { topic: "moments", name: "FIFA", youtube: "UCpcTrCXblq78GZrTUTLWeBw", fallback: true },

  // News: transfers, results, injuries.
  { topic: "news", name: "Kun.uz", url: "https://kun.uz/news/rss", lang: "uz", match: FOOTBALL_UZ },
  { topic: "news", name: "Daryo", url: "https://daryo.uz/feed/", lang: "uz", match: FOOTBALL_UZ },
  { topic: "news", name: "Gazeta.uz", url: "https://www.gazeta.uz/uz/rss/", lang: "uz", match: FOOTBALL_UZ },
  { topic: "news", name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", exclude: NOT_FOOTBALL },
  { topic: "news", name: "Sky Sports", url: "https://www.skysports.com/rss/12040", exclude: NOT_FOOTBALL }
];

export const youtubeFeed = (channelId) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

// The fun fact's photo and link come from the English Wikipedia article each
// fact names (tools/news/facts.mjs).
export const wikiSummary = (title) => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`;
