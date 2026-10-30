# More Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the Retro games so only the open game is loaded and running, then add 2048 (with size choice), Minesweeper (3 levels) and Memory sequences (4 or 6 colours).

**Architecture:**
- `games/panel.js` holds the panel, the list, the records and the synth.
- Each game lives in its own `games/<id>.js` + `.css` and registers into `window.__oneGameModules`. The panel loads a game's files when it's opened and unmounts it on leave.
- Each game keeps the existing pattern: pure rule functions exposed as a `window.__one<Name>` hook, plus a React component.

**Tech Stack:** plain browser scripts (no build), React 18 via `window.__oneKit`; tests use `node:test` + Playwright (`tests/helpers.cjs`).

**Spec:** `docs/superpowers/specs/2026-10-29-more-games-design.md`

## Global Constraints

- No build step and no new dependencies. The game code stays out of `index.html`.
- Record keys in `one.games.v1`:
  - existing: `snake`, `tetris`, `breakout`;
  - 2048: `2048-3`…`2048-6`;
  - Minesweeper (times, lower wins): `mines-easy`, `mines-medium`, `mines-hard`;
  - Memory: `memory-4`, `memory-6`.
- Copy fixed by the spec:
  - "Couldn't open this game. Check your connection and try again.";
  - 2048: "You win!", "Keep going", "New game", "Undo";
  - Minesweeper: "You cleared it in m:ss!", "🏆 New best time!", "Boom!", "Flag mode";
  - Memory: "Watch…", "Your turn", "Wrong colour! You reached round N.";
  - all games: "Game over", "🏆 New record!", "Play again".
- 2048:
  - tile colours as listed in the spec;
  - a new tile is a 2 at 90% odds, otherwise a 4;
  - slides take 120 ms;
  - a swipe needs at least 24 px.
- Minesweeper:
  - levels: easy 9×9/10, medium 16×16/40, hard 16×30/99 (30×16 when the viewport is portrait and at most 520 px wide);
  - a long press flags after 400 ms;
  - number colours as listed in the spec;
  - squares are at least 28 px on touch screens.
- Memory:
  - each colour lights for `max(300, 600 − 20·(round − 1))` ms, with a 120 ms gap;
  - colours as listed in the spec, in this order: 4 colours = green, red, yellow, blue; 6 colours add purple and orange.
- Every game:
  - Esc pauses while playing, then steps back;
  - works at 375×740, 320×568, 740×375 and 1280×800 without sideways scrolling;
  - follows reduced motion;
  - sets `window.__oneActiveGame = id` while mounted.

## Review Focus

1. **Opening game B while game A's file is still loading** (a fast double choice): only B ends up mounted, and A's late `Component` never mounts. *(Task 1 test)*
2. **2048 on a full board where the only move merges a pair:** it is not game over, and the spawn after that merge fits. *(Task 2 test)*
3. **Minesweeper Easy, the first click in a corner:** it's safe and opens an area. Mines are never placed in that 3×3 even near the edges, and the mine count stays exact. *(Task 3 test)*
4. **Memory: tapping during playback, or pausing mid-playback:** taps are ignored, nothing is scored, and on resume the sequence starts again from the first colour. *(Task 4 test)*
5. **Leaving a game while its timers are running** (Minesweeper's clock, Memory's playback, 2048's slide timeout): there are no state updates after unmount, and no console errors. *(Tasks 2–4 tests, via a page-error check after "All games")*

---

### Task 1: One file per game; the panel loads only the open game

**Files:**
- Create: `games/panel.js`, `games/panel.css`, `games/snake.js`, `games/snake.css`, `games/tetris.js`, `games/tetris.css`, `games/breakout.js`, `games/breakout.css` (split from `games/games.js` and `games/games.css`, which are then deleted).
- Modify:
  - `index.html`: `loadGames()` loads `games/panel.js` and `games/panel.css`; `APP_FILES` lists all of `games/*.js` and `games/*.css`;
  - `sw.js`: `SHELL` lists the same files.
- Modify tests:
  - `tests/helpers.cjs`: add `loadGame(page, id)`;
  - `tests/games-load.test.cjs`, `tests/update.test.cjs`: the file list;
  - `tests/games.test.cjs`, `tests/tetris.test.cjs`, `tests/breakout.test.cjs`: call `loadGame` before using the rule hooks.
- Create: `tests/games-switch.test.cjs`.

**Interfaces:**
- Produces:
  - **The kit:** `panel.js` sets `window.__oneGameKit = { React2, reactDom, IconButton, FOCUSABLE, icons, useGameRecord, loadGameRecords, retroSound, RETRO_NOTES, tetrisRandom }`. `tetrisRandom` is the seeded rng, shared by Breakout and the new games.
  - **Registration:** `window.__oneGameModules = window.__oneGameModules || {}`. Each game file assigns `window.__oneGameModules[id] = { Component }` and keeps its rule hooks (`__oneSnake`, `__oneTetris`, `__oneBreakout`).
  - **Loading:** `window.__oneGames = { GamesPanel, loadGame(id) -> Promise<{ Component }> }`:
    - it's memoised per id;
    - a failure clears the memo and removes the failed tags;
    - the CSS is `games/<file>.css`.
  - **`GAMES` entries:** `{ id, title, blurb, emoji, file }`, with `file` ∈ snake, tetris, breakout (2048, minesweeper and memory are added in Tasks 2–4).
  - **`GamesPanel`:**
    - pointer-enter or focus on a card calls `loadGame(id)` early;
    - opening sets `pending = id`, awaits `loadGame`, and mounts only if `pending` is still that id (Review Focus 1);
    - a spinner shows on the card after 120 ms;
    - a failure shows the spec's message.
  - **Active-game hook:** each game component's mount effect sets `window.__oneActiveGame = id`, and its cleanup clears it if it still equals that id.
  - **Test helper:** `loadGame(page, id)` in `tests/helpers.cjs`: `waitForGames(page)`, then `page.evaluate(id => window.__oneGames.loadGame(id), id)`.
  - **File list:** `APP_FILES` (in `index.html`) and `SHELL` (in `sw.js`) contain `./games/panel.js`, `./games/panel.css` and every game's `.js`/`.css`. `update.test.cjs`'s `FILES` (and its count of 4) becomes that list plus `index.html` and the manifest.

- [ ] **Step 1: Write the failing tests** in `tests/games-switch.test.cjs`, and update `tests/games-load.test.cjs`:
  - `only the panel loads in the background`: after load and `waitForGames`, the performance resource entries include `/games/panel.js` and contain no `/games/snake.js`, `/games/tetris.js` or `/games/breakout.js`.
  - `opening a game loads only that game`: open Tetris, and the resources now include `/games/tetris.js` but still no `/games/breakout.js`.
  - `switching games switches the old one off`:
    1. Open Breakout and press Space.
    2. Read `window.__oneBreakoutFrames` (a counter that Breakout's rAF increments; add it as a test hook) and wait 300 ms.
    3. Click "All games" and open Snake.
    4. `__oneActiveGame` is "snake", `__oneBreakoutControl` is undefined, and `__oneBreakoutFrames` doesn't change over 500 ms.
  - `closing the panel leaves no game running`: open Tetris, close the panel, and `__oneActiveGame` is undefined.
  - `choosing another game while one is loading opens only the last` (Review Focus 1): delay `games/tetris.js` by 800 ms with `page.route`. Click Tetris, then "All games", then Snake. After 1.5 s the dialog is named "Snake" and `__oneActiveGame` is "snake".
  - `a game that can't load says so and retries`: abort `games/snake.js`, click Snake, and the spec's message shows. Un-route and click again: it opens.
  - Update `index.html no longer carries the game code`: `games/snake.js` contains `function SnakeGame` and `games/tetris.js` contains `function TetrisGame`.
- [ ] **Step 2: Run** `cd tests && node --test --test-concurrency=1 games-switch.test.cjs games-load.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement the Interfaces above** by moving code verbatim between files. Each game file starts with an IIFE that destructures `window.__oneGameKit`. Move each game's CSS block into its own CSS file, and keep the shared rules (`.games*`, `.game-card*`, `.snake-message*`, `.snake-play`, `.snake-pause`, `.snake-mute`, `.snake-stat*`, `.snake-record`, `.snake-hint`, the keyframes they use) in `panel.css`.
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 games-switch.test.cjs games-load.test.cjs games.test.cjs tetris.test.cjs breakout.test.cjs update.test.cjs sw.test.cjs home.test.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "perf: each game in its own file; only the open game is loaded and running"`

### Task 2: 2048

**Files:**
- Create: `games/2048.js`, `games/2048.css`, `tests/game-2048.test.cjs`
- Modify: `games/panel.js` (the `GAMES` entry `{ id: "2048", title: "2048", blurb: "Slide, merge, reach 2048.", emoji: "🔢", file: "2048" }`, and new `RetroSound` cues `g48Move`, `g48Merge(value)`, `g48Win`), `index.html` `APP_FILES`, `sw.js` `SHELL`.

**Interfaces:**
- Produces:
  - `window.__one2048 = { t48New, t48Move, t48CanMove, t48Spawn }`.
  - **State:** `{ size, cells: number[][] (0 = empty), score, won, kept, over, undo: null | { cells, score }, rng, nextId, tiles: [{ id, r, c, v }] }`. `tiles` track identity for animation.
  - `t48Move(state, dir: "up"|"down"|"left"|"right") -> { state, moved, merges: [{ r, c, v }], gained }`. It spawns only when `moved`, and saves `undo` before moving.
  - **Undo:** `t48Undo(state)` restores `undo` and sets it to null.
  - **Winning:** "Keep going" sets `kept = true`, so the win card isn't shown again.
  - **Component:** `Game2048`, with the DOM:
    - `.g48[data-status]`, where status ∈ ready|playing|won|over|paused;
    - `.g48-board[data-size]`, with `.g48-tile[data-value][data-r][data-c]`;
    - test ids `g48-score` and `g48-best`;
    - buttons "Undo", "New game", "Keep going", "Play again".
- **Seeds:** `window.__one2048Seed` and `window.__one2048Cells` (a start board) as test seams.

- [ ] **Step 1: Write the failing tests** in `tests/game-2048.test.cjs`. Rule tests run on a page after `loadGame(page, "2048")`.
  - `a row merges each tile once`:
    - `[2,2,2,2]` moved left gives `[4,4,0,0]` and gains 8;
    - `[2,2,4,0]` gives `[4,4,0,0]` and gains 4, not `[8,…]`;
    - `[4,0,0,4]` gives `[8,0,0,0]`.
  - `only a real move adds a tile`: a board whose left move changes nothing gives `moved: false` and the same number of tiles. After a real move there's exactly one more tile, and it's a 2 or a 4.
  - `2048 wins once; Keep going continues`: two 1024 tiles merge → `won`, and after Keep going a later merge doesn't re-show the card.
  - `full board with one merge left is not over` (Review Focus 2): a 4×4 with no empty square and one adjacent pair gives `t48CanMove` true. A full board with no pairs → over.
  - `Undo restores the board and score once`: after a move, Undo brings back the cells and score, and a second Undo does nothing (the button is disabled).
  - **On screen:**
    - `sizes have their own best score`: choose 3×3, play until over with a seeded start, and `one.games.v1["2048-3"].best` = the score while `2048-4` is untouched;
    - `keys and swipe move the tiles`: ArrowLeft and a touch swipe (pointer events) both change `data-c` of a tile;
    - `fits phones`: at 375×740 and 740×375 the board is inside the viewport, with no sideways scroll;
    - `leaving mid-slide raises no errors` (Review Focus 5): press ArrowLeft, then "All games" immediately; there are no page errors after 500 ms.
- [ ] **Step 2: Run** `cd tests && node --test game-2048.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement the Interfaces above.**
  - Tiles are absolutely positioned with `transform: translate(calc(var(--cell) * c), calc(var(--cell) * r))` and `transition: transform 120ms`.
  - Merged tiles get a `pop` class for 150 ms. A "+N" float sits on the Score box.
  - Reduced motion: no transitions.
  - Board size: `min(440px, calc(100vw - 64px), calc(100dvh - 300px))`.
  - Keys and touch follow the Global Constraints, plus U for Undo, P to pause and M for sound.
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 game-2048.test.cjs games-switch.test.cjs`. Expected: all pass. Then take screenshots (1280×800 Morning and Night, 390×844).
- [ ] **Step 5: Commit** `git commit -am "feat: 2048 — four sizes, undo, win and keep going"`

### Task 3: Minesweeper

**Files:**
- Create: `games/minesweeper.js`, `games/minesweeper.css`, `tests/game-mines.test.cjs`
- Modify: `games/panel.js` (the entry `{ id: "minesweeper", title: "Minesweeper", blurb: "Clear the field without a boom.", emoji: "💣", file: "minesweeper" }`, and cues `msOpen`, `msFlag`, `msBoom`, `msWin`), `index.html` `APP_FILES`, `sw.js` `SHELL`.

**Interfaces:**
- Produces:
  - `window.__oneMines = { LEVELS, minesNew, minesOpen, minesChord, minesFlag }`.
  - **Levels:** `LEVELS = { easy: { rows: 9, cols: 9, mines: 10 }, medium: { rows: 16, cols: 16, mines: 40 }, hard: { rows: 16, cols: 30, mines: 99 } }`.
  - **New game:** `minesNew(level, seed, { portrait = false })` swaps hard's rows and columns when `portrait` is set.
  - **State:** `{ level, rows, cols, mines, placed: false, cells: [{ mine, open, flag, n }], status: "ready"|"playing"|"won"|"lost", hit: index|null, startedAt, endedAt, rng }`.
  - **Opening:** `minesOpen(state, r, c)` places the mines on the first call, avoiding the 3×3 around (r, c), with an exact count. It flood-opens squares with n = 0, using an iterative queue.
  - **Chording:** `minesChord(state, r, c)` opens the closed, unflagged neighbours when the flags around equal `n`.
  - **Flagging:** `minesFlag(state, r, c)` toggles on a closed square only.
  - **Component:** `Minesweeper`, with the DOM:
    - `.ms[data-status]`;
    - `.ms-grid[data-rows][data-cols]`, with buttons `.ms-cell[data-r][data-c][data-state=closed|open|flag]` and `data-n` when open;
    - test ids `ms-time` (m:ss) and `ms-left`;
    - the switch "Flag mode" and the buttons "New game", "Easy", "Medium" and "Hard".

- [ ] **Step 1: Write the failing tests** in `tests/game-mines.test.cjs`:
  - `the first click is safe and opens an area, even in a corner` (Review Focus 3): for 30 seeds, `minesOpen(minesNew("easy", seed), 0, 0)`:
    - the status isn't "lost";
    - the mine count is exactly 10;
    - there are no mines in rows 0–1 / columns 0–1;
    - more than 1 square is open.
  - `flood opening stops at numbers`: in a hand-built state with mines in one column, opening the far side opens every square up to the numbered border, and no mines.
  - `chording opens around a satisfied number; flags toggle only on closed squares`.
  - `opening a mine loses; opening every safe square wins`.
  - `mines left counts flags and can go negative`.
  - **On screen:**
    - `the timer starts on the first open and the best time is kept per level`: with a seeded Easy game, open the safe squares through the test hook `window.__oneMinesSolve()` (it opens every safe square through the UI handlers). The win message has the m:ss form, and `one.games.v1["mines-easy"].best` is set while medium is untouched.
    - `right-click flags, long press flags, Flag mode flags`.
    - `keyboard: arrows move focus, Enter opens, F flags`.
    - `Hard scrolls inside its frame on a phone`: at 375×740, Hard has `data-rows="30"`, the `.ms-frame` scrollHeight is greater than its clientHeight, and the document doesn't scroll sideways.
    - `leaving while the clock runs raises no errors` (Review Focus 5).
- [ ] **Step 2: Run** `cd tests && node --test game-mines.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement the Interfaces above.**
  - The look follows the spec: raised blue closed squares, white open squares, yellow flagged squares.
  - The clock renders from `startedAt` with a 1 s interval while playing.
  - `contextmenu` calls `preventDefault` on the grid.
  - The long press is pointerdown plus a 400 ms timer, cancelled by moving more than 8 px or by pointerup.
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 game-mines.test.cjs games-switch.test.cjs`. Expected: all pass. Then take screenshots.
- [ ] **Step 5: Commit** `git commit -am "feat: Minesweeper — three levels, safe first click, flags and chording"`

### Task 4: Memory sequences

**Files:**
- Create: `games/memory.js`, `games/memory.css`, `tests/game-memory.test.cjs`
- Modify: `games/panel.js` (the entry `{ id: "memory", title: "Memory", blurb: "Watch the colours, repeat the sequence.", emoji: "🎨", file: "memory" }`, and the cue `memTone(i)` with tones C5 E5 G5 C6 E6 G6 plus a `memWrong` buzz), `index.html` `APP_FILES`, `sw.js` `SHELL`.

**Interfaces:**
- Produces:
  - `window.__oneMemory = { memNew, memNextRound, memPress, memStepMs, MEM_COLORS }`.
  - **State:** `{ colors: 4|6, sequence: number[], step: 0, round: 0, score: 0, status: "ready"|"watch"|"input"|"paused"|"over", rng }`.
  - **Next round:** `memNextRound(state)` appends one random index below `colors`, sets `round = sequence.length`, `step = 0` and `status = "watch"`.
  - **Pressing:** `memPress(state, i)` is ignored unless the status is "input".
    - A correct press advances `step`. When `step === sequence.length`, the score becomes `round` and the status `"done"`.
    - A wrong press → `"over"` with `wrong: { pressed: i, expected }`.
  - **Timing:** `memStepMs(round) = max(300, 600 − 20·(round − 1))`.
  - **Component:** `MemoryGame`:
    - It drives watch → playback (timeouts) → input → done → next round after 600 ms.
    - The DOM: `.mem[data-status][data-colors]`, slices as buttons `Colour 1…6` (aria-label "Green", "Red", "Yellow", "Blue", "Purple", "Orange") with `data-lit="true"` while lit, a centre `.mem-round`, and test ids `mem-score` and `mem-best`.
- **Seeds:** `window.__oneMemorySeed` as a test seam.

- [ ] **Step 1: Write the failing tests** in `tests/game-memory.test.cjs`:
  - `the sequence grows by one each round and keeps its start`.
  - `a wrong press ends the game; presses outside input are ignored`.
  - `playback speeds up and stops at 300 ms`: `memStepMs(1) === 600`, `memStepMs(11) === 400`, `memStepMs(16) === 300` and `memStepMs(40) === 300`.
  - **On screen:**
    - `4 and 6 colour modes with number keys`: choose 6 colours, and there are 6 slices. With seed 3, read the lit order from `data-lit` during playback, then repeat it with keys `1..6`; the score becomes 1.
    - `taps during playback are ignored and pause replays from the start` (Review Focus 4): during "watch", click a slice and the score stays 0. Press P then P, and the first lit slice after resuming is `sequence[0]` (read through the hook).
    - `a wrong press shows the message and keeps the best score per mode`: "Wrong colour! You reached round 1." appears, and `one.games.v1["memory-6"].best` is set while `memory-4` is untouched.
    - `fits phones`.
    - `leaving during playback raises no errors` (Review Focus 5).
- [ ] **Step 2: Run** `cd tests && node --test game-memory.test.cjs`. Expected: FAIL.
- [ ] **Step 3: Implement the Interfaces above.**
  - The circle is SVG: slices are `path` arcs with a gap of 6°, and the centre is a circle with the round number.
  - A lit slice gets a brighter fill and a CSS glow (`filter: drop-shadow`). Reduced motion keeps the brightness change but no glow animation.
  - Key mapping goes clockwise from the top-left slice.
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 game-memory.test.cjs games-switch.test.cjs games.test.cjs tetris.test.cjs breakout.test.cjs game-2048.test.cjs game-mines.test.cjs games-load.test.cjs home.test.cjs`. Expected: all pass. Then take screenshots.
- [ ] **Step 5: Commit and push** `git commit -am "feat: Memory sequences — 4 and 6 colours, speeding up" && git push -u origin ccr-f62deaf2-d44ra0`
