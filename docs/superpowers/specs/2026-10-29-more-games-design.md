# More games: one game at a time, 2048, Minesweeper, Memory sequences — design

Date: 2026-10-29
Status: draft, waiting for review
Builds on: `2026-10-29-fast-loading-design.md` (games load from `games/`), the Retro games panel, Snake, Tetris and Breakout

## Why

The owner is adding three more classic games: **2048**, **Minesweeper** and **Memory sequences** (Simon). With six games, they want no lag: only the open game may exist and run. Starting another game must switch every other game off completely.

## Decisions already made

| Question | Decision |
|---|---|
| "Completely off" | One file per game. Only the open game is loaded and running, and leaving or switching stops everything it started. |
| 2048 | Sizes 3×3, 4×4 (default), 5×5 and 6×6, with a best score per size. A win screen at 2048 with Keep going or New game. One Undo per move. |
| Minesweeper | Easy 9×9 with 10 mines, Medium 16×16 with 40, and Hard 16×30 with 99 (30×16 on phones, scrolling). A best time per level. |
| Memory sequences | 4-colour and 6-colour modes. Classic: a wrong colour ends the game. Playback speeds up, with a best score per mode. |

## Constraints

- No build step and no new dependencies. Everything is plain scripts and CSS under `games/`, using React through `window.__oneKit`.
- Best scores go in `localStorage["one.games.v1"]` under the keys `2048-3`…`2048-6`, `mines-easy`/`mines-medium`/`mines-hard` (times, lower is better) and `memory-4`/`memory-6`. Snake, Tetris and Breakout keep their keys.
- The shared sound synth and mute setting are reused. Esc pauses a running game first and then steps back, as Tetris does.
- Every game works in both themes, at 375×740, 320×568 and 740×375, and with reduced motion. They are all playable by keyboard, mouse and touch.

## 1. One game at a time, each in its own file

**Files:**
- `games/panel.js` + `games/panel.css`: the panel (`GamesPanel`), the game list, best-score helpers (`useGameRecord`), `RetroSound` and the shared message and score-box styles.
- One file pair per game: `games/snake.js`/`.css`, `games/tetris.js`/`.css`, `games/breakout.js`/`.css`, `games/2048.js`/`.css`, `games/minesweeper.js`/`.css` and `games/memory.js`/`.css`.
- `games/games.js` and `games/games.css` are removed.

**Registering:**
- `panel.js` sets `window.__oneGames = { GamesPanel }`, as today, so `index.html`'s `loadGames()` loads `panel.js`/`panel.css` instead of `games.js`/`games.css`.
- It also exposes `window.__oneGameKit = { React2, useGameRecord, retroSound, …shared helpers }` for the game files.
- Each game file finishes with `window.__oneGameModules[id] = { Component }`.

**The list:** `GAMES` in `panel.js` holds only metadata (`id`, `title`, `blurb`, `emoji`, `file`).

**Opening a game:**
- The panel loads its `.js` and `.css` once (memoised, with a retry after a failure, like `loadGames`).
- While the files arrive, the card shows a spinner, but only after 120 ms.
- Pointing at or focusing a card starts loading early.
- If loading fails, the message "Couldn't open this game. Check your connection and try again." appears.

**Switching off:**
- Only one game component is mounted at a time, so leaving (back, closing or opening another game) unmounts it.
- Each game's cleanup stops all of its timers, animation frames, listeners and sounds, and removes its `window.__one<Game>Control`-style hooks.
- Each game also sets `window.__oneActiveGame = id` while mounted and clears it on unmount, as a test hook.

**Offline:** `sw.js` adds every `games/*.js` and `games/*.css` file to `SHELL`, and `updateApp()`'s `APP_FILES` gains them too, so a Refresh or daily update keeps all the game files current and consistent.

## 2. 2048

**Rules** (pure functions, `window.__one2048`):
- **New game:** `t48New(size, seed)` starts with 2 tiles.
- **Moving:** `t48Move(state, dir)` slides the tiles. Each tile merges at most once per move, and points are the sum of the merged values. It returns `{ state, moved, merges, gained }`.
- **New tile:** after a move that changed something, a tile is added on a random empty square: 2 at 90% odds, 4 at 10%.
- **Winning:** `won` becomes true the first time a 2048 tile exists. "Keep going" hides the win card and continues.
- **Game over:** no empty square and no possible merge.
- **Undo:** the state before the last move is kept, so one Undo restores it, score included. Undo is then off until the next move.

**Screen:**
- **The bar:** a size picker on the start card (3×3 / 4×4 / 5×5 / 6×6), and boxes for Score, Best (for that size) and Undo.
- **Board:** a square with tiles sized to fit. Slides take 120 ms, merged tiles pop, new tiles fade in, and "+N" floats up. Reduced motion jumps straight to the result.
- **Colours** (a dark purple board, as in the reference): 2 `#efe3ff`, 4 `#dcc6ff`, 8 `#c39bff`, 16 `#a874ff`, 32 `#8f4dff`, 64 `#7426f0`, 128 `#5f12cc`, 256 `#4a0aa8`, 512 `#ff8fb1`, 1024 `#ff6f7d`, 2048 `#ffc24b`, and higher `#ffd86e`. Dark text up to 32, light text from 64.
- **Controls:** arrows or WASD, swipe (24 px minimum), U for Undo, P to pause, M for sound.
- **Messages:** "You win!" (Keep going / New game) and "Game over" with the score, "🏆 New record!" and Play again.

## 3. Minesweeper

**Rules** (`window.__oneMines`):
- **New game:** `minesNew(level, seed)` with level easy, medium or hard. Mines are placed on the first `minesOpen`, never on the clicked square or its 8 neighbours.
- **Opening:**
  - `minesOpen(state, r, c)` reveals a square and flood-opens squares with no mines around them.
  - `minesChord(state, r, c)` opens the neighbours of a revealed number when its flags equal its number.
  - `minesFlag(state, r, c)` toggles a flag on an unrevealed square.
- **The status:**
  - opening a mine → `lost` (the hit mine is marked);
  - every safe square revealed → `won`.
- **The counter:** mines left = mines − flags. It can go negative.
- **The timer:** whole seconds from the first open until a win or a loss, shown as m:ss. The best time is saved per level when you win.

**Screen:**
- **Top bar:** level picker (Easy / Medium / Hard), ⏱ time, 💣 mines left, Flag mode (touch), New game.
- **Grid:**
  - Unrevealed squares are raised blue (`#4aa8f0`, with a light top edge). Revealed squares are white or very light grey.
  - Numbers use 1 `#1e88c7`, 2 `#5a8f1e`, 3 `#d63b4e`, 4 `#3949ab`, 5 `#8d4b16`, 6 `#00897b`, 7 `#333`, 8 `#777`.
  - Flagged squares are yellow (`#f6c443`) with a red 🚩.
  - On a loss every mine shows 💣, the hit one on red, and wrong flags show ✕.
- **Size:**
  - Squares fit the panel, with at least 28 px on touch screens. A board that is wider or taller than the panel scrolls inside its own frame, never the page.
  - Hard on a phone held upright uses 30 rows × 16 columns.
- **Controls:**
  - mouse: left opens, right flags, and a click on a satisfied number chords;
  - touch: tap opens, a 400 ms long press flags, and Flag mode makes taps flag;
  - keyboard: arrow keys move a visible focus square, Enter or Space opens (and chords on numbers), F flags.
- **Messages:** "You cleared it in m:ss!" (with "🏆 New best time!") and "Boom!", each with New game.

## 4. Memory sequences

**Rules** (`window.__oneMemory`):
- **New game:** `memNew(colors, seed)` with colors 4 or 6.
- **Each round:** `memNextRound(state)` adds one random colour to the sequence.
- **Your input:** `memPress(state, i)` checks the next expected colour:
  - a correct press advances;
  - finishing the sequence completes the round, and score = rounds completed;
  - a wrong press → `over`.
- **Playback timing:** each colour lights for `max(300, 600 − 20 × (round − 1))` ms, with a 120 ms gap. There is no time limit on your turn.

**Screen:**
- **The circle:** colour slices around a centre showing the round number.
  - 4 colours: green `#2ecc55`, red `#f2453d`, yellow `#f5d82a`, blue `#3e6fd8`.
  - 6 colours add purple `#9b59d0` and orange `#ff8c2e`.
  - A lit slice glows and brightens, and each colour has its own tone through the shared synth.
- **Start card:** a mode picker (4 colours / 6 colours) and Play.
- **The bar:** Score, Best (for the mode), Pause and Sound.
- **Controls:** tap or click a slice, or press keys 1–4 (or 1–6) in order around the circle starting at the top-left. Input is ignored while a sequence is playing. P pauses; on resume the current sequence plays again.
- **Messages:** "Watch…" and "Your turn" as a hint under the circle. When the game ends: "Wrong colour! You reached round N." with "🏆 New record!" and Play again. The right slice flashes after a wrong press.

## Testing

- **The split** (`games-load.test.cjs`, `games-switch.test.cjs`):
  - Only `panel.js` loads in the background. Opening a game loads just its file.
  - Breakout → back → Snake: `__oneBreakoutControl` is gone, no Breakout frames are drawn (a frame counter stays flat), and `__oneActiveGame` is "snake".
  - Closing the panel leaves `__oneActiveGame` empty.
  - A failed game load shows the message and retries.
  - The Snake, Tetris and Breakout suites pass unchanged, apart from waiting for their game file.
- **2048 rules:**
  - slides and merges, with each tile merging once per move ([2,2,2,2] → [4,4]);
  - the score is the sum of merges;
  - a tile is added only when something moved;
  - the win flag appears at 2048, and Game over when no move is left;
  - Undo restores the board and score, once.
- **2048 on screen:** size choice, best score per size, keys and swipe, the win card with Keep going, and phone layouts.
- **Minesweeper rules:**
  - the first click is safe and opens an area;
  - flood opening, chording, flag toggling, and the mines-left counter;
  - losing on a mine, and winning when every safe square is revealed.
- **Minesweeper on screen:**
  - the timer starts on the first open;
  - right-click flags, long press flags, and Flag mode works;
  - the keyboard controls work;
  - the best time is saved per level;
  - Hard scrolls inside its frame on a phone.
- **Memory rules:** the sequence grows by one each round, a wrong press means over, and the playback speed follows the formula and its limit.
- **Memory on screen:**
  - 4- and 6-colour modes, with the keys mapped correctly;
  - input is ignored during playback;
  - a wrong press shows the message and saves the best score;
  - pausing replays the sequence.
- **Regression:** fast loading (`update.test.cjs`, `sw.test.cjs`), Home and the sound tests still pass.

## Not included

Online leaderboards, a 2048 "hint", Minesweeper custom sizes or question-mark flags, Memory time limits or a relaxed mode, and achievements.
