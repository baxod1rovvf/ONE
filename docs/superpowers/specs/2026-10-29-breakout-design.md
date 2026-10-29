# Breakout: design

Date: 2026-10-29
Status: draft, waiting for review
Builds on: `2026-10-29-fast-loading-design.md` (games live in `games/games.js` and `games/games.css`), the Retro games panel, `RetroSound`

## Why

The owner wants a Breakout game like their reference pictures (a paddle, a bouncing ball, glowing bricks in a dark space) as the third Retro game. Each map should feel like a surprise. There are no level numbers and no easy-to-hard order: a set of 30 varied maps comes in random order, and the game goes on until the lives run out.

## Decisions already made

| Question | Decision |
|---|---|
| Maps | A fixed set of 30 maps. Each new game deals them in a shuffled order with no repeats until all 30 are played, then reshuffles. It never repeats a map twice in a row, even across a reshuffle. It continues until the lives run out. |
| Level number or difficulty curve | None on screen and no ramp: difficulty is a property of each map (10 gentle, 12 medium, 8 tough), mixed by the shuffle |
| Special bricks | Strong (2–5 hits, the number shown), steel (unbreakable obstacle), explosive (breaks its 8 neighbours), bonus (drops a power-up) |
| Power-ups | Wide paddle, Multi-ball, Slow ball, Extra life |
| How it's built | Maps, physics and drawing are separate. Maps and physics are plain functions; drawing is a canvas redrawn every frame. |
| Field | Fixed 480×640 (3:4), scaled to fit |
| Look | A dark neon space field inside the playful panel |

## Constraints

- The code goes in `games/games.js` and the styles in `games/games.css`, next to Snake and Tetris. No new dependencies.
- It reuses `useGameRecord("breakout")` (best score only), `retroSound` with its mute setting, and `GamesPanel` with `escapeRef` (Esc pauses while playing, otherwise steps back).
- It works in the Morning and Night themes, fits a 375px-wide phone and a phone on its side, and follows reduced motion.

## 1. Maps

**Grid.** Bricks sit on 12 columns × up to 12 rows:
- each brick is 36×16, with 4 px gaps;
- the grid starts at x = 12, y = 56;
- the field is 480×640.

A brick is `{ col, row, kind: "normal" | "strong" | "steel" | "explosive" | "bonus", hp, color }`. Normal, explosive and bonus bricks have hp 1. Strong bricks have hp 2–5. Steel has hp `Infinity`.

**Pattern makers** (`breakoutMakers`). Each takes `(rng, params)` and returns a set of filled `(col, row)` squares:
1. **wall:** a solid block of `rows` × `cols`, centred.
2. **twin:** two blocks of `cols` wide and `rows` tall at the left and right, with an empty middle.
3. **mirror:** random squares on the left half (fill chance `density`), mirrored to the right.
4. **pyramid:** a triangle with `rows` rows, standing up, upside down or stepped (`shape`).
5. **diamonds:** `count` diamonds of radius `r`, spaced evenly.
6. **stripes:** alternating full and empty rows, columns, or a chessboard (`style`).
7. **pillars:** columns `width` wide with `gap` empty columns between them, `rows` tall.
8. **fortress:** a ring `thick` squares thick around a core of `core` × `core`.
9. **caves:** cellular-automaton blobs: random fill at `density`, then 3 smoothing passes.
10. **waves:** a sine band of thickness `thick`, with amplitude `amp` and period `period` columns.

**Turning shapes into bricks** (`breakoutBuild(def)`). A definition is `{ id, maker, params, seed, tier: "gentle" | "medium" | "tough", mix, palette }`:
1. The maker draws its squares with an rng seeded from `seed` (the mulberry32 generator, shared with Tetris).
2. The squares become bricks using the definition's `mix`: the chances of strong bricks (and the most hits they can have), steel, explosive and bonus bricks.
3. Colours come from `palette`: `"rainbow-rows"`, `"regions"` or `"by-kind"`.

| Tier | Rows | Strong | Most hits | Steel | Explosive | Bonus |
|---|---|---|---|---|---|---|
| gentle (10 maps) | 3–5 | 0–10% | 2 | 0 | 0–4% | 8% |
| medium (12 maps) | 5–8 | 15–30% | 3 | 0–8% | 4–6% | 8% |
| tough (8 maps) | 7–12 | 30–50% | 5 | 8–15% | 6% | 8% |

`BREAKOUT_MAPS` is the table of the 30 definitions. Each maker appears 2–4 times, with different settings.

**Check** (`breakoutCheck(bricks)` → `{ ok, breakable, reason }`):
- **Reachability:** a flood fill starts from every empty square in the row below the lowest brick, and spreads through squares that aren't steel; breakable bricks count as open. Every breakable brick has to be reached.
- **Size:** there must be at least 8 breakable bricks.
- **No sealed field:** no row may be all steel.
- **Where it runs:** at load time only as a guard. A map that fails is replaced by a gentle 6-row × 10-column wall, with no error shown. The real guarantee is the test that checks all 30 maps.

**Order** (`breakoutDeck(rng, lastId)`): returns the 30 ids, shuffled, with the first id different from `lastId`.

## 2. Physics and the game loop

**State** (`breakoutNew(seed)`):
- deck and map: `deck`, `deckIndex`, `mapId`, `bricks`;
- the game: `paddle { x, w }`, `balls [{ x, y, vx, vy, stuck }]`, `capsules [{ x, y, kind }]`;
- `effects { wide: msLeft, slow: msLeft }`, `score`, `lives` (start 3, at most 5);
- `status: "ready" | "playing" | "paused" | "cleared" | "over"`, `clearMs`, `events: []`.

**Step** (`breakoutStep(state, dtMs, input)`, where input is `{ targetX | null, dir: -1|0|1, launch: boolean }`). It returns a new state, and `events` lists what happened this step: `paddle`, `hit`, `break`, `steel`, `boom`, `catch`, `lost`, `life`, `cleared`, `over`.

- **Time.** `dtMs` is capped at 50 ms. The step is split into sub-steps so that no ball moves more than 4 px per sub-step.
- **Paddle.**
  - Size and place: 88 px wide (132 px during Wide), 12 px tall, at y = 600.
  - Moving: with `targetX`, the paddle centre goes straight there. With `dir`, it moves 520 px/s. It is clamped to the field.
- **Ball.**
  - Size and speed: radius 7, speed 340 px/s (238 px/s during Slow).
  - On the paddle: a stuck ball rides on the paddle; `launch` sends it up at −10°…+10°.
  - Walls: it bounces off the left, right and top walls.
  - Paddle bounces: on a paddle hit, the angle from vertical is `offset × 60°`, where `offset` runs from −1 to 1 across the paddle, and the speed stays the same.
  - Never flat: the angle is kept at least 15° away from horizontal.
- **Bricks.**
  - Collisions: circle-against-box, with at most one brick hit per ball per sub-step. The ball reflects on the axis with the smaller overlap.
  - Steel: it reflects the ball and doesn't take damage.
  - Other bricks: lose 1 hp and give +10. At 0 hp the brick breaks for +10 × its starting hp.
  - Explosive: when one breaks it gives +20 extra and takes 1 hp from each of its 8 neighbours (not steel), which can set off a chain.
  - Bonus: when one breaks it drops a capsule. The kind is weighted Wide 3, Multi 3, Slow 3, Life 1.
- **Capsules.**
  - They fall at 140 px/s and vanish below the field.
  - A capsule that touches the paddle is caught:
    - Wide: `wide = 15000` ms.
    - Multi: 2 extra balls are added at ±25° from the first ball in play.
    - Slow: `slow = 12000` ms.
    - Life: lives + 1, at most 5.
- **Losing a ball.**
  - A ball below y = 640 is removed. When none are left: lives − 1 and the event `lost`.
  - With lives still left, a new stuck ball sits on the paddle, the effects reset and the capsules clear.
  - With no lives left, the status becomes `over`.
- **Clearing a map.**
  - When no breakable bricks are left: the status becomes `cleared`, +500 points and the event `cleared`.
  - After `clearMs` reaches 1500, the next map is dealt from the deck (reshuffled at the end with `breakoutDeck`).
  - The bricks, paddle, balls, capsules and effects reset for the new map. The score and lives stay, and the status becomes `ready`.

## 3. Screen, controls and sound

**Panel.** Breakout is the third card, "Breakout", with the emoji 🏓 and the blurb "Break every brick, catch the power-ups."

**Layout.**
- A slim bar above the field: Score, Lives (hearts), Best, Pause and the Game sounds button.
- The field is a canvas 480×640 in field units, drawn at the device pixel ratio and scaled to the largest size that fits the panel.
- On a phone on its side, the bar sits to the left of the field.

**Looks.**
- **Field:**
  - Background: a dark navy gradient with a faint grid and twinkling stars.
  - Normal bricks: rounded neon bricks with a glow (shadow blur) in the map's colours.
  - Strong bricks: they show the hits left as a white number and get dimmer and cracked as they lose hp.
  - Steel: metallic grey with rivets.
  - Explosive: red-orange with a pulsing ✸.
  - Bonus: a sparkle ★.
  - Ball: glowing white-cyan with a short trail.
  - Paddle: a neon cyan capsule.
  - Capsules: their emoji (🟦 ⚪ 🐢 ❤️).
- **Effects:**
  - Breaking a brick throws particles.
  - An explosion flashes and shakes the field for 150 ms.
  - "Map cleared!" shows sparkles and the +500.
  - A new map's bricks drop in from above over 400 ms.
- **Reduced motion:** no trail, particles, shake or drop-in.

**Controls.**

| Input | Action |
|---|---|
| Mouse over the field | the paddle follows the pointer (the pointer is hidden while playing) |
| Touch drag anywhere on the field | the paddle follows the finger's x |
| ← → or A D | move |
| Click, tap, Space or ↑ | launch the ball (from "Ready?" it also starts) |
| P or Esc | pause |
| M | sound on/off |

A hint line lists the keys on non-touch screens. The game pauses when the tab is hidden.

**Messages on the field.**
- "Ready?" with Play.
- "Paused" with Resume and Restart.
- "Map cleared!" with +500.
- "Game over" with the score, "🏆 New record!" when earned, and Play again.
- Losing a life flashes the hearts.

**Sound** (new `RetroSound` cues):

| Moment | Cue | Sound |
|---|---|---|
| Paddle hit | `bPaddle` | bonk |
| Brick hit | `bHit(row)` | blip, higher near the top |
| Steel hit | `bSteel` | metallic clank |
| Explosion | `bBoom` | noise burst |
| Power-up caught | `bCatch` | rising sparkle |
| Life lost | `bLost` | falling tone |
| Map cleared | `bCleared` | fanfare |

Game over uses `over()` and a new record uses `record()`.

## Code layout

- **Maps:** `BREAKOUT_MAPS`, `breakoutMakers`, `breakoutBuild`, `breakoutCheck`, `breakoutDeck`.
- **Physics:** `breakoutNew`, `breakoutStep`.
- **Drawing:** `breakoutDraw(ctx, state, fx, time)`, where `fx` holds the particles, trail and shake, which live only in the component.
- **Component:** `BreakoutGame({ escapeRef })` owns the rAF loop, input, sounds from `events`, messages, and the best score.
- **Test hook:** `window.__oneBreakout` exposes the maps, physics and builder functions. Like the Tetris hooks, `window.__oneBreakoutSeed` fixes the seed in tests.

## Testing

A new file, `tests/breakout.test.cjs`.

- **Maps:**
  - There are exactly 30 definitions.
  - Every map builds and passes `breakoutCheck`, with ≥ 8 breakable bricks.
  - No two maps produce the same brick layout.
  - The tiers come out 10 / 12 / 8, and each maker is used 2–4 times.
  - `breakoutDeck` uses all 30 ids, and its first id is never `lastId`.
  - The check fails a hand-made layout where steel seals off a brick.
- **Physics:**
  - The ball bounces off the walls and the top.
  - A paddle centre hit goes straight up, an edge hit goes out near 60°, and the speed is kept.
  - A ball at 3× speed never passes through a brick.
  - A strong brick loses hp and breaks on its last hit with the right points; steel never breaks.
  - An explosion damages its neighbours, chains to explosive neighbours and spares steel.
  - Each power-up works and expires (Wide after 15 s, Slow after 12 s), Multi adds 2 balls, and Life stops at 5.
  - Losing the last ball costs a life, and at 0 lives the status is `over`.
  - Clearing a map adds +500, keeps the score and lives, and deals the next map after 1500 ms.
  - The ball never travels flatter than 15°.
- **In the browser:**
  - The card opens the game.
  - Space launches the ball, and the mouse and arrow keys move the paddle.
  - P and Esc pause, and Restart deals a new deck with score 0 and 3 lives.
  - Game over (helped along by a test seed and a near-empty map) saves the best score.
  - The field fits 375×740 and 740×375 with no sideways scroll.
  - There are no console errors.
- **Regression:** Snake, Tetris and Home still pass.

## Not included

Moving bricks, portals, a laser paddle, level numbers or a difficulty ramp, a map picker, and saving a run part-way through.
