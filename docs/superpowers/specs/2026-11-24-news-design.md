# News (replaces Saved; Quran page removed)

## What it is

A News tab in the dock, where Saved used to be. Every day there is one edition:
nine stories plus one fun fact (ten things to read). The stories are split in
two: **the light side** (funny and odd, animals) and **the serious side** (world
and politics, technology). Editions are kept for seven days, so earlier ones can
still be read from the day chips at the top.

A story doesn't have to be from today: any story from the past seven days that
hasn't been in an earlier edition can be picked, newest first.

## Where the news comes from

Core is a static site with no server, so a GitHub Action builds the edition:

- `.github/workflows/news.yml` runs every day at 01:17 UTC (and on demand from
  the Actions tab), runs `tools/news/build-news.mjs`, and commits
  `news/<date>.json` and `news/index.json`. Editions older than seven days are
  deleted in the same commit.
- `tools/news/sources.mjs` lists the feeds (public RSS/Atom and YouTube channel
  feeds) and the plan: World & politics 3 (1 video), Technology 2 (1 video),
  Funny & odd 2, Animals 2 (1 video). A topic that is short of stories hands its
  places to its own side first.
- For articles, the builder fetches the page and keeps its readable text
  (Readability), so it can be read inside Core. If that fails, the feed's summary
  and a link to the original remain.
- The fun fact comes from uselessfacts.jsph.pl (today's fact), with a built-in
  list (`tools/news/facts.mjs`) as the fallback. No fact repeats within a week.
- A feed that fails is skipped and named in the run's log.

## Videos

Videos are never downloaded or stored. An edition only holds the YouTube video
id and thumbnail address. The player (`youtube-nocookie.com/embed/…`) is created
only when the story is opened, and removed when the reader closes.

## In the app

- `pages/news/news.js` and `news.css`. The reader is a Modal with the story's
  text (or the video), a link to the original, and "Next story", which goes
  through the light side, then the serious side.
- What has been read is remembered per device in localStorage
  (`one.news.read.v1`), kept for eight days. It is not synced.
- `sw.js` fetches `news/*` from the network first and keeps the last copy for
  offline reading.

## Removed

- The Quran page (`pages/quran`, its data, tools, tests and docs). The Sounds
  panel's Quran recitation tab is a separate feature and stays.
- The Saved page, its editor, the Link kind in quick capture and the Saved
  search results. The `saved` list stays in the data format (backups and sync
  still accept it), so links saved earlier aren't destroyed; nothing shows them.

## Update: languages, trending, Uzbekistan, football (2026-11-24)

- An edition is now 18 stories and the fun fact, in five sections shown in this
  order: **Trending now** (3, Google Trends for the US, UK and Uzbekistan, each
  with the top story about the search), **Uzbekistan** (3, Kun.uz, Gazeta.uz,
  Daryo; Google News only when those run short), **Football** (3, one a video:
  BBC Sport, ESPN, Sky Sports, Premier League and FIFA on YouTube), then
  the light side (4) and the serious side (5).
- **Languages.** The page switches between English, Oʻzbekcha and Русский
  (remembered per device, `one.news.lang.v1`). The builder translates every
  story's title, summary and article text, and the fact, into the other two
  languages (`lang` is the original, `tr.<lang>` the translations), through
  Google Translate's free web address (no key). Batches of up to 4000
  characters; a batch that comes back with the wrong number of parts is
  retried text by text; after repeated failures the run stops translating and
  stories stay in their own language. A story without a translation, or whose
  article couldn't be translated, is shown as published with a note.
  `NEWS_NO_TRANSLATE=1` skips translation.
- Editions from before this change have no `lang`; they are read as English.
- **Uzbek spelling.** Uzbek stories are written in the usual Latin spelling
  (`tools/news/uzbek.mjs`): Gazeta.uz's Cyrillic is transliterated, and Kun.uz's
  proposed-alphabet letters (ş, ç, ö, ğ) become sh, ch, oʻ, gʻ. Translations into
  Uzbek get the same treatment.
- The Guardian refuses GitHub's servers (HTTP 403), so it was replaced by ESPN
  (football), DW and France 24 (world) and Mongabay (animals).

## Update: football only, in Uzbek (2026-11-25)

Replaces the sections and the language switch above.

- **Content.** Each edition is 10 football blocks: 6 *moments* (great goals,
  classic goals from old matches, dribbles and skills, as videos from official
  channels picked by words like goal, skills, classic, best; up to 60 days
  old) mixed in among 4 *news* stories (transfers, results, injuries, from BBC
  Sport, Sky Sports, ESPN and the football stories of Kun.uz, Daryo and
  Gazeta.uz, from the past week). `news/seen.json` remembers what was shown for
  120 days, so a moment never comes back.
- **Short titles.** Every block has a short Uzbek title built from the story
  (`tools/news/football.mjs`): kind (Gol, Dribling, Seyv, Lahza, Transfer,
  Jarohat, Natija, Yangilik), a year when the title names one, then the
  player and team it mentions, e.g. "Gol - 2005 - Messi - Manchester United".
  With no known name, the Uzbek title shortened.
- **Uzbek only.** Stories are translated into Uzbek only; the page's words are
  Uzbek; the language switch is gone.
- **Page.** No sections or category labels. Blocks two to a line (also on a
  phone), each 40% picture and 60% short title, with rounded corners. A dot in
  the bottom-right is blue until the block is read, then green; there is no
  tick and no fading. Everything opens in the reader inside Core.
- **Fun fact.** A card: light bulb, "Bugungi kashfiyot" tag, headline, one
  sentence, "Manba: Vikipediya" and a photo. The facts are a list of 60
  (`tools/news/facts.mjs`), each naming the Wikipedia article it can be checked
  against; the photo and the link come from that article.
