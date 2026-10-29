# Fast Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Move the games out of `index.html` into files that load in the background, so Games opens instantly.
- Make ONE always start from the copy saved on the device.
- Bring in updates through a Refresh button and a silent daily 23:59 download.

**Architecture:**
- `games/games.js` and `games/games.css` are plain files. `index.html` shares what they need through `window.__oneKit`, and loads them once with `loadGames()` when the browser is idle.
- `sw.js` answers pages and app files from the cache only (cache-first, no background refresh). The `x-one-fresh` header bypasses it.
- `updateApp()` in `index.html` fetches the fresh files into the cache. The Refresh button runs it and then reloads. A daily scheduler runs it with no reload.

**Tech Stack:** the single-file React 18 app (no build), a service worker, the Cache API; tests use `node:test` + Playwright (`tests/helpers.cjs`) and Node `vm` for `sw.js`.

**Spec:** `docs/superpowers/specs/2026-10-29-fast-loading-design.md`

## Global Constraints

- There's no build step and no new dependencies. CDN versions stay pinned.
- The person's data (localStorage other than `one.update.v1`, IndexedDB, Supabase) is never read or changed by the update code.
- The app cache name is `one-v7`. The update record is `localStorage["one.update.v1"] = { last: <ms> }`.
- A daily update never reloads the page and never shows anything. The spinner on the Games button appears only after 120 ms.
- Copy fixed by the spec:
  - "Refresh";
  - "Couldn't reach ONE. You're still on the saved version.";
  - "Couldn't open the games. Check your connection and try again."
- Snake and Tetris behave exactly as today. All their existing tests keep passing.

## Review Focus

1. **Pressing Games twice quickly while the files are still loading:** one panel opens, and no second script tag is added. *(Task 1 test)*
2. **A failed games load:** a later press tries again and works, rather than waiting forever on a rejected promise. *(Task 1 test)*
3. **A half-failed update:** if `games.js` is 200 but `index.html` fails, nothing is written to the cache, so the saved version stays consistent. *(Task 3 test)*
4. **Pressing Refresh twice:** only one update runs and only one reload happens. *(Task 3 test)*
5. **The 23:59 timer firing while the tab is hidden, then visibility returns:** the update runs once, not twice. *(Task 3 test)*

---

### Task 1: Games in their own files, loaded in the background

**Files:**
- Create: `games/games.js`, `games/games.css`
- Modify: `index.html`:
  - remove the games code (`/* ---------- Home: retro games ---------- */` up to `TasksPage`);
  - remove the games CSS (from `/* ---------- Home: retro games ---------- */` in `<style>` through the Snake, Tetris and phone rules);
  - add the kit, `loadGames` and the Games button changes.
- Modify: `tests/helpers.cjs` (add `waitForGames(page)` and `openApp(..., { init })`), `tests/games.test.cjs`, `tests/tetris.test.cjs`
- Create: `tests/games-load.test.cjs`

**Interfaces:**
- Produces:
  - `window.__oneKit = { React, ReactDOM, IconButton, icons: { Trophy, X, ArrowLeft, Volume2, VolumeX }, FOCUSABLE }`, set in `index.html` before `createRoot`.
  - `games/games.js`: an IIFE that reads the kit, defines everything that used to be in `index.html`, and sets `window.__oneGames = { GamesPanel }`, plus `__oneSnake`, `__oneTetris` and `__oneRetroSound` as today.
  - `loadGames() -> Promise<{ GamesPanel }>`: memoised. On failure it clears the memo, removes the failed tags, and rejects.
  - Home's Games button:
    - gets `aria-busy="true"` and `data-loading="true"` only after 120 ms of waiting;
    - renders `GamesPanel` from the resolved module;
    - on failure, shows the toast "Couldn't open the games. Check your connection and try again." (via `useToast()`, with `tone: "error"`).
  - The background load: in `Shell`, a `useEffect` calls `requestIdleCallback(() => loadGames().catch(() => {}))`, falling back to `setTimeout(…, 1500)`.
  - `tests/helpers.cjs`:
    - `waitForGames(page)` waits for `window.__oneGames`;
    - `openApp` takes `init: async (page) => {}`, which runs before the final `page.goto`.

- [ ] **Step 1: Write the failing tests** in `tests/games-load.test.cjs`.
  - `game files load in the background`: after `openApp(... route "home")` and no clicks other than the helper's corner click, a request for `/games/games.js` is seen within 4 s, and `window.__oneGames` is defined.
  - `Games opens within 100 ms once loaded`: after `waitForGames`, measure from click to the `dialog "Retro games"` being visible, in the page with `performance.now()` around a `click()` and a rAF poll. It must be < 100.
  - `a slow games file shows the spinner, then opens`:
    1. `init` sets `page.route("**/games/games.js", r => setTimeout(() => r.continue(), 1500))`.
    2. Click Games right after load.
    3. Within 120–1400 ms the button has `aria-busy="true"`.
    4. After the file arrives the dialog opens and `aria-busy` is gone.
  - `a failed load shows the toast and a second press works` (Review Focus 2):
    1. Abort the first `games.js` request.
    2. Click Games; the toast text is visible and there's no dialog.
    3. Un-route, then click again; the dialog opens.
  - `two quick presses open one panel` (Review Focus 1): slow `games.js` by 800 ms, double-click Games. Once loaded, `document.querySelectorAll("script[src$='games/games.js']").length === 1` and one `.games` dialog is open.
  - `index.html no longer contains game code`: `fs.readFileSync(index.html)` does not include `function SnakeGame` or `function TetrisGame`, and `games/games.js` includes both.
- [ ] **Step 2: Run** `cd tests && node --test games-load.test.cjs`. Expected: FAIL (no request for `games/games.js`).
- [ ] **Step 3: Move the code and wire it up** following the Interfaces above.
  - Move the game code verbatim, then replace its free names with kit lookups at the top of the IIFE: `const React2 = kit.React; const reactDom = kit.ReactDOM; const { IconButton, FOCUSABLE } = kit; const { Trophy, X, ArrowLeft, Volume2, VolumeX } = kit.icons;`.
  - Add `"./games/games.js"` and `"./games/games.css"` to `SHELL` in `sw.js`, with no other `sw.js` change in this task.
  - In `tests/games.test.cjs` and `tests/tetris.test.cjs`, call `await waitForGames(page)` before any `page.evaluate` that reads `__oneSnake`, `__oneTetris` or `__oneRetroSound`. In `tetris.test.cjs` that's the shared `rules` page (`before`) and `openTetris`.
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 games-load.test.cjs games.test.cjs tetris.test.cjs home.test.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `git add games index.html sw.js tests && git commit -m "perf: games load from their own files in the background"`

### Task 2: Service worker — start from the saved copy

**Files:**
- Modify: `sw.js`:
  - `CACHE = "one-v7"`;
  - navigation is cache-first;
  - the final `respondWith` becomes cache-only with a network fill;
  - the `x-one-fresh` bypass.
- Test: `tests/sw.test.cjs`

**Interfaces:**
- Produces:
  - Requests carrying the header `x-one-fresh: 1` go straight to `fetch(req)` and are never cached by the service worker. `updateApp` writes the cache itself.
  - Navigation: `caches.match("./index.html")`. On a miss: `fetch` → `put("./index.html")` → respond. Offline with nothing saved: the network error passes through.
  - Other cacheable requests: on a hit, return the hit (no fetch). On a miss: `fetch` → `put` on 200 or opaque → respond.

- [ ] **Step 1: Write the failing tests** in `tests/sw.test.cjs`, using the existing `makeWorld` fakes.
  - `a page request comes from the saved copy`: the world has `one-v7` with `./index.html` = "old", and the network returns "new". A `navigate` request responds "old", and no fetch was made.
  - `a first visit saves the page`: with an empty cache, the navigate response is the network's "new" and `puts` contains `./index.html`.
  - `app files come from the cache without a background fetch`: a cached `/games/games.js` hit gives `fetched.length === 0`.
  - `fresh requests always reach the network`: a request with the `x-one-fresh: 1` header to `/index.html` is fetched and nothing is put.
  - `the cache name is one-v7`: the install event opens `one-v7`.
  - The existing media and Quran tests stay unchanged and passing.
- [ ] **Step 2: Run** `cd tests && node --test sw.test.cjs`. Expected: the new tests fail.
- [ ] **Step 3: Implement the Interfaces above in `sw.js`.** Update its header comment to say the pages and app files come from the saved copy, and updates arrive through Refresh and the daily update.
- [ ] **Step 4: Run** `cd tests && node --test sw.test.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "perf: ONE starts from the saved copy"`

### Task 3: updateApp, Refresh button, daily 23:59 update

**Files:**
- Modify: `index.html`:
  - `updateApp()`, `lastDailyBoundary(now)`, `useDailyUpdate()`;
  - the Refresh button in `CornerCluster`;
  - CSS for the spinning icon.
- Create: `tests/update.test.cjs`

**Interfaces:**
- Produces:
  - `APP_FILES = ["./index.html", "./games/games.js", "./games/games.css", "./manifest.webmanifest"]`.
  - `updateApp() -> Promise<void>`:
    1. Fetch all of `APP_FILES` with `{ cache: "no-store", headers: { "x-one-fresh": "1" } }`.
    2. If any response is not ok, reject before writing anything.
    3. If `"caches" in window`: open `one-v7`, put each file (and `"./"` → the `index.html` response clone).
    4. Run `navigator.serviceWorker?.getRegistration()` → `reg?.update()`, ignoring errors.
    5. Write `one.update.v1.last = Date.now()`.

    It's memoised while running, so concurrent calls share one promise.
  - `lastDailyBoundary(now: number) -> number`: today at 23:59:00 local if `now` is at or after it, else yesterday at 23:59:00.
  - `useDailyUpdate()` (in `Shell`):
    1. When idle after mount, and on each `visibilitychange` to visible: if `!last || last < lastDailyBoundary(Date.now())`, run `updateApp().catch(() => {})`.
    2. Set a `setTimeout` to the next local 23:59:00. When it fires, run `updateApp().catch(() => {})` and re-arm. Clear it on unmount.

    It never reloads.
  - Refresh button: `IconButton` with label "Refresh" in `CornerCluster`, just before Settings, with the `RefreshCw` icon at size 18.
    - While working: `data-busy="true"`, the icon spins (`@keyframes` rotate, none with reduced motion), and further clicks are ignored.
    - On success: `location.reload()`.
    - On failure: the toast "Couldn't reach ONE. You're still on the saved version." with `tone: "error"`, and the spin stops.
  - Test seam: `window.__oneUpdate = { updateApp, lastDailyBoundary }`.

- [ ] **Step 1: Write the failing tests** in `tests/update.test.cjs`. They use `openApp` with `init` to call `page.clock.install({ time })` where a test needs a set time, and `page.route` to count and serve `index.html`, `games.js`, `games.css` and the manifest.
  - `lastDailyBoundary picks the latest 23:59`: in the page,
    - for 2026-10-29 at 10:00 local it returns 2026-10-28 23:59;
    - for 2026-10-29 at 23:59:30 it returns 2026-10-29 23:59;
    - for 2026-10-30 at 00:00 it returns 2026-10-29 23:59.
  - `Refresh fetches fresh files, saves them and reloads`:
    1. Count requests carrying `x-one-fresh: 1`: there must be 4.
    2. After a `framenavigated` (the reload), `caches.open("one-v7")` has `./index.html` and `./games/games.js` with the served bodies.
  - `Refresh offline shows the message and stays`: abort the `x-one-fresh` requests. The toast is visible, no navigation happens within 1 s, and `data-busy` is gone.
  - `a half-failed update writes nothing` (Review Focus 3):
    1. Seed the cache with `./index.html` = "old".
    2. Route `index.html` (fresh) to a 500 and the others to 200.
    3. `await __oneUpdate.updateApp().catch(() => "x")` gives "x", and the cache still holds "old" and no `games.js` entry.
  - `two Refresh presses make one update and one reload` (Review Focus 4): double-click Refresh. There are 4 fresh requests (not 8) and one `framenavigated`.
  - `opening after a missed 23:59 updates once with no reload`:
    1. Set `one.update.v1.last` = 2026-10-27 12:00 in `init`, with the clock at 2026-10-29 09:00.
    2. Within 4 s there are 4 fresh requests and no reload.
    3. `last` is now ≥ 2026-10-29 09:00.
  - `no update when already done today`: `last` = 2026-10-29 00:30 and the clock at 09:00 give 0 fresh requests in 4 s.
  - `the 23:59 timer updates while open, without reloading`:
    1. Start the clock at 23:58:00 with `last` = earlier today.
    2. `page.clock.runFor(70_000)`.
    3. There are 4 fresh requests and no navigation.
  - `hidden at 23:59 then visible updates once` (Review Focus 5): as in the previous test, but make the document hidden before 23:59 (`Object.defineProperty(document, "visibilityState", …)` plus dispatch), run past 23:59, then make it visible and dispatch. There are exactly 4 fresh requests.
- [ ] **Step 2: Run** `cd tests && node --test update.test.cjs`. Expected: FAIL (`__oneUpdate` is undefined).
- [ ] **Step 3: Implement the Interfaces above.**
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 update.test.cjs games-load.test.cjs home.test.cjs nav.test.cjs pages.test.cjs sw.test.cjs`. Expected: all pass.
- [ ] **Step 5: Screenshot the corner cluster with the Refresh button (Morning, 1280×800) and check it sits with the other icons.**
- [ ] **Step 6: Commit and push** `git commit -am "feat: Refresh button and a silent daily update at 23:59" && git push -u origin ccr-f62deaf2-d44ra0`
