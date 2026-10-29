# Fast loading: design

Date: 2026-10-29
Status: draft, waiting for review
Builds on: the Retro games panel (Snake, Tetris) and the service worker in `sw.js`

## Why

The owner's last website got slow as it grew, and they want ONE to stay fast:

- **Coming back should take no waiting.** Today the service worker asks the network for `index.html` on every visit, so a slow connection means a slow start.
- **The games shouldn't keep growing `index.html`.** All the games (and the coming Breakout) live in the one file.
- **Opening Games must feel instant**, as if it were still part of the same page.

Updates should still reach everyone, without warnings.

## Decisions already made

| Question | Decision |
|---|---|
| Where the games live | Their own files, `games/games.js` and `games/games.css`, loaded into the same page (no separate HTML page) |
| Waiting when opening Games | None: the game files load in the background shortly after ONE opens |
| How ONE starts | Always from the copy saved on the device; only the very first visit uses the network |
| How updates arrive | A Refresh button (top right), plus an automatic download every day at 23:59 local time |
| Telling people about updates | Never: no dot, badge or popup |
| Updating while ONE is open at 23:59 | Download only; the new version shows on the next open. Never reload by itself. |

## Constraints

- There's still no build step: plain files on GitHub Pages, and CDN libraries pinned to exact versions.
- The person's data (localStorage, IndexedDB, Supabase sync) is never touched by updates. Only the app's own files change.
- Snake and Tetris behave exactly as they do now, including their best scores (`one.games.v1`) and the sound setting.

## 1. Games in their own files

**Files.**
- `games/games.js` holds the code that is in `index.html` today:
  - from `/* ---------- Home: retro games ---------- */` up to `TasksPage`: the records, the `RetroSound` synth, Snake, Tetris, `GAMES` and `GamesPanel`;
  - the `Gamepad2`, `Volume2` and `VolumeX` icons stay in `index.html`.
- `games/games.css` holds the games styles that are in `index.html` today (`/* ---------- Home: retro games ---------- */` and the Snake and Tetris rules, including their media queries).

**Handshake.**
- `index.html` sets `window.__oneKit = { React, ReactDOM, IconButton, icons: { Trophy, X, ArrowLeft, Volume2, VolumeX }, FOCUSABLE }` before the app renders.
- `games/games.js` is an ordinary script (not a module). It reads `window.__oneKit` and finishes by setting `window.__oneGames = { GamesPanel }`. It also keeps today's test hooks (`window.__oneSnake`, `window.__oneTetris`, `window.__oneRetroSound`).

**Loading.**
- `index.html` gets a single function, `loadGames()`, that returns a promise:
  - The first call adds `<link rel="stylesheet" href="games/games.css">` and `<script src="games/games.js">`.
  - It resolves when both have loaded and `window.__oneGames` exists. Later calls return the same promise.
  - If loading fails, the promise is forgotten so the next call tries again.
- **Background load:** after the first render, ONE calls `loadGames()` when the browser is idle (`requestIdleCallback`, or after 1.5 s where that doesn't exist).
- **Games button:** it opens the panel as soon as `loadGames()` resolves; when the files are already loaded, that is instant.
  - While it waits, the button shows a small spinner, but only after 120 ms, so a quick load never flickers.
  - If loading fails, a toast says *"Couldn't open the games. Check your connection and try again."*

## 2. Instant start

`sw.js` changes:

- **Version:** the app cache becomes `one-v7`.
- **What it saves on install (`SHELL`):** the current list plus `./games/games.js` and `./games/games.css`.
- **Page requests (navigation):** answered from the saved `./index.html` when there is one. The network is only used when nothing is saved yet (the first visit), and that response is saved.
- **Other app files** (same-origin files, the CDN libraries, Google Fonts): answered from the saved copy when there is one. Otherwise they come from the network and are saved.
  - The background re-fetch on every request goes away, so a page and its scripts always come from the same saved version.
  - Media, the Quran offline cache and Supabase keep their current handling.
- **Fresh requests:** a request carrying the header `x-one-fresh: 1` always goes to the network and is never answered from the cache. `updateApp()` uses it.

## 3. Updates

**`updateApp()` (in `index.html`) returns a promise:**
1. It fetches `./index.html`, `./games/games.js`, `./games/games.css` and `./manifest.webmanifest` with `cache: "no-store"` and the `x-one-fresh: 1` header.
2. Only when all four return 200 does it save them into the `one-v7` cache. They're saved under the same keys the service worker uses, and `./index.html` is also saved under `./`.
3. It calls `navigator.serviceWorker.getRegistration()` and then `registration.update()`, so a new `sw.js` installs too.
4. It writes `localStorage["one.update.v1"] = { last: <ms> }`.

If any step fails, nothing already saved is changed and the promise rejects.

**Refresh button.**
- It goes in the top-right `CornerCluster` on every page, before the settings button. It's an `IconButton` labelled "Refresh" with the `RefreshCw` icon.
- Pressing it spins the icon (no spin with reduced motion), runs `updateApp()`, then `location.reload()`.
- On failure, the icon stops and a toast says *"Couldn't reach ONE. You're still on the saved version."*
- A second press while it's working is ignored.

**Daily update at 23:59.**
- **The boundary:** the most recent local 23:59:00 at or before now.
- **On open:** after the first render (when idle), if `one.update.v1.last` is older than the boundary, or missing, run `updateApp()` in the background without reloading.
- **While open:** a timer is set for the next local 23:59:00. When it fires, run `updateApp()` without reloading, then set the timer for the following day.
- **Catching up:** when the tab becomes visible again, the "on open" check runs again, so a laptop that slept through 23:59 still updates.
- **Failures:** a failed daily update stays silent and is tried again on the next open or the next time the tab becomes visible.
- **The rule that always holds:** a daily update never reloads the page and never shows anything.

**No service worker.** Where there isn't one (for example local `http`), the Refresh button is a plain reload, and the daily update only refreshes the HTTP cache by fetching with `no-store`.

## Testing

- **Service worker** (`tests/sw.test.cjs`, run in Node with fakes, like today):
  - A page request is answered from the saved `./index.html` while the fake network would return something newer.
  - With nothing saved, a page request goes to the network and the response is saved.
  - Same-origin scripts and styles come from the cache without a background re-fetch.
  - `x-one-fresh` requests always reach the network.
  - Media and Quran-offline behaviour is unchanged.
- **Games** (`tests/games.test.cjs`, `tests/tetris.test.cjs`):
  - `games/games.js` loads in the background without a click.
  - Opening Games after it has loaded shows the panel within 100 ms.
  - When the games file is held back, the spinner appears after 120 ms and the panel opens when the file arrives.
  - A failed load shows the toast and a second press tries again.
  - All existing Snake and Tetris tests pass, waiting for `window.__oneGames` where they use the game hooks.
- **Updates** (new `tests/update.test.cjs`, with `Date` and `fetch` controlled in the page):
  - Refresh fetches the four files with `no-store`, saves them and reloads.
  - Offline, Refresh shows the toast and doesn't reload.
  - With `last` before the latest 23:59, opening runs one background update with no reload.
  - With `last` after it, nothing runs.
  - The 23:59 timer runs one update with no reload.
- **Regression:** the Home, nav and pages tests still pass.

## Not included

Update notices of any kind, partial or "delta" updates, and versioned file names.
