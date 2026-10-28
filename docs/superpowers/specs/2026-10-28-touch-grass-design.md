# Touch Grass: playful redesign of ONE

Date: 2026-10-28
Status: draft, waiting for review

## Why

ONE works, but it looks like a quiet productivity tool. It should feel playful and colourful. Home becomes a live "touch grass" meadow you can brush with your hand, and every other page takes on the same sky-and-meadow look while doing exactly what it does today.

Reference: the "touch grass" screen recording (realistic 3D meadow, clean bold title, hand cursor that parts the grass, Morning/Night with pink dusk, fireflies, break countdown) and the screenshot (overall composition only). Where they differ, the recording wins: clean type, not glossy 3D letters.

## Decisions already made

| Question | Decision |
|---|---|
| Old Home content (greeting, Today's focus, Overview, Recent, Shortcuts) | Deleted. Home is only the meadow. Tasks and Websites keep the data. |
| Navigation | Sidebar and top bar removed. A floating glass tab bar at the bottom on desktop and phone. |
| Other pages | "Same world, calmer": static sky + grass backdrop, frosted cards, a colour per section. Same functions as today. |
| Meadow technology | three.js (real 3D), loaded only on Home. |
| Title style | The recording's clean rounded title, not the screenshot's glossy letters. |
| Light/dark | Morning/Night is the theme. The separate theme button goes away. |

## Constraints

- One static file app (`index.html`) on GitHub Pages, no build step. Libraries come from CDNs, pinned to exact versions.
- All current features, data, sync (Supabase, encrypted), app lock, search (⌘K / Ctrl+K), quick capture (C) and PWA install keep working.
- Usable from 375px to wide desktop, no horizontal page scroll.
- Respects `prefers-reduced-motion`.

## 1. Home: the meadow

### Scene
- Full-viewport WebGL canvas behind the Home UI.
- three.js `0.169.0` ES module, loaded with dynamic `import()` from `https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js` the first time Home opens. Other pages never load it.
- Contents: sky dome (shader gradient), sun or moon disc with glow, 4–6 soft billboard clouds drifting slowly, distant hazy hills, a rolling hill with a single round-canopy tree near the crest, grass blades, wildflowers (white, yellow, pink, violet) scattered in the grass.
- Camera low on the hill looking up toward the tree, like the recording; slight depth-of-field feel via fog and softer far blades.

### Grass
- Instanced blades (one draw call), custom vertex shader for shape, wind sway (layered noise gusts) and bending.
- Blade count: about 60k on desktop, about 18k on phones (by `matchMedia('(pointer: coarse)')` and screen size). If the measured frame rate stays under ~45 fps for 2 s, the count steps down (and pixel ratio is capped at 1.5).

### Touch
- A "touch map": a small (e.g. 256×256) render target over the hill's ground plane. The pointer, raycast onto the hill, paints soft dabs into it; each frame the map fades toward zero so a trail recovers in about 3 s.
- Blades read the map in the vertex shader: they bend away from the stroke direction and lighten slightly, leaving the brushed-down trail seen in the recording.
- Cursor: over the grass (the canvas, not over UI), the native cursor is hidden and a cartoon-hand SVG follows the pointer. Over buttons and the dock the normal pointer shows.
- Touch screens: a finger drag paints the same trail; no hand is drawn.

### Morning ↔ Night
- One `time` value from 0 (morning) to 1 (night), tweened over about 2.5 s. Sky, sun/moon, light colour, fog, grass tint and clouds are all driven from it, passing through a pink dusk around the middle.
- Night: moon and glow, a star field, blue-black grass and clouds.
- The chosen value is saved in the existing `settings.theme` (`light` = Morning, `dark` = Night, `system` = follow device; no data migration) and sets the app theme for every page.

### Fireflies (night only)
- About 40 points drifting slowly above the meadow, blinking, additive glow.
- Brushing the grass spawns extra fireflies along the fresh trail; they rise a little and fade after a few seconds. Morning shows none.

### Home UI (over the canvas)
- Centre top: "touch grass" (large, rounded display font) and "without leaving your desk" under it, then a **try a break** pill button (dark green in Morning, light in Night).
- Bottom centre, above the dock: a glass pill with ☀ Morning / ☾ Night segmented switch and a round sound button.
- The corner cluster (section 2) sits top right. ONE mark top left.

### Fallbacks
- Reduced motion: the scene renders once and stays still; touch shows a soft glow under the pointer instead of moving blades; Morning/Night switches instantly.
- No WebGL, or three.js fails to load (offline before it was cached): a painted CSS/SVG meadow with the same layout; the toggle, break and sound still work.
- Leaving Home stops the render loop, removes listeners and disposes geometries, materials and render targets.

## 2. Navigation: glass dock and corner cluster

Removed: `Sidebar`, `Topbar`, `MobileNav` and their CSS.

### Glass dock (all sizes)
- Floats 16px above the bottom edge (plus `env(safe-area-inset-bottom)`), centred.
- Tabs: Home, Tasks, Websites, Ideas, Saved. Icon + label on desktop; icon with a tiny label on phones; each target at least 44×44px.
- Glass: `backdrop-filter: blur(20px) saturate(160%)`, light tint in Morning, navy tint at Night, 1px bright top edge, soft shadow. Solid tint fallback where `backdrop-filter` is unsupported.
- Active tab: a solid rounded "pebble" that slides between tabs with a small spring overshoot.
- Tasks keeps its today-count badge.
- It is a `<nav aria-label="Pages">`, tabs are links with `aria-current="page"`, focus rings visible on the glass.
- Hidden (slides down) during a break.

### Corner cluster (top right, every page)
- Small glass pill: Search, Capture (+), Settings, and Lock only when app lock is on.
- Search keeps ⌘K / Ctrl+K; Capture keeps C.
- Each icon button has an `aria-label` and a tooltip with its shortcut.
- Fades out during a break.

### Top left
- ONE mark and the page name, small and quiet.

### Layout
- Every page gets bottom padding equal to dock height + gap so the last item is never covered.

## 3. Playful style for the other pages

### Backdrop (CSS/SVG, no WebGL)
- Morning: sky gradient (sky blue → pale warm horizon), 2–3 static cloud shapes, painted grass strip along the bottom behind the dock.
- Night: navy → indigo sky, a few twinkling stars, dark teal grass.
- Fixed behind the scrolling content.

### Type
- Headings: Fredoka (Google Fonts), rounded and bold.
- Body, lists, forms: Geist as today.

### Surfaces
- Cards: frosted, white about 80% opacity in Morning, deep blue about 60% at Night, 20px radius, gentle shadow. More opaque than the dock so text stays crisp.
- Buttons: pill-shaped, chunky, slight press-in on `:active`. Existing verb-first labels stay.

### Section colours
Each page sets `--section` (and a soft and a text variant) used for its header accent, primary buttons, checkboxes, progress and focus rings.

| Page | Colour | Small touch |
|---|---|---|
| Tasks | grass green | completing a task pops a tiny sprout by the checkbox |
| Websites | sky blue | tiles lift on hover like clouds |
| Ideas | sunflower yellow | idea map nodes become round "seeds" with vine-like links |
| Saved | blossom pink | a bookmark-petal corner on cards |
| Settings | lavender | none |
| Goals (hidden route) | clover teal | none |
| Notes (hidden route) | warm peach | none |

### Empty states
- Friendly one-line message + clear action button + a small inline illustration (seed, cloud, lightbulb-flower). These are marked as places where a Hairline figure could replace the illustration later, if that skill is installed.

### Motion
- Page content fades and rises in; dock pebble springs; checkboxes pop. All removed under reduced motion.

### Implementation note
- The token block at the top of `index.html` is replaced by Morning and Night palettes plus section colours. The existing `[data-theme]` mechanism and stored values (`light`, `dark`, `system`) are kept; the UI just calls them Morning, Night and Follow device, so most restyling comes from tokens rather than per-page rewrites.
- Settings → Appearance → Theme offers Morning / Night / Follow device.

## 4. Break mode and sound

### Break mode
- **try a break** fades and slides away the title, button, Morning/Night pill, corner cluster and dock (~0.6 s), and shows a small glass pill at the top: `break 1:00 · end`, counting down each second.
- The meadow stays fully interactive. M and N switch Morning/Night.
- At 0:00: a soft chime (only if sound is on), a short "welcome back 🌱" note, UI slides back.
- **end** or Esc stops early. The countdown uses wall-clock time, so a background tab still ends on time.
- Only available on Home.

### Ambient sound
- Generated with the Web Audio API, no files: filtered noise for wind; Morning adds occasional synthesized bird chirps, Night adds cricket pulses.
- Off by default. The round button toggles it, with a ~1 s fade. Remembered for the session only.

## 5. Code structure (inside `index.html`)

| Unit | Responsibility |
|---|---|
| `Meadow` (plain JS class) | Owns three.js scene. `start(canvas)`, `setTime(t)`, `setPointer(x, y, down)`, `setQuality()`, `dispose()`. No React. |
| `HomePage` | Mounts the canvas, creates/disposes `Meadow`, title, break button, Morning/Night pill, hand cursor. |
| `useBreak` / `BreakPill` | Countdown state and the top pill. |
| `AmbientSound` | Web Audio graph; `start(mode)`, `setMode(mode)`, `stop()`. |
| `GlassDock` | Bottom tab bar. |
| `CornerCluster` | Search / Capture / Settings / Lock. |
| `Backdrop` | Static sky + grass for non-Home pages. |
| CSS | New tokens, glass, cards, section colours, page restyles. |

`sw.js`: add `cdn.jsdelivr.net` to `CACHEABLE_HOSTS`, bump `CACHE` to `one-v5`.

## 6. Testing

Using the pre-installed Chromium via Playwright, against a local static server:

1. Home at 375×812 and 1280×800, Morning, Night and during a break: screenshots compared by eye against the recording frames.
2. Touch: a scripted mouse drag across the grass; compare frames before/after to confirm the trail appears and recovers.
3. Night: fireflies visible; extra fireflies along a fresh trail.
4. Break: UI and dock hidden, countdown ticks, Esc ends it, UI returns.
5. Dock and corner cluster: each tab navigates; search, capture, settings and lock open; keyboard shortcuts work; focus rings visible.
6. Function smoke test: add, complete and delete a task; add and delete a website, an idea and a saved link; data persists after reload.
7. No console errors; no horizontal scroll at 375px; reduced-motion emulation shows the still meadow; WebGL disabled shows the CSS meadow.

## Out of scope

- New features for Tasks, Websites, Ideas or Saved.
- Changes to sync, lock or data format. `settings.sidebarCollapsed` becomes unused but is left in stored data.
- Installing the Hairline skill (needs the owner's go-ahead).
