# Touch Grass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ONE's Home with a live, touchable three.js meadow, swap the sidebar and top bar for a floating glass dock, and restyle every other page in the same playful sky-and-meadow look without changing what they do.

**Architecture:** Everything stays in `index.html` (one classic `<script>` IIFE written as plain `React2.createElement` calls, no JSX, no build). The meadow is a plain JS class `Meadow` that owns three.js and is driven by `HomePage`; three.js is pulled in with a dynamic `import()` only when Home mounts. Navigation becomes `GlassDock` + `CornerCluster`; other pages get a CSS/SVG `Backdrop` and new design tokens, with a per-page `--section` colour set from `data-section` on `<main>`.

**Tech Stack:** React 18.3.1 UMD (cdnjs, already used), three.js `0.169.0` ES module (jsDelivr), Web Audio API, CSS `backdrop-filter`, Google Fonts (Fredoka + existing Geist). Tests: Node 22 `node:test` + the pre-installed Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-10-28-touch-grass-design.md`

## Global Constraints

- One static file app (`index.html`) on GitHub Pages, no build step. Libraries come from CDNs, pinned to exact versions.
- three.js `0.169.0` from `https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js`, loaded only when Home opens.
- All current features, data, sync (Supabase, encrypted), app lock, search (⌘K / Ctrl+K), quick capture (C) and PWA install keep working.
- Usable from 375px to wide desktop, no horizontal page scroll.
- Respects `prefers-reduced-motion`.
- Stored theme values stay `light` / `dark` / `system`, shown as Morning / Night / Follow device. No data migration; `settings.sidebarCollapsed` is left in stored data, unused.
- Match the file's existing idiom: `React2.createElement`, `useUI()`, `useStore()`, lucide icons made with `createLucideIcon`, CSS sections headed `/* ---------- Name ---------- */`.
- Copy fixed by the spec: "touch grass", "without leaving your desk", "try a break", "break", "end", "welcome back 🌱", "Morning", "Night", "Follow device".
- Dock tap targets at least 44×44px; dock 16px above the bottom plus `env(safe-area-inset-bottom)`.

## Review Focus

1. Pointer leaves the window (or a touch is cancelled) mid-drag: the trail stops growing and the hand disappears; no stuck "pressed" state. Test in Task 6.
2. Window resized or phone rotated while on Home: the canvas matches the new viewport with no stretching. Test in Task 5.
3. Leaving Home mid-break or mid-transition (back button, hash change, lock): break cancelled, audio stopped, render loop stopped, dock and corner cluster shown again. Test in Task 7.
4. Morning/Night clicked again while a transition is running: the blend reverses from where it is, with no jump. Test in Task 5.
5. Tab hidden during a break: the countdown still ends on wall-clock time, and rendering pauses while hidden. Test in Task 7.

---

## File structure

| File | Responsibility |
|---|---|
| `index.html` | The app. New blocks: tokens + backdrop CSS, glass dock/cluster CSS, Home/meadow CSS, page restyle CSS; JS units `Backdrop`, `GlassDock`, `CornerCluster`, `PageBrand`, `HomePage`, `MeadowFallback`, `HandCursor`, `Meadow` (+ `loadThree`), `useBreak`, `BreakPill`, `AmbientSound`, `Sprout`. Removed: `Sidebar`, `NavItem`, `Topbar`, `MobileNav`, `HomeSubtitle`, `TodayFocus`, `Overview`, `Recent`, `Shortcuts` and their CSS. |
| `sw.js` | Cache `cdn.jsdelivr.net`, bump cache name. |
| `tests/package.json` | Pins local copies of `three@0.169.0`, `react@18.3.1`, `react-dom@18.3.1` that tests serve in place of the CDNs (CDNs are not reachable from CI sandboxes). |
| `tests/helpers.cjs` | Static server, browser launch, CDN routing, app opener, console-error capture. |
| `tests/*.test.cjs` | One file per task area. |
| `.gitignore` | `tests/node_modules/` |

Run all tests: `cd tests && npm install && node --test` (Playwright comes from the environment; locally `npm i -g playwright` once).

---

### Task 1: Test harness and baseline

**Files:**
- Create: `tests/package.json`, `tests/helpers.cjs`, `tests/baseline.test.cjs`, `.gitignore`

**Interfaces:**
- Produces (all from `tests/helpers.cjs`):
  - `startServer(): Promise<{ url: string, close(): Promise<void> }>`: serves the repo root over `http://127.0.0.1:<random port>`.
  - `launch(opts?: { webgl?: boolean, reducedMotion?: boolean, blockThree?: boolean }): Promise<Browser>`
  - `openApp(browser, baseUrl, { route = "home", theme = "light", viewport = { width: 1280, height: 800 }, hasTouch = false, data?: object }): Promise<{ page, errors: string[] }>`: seeds `localStorage["one.workspace.v1"]` (if `data`), sets `settings.theme`, routes CDN requests, waits for `#root` to have children. `errors` collects `console.error` and `pageerror`.
  - Routing inside `openApp`: `cdnjs…/react.production.min.js` → `tests/node_modules/react/umd/react.production.min.js`; react-dom likewise; `cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js` → `tests/node_modules/three/build/three.module.js` (or `route.abort()` when `blockThree`); `fonts.googleapis.com` / `fonts.gstatic.com` → `route.abort()`. Errors caused by the aborted font requests are filtered out of `errors`.
  - `launch({ webgl: false })` adds an init script making `HTMLCanvasElement.prototype.getContext` return `null` for `webgl`/`webgl2`.
  - `launch({ reducedMotion: true })` → contexts get `reducedMotion: "reduce"`.

- [ ] **Step 1:** Write `tests/package.json` (`"private": true`, devDependencies exactly `three: 0.169.0`, `react: 18.3.1`, `react-dom: 18.3.1`), add `tests/node_modules/` to `.gitignore`, run `cd tests && npm install`.
- [ ] **Step 2: Write the baseline test** `tests/baseline.test.cjs`:

```js
test("app boots on every route with no console errors", async () => {
  for (const route of ["home", "tasks", "websites", "ideas", "saved", "preferences"]) {
    const { page, errors } = await openApp(browser, server.url, { route });
    assert.ok(await page.locator("#main").isVisible());
    assert.deepEqual(errors, []);
    await page.close();
  }
});
```

- [ ] **Step 3:** Implement `tests/helpers.cjs` (Node `http` + `fs`, `require("playwright")`).
- [ ] **Step 4:** Run `cd tests && node --test baseline.test.cjs`. Expected: PASS against the current, unchanged app (this proves the harness, not new code).
- [ ] **Step 5:** Commit: `test: add Playwright harness that serves CDN libraries locally`.

---

### Task 2: Morning/Night tokens, backdrop and section colours

**Files:**
- Modify: `index.html` `<head>` (Google Fonts link adds `Fredoka:wght@500;600;700`), `:root` token block and both dark blocks (lines ~23–140), `--section` rules, new CSS section `/* ---------- Backdrop ---------- */`, `Shell` (adds `Backdrop`, `data-section` on `<main>`), `PreferencesPage` theme row labels.
- Test: `tests/theme.test.cjs`

**Interfaces:**
- Produces:
  - CSS tokens (Morning = light, Night = dark), kept names so existing CSS keeps working: `--bg`, `--surface`, `--surface-2/3`, `--text`, `--text-2/3`, `--border`, `--border-strong`, `--accent*`, `--success*`, `--warn*`, `--danger*`, `--overlay`, `--shadow-*`. New: `--font-display: 'Fredoka', var(--font)`, `--r-card: 20px`, `--glass-bg`, `--glass-border`, `--glass-shadow`, `--card-bg` (Morning `rgba(255,255,255,0.8)`, Night `rgba(16,24,58,0.6)`), `--sky-top`, `--sky-bottom`, `--grass-1`, `--grass-2`.
  - Section colour tokens set by `main[data-section="<route>"]`: `--section`, `--section-soft`, `--section-text`, `--on-section`. Values: tasks grass green, websites sky blue, ideas sunflower yellow, saved blossom pink, preferences lavender, goals clover teal, knowledge warm peach (pick hexes with ≥4.5:1 for `--section-text` on `--card-bg` in both themes). `--accent*` aliases `--section*` inside `main` so existing buttons/checkboxes pick it up.
  - `Backdrop()`: `<div class="backdrop" aria-hidden="true">` with sky gradient, 3 inline-SVG clouds, stars (Night only, CSS twinkle), grass strip SVG at the bottom. `position: fixed; inset: 0; z-index: -1`. Not rendered on Home.
  - Settings → Appearance → Theme options read "Morning", "Night", "Follow device" (values unchanged).

- [ ] **Step 1: Write failing tests** in `tests/theme.test.cjs`:

```js
test("Morning and Night give the page a sky backdrop", async () => {
  for (const theme of ["light", "dark"]) {
    const { page } = await openApp(browser, server.url, { route: "tasks", theme });
    assert.ok(await page.locator(".backdrop").isVisible());
    assert.equal(await page.locator(".backdrop__stars").isVisible(), theme === "dark");
  }
});
test("each page sets its own section colour", async () => {
  const seen = new Set();
  for (const route of ["tasks", "websites", "ideas", "saved", "preferences"]) {
    const { page } = await openApp(browser, server.url, { route });
    assert.equal(await page.locator("main").getAttribute("data-section"), route);
    seen.add(await page.evaluate(() => getComputedStyle(document.querySelector("main")).getPropertyValue("--section").trim()));
  }
  assert.equal(seen.size, 5);
});
test("headings use the rounded display font", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  assert.match(await page.locator(".page-title").evaluate((el) => getComputedStyle(el).fontFamily), /Fredoka/);
});
test("theme setting is labelled Morning / Night / Follow device", async () => {
  const { page } = await openApp(browser, server.url, { route: "preferences" });
  for (const label of ["Morning", "Night", "Follow device"]) assert.ok(await page.getByText(label, { exact: true }).first().isVisible());
});
```

- [ ] **Step 2:** Run `node --test theme.test.cjs`. Expected: FAIL (no `.backdrop`, no `data-section`).
- [ ] **Step 3:** Implement the tokens, `Backdrop`, `data-section={ui.route}` on `<main className="page">`, and the Settings labels.
- [ ] **Step 4:** Run `node --test theme.test.cjs baseline.test.cjs`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: Morning/Night sky tokens, backdrop and per-page colours`.

---

### Task 3: Glass dock and corner cluster replace sidebar and top bar

**Files:**
- Modify: `index.html`: delete `NavItem`, `Sidebar`, `Topbar`, `MobileNav` (JS ~5543–5660) and CSS sections Sidebar, Main + topbar, Mobile navigation (~998–1475) plus their rules in Responsive; rewrite `Shell` (drops `isTablet`, `collapsed`, `toggleCollapse`, `toggleTheme`); add CSS sections `/* ---------- Glass dock ---------- */` and `/* ---------- Corner cluster ---------- */`.
- Test: `tests/nav.test.cjs`

**Interfaces:**
- Consumes: `ROUTES`, `useUI()` (`route`, `navigate`, `openSearch`, `openCapture`), `useLock()` (`enabled`, `lock`), `useStore().data.tasks`, `IconButton`.
- Produces:
  - `GlassDock({ hidden: boolean })`: `<nav class="dock" aria-label="Pages">` with `data-hidden="true"` while hidden and no `data-hidden` attribute otherwise; one `<a class="dock__tab" href="#id" aria-current>` per `ROUTES` entry with icon + `<span class="dock__label">`; a `<span class="dock__pebble">` positioned under the active tab via `--pebble-x` / `--pebble-w` (spring easing `cubic-bezier(0.34, 1.56, 0.64, 1)`); Tasks shows the existing today-count badge.
  - `CornerCluster({ hidden: boolean })`: `<div class="cluster" role="toolbar" aria-label="Quick actions">` with `IconButton`s labelled "Search", "Quick capture", "Settings" and (only when `lock.enabled`) "Lock ONE now"; tooltips show `⌘K` / `C`.
  - `PageBrand()`: top-left ONE mark (`BrandMark`) + page label; links to `#home`.
  - CSS var `--dock-space` (dock height + 16px + safe area) used as `padding-bottom` on `.page`.
  - `Shell` holds `const [breakActive, setBreakActive] = React2.useState(false)` and passes `hidden={breakActive}` to dock and cluster; it passes `onBreakChange={setBreakActive}` to `HomePage` (Task 7 uses it).

- [ ] **Step 1: Write failing tests** in `tests/nav.test.cjs`:

```js
test("no sidebar or top bar; one glass dock at the bottom", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  assert.equal(await page.locator(".sidebar, .topbar, .tabbar").count(), 0);
  const dock = page.getByRole("navigation", { name: "Pages" });
  const box = await dock.boundingBox();
  assert.ok(800 - (box.y + box.height) >= 16);
  assert.match(await dock.evaluate((el) => getComputedStyle(el).backdropFilter), /blur/);
});
test("dock tabs navigate and mark the current page", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  for (const name of ["Websites", "Ideas", "Saved", "Home", "Tasks"]) {
    await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name }).click();
    assert.equal(await page.getByRole("link", { name, exact: true }).getAttribute("aria-current"), "page");
  }
});
test("dock tabs are at least 44px and the page never scrolls sideways at 375px", async () => {
  for (const route of ["home", "tasks", "websites", "ideas", "saved", "preferences"]) {
    const { page } = await openApp(browser, server.url, { route, viewport: { width: 375, height: 812 } });
    for (const b of await page.locator(".dock__tab").evaluateAll((els) => els.map((e) => e.getBoundingClientRect())))
      assert.ok(b.width >= 44 && b.height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  }
});
test("corner cluster: search (Ctrl+K), capture (C), settings; lock only when enabled", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await page.keyboard.press("Control+K"); assert.ok(await page.getByRole("dialog").isVisible()); await page.keyboard.press("Escape");
  await page.keyboard.press("c"); assert.ok(await page.getByRole("dialog").isVisible()); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Settings" }).click(); assert.match(page.url(), /#preferences$/);
  assert.equal(await page.getByRole("button", { name: "Lock ONE now" }).count(), 0);
});
test("last list item is not covered by the dock", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", viewport: { width: 375, height: 812 } });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const last = await page.locator(".task-row").last().boundingBox();
  const dock = await page.locator(".dock").boundingBox();
  assert.ok(last.y + last.height <= dock.y);
});
```

- [ ] **Step 2:** Run `node --test nav.test.cjs`. Expected: FAIL (sidebar still present).
- [ ] **Step 3:** Implement `GlassDock`, `CornerCluster`, `PageBrand`; remove the old nav JS and CSS; rewrite `Shell`.
- [ ] **Step 4:** Run `node --test`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: floating glass dock and corner cluster replace sidebar and top bar`.

---

### Task 4: New Home shell, painted fallback meadow and hand cursor

**Files:**
- Modify: `index.html`: delete `HomePage` body, `HomeSubtitle`, `TodayFocus`, `Overview`, `Recent`, `Shortcuts` (~6086–6171) and CSS section Home (~1652–1898) plus Home rules in Responsive; drop now-unused helpers only if nothing else references them (`grep` before removing `greeting`, `longDate`, `ProgressRing`, `InlineAddTask`). Add CSS section `/* ---------- Home meadow ---------- */`.
- Test: `tests/home.test.cjs`

**Interfaces:**
- Consumes: `useStore()` (`data.settings.theme`, `setSettings`), `useTheme(pref)`.
- Produces:
  - `HomePage({ onBreakChange })`: root `<div class="meadow-home" data-time="morning|night">`, children in order: `<canvas class="meadow-canvas" aria-hidden>` (filled in Task 5), `MeadowFallback` (shown while three.js loads or when it fails), `<header class="meadow-hero">` with `<h1>`"touch grass"`</h1>`, `<p>`"without leaving your desk"`</p>`, `<button class="meadow-break">`"try a break"`</button>`, then `<div class="meadow-controls" role="group" aria-label="Time of day">` with a two-option segmented control (`role="radiogroup"`, radios "Morning"/"Night") and a round `<button class="meadow-sound" aria-pressed>` labelled "Ambient sound", then `HandCursor`.
  - Choosing Morning/Night calls `setSettings({ theme: "light" | "dark" })`; with `theme: "system"` the control shows whatever `useTheme` resolves.
  - `MeadowFallback({ time: "morning" | "night" })`: inline SVG/CSS painting of sky, sun or moon, hill, tree and grass; `data-ready` attribute removed once the WebGL scene draws its first frame.
  - `HandCursor({ targetRef })`: a fixed-position cartoon-hand SVG (`.hand-cursor`) following `pointermove` over `targetRef` only for `pointerType === "mouse"`; `targetRef` gets `cursor: none`; hidden on `pointerleave` and over any `button, a, [role=radio]` (they keep the normal pointer). Pressed state (`data-down`) on `pointerdown`, cleared on `pointerup`/`pointercancel`/`pointerleave`.

- [ ] **Step 1: Write failing tests** in `tests/home.test.cjs`:

```js
test("Home is only the meadow: title, subtitle, break button, time control", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "touch grass");
  assert.ok(await page.getByText("without leaving your desk").isVisible());
  assert.ok(await page.getByRole("button", { name: "try a break" }).isVisible());
  assert.equal(await page.locator(".task-list, .home-shortcuts, .capture-bar, .sample-banner").count(), 0);
});
test("Morning/Night control switches and saves the theme", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForFunction(() => document.querySelector(".meadow-home").dataset.time === "night");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")).settings.theme);
  assert.equal(saved, "dark");
  await page.getByRole("link", { name: "Tasks" }).click();
  assert.ok(await page.locator(".backdrop__stars").isVisible());
});
test("hand cursor shows over grass and hides over buttons", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.mouse.move(400, 650);
  assert.ok(await page.locator(".hand-cursor").isVisible());
  await page.getByRole("button", { name: "try a break" }).hover();
  assert.ok(!(await page.locator(".hand-cursor").isVisible()));
});
test("painted meadow shows when WebGL is unavailable", async () => {
  const b = await launch({ webgl: false });
  const { page, errors } = await openApp(b, server.url, { route: "home" });
  assert.ok(await page.locator(".meadow-fallback").isVisible());
  assert.deepEqual(errors, []);
});
```

- [ ] **Step 2:** Run `node --test home.test.cjs`. Expected: FAIL (old Home).
- [ ] **Step 3:** Implement the Home shell, `MeadowFallback`, `HandCursor`; delete the old Home code and CSS.
- [ ] **Step 4:** Run `node --test`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: Touch Grass Home shell with painted fallback and hand cursor`.

---

### Task 5: The 3D meadow: scene, grass, Morning ↔ Night

**Files:**
- Modify: `index.html`: new JS block `/* ---------- Meadow (three.js) ---------- */` above `HomePage`; `HomePage` creates/disposes it.
- Test: `tests/meadow.test.cjs`

**Interfaces:**
- Consumes: canvas from Task 4; `prefers-reduced-motion` via `matchMedia`.
- Produces:
  - `loadThree(): Promise<THREE>`: memoised `import("https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js")`.
  - `class Meadow`:
    - `constructor(THREE, canvas, { time: 0 | 1, reducedMotion: boolean })`
    - `start(): void`: builds the scene and begins the `requestAnimationFrame` loop (one frame only under reduced motion); calls `onFirstFrame` once.
    - `onFirstFrame: () => void` (set by `HomePage` to hide `MeadowFallback`).
    - `setTime(target: 0 | 1, { instant?: boolean }): void`: tweens `this.time` toward `target` over 2500 ms with ease-in-out, starting from the current value (so a reversal mid-tween has no jump); instant under reduced motion.
    - `resize(width: number, height: number): void`: renderer size, camera aspect; called from a `ResizeObserver` on the canvas.
    - `dispose(): void`: cancels rAF, removes listeners, disposes every geometry, material, texture and render target, calls `renderer.dispose()` and `forceContextLoss()`.
    - `stats(): { blades: number, time: number, animating: boolean, fps: number, width: number, height: number }`.
  - `HomePage` exposes the live instance as `window.__oneMeadow` (and deletes it on unmount) so tests can read `stats()`.
- Scene content and values the spec pins:
  - Sky: big sphere with a `ShaderMaterial` gradient; three palettes keyed by `time` (0 morning blue → 0.5 pink dusk → 1 navy); a star field (`Points`, ~800) whose opacity is `smoothstep(0.55, 1, time)`.
  - Sun and moon: sprite discs with a radial glow; the sun sinks and fades over 0→0.5, the moon rises over 0.5→1.
  - 4–6 cloud billboards (canvas-drawn soft texture) drifting slowly in x, tinted by `time`.
  - Distant hills: 2 low-poly layers with fog colour from the palette.
  - Hill: a displaced plane; `heightAt(x, z)` is shared by grass placement and the touch raycast (Task 6).
  - Tree: trunk cylinder + 5–7 icosahedron leaf clusters near the crest.
  - Grass: one `InstancedMesh` of a 5-segment tapered blade; per-instance offset, rotation, height, lean and colour jitter; vertex shader does wind (two octaves of moving noise) and bending; colour mixes base/tip with the palette by `time`. Count: 60000 when `!matchMedia("(pointer: coarse)").matches && innerWidth >= 768`, else 18000. If average fps < 45 for 2 s, halve `mesh.count` (minimum 9000) and cap pixel ratio at 1.5 (always cap at 2).
  - Wildflowers: a second `InstancedMesh` (~3% of blade count) of small quads in white, yellow, pink, violet, using the same wind.

- [ ] **Step 1: Write failing tests** in `tests/meadow.test.cjs`:

```js
const stats = (page) => page.evaluate(() => window.__oneMeadow && window.__oneMeadow.stats());
test("meadow renders with 60k blades on desktop and 18k on phones", async () => {
  let { page, errors } = await openApp(browser, server.url, { route: "home" });
  await page.waitForFunction(() => window.__oneMeadow);
  assert.equal((await stats(page)).blades, 60000);
  assert.ok(!(await page.locator(".meadow-fallback").isVisible()));
  assert.deepEqual(errors, []);
  ({ page } = await openApp(browser, server.url, { route: "home", viewport: { width: 375, height: 812 }, hasTouch: true }));
  await page.waitForFunction(() => window.__oneMeadow);
  assert.equal((await stats(page)).blades, 18000);
});
test("Night blends over ~2.5s and reverses from where it is", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await page.waitForFunction(() => window.__oneMeadow);
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForTimeout(1200);
  const mid = (await stats(page)).time;
  assert.ok(mid > 0.2 && mid < 0.8);
  await page.getByRole("radio", { name: "Morning" }).click();
  await page.waitForTimeout(50);
  assert.ok(Math.abs((await stats(page)).time - mid) < 0.1);   // no jump
  await page.waitForFunction(() => window.__oneMeadow.stats().time === 0, null, { timeout: 4000 });
});
test("canvas follows a resize without stretching", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.waitForFunction(() => window.__oneMeadow);
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForFunction(() => window.__oneMeadow.stats().width === 812 && window.__oneMeadow.stats().height === 375);
});
test("leaving Home stops and frees the meadow", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.waitForFunction(() => window.__oneMeadow);
  await page.getByRole("link", { name: "Tasks" }).click();
  assert.equal(await page.evaluate(() => window.__oneMeadow), undefined);
  assert.equal(await page.locator(".meadow-canvas").count(), 0);
});
test("painted meadow stays when three.js cannot load", async () => {
  const b = await launch({ blockThree: true });
  const { page } = await openApp(b, server.url, { route: "home" });
  await page.waitForTimeout(1000);
  assert.ok(await page.locator(".meadow-fallback").isVisible());
  assert.ok(await page.getByRole("button", { name: "try a break" }).isEnabled());
});
```

- [ ] **Step 2:** Run `node --test meadow.test.cjs`. Expected: FAIL (`window.__oneMeadow` undefined).
- [ ] **Step 3:** Implement `loadThree`, `Meadow` and the `HomePage` wiring (load → construct → `start()`; `catch` keeps the fallback; cleanup calls `dispose()`).
- [ ] **Step 4:** Run `node --test`. Expected: all PASS. Then take screenshots at 1280×800 and 375×812 in Morning and Night (`page.screenshot` into the scratchpad) and compare by eye with the recording frames: low camera, tree on the crest, soft clouds, pink dusk midway, moon at night. Adjust and re-run until they read the same.
- [ ] **Step 5:** Commit: `feat: live three.js meadow with Morning/Night blend`.

---

### Task 6: Touching the grass and fireflies

**Files:**
- Modify: `index.html`: `Meadow` (touch map, pointer, fireflies); `HomePage` forwards pointer events.
- Test: `tests/touch.test.cjs`

**Interfaces:**
- Consumes: `Meadow`, `heightAt`, `HandCursor` from Tasks 4–5.
- Produces:
  - `Meadow.setPointer(ndcX: number, ndcY: number, active: boolean): void`: raycasts to the hill; while `active`, paints a soft dab (radius ≈ 0.6 world units, carrying stroke direction in RG and pressure in B) into a 256×256 `WebGLRenderTarget` ping-pong pair covering the hill.
  - Each frame the touch map is multiplied by a decay chosen so pressure falls below 5% in 3 s (`decay = 0.05 ** (dt / 3)`); the grass vertex shader samples it to bend blades along the stroke and lift their colour by up to 15%.
  - `HomePage` calls `setPointer(x, y, true)` on `pointermove` (mouse: hover counts as touching, as in the recording; touch/pen: only while down) and `setPointer(0, 0, false)` on `pointerleave`, `pointercancel` and window `blur`.
  - Fireflies: `Points` with additive blending and a soft round sprite; 40 ambient ones wandering above the hill; up to 60 trail ones spawned at painted points, rising 0.3 units and fading over 3 s. Overall firefly opacity is `smoothstep(0.6, 1, time)` (none in Morning).
  - `stats()` gains `touchMax: number` (max pressure, read back from a 16×16 downsample at most every 250 ms) and `fireflies: number` (count currently visible, opacity > 0.05).
  - Reduced motion: blades do not move; the touch map instead drives a soft glow decal at the pointer.

- [ ] **Step 1: Write failing tests** in `tests/touch.test.cjs`:

```js
async function brush(page) {
  for (let x = 300; x <= 900; x += 20) await page.mouse.move(x, 640);
}
test("brushing the grass leaves a trail that springs back in about 3s", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.waitForFunction(() => window.__oneMeadow);
  const before = await page.screenshot({ clip: { x: 300, y: 560, width: 600, height: 160 } });
  await brush(page);
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax > 0.5);
  const after = await page.screenshot({ clip: { x: 300, y: 560, width: 600, height: 160 } });
  assert.notDeepEqual(before, after);
  await page.mouse.move(640, 100);   // over the sky: no new dabs
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax < 0.05, null, { timeout: 4500 });
});
test("leaving the window mid-stroke stops the trail and hides the hand", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.waitForFunction(() => window.__oneMeadow);
  await page.mouse.move(500, 640); await page.mouse.down();
  await page.mouse.move(-10, 640);   // out of the viewport
  await page.locator(".meadow-home").dispatchEvent("pointerleave");
  assert.ok(!(await page.locator(".hand-cursor").isVisible()));
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax < 0.05, null, { timeout: 4500 });
});
test("fireflies only at night, and more of them along a fresh trail", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await page.waitForFunction(() => window.__oneMeadow);
  assert.equal((await page.evaluate(() => window.__oneMeadow.stats())).fireflies, 0);
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForFunction(() => window.__oneMeadow.stats().time === 1, null, { timeout: 4000 });
  const ambient = (await page.evaluate(() => window.__oneMeadow.stats())).fireflies;
  assert.ok(ambient >= 40);
  await brush(page);
  await page.waitForFunction((n) => window.__oneMeadow.stats().fireflies > n, ambient);
});
test("a finger drag on a phone touches the grass", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", viewport: { width: 375, height: 812 }, hasTouch: true });
  await page.waitForFunction(() => window.__oneMeadow);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 60, y: 700 }] });
  for (let x = 60; x <= 320; x += 20) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: 700 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax > 0.5);
  assert.equal(await page.locator(".hand-cursor").isVisible(), false);
});
```

- [ ] **Step 2:** Run `node --test touch.test.cjs`. Expected: FAIL (`touchMax` undefined).
- [ ] **Step 3:** Implement the touch map, shader sampling, pointer wiring and fireflies.
- [ ] **Step 4:** Run `node --test`. Expected: all PASS. Screenshot a brushed trail in Morning and in Night and compare with the recording frames (lighter flattened path; fireflies gathering on it at night).
- [ ] **Step 5:** Commit: `feat: touch the grass and night fireflies`.

---

### Task 7: Break mode and ambient sound

**Files:**
- Modify: `index.html`: `useBreak`, `BreakPill`, `AmbientSound` blocks; `HomePage` wiring; CSS for `.break-pill`, `.meadow-home[data-break]` fades.
- Test: `tests/break.test.cjs`

**Interfaces:**
- Consumes: `HomePage({ onBreakChange })`, `Shell`'s `breakActive` → `GlassDock`/`CornerCluster` `hidden` (Task 3), `Meadow.setTime`.
- Produces:
  - `useBreak(durationMs = 60000): { active: boolean, remainingMs: number, start(): void, end(reason: "done" | "user"): void }`: stores `endsAt = Date.now() + durationMs`, recomputes `remainingMs` from `Date.now()` on a 250 ms interval and on `visibilitychange`; at 0 calls `end("done")`. Cleared on unmount.
  - `formatCountdown(ms: number): string` → `"1:00"`, `"0:59"`, … `"0:00"` (ceil to seconds).
  - `BreakPill({ remainingMs, onEnd })`: `<div class="break-pill" role="timer" aria-live="off">` "break" `<span>{formatCountdown}</span>` `<button>`"end"`</button>`.
  - While active: `.meadow-home[data-break]` fades out hero and controls (600 ms), `onBreakChange(true)` hides dock and cluster, Esc calls `end("user")`, M/N keys call the Morning/Night handler. On `end("done")`: if sound is on, play a chime; show a `role="status"` toast "welcome back 🌱" for 2.5 s. On any end, `onBreakChange(false)`.
  - `HomePage` unmount (navigation, lock) calls `end("user")` and `onBreakChange(false)`.
  - `Meadow` pauses its rAF loop while `document.hidden` and resumes on `visibilitychange`.
  - `class AmbientSound`: `start(mode: "morning" | "night"): void` (creates the `AudioContext` lazily, on the user's click), `setMode(mode): void`, `chime(): void`, `stop(): void` (1 s gain fade, then `ctx.suspend()`), `get playing(): boolean`. Graph: looped white-noise buffer → lowpass (~600 Hz, slowly modulated) for wind; morning adds a chirp scheduler (sine sweeps 2–5 kHz, random 2–7 s gaps); night adds crickets (~4.5 kHz sine bursts gated at ~30 Hz, 3–4 pulses, every ~0.8 s). Master gain fades 0 ↔ 0.35 over 1 s.
  - Sound button: `aria-pressed` reflects `playing`; state lives in `sessionStorage["one.sound"]` (session only, per the spec); off by default.

- [ ] **Step 1: Write failing tests** in `tests/break.test.cjs`:

```js
test("try a break hides the UI and counts down from 1:00", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.clock.install();
  await page.getByRole("button", { name: "try a break" }).click();
  assert.match(await page.getByRole("timer").textContent(), /break\s*1:00/);
  assert.equal(await page.locator(".dock").getAttribute("data-hidden"), "true");
  assert.ok(!(await page.getByRole("heading", { name: "touch grass" }).isVisible()));
  await page.clock.runFor(1000);
  assert.match(await page.getByRole("timer").textContent(), /0:59/);
  await page.clock.runFor(59000);
  assert.ok(await page.getByText("welcome back 🌱").isVisible());
  assert.equal(await page.locator(".dock").getAttribute("data-hidden"), null);
});
test("end button and Esc stop the break early", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.getByRole("button", { name: "try a break" }).click();
  await page.getByRole("button", { name: "end" }).click();
  assert.equal(await page.getByRole("timer").count(), 0);
  await page.getByRole("button", { name: "try a break" }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("timer").count(), 0);
});
test("M and N switch time of day during a break", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await page.getByRole("button", { name: "try a break" }).click();
  await page.keyboard.press("n");
  await page.waitForFunction(() => document.querySelector(".meadow-home").dataset.time === "night");
});
test("leaving Home mid-break restores the dock", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.getByRole("button", { name: "try a break" }).click();
  await page.evaluate(() => { location.hash = "tasks"; });
  await page.waitForSelector(".dock:not([data-hidden])");
  await page.evaluate(() => { location.hash = "home"; });
  assert.equal(await page.getByRole("timer").count(), 0);
});
test("countdown ends on time even if the tab was hidden", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.clock.install();
  await page.getByRole("button", { name: "try a break" }).click();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.clock.fastForward(61000);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  assert.equal(await page.getByRole("timer").count(), 0);
});
test("sound is off until tapped, and no AudioContext exists before that", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const sound = page.getByRole("button", { name: "Ambient sound" });
  assert.equal(await sound.getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => window.__oneSound == null), true);
  await sound.click();
  assert.equal(await sound.getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => window.__oneSound.playing), true);
});
```

(`HomePage` exposes the `AmbientSound` instance as `window.__oneSound` once created, like `__oneMeadow`.)

- [ ] **Step 2:** Run `node --test break.test.cjs`. Expected: FAIL (no timer).
- [ ] **Step 3:** Implement `useBreak`, `formatCountdown`, `BreakPill`, `AmbientSound` and the wiring.
- [ ] **Step 4:** Run `node --test`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: one-minute break mode and generated ambient sound`.

---

### Task 8: Reduced motion and offline caching

**Files:**
- Modify: `index.html` (`@media (prefers-reduced-motion: reduce)` rules for dock pebble, page enter, checkbox pop, break fades, backdrop twinkle; `Meadow` reduced-motion paths from Tasks 5–6 checked here), `sw.js`.
- Test: `tests/motion.test.cjs`

**Interfaces:**
- Consumes: `Meadow.stats().animating`, `reducedMotion` option.
- Produces: `sw.js` `CACHE = "one-v5"`, `CACHEABLE_HOSTS` includes `"cdn.jsdelivr.net"` (three.js is cached on first visit via the existing cache-first branch).

- [ ] **Step 1: Write failing tests** in `tests/motion.test.cjs`:

```js
test("reduced motion: still meadow, instant Morning/Night", async () => {
  const b = await launch({ reducedMotion: true });
  const { page } = await openApp(b, server.url, { route: "home", theme: "light" });
  await page.waitForFunction(() => window.__oneMeadow);
  assert.equal((await page.evaluate(() => window.__oneMeadow.stats())).animating, false);
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForTimeout(100);
  assert.equal((await page.evaluate(() => window.__oneMeadow.stats())).time, 1);
});
test("reduced motion: no CSS animation on the dock pebble", async () => {
  const b = await launch({ reducedMotion: true });
  const { page } = await openApp(b, server.url, { route: "tasks" });
  assert.match(await page.locator(".dock__pebble").evaluate((el) => getComputedStyle(el).transitionDuration), /^0s/);
});
test("service worker caches three.js from jsDelivr", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.match(sw, /const CACHE = "one-v5"/);
  assert.match(sw, /"cdn\.jsdelivr\.net"/);
});
```

- [ ] **Step 2:** Run `node --test motion.test.cjs`. Expected: FAIL on the CSS and `sw.js` assertions (the meadow ones may already pass from Task 5).
- [ ] **Step 3:** Implement the reduced-motion CSS and the `sw.js` changes.
- [ ] **Step 4:** Run `node --test`. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: reduced-motion fallbacks and offline cache for three.js`.

---

### Task 9: Playful restyle of Tasks, Websites, Ideas, Saved, Settings, Goals and Notes

**Files:**
- Modify: `index.html` CSS sections Buttons, Form fields, Modal, Empty state, Checkbox, Shared page pieces, Tasks, Goals, Knowledge, Saved rows, Launchpad/Websites, Settings, Ideas, Quick capture, Search palette, Toasts, Lock screen (values only; class names unchanged); JS `Sprout` component used by `TaskRow`; `EmptyState` gets an optional `art` prop with three inline SVGs (`"seed"`, `"cloud"`, `"bulb-flower"`).
- Test: `tests/pages.test.cjs`

**Interfaces:**
- Consumes: section tokens from Task 2; `TaskRow`, `EmptyState`, existing page components.
- Produces:
  - Cards/panels: `background: var(--card-bg)`, `backdrop-filter: blur(12px)`, `border-radius: var(--r-card)`, soft shadow.
  - Buttons: pill (`border-radius: 999px`), min-height 40px, `:active { transform: translateY(1px) scale(0.98) }`; primary uses `--section` / `--on-section`.
  - Headings (`.page-title`, `.panel__title`, `.settings__title`, modal titles): `font-family: var(--font-display)`.
  - `Sprout({ show: boolean })`: a 14px SVG sprout next to the checkbox that pops up (scale 0 → 1.15 → 1, 400 ms) when a task becomes done; `TaskRow` renders `<Sprout show={task.done} />`; static under reduced motion.
  - Websites: tiles lift (`translateY(-3px)` + bigger shadow) on hover.
  - Ideas: map nodes `border-radius: 50%` "seeds", links drawn as curved paths with `stroke-linecap: round` in `--section`.
  - Saved: cards get a `::after` petal corner in `--section-soft`.
  - Empty states: `EmptyState` shows its `art` above the title; Tasks uses `"seed"`, Websites `"cloud"`, Ideas `"bulb-flower"`, Saved `"seed"`. A `/* Hairline figure could replace this art later */` comment marks each.
  - Page content enter: fade + 8px rise, 220 ms.

- [ ] **Step 1: Write failing tests** in `tests/pages.test.cjs`:

```js
test("tasks: add, complete (sprout pops), delete, and it survives reload", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks" });
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel(/title|task/i).first().fill("Water the plants");
  await page.getByRole("button", { name: "Add task" }).click();
  const row = page.locator(".task-row", { hasText: "Water the plants" });
  await row.getByRole("checkbox").click();
  assert.ok(await row.locator(".sprout").isVisible());
  await page.reload();
  assert.ok(await page.locator(".task-row", { hasText: "Water the plants" }).isVisible());
  // delete through the row's menu, as the app does today
  await page.locator(".task-row", { hasText: "Water the plants" }).getByRole("button", { name: /more|actions|menu/i }).click();
  await page.getByRole("menuitem", { name: /delete/i }).click();
  await page.getByRole("button", { name: /delete/i }).last().click();
  assert.equal(await page.locator(".task-row", { hasText: "Water the plants" }).count(), 0);
  assert.deepEqual(errors, []);
});
test("websites, ideas and saved links can still be added and removed", async () => {
  // one block per page using its existing buttons: "Add website", "New idea", "Save link";
  // assert the new item appears, then remove it via its menu and assert it is gone.
});
test("cards are frosted and rounded, buttons are pills, on every page", async () => {
  for (const route of ["tasks", "websites", "ideas", "saved", "preferences", "goals", "knowledge"]) {
    const { page } = await openApp(browser, server.url, { route });
    const card = page.locator(".panel, .settings__section, .card").first();
    assert.equal(await card.evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "20px");
    assert.equal(await page.locator(".btn").first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius), "999px");
  }
});
test("empty pages show friendly art and an action", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", data: EMPTY_DATA });
  assert.ok(await page.locator(".empty-state svg.empty-art").isVisible());
  assert.ok(await page.locator(".empty-state").getByRole("button").first().isVisible());
});
```

Fill in the second test with the same pattern as the first. Selectors must use the labels the app already shows (read each editor's `Field` labels before writing them). `EMPTY_DATA` is `createEmptyData`'s shape, written into `tests/helpers.cjs` as a fixture with `settings.sampleBannerDismissed: true`.

- [ ] **Step 2:** Run `node --test pages.test.cjs`. Expected: FAIL on sprout, radius and empty-art assertions; the add/delete flows should already pass (they guard against regressions).
- [ ] **Step 3:** Implement the CSS restyles, `Sprout`, `EmptyState` art.
- [ ] **Step 4:** Run `node --test`. Expected: all PASS. Screenshot every route at 375×812 and 1280×800 in Morning and Night and check contrast and spacing by eye.
- [ ] **Step 5:** Commit: `feat: playful sky-and-meadow restyle for every page`.

---

### Task 10: Final verification

- [ ] **Step 1:** Run `cd tests && node --test`. Expected: every test PASSES, with no console errors reported.
- [ ] **Step 2:** Save a review set to the scratchpad: Home Morning, Home dusk (mid-blend), Home Night with a brushed trail, Home during a break, plus each page in Morning and Night, all at 375×812 and 1280×800. Compare Home shots side by side with the recording frames.
- [ ] **Step 3:** Run a lock check by hand: enable app lock in Settings, lock, unlock; Home meadow restarts cleanly and no errors appear.
- [ ] **Step 4:** Push the branch.
