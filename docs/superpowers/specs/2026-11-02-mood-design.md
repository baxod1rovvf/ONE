# Mood in Core: design

Date: 2026-11-02
Status: approved in conversation, waiting for spec review
Builds on: pages in their own files (`pages/<id>/`), Supabase sync, the Home cards

## Why

The owner wants to mark each day with how it went, see their mood over the
week, see the week's best and worst day, and write a note on why the mood
was like that. It's private, and syncs between their devices like tasks do.

Success: marking a day takes a couple of seconds, and the week view answers
"how was my week, and why?" at a glance.

## Decisions already made

| Question | Decision |
|---|---|
| How a day is marked | 5 faces: 1 awful, 2 bad, 3 okay, 4 good, 5 great. One tap. |
| Best and worst day | For the week being shown only. Earlier weeks can be stepped back to. |
| Where it lives | A new Mood page in the side menu, plus a "How was today?" card on Home. |
| Week | Monday to Sunday. |
| Reminders | None. After 21:00 the Home card is a little more noticeable; nothing else. |

## 1. Data

- A new synced collection, `moods`, in the workspace next to `tasks`.
- One entry per day: `{ id, date, mood, note, createdAt }`.
  - `date` is a local date, `YYYY-MM-DD`. At most one entry per date.
  - `mood` is a whole number from 1 to 5.
  - `note` is optional text, at most 500 characters (the field stops taking more).
- `moods` is added to `createEmptyData`, the sample data (a few days of the
  current week, marked `sample: true`, like other sample items), to
  `EXTRA_COLLECTIONS` (so an older workspace without it loads with an empty
  list) and to `SYNCED_COLLECTIONS` (so it syncs, merges and keeps
  tombstones like tasks). The Settings backup carries it, since it is part
  of the workspace.
- When the same day is marked on two devices, the later edit wins, the same
  way tasks merge today.

## 2. Rules

All the date and summary maths lives in `pages/mood/rules.js`, which knows
nothing about the screen and is exposed as `window.__oneMoodRules` (internal names keep `one`, like `__oneTelegramRules`)`.

- **Marking.** Choosing a face on a day with no entry adds one. Choosing a
  different face changes it. Choosing the same face again clears the mood;
  if the day also has no note, the entry is removed, otherwise the note is
  kept and the day shows as unmarked with a note.
- **Which days.** Today and any past day can be marked or changed. Future
  days cannot.
- **Week.** `weekStart(date)` is the Monday on or before `date`. A week is
  that Monday and the six days after it.
- **Week's mood.** The average of the marked days' moods, rounded to the
  nearest whole face (x.5 rounds up), shown as that face and its word, with
  the count of marked days: "Good · 5 of 7 days". Unmarked days don't count.
  With no marked days, the week shows "No days marked yet".
- **Best day.** The highest mood that week. Ties go to the day with a note,
  then to the more recent day.
- **Worst day.** The lowest mood that week, with the same tie rules.
- **Not enough to compare.** Best and worst are shown only when at least 2
  days are marked and not all of them have the same mood. Otherwise one
  line says "Mark a few more days to see your best and worst."

## 3. Screens

### Home: "How was today?"

- A frosted card, like the Telegram card, with the 5 faces in a row and the
  question "How was today?".
- One tap marks today. The card then shows the chosen face and word, and a
  "Why?" button that opens a note field in place; the note saves as it is
  typed.
- Tapping another face changes today's mark; tapping the chosen one again
  clears it.
- From 21:00, while today is unmarked, the card has a stronger accent border.
- "See the week" opens the Mood page.

### Mood page (`#mood`)

- Page head: title "Mood", a one-line description, and the week ("Nov 2 –
  8") with previous/next week buttons. Next is disabled on the current week.
- **Week strip:** seven days, each a button with its face (or an empty dot),
  weekday and date. Today is outlined. Future days are shown but disabled.
- **Day editor:** tapping a day opens it under the strip (today is open on
  first visit): the day's name, the 5 faces, and a note field labelled
  "Why was it like that?". The note saves as it is typed. No Save button.
- **Summary:** three lines under the strip:
  - This week: face, word, "n of 7 days".
  - Best day: face, weekday, and the note's first line if there is one.
  - Worst day: the same.
  Best and worst are buttons that open that day.
- **The week's notes:** each day with a note, newest first, with its face.
- **Empty week:** a friendly line and the 5 faces to mark today.

### Faces and colour

- Faces are drawn as SVG (circle, eyes, a mouth that curves from frown to
  smile), not emoji, so they look the same everywhere.
- Each mood has a soft colour from red (awful) through amber (okay) to green
  (great), defined as tokens for light and dark themes. The word is always
  shown or announced with the face; colour is never the only clue.
- Face buttons have accessible names ("Great", "Good"...) and `aria-pressed`.
- Works from 375px wide upward with no sideways scrolling.

## 4. Files

- `pages/mood/rules.js` (new): the rules in section 2.
- `pages/mood/mood.js`, `pages/mood/mood.css` (new): the page, loaded like
  the other pages.
- `index.html`: the `moods` collection, the Mood route in the side menu,
  `PAGE_FILES`, a shared `MoodFace` component and the mood words and colours
  on `window.__oneApp`, and loading `rules.js` before the page and the Home
  card need it.
- `pages/home/home.js`, `pages/home/home.css`: the "How was today?" card.
- `sw.js`: the new files in the offline list.

## 5. Tests

- `tests/mood-rules.test.cjs`:
  - weeks run Monday to Sunday (including across a month and a year),
  - the average and its rounding,
  - best and worst ties,
  - "not enough to compare",
  - future days can't be marked.
- `tests/mood.test.cjs`:
  - marking on Home shows on the Mood page,
  - tapping the chosen face again clears it,
  - a note saves and survives a reload,
  - previous week works and next stops at the current week,
  - no console errors and no sideways scroll at phone width and in dark mode.
- The existing suite keeps passing; the baseline route test includes `mood`.

## Not now

Month and year views, charts over time, tags or activities, reminders or
notifications, export of moods on their own.
