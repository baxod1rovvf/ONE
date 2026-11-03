# Quran Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Quran tab where the owner memorises surahs in blocks of 4, shortest first. Each surah is shown verse by verse in Arabic, an Uzbek reading and the Uzbek translation, with per-verse audio, a "Test me" mode and an end-of-block review.

**Architecture:**
- **Text:** downloaded once by a Node script from Quran.com, QuranEnc and the GitHub reading project, then committed as JSON under `pages/quran/data/`.
- **Rules:** path, blocks, steps and the day count live in `pages/quran/rules.js` (pure, Node-tested).
- **Page:** `pages/quran/quran.js` renders the path, step and review views from the hash (`#quran`, `#quran/<n>`, `#quran/review`).
- **Progress:** a new synced `hifz` collection.

**Tech Stack:** React 18 UMD via `React2.createElement` (no build step), plain CSS, Node 22 for the script, and Node's test runner with Playwright Chromium (`tests/helpers.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-03-quran-learning-design.md`

## Global Constraints

- **No Quran text typed by hand, anywhere:** not in code, tests or fixtures that ship. Test fixtures for the script use the real downloaded shapes, but only short snippets copied from the committed data or the GitHub file (surah 112).
- **Sources:**
  - Arabic: Quran.com API v4 `text_uthmani`.
  - Translation: QuranEnc `uzbek_sadiq`.
  - Reading: `https://raw.githubusercontent.com/AbdurazzoqAbdugafforov/uzbek-quran-transliteration/main/quran_json/surahs/<n>.json`, field `ayahs[].uzbekReading`.
- **Credits shown on step pages, exactly:** "Arabic: Quran.com (Tanzil). Translation: Shaykh Muhammad Sodiq Muhammad Yusuf, via QuranEnc. Uzbek reading: uzbek-quran-transliteration (github.com/AbdurazzoqAbdugafforov)."
- **Path:** sorted by `words` ascending, ties by surah number ascending; `known` surahs removed; blocks of 4; the last block may be shorter.
- **Hifz states:** `learning`, `learned`, `needs-work`, `solid`, `known`. A surah with no entry is not started.
- **Day count:** "Day N of 14" from the earliest `startedAt` in the block (the start day is day 1). Past 14 it reads "Day N · take your time". Time never locks anything.
- **Copy:**
  - "Uzbek reading not checked yet. Compare it with your mushaf or app, then mark it checked."
  - Buttons: "Mark reading as checked", "Reading checked", "I've learned it", "Test me", "Hide all again", "Solid", "Needs work", "Study again", "I know this", "Learn it after all", "Continue", "Play whole surah".
- **Dock:** the "Quran" tab sits after Mood, making 8 tabs, each at least 44px at 375px wide, with no sideways scroll.
- **Arabic:** rendered with `dir="rtl"` and `lang="ar"` in the font "Amiri Quran" (Google Fonts, added to the existing `<link>`).
- **Names and style:**
  - Internal names keep `one` (`window.__oneQuranRules`, collection `hifz`).
  - Style matches the existing pages (`h = React2.createElement`, double quotes, 2-space indent).
- **Network:** `api.quran.com` and `quranenc.com` must be allowed in this session for Task 2 Step 5 and Task 6 Step 1. If they are blocked, stop and ask the owner. Never invent responses for those steps.

## Review Focus

1. **A reading file whose verse count differs from Quran.com**, e.g. a split or merged verse. The script refuses and names the surah. Test in Task 2 (`validateSurah`).
2. **Marking a surah "I know this" while it is the current step mid-block:** the block refills, the next surah becomes current, and the progress already made on the other surahs is kept. Test in Task 1.
3. **A `needs-work` surah after the next block has started:** this can't happen, because the next block opens only when all are `solid`. But a surah re-marked `needs-work` from another device after sync must put the block back into review, not crash. Test in Task 1 (`blockState` with mixed states).
4. **A very long verse on a phone** (surah 2 verse 282 is the longest): the Arabic wraps within its card, with no sideways scroll at 375px. Test in Task 4 using the real file `2.json`.
5. **A reciter without verse timings, or Quran.com unreachable:** the verse ▶/🔁 buttons are hidden, "Play whole surah" still works, and no console error appears. Test in Task 6.

---

### Task 1: Path and progress rules

**Files:**
- Create: `pages/quran/rules.js`
- Test: `tests/quran-rules.test.cjs`

**Interfaces:**
- Produces (`module.exports` in Node and `window.__oneQuranRules` in the browser, with the same wrapper as `pages/mood/rules.js`):
  - `STATES = ["learning", "learned", "needs-work", "solid", "known"]`
  - `progressMap(entries) -> Map<number, entry>`: one entry per `surah`, keeping the greatest `_m`, then the greatest `updatedAt`.
  - `buildPath(index, progress: Map) -> number[][]`: blocks of surah numbers.
  - `stepState(surah, block, progress) -> "done" | "current" | "locked" | "needs-work"`
  - `blockState(block, progress) -> { status: "studying" | "review" | "done", current: number | null }`, where `current` is the surah to study while `status === "studying"`.
  - `currentBlock(path, progress) -> number`: the index of the first block that isn't `done` (`path.length` when all are done).
  - `dayCount(block, progress, today: "YYYY-MM-DD") -> { day: number, of: 14 } | null`, which is `null` when no surah in the block has `startedAt`. `startedAt` is an ISO date `YYYY-MM-DD`.
- Rules:
  - A step is done when its surah is `learned` or `solid`.
  - `needs-work` shows as "needs-work" and counts as not done.
  - The status is `review` when every surah is done but not all are `solid`, and `done` when all are `solid`.

- [ ] **Step 1: Write the failing tests.** Use a synthetic index, which is not Quran text: `const idx = [[1,29],[2,6100],[103,14],[108,10],[110,19],[112,15],[113,23],[114,20]].map(([n, words]) => ({ n, words }))` and `const P = (o) => new Map(Object.entries(o).map(([n, v]) => [Number(n), { surah: Number(n), ...v }]))`.

```js
test("path: shortest first, ties by number, blocks of 4, last block shorter", () => {
  assert.deepEqual(buildPath(idx, P({})), [[108, 103, 112, 110], [114, 113, 1, 2]]);
  const tie = [{ n: 5, words: 10 }, { n: 4, words: 10 }];
  assert.deepEqual(buildPath(tie, P({})), [[4, 5]]);
});
test("known surahs leave the path and blocks refill", () => {
  assert.deepEqual(buildPath(idx, P({ 112: { state: "known" } })), [[108, 103, 110, 114], [113, 1, 2]]);
});
test("marking the current surah known moves on and keeps other progress", () => {
  const p = P({ 108: { state: "learned" }, 103: { state: "known" } });
  const path = buildPath(idx, p);
  assert.deepEqual(path[0], [108, 112, 110, 114]);
  assert.deepEqual(blockState(path[0], p), { status: "studying", current: 112 });
  assert.equal(stepState(108, path[0], p), "done");
  assert.equal(stepState(110, path[0], p), "locked");
});
test("review opens when all four are done, block done when all are solid", () => {
  const b = [108, 103, 112, 110];
  const learned = P({ 108: { state: "learned" }, 103: { state: "learned" }, 112: { state: "learned" }, 110: { state: "learned" } });
  assert.deepEqual(blockState(b, learned), { status: "review", current: null });
  const mixed = P({ 108: { state: "solid" }, 103: { state: "needs-work" }, 112: { state: "solid" }, 110: { state: "solid" } });
  assert.deepEqual(blockState(b, mixed), { status: "studying", current: 103 });
  assert.equal(stepState(103, b, mixed), "needs-work");
  const solid = P({ 108: { state: "solid" }, 103: { state: "solid" }, 112: { state: "solid" }, 110: { state: "solid" } });
  assert.deepEqual(blockState(b, solid), { status: "done", current: null });
  assert.equal(currentBlock([b, [114]], solid), 1);
});
test("day count from the earliest start, and past 14", () => {
  const b = [108, 103];
  assert.equal(dayCount(b, P({}), "2026-11-03"), null);
  assert.deepEqual(dayCount(b, P({ 108: { state: "learned", startedAt: "2026-11-01" }, 103: { state: "learning", startedAt: "2026-11-02" } }), "2026-11-03"), { day: 3, of: 14 });
  assert.equal(dayCount(b, P({ 108: { state: "learning", startedAt: "2026-10-01" } }), "2026-11-03").day, 34);
});
test("one entry per surah when two devices changed it", () => {
  const m = progressMap([{ id: "a", surah: 112, state: "learning", _m: 1 }, { id: "b", surah: 112, state: "learned", _m: 2 }]);
  assert.equal(m.get(112).state, "learned");
});
```

- [ ] **Step 2: Run it to check it fails.**
  Run: `cd tests && node --test quran-rules.test.cjs`
  Expected: FAIL, "Cannot find module '../pages/quran/rules.js'".
- [ ] **Step 3: Implement** `pages/quran/rules.js`. Day maths uses UTC parsing, like `pages/mood/rules.js`.
- [ ] **Step 4: Run it to check it passes.**
  Run: `cd tests && node --test quran-rules.test.cjs`
  Expected: 6 pass.
- [ ] **Step 5: Commit** (`feat(quran): path and progress rules`).

---

### Task 2: The data script and the data

**Files:**
- Create: `tools/quran/build-data.mjs`, `tools/quran/lib.mjs`
- Create (generated by Step 5): `pages/quran/data/1.json` … `114.json`, `pages/quran/data/index.json`
- Test: `tests/quran-build.test.cjs` (script logic), `tests/quran-data.test.cjs` (the committed data)

**Interfaces:**
- `tools/quran/lib.mjs` exports pure functions:
  - `countWords(arabic: string) -> number`: whitespace-separated tokens that contain at least one Arabic letter (`/[ء-يٱ]/`). Pause marks standing alone don't count.
  - `buildSurah({ n, chapter, arabic, translation, reading }) -> surahFile`, where:
    - `chapter` is `{ name_arabic, name_simple, translated_name: { name } }` (Quran.com `/chapters?language=uz`);
    - `arabic` is `[{ verse_number, text_uthmani }]`;
    - `translation` is `[{ aya, translation }]` (QuranEnc `result`);
    - `reading` is `[{ ayahNumber, uzbekReading }]` (the GitHub `ayahs`).
  - `validateSurah(file) -> string[]`: a list of problems, empty when the file is fine. It reports count mismatches by name (`"surah 5: 120 Arabic verses, 119 readings"`) and empty fields (`"surah 5 verse 3: empty reading"`).
- Surah file: `{ n, nameAr, nameUz, meaningUz, verses: [{ n, ar, reading, uz }], sources: { arabic, translation, reading }, fetchedAt }`. Each field is trimmed, and nothing else is changed.
- Index file: `[{ n, nameAr, nameUz, meaningUz, verses: number, words: number }]`, sorted by `n`.
- `build-data.mjs`:
  - fetches, with up to 3 retries per request:
    - `https://api.quran.com/api/v4/chapters?language=uz`;
    - per surah, `https://api.quran.com/api/v4/verses/by_chapter/<n>?fields=text_uthmani&per_page=300`;
    - per surah, `https://quranenc.com/api/v1/translation/sura/uzbek_sadiq/<n>`;
    - per surah, the GitHub file.
  - collects every `validateSurah` problem for all 114 surahs;
  - writes nothing and exits 1 when any problem exists, printing them all;
  - otherwise writes all 115 files.

- [ ] **Step 1: Write the failing tests** in `tests/quran-build.test.cjs`. Import with `await import("../tools/quran/lib.mjs")`. For the fixtures, use the strings of verses 1–2 of surah 112 read at test time from the GitHub-shaped object in `tests/fixtures/quran/112-reading.json`. Save that file in this step with `curl` from the GitHub URL (which is reachable); it is a verbatim copy, not typed.

```js
test("countWords counts Arabic words, not pause marks", () => {
  assert.equal(countWords("كلمة ۖ كلمة"), 2); // synthetic letters, not Quran text
});
test("buildSurah joins the three sources by verse number", () => {
  const g = require("./fixtures/quran/112-reading.json").ayahs;
  const file = buildSurah({
    n: 112,
    chapter: { name_arabic: "x", name_simple: "Al-Ikhlas", translated_name: { name: "y" } },
    arabic: g.map((a) => ({ verse_number: a.ayahNumber, text_uthmani: a.arabic })),
    translation: g.map((a) => ({ aya: String(a.ayahNumber), translation: a.uzbekTranslation })),
    reading: g
  });
  assert.equal(file.verses.length, g.length);
  assert.equal(file.verses[1].reading, g[1].uzbekReading.trim());
  assert.deepEqual(validateSurah(file), []);
});
test("validateSurah names count mismatches and empty fields", () => {
  // same setup, with one reading dropped and one translation blanked
  // → problems include "surah 112: 4 Arabic verses, 3 readings" and "surah 112 verse 2: empty translation"
});
```

- [ ] **Step 2: Run it to check it fails.**
  Run: `cd tests && node --test quran-build.test.cjs`
  Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `tools/quran/lib.mjs` and `tools/quran/build-data.mjs`. The script uses Node 22's built-in `fetch` and needs no npm dependency.
- [ ] **Step 4: Run it to check it passes.**
  Run: `cd tests && node --test quran-build.test.cjs`
  Expected: pass.
- [ ] **Step 5: Run the script for real.**
  First check: `curl -sS -m 10 -o /dev/null -w "%{http_code}" https://api.quran.com/api/v4/chapters/1` must print 200, and the same for `https://quranenc.com/api/v1/translation/sura/uzbek_sadiq/1`. If either is blocked, **stop and ask the owner** to allow it (title-bar environment menu → Edit → Network access).
  Then run: `node tools/quran/build-data.mjs`
  Expected: "wrote 114 surahs". If it lists problems, show them to the owner and stop. Never patch the data by hand.
- [ ] **Step 6: Write the data test** `tests/quran-data.test.cjs` (Node, reading `pages/quran/data`):
  - 114 files plus `index.json`;
  - each file's `verses.length` equals its index `verses`;
  - every `ar`, `reading` and `uz` is non-empty;
  - every `ar` matches `/[؀-ۿ]/`;
  - every file has `sources.arabic`, `sources.translation` and `sources.reading`;
  - `index.json` is sorted by `n`;
  - every `words` is greater than 0.
  Run it: pass.
- [ ] **Step 7: Commit** the script, tests, fixture and data (`feat(quran): data from Quran.com, QuranEnc and the Uzbek reading project`).

---

### Task 3: Quran tab, progress collection and the path page

**Files:**
- Create: `pages/quran/quran.js`, `pages/quran/quran.css`
- Modify `index.html`:
  - `hifz` in `createEmptyData`, `EXTRA_COLLECTIONS`, `SYNCED_COLLECTIONS` and the `removeSamples`/`hasSamples` lists (no sample hifz entries);
  - a `BookOpenText` lucide icon;
  - the route `{ id: "quran", label: "Quran", icon: BookOpenText, description: "Learn surahs by heart, four at a time" }` after `mood` in `ROUTES`;
  - `resolveRoute`: `quran/…` resolves to `quran`;
  - `PAGE_IDS` and `PAGE_FILES` gain `quran` and `./pages/quran/rules.js`;
  - `PAGE_DEPS.quran = ["pages/quran/rules.js"]`;
  - `main[data-section='quran']` uses the `--c-telegram` colours (blue);
  - "Amiri Quran" added to the Google Fonts `<link>`.
- Modify `sw.js`: `quran` in the pages list, plus `./pages/quran/rules.js` and `./pages/quran/data/index.json`.
- Modify tests that list pages or tabs:
  - `tests/nav.test.cjs` (7 to 8 tabs, and add `"quran"` to the 375px route list and the dock click list);
  - `tests/pages-load.test.cjs` and `tests/update.test.cjs` (`PAGE_IDS` plus `/pages/quran/rules.js`; update's FILES list does not include data);
  - `tests/baseline.test.cjs`.
- Test: `tests/quran.test.cjs` (new)

**Interfaces:**
- Consumes: Task 1 rules; `pages/quran/data/index.json` (fetched with `fetch("pages/quran/data/index.json")` once per page load and kept in a module variable).
- Produces:
  - `window.__onePages.quran = QuranPage`.
  - `useHifz()` inside `quran.js`, returning `{ progress: Map, set(surah, patch) }`. `set` adds or updates the `hifz` entry for that surah, with a new `id`, `surah` and `updatedAt`.
  - `hashView() -> { kind: "path" } | { kind: "surah", n } | { kind: "review" }`, read from `location.hash` and updated on `hashchange`.
  - The path view:
    - a current block card labelled by `aria-label` "Block N" showing `dayCount` as "Day N of 14" (or "Day N · take your time"), with an `ol` of 5 steps. Each step is an item with text "<nameUz> · <nameAr>" and a `data-state`; step 5 is "Review". Steps not yet done also carry an "I know this: <nameUz>" button;
    - **Continue**, which goes to `#quran/<current>` or `#quran/review`;
    - "Next blocks" with "I know this" buttons named `I know this: <nameUz>`;
    - "Finished blocks";
    - "Known surahs" with `Learn it after all: <nameUz>`.
  - When a surah first becomes `current` with no entry, the page sets `{ state: "learning", startedAt: today }` for it, in an effect.
  - Offline: on the path view, the current block's surah files are fetched once in the background (`fetch(...)` with errors ignored). The service worker saves what is fetched, so they open offline later.

- [ ] **Step 1: Write the failing tests** in `tests/quran.test.cjs`, with the same `before`/`after`/`EMPTY_DATA` pattern as `tests/mood.test.cjs`, `route: "quran"`, and the expected order read from the committed `index.json` in Node:

```js
const index = require("../pages/quran/data/index.json");
const order = [...index].sort((a, b) => a.words - b.words || a.n - b.n).map((s) => s.n);
test("Quran: block 1 holds the four shortest surahs", async () => {
  // open #quran → region "Block 1" list items 1–4 contain nameUz of order[0..3]; item 5 "Review"
  // step 1 data-state="current", steps 2–4 "locked"; stored hifz has { surah: order[0], state: "learning", startedAt: today }
});
test("Quran: I know this refills the block", async () => {
  // Next blocks: click "I know this: <nameUz of order[4]>" → order[4] leaves the path; block 2 now starts with order[5]; Known surahs lists "Learn it after all: <nameUz of order[4]>"
  // Current block: click "I know this: <nameUz of order[0]>" → Block 1 step 1 is order[1] (current) and step 4 is order[5]
  // "Learn it after all: <nameUz of order[4]>" → order[4] back in the path
});
test("Quran: the block shows its day", async () => {
  // clock fixed 2026-11-03; hifz { surah: order[0], state: "learning", startedAt: "2026-11-01" } → "Day 3 of 14"
});
test("Quran: 8 dock tabs fit a phone, no sideways scroll, dark theme", async () => {
  // viewport 375x812, theme dark → .dock__tab count 8, each ≥44px; scrollWidth 375; no console errors
});
```

- [ ] **Step 2: Run it to check it fails.**
  Run: `cd tests && node --test quran.test.cjs`
  Expected: FAIL (no Quran tab).
- [ ] **Step 3: Implement** the wiring and the path view.
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 quran.test.cjs quran-rules.test.cjs nav.test.cjs pages-load.test.cjs update.test.cjs baseline.test.cjs sw.test.cjs`
  Expected: all pass.
- [ ] **Step 5: Commit** (`feat(quran): Quran tab and the learning path`).

---

### Task 4: The surah page

**Files:**
- Modify: `pages/quran/quran.js`, `pages/quran/quran.css`
- Modify: `index.html`, adding the setting `quranTestTranslation: true` to the default settings
- Test: `tests/quran.test.cjs`

**Interfaces:**
- Consumes: `useHifz`, `hashView` (Task 3); `fetch("pages/quran/data/<n>.json")`.
- Produces the surah view (`#quran/<n>`):
  - the header (h1 = `nameUz`, then `nameAr` with `lang="ar" dir="rtl"`, the meaning, and "<k> verses");
  - the reading bar (the exact copy from Global Constraints) or the note "Reading checked";
  - one `article.ayah` per verse with `aria-label="Verse <k>"`, containing `.ayah__ar` (lang ar, rtl), `.ayah__reading` and `.ayah__uz`;
  - the "Test me" switch (`role="switch"`, named "Test me"), and next to it, shown while Test me is on, a "Show translation" switch bound to `settings.quranTestTranslation`. (Ruling: the spec put this in Settings; it sits here, where it's used, and is still a synced setting.) When on, `.ayah__ar` shows the first word only and `.ayah__reading` is hidden, and `.ayah__uz` is shown only if `settings.quranTestTranslation`. Clicking an article reveals it (class `is-revealed`). "Hide all again" clears all reveals;
  - **I've learned it**, visible when the surah is the current step or `needs-work`. It sets `learned` and navigates to the next current surah, or to `#quran/review`;
  - the credits footer (exact copy).
- Loading: "Loading surah…" inline. On a fetch error: "Couldn't open this surah. Check your connection and try again." plus a **Try again** button.

- [ ] **Step 1: Write the failing tests:**

```js
test("Quran: a surah shows Arabic, reading and translation for every verse", async () => {
  // open #quran/<order[0]> → article.ayah count === file.verses.length; first article's .ayah__ar text === file.verses[0].ar (file read in Node from pages/quran/data)
  // reading bar text visible; click "Mark reading as checked" → "Reading checked"; reload → still "Reading checked"; stored hifz readingChecked true
});
test("Quran: Test me hides, a tap reveals, Hide all again hides", async () => {
  // switch on → first .ayah__ar text === first word of file.verses[0].ar; .ayah__reading hidden; click article → full text; "Hide all again" → first word again
});
test("Quran: I've learned it moves to the next step, and after four to the review", async () => {
  // data with hifz learned for order[0..2] → open #quran/<order[3]>, click I've learned it → hash #quran/review
  // fresh: open #quran/<order[0]> → I've learned it → hash #quran/<order[1]>
});
test("Quran: the longest verse wraps on a phone", async () => {
  // 375x812, open #quran/2 → wait for article "Verse 282"; scrollWidth 375
});
```

- [ ] **Step 2: Run it to check it fails.**
  Run: `cd tests && node --test quran.test.cjs`
  Expected: the 4 new tests fail.
- [ ] **Step 3: Implement** the surah view.
- [ ] **Step 4: Run** `cd tests && node --test quran.test.cjs`
  Expected: all pass.
- [ ] **Step 5: Look at it.** Screenshot `#quran/<order[0]>` at 1280×800 (light) and 375×812 (dark), with Test me on and off. Check that the Arabic is large and readable in Amiri Quran.
- [ ] **Step 6: Commit** (`feat(quran): the surah page`).

---

### Task 5: The review

**Files:**
- Modify: `pages/quran/quran.js`, `pages/quran/quran.css`
- Test: `tests/quran.test.cjs`

**Interfaces:**
- Produces the review view (`#quran/review`) for the current block:
  - one section per surah (`aria-label` = `nameUz`), in Test me mode (the same verse cards as Task 4, so reuse the component);
  - **Solid** and **Needs work** buttons with `aria-pressed`, which set `solid` and `needs-work`;
  - on `needs-work`, a **Study again** link to `#quran/<n>`;
  - when `blockState` is `done`, the text "Block done" and a **Continue** button to the next block's first surah.
- If the block isn't in review (`blockState().status === "studying"`), `#quran/review` shows "Finish the four surahs first." and a **Continue** button.

- [ ] **Step 1: Write the failing tests:**

```js
test("Quran: the review needs all four Solid", async () => {
  // hifz learned for order[0..3] → open #quran/review; mark three Solid and one Needs work → no "Block done"; "Study again" link to that surah
  // mark it Solid → "Block done"; Continue → hash #quran/<order[4]>; stored states solid ×4
});
test("Quran: the review waits until the four are learned", async () => {
  // no hifz → #quran/review shows "Finish the four surahs first."
});
```

- [ ] **Step 2: Run it to check it fails.**
- [ ] **Step 3: Implement** the review view.
- [ ] **Step 4: Run** `cd tests && node --test quran.test.cjs`
  Expected: all pass.
- [ ] **Step 5: Commit** (`feat(quran): the block review`).

---

### Task 6: Audio, whole surah and verse by verse

**Files:**
- Modify: `index.html`. Add `QuranSource.verseTimings(reciterId, n)`, returning `[{ verse, from, to }]` in milliseconds or `null`, and export `playQuranClip(url, { from, to, loop })` and `stopQuranClip()` on `window.__oneApp`, using one shared `Audio` element. Playing one pauses the Sounds engine, the same way the Quran player does (find its pause call with `grep -n "pauseOthers\|pauseAll" index.html`).
- Modify: `pages/quran/quran.js`. Add **Play whole surah** in the header, and ▶ and 🔁 buttons per verse (`aria-label` "Play verse <k>" and "Repeat verse <k>", with `aria-pressed` on repeat).
- Modify: `tests/helpers.cjs`, extending `audioRoute` so the timings request returns a fixture.
- Create: `tests/fixtures/quran/timings-<n>.json`, built from the real response shape captured in Step 1, with times made up and no text.
- Test: `tests/quran.test.cjs`

**Interfaces:**
- The reciter: `settings` of the Sounds engine (`quran.reciterId`). When it's null, use the first reciter in `QuranSource.reciters()`.
- Timings come from one request per (reciter, surah), cached in memory.

- [ ] **Step 1: Probe the live API.** This needs `api.quran.com`; stop and ask the owner if it's blocked.
  - Run `curl -sS "https://api.quran.com/api/v4/chapter_recitations/7/112?segments=true" | head -c 1500`.
  - If there are no timestamps, also try `curl -sS "https://api.qurancdn.com/api/qdc/audio/reciters/7/audio_files?chapter=112&segments=true" | head -c 1500`.
  - Record in the ledger which URL gives per-verse `timestamp_from` and `timestamp_to` (or the equivalent), and the field names. `verseTimings` uses exactly that.
  - If neither gives timings, ledger a ruling: there's no per-verse audio, only "Play whole surah", and the verse buttons are never shown. Then skip the verse tests.
- [ ] **Step 2: Write the failing tests:**

```js
test("Quran: Play verse seeks to that verse and stops at its end", async () => {
  // fixture timings for order[0] (verse 2: from 4000 to 7000) → click "Play verse 2" → audio currentTime ≥ 4 within 1 s, then paused near 7 (use page.clock or poll audio.paused)
});
test("Quran: without timings the verse buttons are hidden and the surah still plays", async () => {
  // timings route returns 404 → no "Play verse 1" button; "Play whole surah" plays; no console errors
});
```

- [ ] **Step 3: Run it to check it fails.**
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `cd tests && node --test --test-concurrency=1 quran.test.cjs sound-quran.test.cjs sound-quran-alone.test.cjs`
  Expected: all pass.
- [ ] **Step 6: Commit** (`feat(quran): whole-surah and verse audio`).

---

### Task 7: Full suite and spec status

- [ ] **Step 1: Run the full suite.**
  Run: `cd tests && npm test`
  Expected: everything passes. A failure in a file Quran didn't touch is re-run on its own and compared against main before calling it unrelated.
- [ ] **Step 2: Update the spec.** Set Status to `built (date)` and note any ruling that changed the spec (such as no per-verse audio). Commit (`docs: mark the Quran learning spec as built`).
