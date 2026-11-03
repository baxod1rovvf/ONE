# Quran learning in Core: design

Date: 2026-11-03
Status: approved in conversation, waiting for spec review
Builds on: pages in their own files (`pages/<id>/`), the Quran player (reciters, Quran.com audio), Supabase sync, the dock

## Why

The owner wants to memorise surahs of the Quran in Core, at a steady pace:
blocks of 4 surahs, about two weeks per block, each block ending with a
review. Every surah is shown in Arabic, in an Uzbek Latin-letter reading
(how to pronounce it), and in Uzbek translation. The first block holds the
easiest (shortest) surahs and the blocks get harder from there.

Success: opening Core shows which surah to learn now; studying one verse at
a time with its audio is easy; the review proves the block is solid before
moving on; the text is trustworthy.

## Decisions already made

| Question | Decision |
|---|---|
| Text sources | Arabic (Uthmani) from Quran.com (Tanzil text); translation by Shaykh Muhammad Sodiq Muhammad Yusuf from QuranEnc (`uzbek_sadiq`); Uzbek reading from github.com/AbdurazzoqAbdugafforov/uzbek-quran-transliteration. Nothing is typed by hand. |
| Trust in the reading | The reading source is unchecked, so each surah's reading shows as "not checked yet" until the owner compares it with a trusted mushaf or app and marks it checked. |
| How text gets in | A script downloads it once and it is committed as data files; Core never fetches text at runtime. |
| Order | All 114 surahs, shortest first by Arabic word count. Surahs marked "I know this" leave the path. |
| Block | Steps 1–4 (one surah each), then step 5, Review. |
| Studying | Verse by verse, with per-verse audio and repeat, and a "Test me" mode. |
| Review | Each of the 4 surahs in "Test me" mode, marked Solid or Needs work; the block finishes when all 4 are Solid. |
| Pace | Two weeks per block is a guide ("Day 6 of 14"), never a lock. |
| Where | A new dock tab, "Quran", after Mood. |

## 1. Data, built once

`tools/quran/build-data.mjs` (Node, run by hand; needs `api.quran.com`,
`quranenc.com` and `raw.githubusercontent.com` / `github.com`):

- For each surah 1–114 it downloads:
  - Arabic: Quran.com API v4, Uthmani text per verse.
  - Surah names and meaning: Quran.com chapters in Uzbek (`language=uz`),
    plus the Arabic name.
  - Translation: QuranEnc `uzbek_sadiq`, the whole surah.
  - Reading: the GitHub project's `quran_json/surahs/<n>.json`
    (`uzbekReading` per ayah).
- It writes:
  - `pages/quran/data/<n>.json`:
    `{ n, nameAr, nameUz, meaningUz, verses: [{ n, ar, reading, uz }], sources, fetchedAt }`.
  - `pages/quran/data/index.json`: `[{ n, nameAr, nameUz, meaningUz, verses, words }]`,
    where `words` is the Arabic word count.
- It refuses to write anything, and says which surah and why, when:
  - the three sources disagree on a surah's verse count, or
  - any verse has an empty field.
- The text is never changed, apart from trimming whitespace. QuranEnc's
  terms require no changes and a credit.
- The source credits are stored in each file and shown in the app.

## 2. Path and progress

`pages/quran/rules.js`: plain functions with no screen code (window.__oneQuranRules in the browser, module.exports in Node).

- **Path:** `index` sorted by `words` ascending; ties by surah number
  ascending. Surahs with state `known` are removed. The rest are cut
  into blocks of 4; the last block may have fewer.
- **Progress:** a new synced collection, `hifz`. One entry per surah the
  owner has touched: `{ id, surah, state, readingChecked, startedAt, updatedAt }`.
  - `state` is `learning`, `learned`, `needs-work`, `solid` or `known`. A surah with no entry is not started.
  - `startedAt` is set when the surah first becomes the current step.
- **Steps:** in a block, a step is:
  - done when its surah is `learned` or `solid`;
  - current when it is the first one not done;
  - locked after that.
  The review (step 5) opens once steps 1–4 are done.
- **Review:** marks each surah `solid` or `needs-work`. A `needs-work`
  surah can be studied again from the review. The block is finished
  when all its surahs are `solid`. Only then does the next block's first
  step become current.
- **Day count:** "Day N of 14", counted from the earliest `startedAt` in
  the block (day 1 is that day). Past 14 it shows "Day 17 · take your
  time". Nothing is ever locked by time.
- **Marking known:** "I know this" is offered on surahs in blocks that are
  not finished. It sets `known`, and the path re-forms. "Learn it after
  all" removes the `known` mark.

## 3. Screens

### Path page (`#quran`)

- **Current block card:**
  - "Block 2 · Day 6 of 14";
  - steps 1–5, each with the surah's Uzbek and Arabic name and a state: done, current, needs work or locked;
  - a **Continue** button that opens the current step.
- **Next blocks:** the next blocks with their surahs, each surah with an
  "I know this" action.
- **Finished blocks:** folded at the bottom.
- **Known surahs:** a short list at the bottom, each with "Learn it after all".

### Step page (`#quran/<n>`)

- **Header:** Uzbek name, Arabic name, meaning, verse count, **Play whole surah**.
- **Unchecked reading:** a bar saying "Uzbek reading not checked yet. Compare it
  with your mushaf or app, then mark it checked." with a **Mark reading as checked**
  button. Once checked, the bar is gone, and a small "Reading checked" note stays.
- **Verse cards:**
  - the verse number;
  - the Arabic, large, `dir="rtl"`, in Amiri Quran;
  - the reading;
  - the translation;
  - ▶ to play the verse, and 🔁 to loop it until it is pressed again.
- **"Test me" switch:** each card shows only the first Arabic word, plus the
  translation unless "Show translation in test mode" is off. Tapping a card
  reveals it. "Hide all again" covers them back up.
- **Bottom:** **I've learned it**. It sets `learned` and goes to the next step,
  or to the review after step 4. It only shows on the current step, or on a
  `needs-work` surah.
- **Credits** in the footer.

### Review page (`#quran/review`)

- The block's surahs, one at a time, in "Test me" mode, each with **Solid**
  and **Needs work**.
- A `needs-work` surah has a **Study again** link to its step page.
- When all are Solid: "Block done", and the next block starts.

### Settings

- The reciter is the Quran player's reciter (same setting).
- "Show translation in test mode": on by default. Synced with the other
  settings.

## 4. Audio

- **Whole surah:** the Quran player's existing Quran.com chapter audio for the chosen reciter.
- **One verse:** Core asks Quran.com for that recording's verse timings. It
  plays from the verse's start and stops at its end, or loops it with 🔁.
  - If the reciter has no timings, the ▶ and 🔁 buttons are hidden and only
    "Play whole surah" is offered.
  - The exact request and its format are confirmed against the live API
    before building.
- Playing here pauses other Core audio, like the Quran player does.

## 5. Offline and size

- Surah files load only when opened. When a block starts, its surahs'
  files are fetched once and kept for offline use (the service worker
  saves them).
- `index.json` and the page files are in the offline list.
- The 114 files together are a few megabytes and are never all loaded at once.

## 6. Files

- `tools/quran/build-data.mjs` (new): the data script.
- `pages/quran/data/` (new, generated): 114 surah files and `index.json`.
- `pages/quran/rules.js`, `pages/quran/quran.js`, `pages/quran/quran.css` (new).
- `index.html`:
  - the `hifz` collection;
  - the Quran dock route after Mood;
  - `PAGE_FILES`, `PAGE_IDS` and `PAGE_DEPS`;
  - the Amiri Quran font link;
  - the setting.
- `sw.js`: page files and `index.json` in the offline list, and surah data
  files saved when fetched.

## 7. Tests

- `tests/quran-rules.test.cjs`:
  - path order and ties;
  - known surahs skipped and blocks refilled;
  - the last short block;
  - step states;
  - review opening and finishing;
  - the day count, including past 14.
- `tests/quran-data.test.cjs`:
  - 114 files and an index;
  - verse counts match;
  - no empty fields;
  - the Arabic is Arabic script;
  - every file has sources.
- `tests/quran.test.cjs` (browser):
  - Block 1 shows the 4 shortest surahs;
  - "I know this" refills the block;
  - Test me hides and reveals;
  - I've learned it moves to the next step;
  - the review needs all 4 Solid;
  - a checked reading survives a reload;
  - phone width (375px, 8 dock tabs, no sideways scroll) and dark mode;
  - verse ▶ seeks to the verse's start using fake timings;
  - with no timings, the verse buttons are hidden.
- The existing suite keeps passing; the page lists in existing tests gain `quran`.

## Not now

- Spaced review of older blocks.
- A daily plan inside a block.
- Recording yourself.
- Tajweed colouring.
- Choosing a different translation.
