# Tetris: design

Date: 2026-10-29
Status: draft, waiting for review
Builds on: the Retro games panel and Snake (Home → Games)

## Why

Home has a Retro games panel with one game, Snake. The owner wants more simple retro games there. This spec covers the second one, classic Tetris. Breakout (the "block game", with endless levels) is a separate spec that comes next.

Success means Tetris feels like the real game: fair piece order, rotation that doesn't get stuck at walls, line clears with the rows above dropping down, a next-piece preview, points and a saved best score. It should be just as playful and easy to use on a laptop or a phone as Snake.

## Decisions already made

| Question | Decision |
|---|---|
| Field size | 10 wide × 18 tall. 10 is the classic width; 18 rows (not the usual 20) keep the squares big on laptop and phone screens. |
| 8 colours | Each of the 7 shapes has a fixed colour: I white, O yellow, T pink, S green, Z red, J blue, L orange. Grey is only the landing shadow. |
| Extras | Hard drop, levels that speed up every 10 lines, a short line-clear flash, and bonuses for 2–4 lines at once. No Hold. |
| How it's built | The same way as Snake: plain rule functions with no drawing, and a React component that draws a grid of squares. No canvas, no library. |

## Constraints

- Everything lives in `index.html`, next to the Snake code, following its style. No new dependencies.
- It reuses the shared panel, the best-score helpers (`one.games.v1` in localStorage, per device) and the `RetroSound` chiptune synth with its mute setting.
- It works in the Morning and Night themes, fits a 375px-wide phone, and follows reduced-motion settings.

## Rules

**Pieces.** Pieces are dealt from a shuffled bag of all 7 shapes; when the bag is empty, a new one is shuffled. The shuffle uses a seeded random generator, so tests can replay the same game.

**Spawning.** A new piece appears centred at the top, flat side down (I in the middle 4 columns of the top row; O in columns 4–5). If it overlaps any locked block, the game is over.

**Moving.** Left/right moves one column if the squares are free. Soft drop moves down one row.

**Rotation.** Clockwise and counter-clockwise, in four rotation states. If the rotated piece would overlap a wall or a block, the game tries these nudges in order and takes the first that fits: (−1,0), (+1,0), (0,−1), (−2,0), (+2,0). For I it also tries (0,−2). If none fits, the turn is refused. O doesn't rotate.

**Gravity.** The piece falls one row per tick. The tick length depends on the level: `max(80, 800 − (level − 1) × 70)` ms, so level 1 is 800 ms, level 10 is 170 ms, and from level 11 on it stays at 80 ms.

**Locking.** When the piece can't fall any further, a lock delay of 500 ms starts. A successful move or rotation restarts the delay, at most 15 times per piece; after that the next touchdown locks it at once. Hard drop locks immediately.

**Clearing lines.** After a lock, full rows are marked as clearing. They flash for 250 ms (no flash with reduced motion), then they are removed and every row above them drops down by the number of rows removed. The next piece appears after the clear.

**Points.**

| Lines at once | Points |
|---|---|
| 1 | 100 × level |
| 2 | 300 × level |
| 3 | 500 × level |
| 4 ("Tetris") | 800 × level |
| Soft drop | +1 per row |
| Hard drop | +2 per row |

**Levels.** Start at level 1; level = 1 + floor(lines / 10). The score for a clear uses the level before it goes up.

**Landing shadow.** The piece's shape at the lowest row it can reach in its current column, drawn as a faint grey outline. A hard drop lands exactly there.

**Game over and best score.** When a spawn is blocked, the game ends. The best score is kept per device; beating it shows "🏆 New record!".

## Screen

**Panel.** Tetris is the second card in Retro games, after Snake, with its best score on the card. Esc steps back from the game to the list, and again to close, the same as Snake.

**Desktop layout.** The 10×18 field is on the left. A column on the right holds: Next (a 4×4 box with the upcoming piece), Score, Lines, Level, Best, a Pause button and the Game sounds button. The square size is the largest that fits the panel's height, up to about 34px.

**Phone layout** (narrow or touch screens). The field fills the width. Next, Score and Level sit in a compact row above it, and the touch buttons are below.

**Looks.** Squares are rounded blocks with a light top edge and a darker bottom edge (a glossy, slightly 3D look). The empty field is a soft dark surface with a faint grid, so every colour, white included, stands out in both themes. The panel itself keeps Snake's playful style: chunky borders, the Fredoka font and big buttons.

**Messages on the field.** "Ready?" + Play; "Paused" + Resume; "Game over" + score, "🏆 New record!" when earned, and Play again. Clearing 4 lines shows a short "TETRIS!" burst; with reduced motion it doesn't move.

## Controls

| Input | Action |
|---|---|
| ← → or A D | move (holding repeats after 170 ms, then every 50 ms) |
| ↓ or S | soft drop (repeats while held) |
| ↑, W or X | rotate clockwise |
| Z | rotate counter-clockwise |
| Space | hard drop (on the Ready or Game over screen it starts a game) |
| P | pause / resume |
| Esc | pause while playing; from a paused or finished game, back to the list |
| M | game sounds on/off |

On touch screens there's a row of large buttons below the field: ◀, ▶, ↻, ▼ (soft drop, repeats while held), ⤓ (hard drop). Tapping the field also rotates. A hint line under the field lists the keys on non-touch screens.

The game pauses by itself when the tab is hidden.

## Sound

These are new cues on the shared `RetroSound` (same mute setting as Snake):

| Moment | Sound |
|---|---|
| Move | soft tick |
| Rotate | short blip |
| Lock | low thud |
| 1–3 lines | rising jingle, one note longer for each extra line |
| Tetris | fanfare |
| Level up | short arpeggio |
| Game over | falling "wah-wah" (the existing `over` cue) |
| New record | the existing `record` fanfare |

## Code layout

- **Rules** (plain functions with no React or DOM inside):
  - `tetrisNew(seed)` returns `{ field, piece, next, bag, rng, score, lines, level, status, clearing, lockMoves }`. `field` is 18 rows of 10 cells (`null` or a shape id).
  - `tetrisMove(state, dx)`, `tetrisRotate(state, dir)`, `tetrisSoftDrop(state)`, `tetrisHardDrop(state)`.
  - `tetrisTick(state)`: gravity, with a flag for "touched down", so the component runs the lock delay.
  - `tetrisLock(state)`: puts the piece into the field and marks full rows as clearing.
  - `tetrisClear(state)`: removes the clearing rows, scores them, levels up and spawns the next piece.
  - `tetrisGhost(state)`: where the piece would land.

  Every function returns a new state.
- **`TetrisGame` component:** owns the timers (gravity by level, lock delay, line-clear flash, held-key repeat) and draws the field, the shadow, the preview and the side column. Pausing just stops the timers.
- **Shared:** `useGameRecord("tetris")`, `retroSound`, `GamesPanel` (a second entry in `GAMES`). Today the panel's Esc handler always steps back. It changes so that an open game can handle Esc first: Tetris uses it to pause while playing, and Snake keeps today's behaviour.
- **Test hook:** `window.__oneTetris` exposes the rule functions, the same way `window.__oneSnake` does.

## Testing

A new file, `tests/tetris.test.cjs`, uses the same helpers as the Snake tests.

- **Rules, with a fixed seed:**
  - Each shape spawns in the right place with the right colour, and every bag holds all 7 shapes.
  - Moves stop at the walls and on blocks.
  - Rotation kicks free a piece pressed against a wall, and a blocked rotation is refused.
  - A hard drop lands exactly on the shadow and adds 2 points per row.
  - Clearing 1, 2, 3 and 4 lines scores 100, 300, 500 and 800 × level, and the rows above drop down correctly.
  - The level goes up after 10 lines, and the gravity time shrinks without going below 80 ms.
  - A blocked spawn ends the game.
- **In the browser:**
  - The panel lists Tetris, and the field has 180 squares.
  - The next piece is shown.
  - The keys move, rotate and hard-drop pieces.
  - Pause stops the falling.
  - The best score is saved and shows on the card.
  - The field fits a 375px-wide phone with the touch buttons.
  - There are no console errors.
- **Regression:** the Snake and Home tests still pass.

## Not included

Hold, garbage rows, multiplayer and online leaderboards. Breakout has its own spec.
