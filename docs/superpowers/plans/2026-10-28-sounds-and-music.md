# Sounds and Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ONE an app-wide sound space: a seven-sound nature mixer with a volume for each sound, a music player (a free library plus your own albums kept privately in the browser), nasheeds, and Quran recitation that plays alone. Everything keeps playing across pages.

**Architecture:**
- An `AudioEngine` class owns one `AudioContext`, the nature voices and one `<audio>` element. It is created by a `SoundProvider` that wraps the app above `Shell`, so changing routes never touches it.
- The UI is a "Sounds" button in the corner cluster that opens a panel with Nature, Music and Quran tabs, plus a mini player above the dock.
- Own albums live in IndexedDB. Quran audio links come from the Quran.com API at runtime.

**Tech Stack:**
- the existing single-file React 18 app;
- Web Audio API, HTMLAudioElement, Media Session API, IndexedDB, the Cache API;
- tests: `node:test` + Playwright; `lamejs@1.2.1` (dev only) to build MP3 test fixtures.

**Spec:** `docs/superpowers/specs/2026-10-28-sounds-and-music-design.md`

## Global Constraints

- One static `index.html` on GitHub Pages, no build step, CDN libraries pinned to exact versions. Nothing copyrighted goes into the repo.
- Own albums never leave the browser and are never synced. Sound settings are per device in `localStorage["one.sound.v2"]`.
- Sound never starts without a user gesture. After a reload, playback resumes on the first tap anywhere.
- Every nature sound has a volume from 0 to 100% (default 40%), plus a master volume. Changes ramp over about 1 s.
- Wind must be soft: a low-pass around 350 Hz with slow swells every 6–12 s.
- Quran plays alone: a surah pauses any track and fades nature to silence. Stopping or ending it restores exactly what was playing.
- Copy fixed by the spec:
  - names: "Sounds", "Nature", "Music", "Quran", "Stop all", "Follow the meadow", "Nasheeds only", "Add music", "Keep offline", "Continue to next surah", "Repeat surah", "Pause the recitation?", "using generated sound";
  - error text: "Couldn't reach the recitation. Check your connection or try another reciter."
- Presets:
  - Rainy day = rain + wind;
  - Forest stream = river + birds;
  - Seaside = ocean + wind;
  - Night meadow = crickets + wind;
  - Deep focus = waterfall + rain.
- Lock pauses everything and unlocking doesn't resume. The mini player is hidden during a break.
- Use only licence-confirmed sources. A row that has no confirmed recording shows no "Real" switch.

**Sources confirmed by web search during planning:**

| Use | Commons file (via `https://commons.wikimedia.org/wiki/Special:FilePath/<name>`) | Licence |
|---|---|---|
| Rain recording | `Sound of rain.ogg` | CC BY-SA 3.0 |
| Crickets recording | `Crickets choir.ogg` | CC BY-SA 4.0 |
| Calm music | `Erik Satie - gymnopedies - la 1 ere. lent et douloureux.ogg` (Robin Alciatore, Musopen) | Public domain |
| Calm music | `Ludwig van Beethoven - sonata no. 14 in c sharp minor 'moonlight', op. 27 no. 2 - i. adagio sostenuto.ogg` (Musopen) | Public domain |
| Calm music | `Moonlight Sonata Presto.ogg` (Paul Pitman, Musopen) | Public domain |

- Wind, birds, river, waterfall and ocean have no confirmed recording yet, so they are generated only.
- No freely licensed nasheed recording was confirmed, so Nasheeds starts empty with an "Add your own nasheeds" action.
- Quran: `GET https://api.quran.com/api/v4/resources/chapter_reciters` and `GET https://api.quran.com/api/v4/chapter_recitations/{reciter_id}/{chapter}` → `audio_file.audio_url`.

## Review Focus

1. Toggling sounds or presets rapidly must not stack duplicate voices or leak nodes: the count of running voices always equals the count of toggled-on sounds. Test in Task 2.
2. A picked folder that mixes audio with non-audio files (images, `.txt`) or broken audio: the bad ones are skipped with a note and the good ones are imported. Test in Task 5.
3. Pressing next, previous or seek while a track is still loading should land on the newest choice, not an older one. Test in Task 4.
4. A surah ending while the panel is closed and you're on another page must still restore the previous mix and track. Test in Task 7.
5. Storage running out partway through an import: the tracks already saved stay, and the message says which were saved. Test in Task 5.

---

## File structure

| File | Responsibility |
|---|---|
| `index.html` | New blocks (in this order, above `HomePage`): `/* ---------- Sound: nature voices ---------- */` (`NATURE_SOUNDS`, `NatureVoice`), `/* ---------- Sound: engine ---------- */` (`AudioEngine`), `/* ---------- Sound: library ---------- */` (`MUSIC_LIBRARY`, `MediaLibrary`, `readTags`), `/* ---------- Sound: Quran ---------- */` (`SURAHS`, `QuranSource`), `/* ---------- Sound: UI ---------- */` (`SoundProvider`, `useSound`, `SoundsButton`, `SoundsPanel`, `NatureTab`, `MusicTab`, `QuranTab`, `MiniPlayer`), CSS section `/* ---------- Sounds panel ---------- */`. Removes `AmbientSound`, `readSoundPref`/`writeSoundPref` and the Home-local sound state. |
| `sw.js` | Cache hosts `commons.wikimedia.org`, `upload.wikimedia.org`, `api.quran.com` and any `*.quranicaudio.com` / `*.qurancdn.com` audio host; a `one-quran-offline` cache for Keep offline; `CACHE = "one-v6"`. |
| `tests/fixtures/make-audio.cjs` | Builds fixtures: `tone.wav` (2 s), `loop.wav` (4 s), `album/01.mp3` and `album/02.mp3` with ID3v2 tags (artist "Test Artist", album "Test Album", titles "First Song"/"Second Song", track 1/2, a 1×1 PNG cover), `untagged.mp3`, `not-audio.txt`, `broken.mp3` (random bytes). |
| `tests/fixtures/quran/chapter_reciters.json`, `tests/fixtures/quran/recitation.json` | Fake API responses. |
| `tests/helpers.cjs` | Routes the Commons Special:FilePath URLs to `loop.wav`/`tone.wav`, `api.quran.com` to the fixtures, and the fixture `audio_url` host to `tone.wav`. Option `blockAudio: true` aborts those. |
| `tests/sound-*.test.cjs` | One file per task. |

---

### Task 1: Audio test fixtures and routing

**Files:**
- Create: `tests/fixtures/make-audio.cjs`, `tests/fixtures/quran/*.json`
- Modify: `tests/package.json` (devDependency `lamejs: 1.2.1`; script `"pretest": "node fixtures/make-audio.cjs"`), `tests/helpers.cjs`, `.gitignore` (`tests/fixtures/audio/`)
- Test: `tests/sound-fixtures.test.cjs`

**Interfaces:**
- Produces:
  - fixture paths under `tests/fixtures/audio/`;
  - `launch({ blockAudio })`;
  - `openApp(..., { gesture = true })`: clicks `body` once after load, so the page counts as tapped (needed for sound).
  - The fake reciters JSON lists: `{id:7, reciter_name:"Mishari Rashid al-`Afasy"}`, `{id:2, reciter_name:"AbdulBaset AbdulSamad", style:{name:"Murattal"}}`, `{id:3, reciter_name:"Abdur-Rahman as-Sudais"}`, `{id:99, reciter_name:"Zzz Test Reciter"}`.
  - The fake recitation JSON is `{audio_file:{audio_url:"https://audio.test-quran.example/{reciter}/{chapter}.mp3"}}`; the route fills in the numbers.

- [ ] **Step 1:** Write `sound-fixtures.test.cjs`:
  - after `npm test`'s pretest, each fixture file exists;
  - `album/01.mp3` starts with `ID3`;
  - in a page, `new Audio(<commons rain URL>)` fires `canplaythrough`;
  - `fetch(<chapter_reciters URL>)` returns 4 reciters.
- [ ] **Step 2:** Run `cd tests && node --test sound-fixtures.test.cjs`. Expected: FAIL (no fixtures).
- [ ] **Step 3:** Implement `make-audio.cjs` (sine tones encoded with lamejs, ID3v2.3 frames TIT2/TPE1/TALB/TRCK/APIC written by hand) and the routing.
- [ ] **Step 4:** Run `npm install && node fixtures/make-audio.cjs && node --test sound-fixtures.test.cjs`. Expected: PASS.
- [ ] **Step 5:** Commit: `test: audio fixtures and routing for the sounds feature`.

---

### Task 2: App-wide engine, Sounds button and the Nature mixer

**Files:**
- Modify: `index.html`:
  - new nature-voice, engine and UI blocks;
  - `App` wraps `SoundProvider` around `Shell` (inside `LockProvider`, so locking unmounts nothing in the provider);
  - `CornerCluster` gets `SoundsButton`;
  - Home's `.meadow-sound` button opens the panel;
  - delete `AmbientSound`, `SOUND_KEY`, `readSoundPref`, `writeSoundPref` and HomePage's sound state;
  - the break-end chime calls `sound.chime()`.
- Test: `tests/sound-nature.test.cjs`

**Interfaces:**
- Produces:
  - `NATURE_SOUNDS: Array<{ id: "wind"|"birds"|"crickets"|"river"|"waterfall"|"rain"|"ocean", label, icon, recording?: { file, licence, author } }>`.
  - `class NatureVoice`: `constructor(ctx, destination, id)`, `start()`, `stop()` (1 s fade, then free the nodes), `setVolume(v: 0..1)`, `useRecording(url | null): Promise<boolean>`, `get running(): boolean`, `get source(): "generated"|"recording"`.
  - `class AudioEngine`:
    - `resume(): Promise<void>` (call from a gesture);
    - `setNature(id, on: boolean)`, `setNatureVolume(id, v)`, `setMaster(v)`, `stopAll()`, `chime()`;
    - `pauseAll()` (lock);
    - `stats(): { voices: Record<id, { on, volume, running, source }>, master, ducked, track }`, where `track` comes from Task 4;
    - `onChange(cb)` → unsubscribe.
  - `SoundProvider` / `useSound(): { engine, state, panelOpen, openPanel(tab?), closePanel(), followMeadow, setFollowMeadow, applyPreset(name) }`, where `state` mirrors the saved settings.
  - Saved shape in `localStorage["one.sound.v2"]`: `{ nature: { [id]: { on, volume, real } }, master, followMeadow, tab, nasheedsOnly, quran: {...}, track: {...} }`.
  - `window.__oneSound = engine` (debug handle, as `__oneMeadow`).
  - DOM:
    - `button[aria-label="Sounds"]` in the cluster, with `data-playing` while anything plays;
    - `[role=dialog][aria-label="Sounds"]` panel with `role=tablist` tabs "Nature", "Music", "Quran";
    - each nature row has `role=switch` with the sound's label, `input[type=range][aria-label="<Label> volume"]`, and `data-source` set to generated or recording.
  - Generated recipes are in the spec table. Wind: brown noise → low-pass 350 Hz → gain with a slow LFO over 6–12 s.
  - Follow the meadow: when `settings.theme` resolves to morning, birds on and crickets off; at night the reverse. This applies only when Follow is on.

- [ ] **Step 1: Write failing tests** in `sound-nature.test.cjs`:

```js
test("Sounds button is on every page and opens the panel with three tabs", ...)       // tasks, websites, home
test("each nature sound toggles on and off with its own volume", async () => {
  // open panel, toggle Rain → stats().voices.rain {on:true, running:true}; drag "Rain volume" to 70 → volume 0.7
  // toggle Rain off → running false within 1.5 s
});
test("sound keeps playing while moving between every page", async () => {
  // Rain on at Home; click each dock tab; after each, stats().voices.rain.running === true and ctx state "running"
});
test("rapid toggling and presets never stack voices", async () => {
  // click Rain switch 9 times quickly, apply 5 presets in a row
  // Object.values(stats().voices).filter(v => v.running).length === number of switches with aria-checked=true
});
test("presets replace the mix", ...)            // Seaside → only ocean+wind on
test("Follow the meadow switches birds and crickets with Morning/Night", ...)
test("mix and volumes come back after a reload, and play after the first tap", async () => {
  // Rain 70%, Wind on; reload; before tapping, button has no data-playing; click body; both running, rain volume 0.7
});
test("Stop all and the master volume", ...)
test("locking pauses everything and unlocking doesn't resume", ...)   // set PIN as in Task 10 of the previous plan
test("the old Home sound button opens the Sounds panel", ...)
```

- [ ] **Step 2:** Run `node --test sound-nature.test.cjs`. Expected: FAIL (no Sounds button).
- [ ] **Step 3:** Implement the blocks above and remove the old Home sound code.
- [ ] **Step 4:** Run `npm test`. Expected: all PASS. Update `break.test.cjs` / `review.test.cjs` sound assertions to the new button, and log the change as a ruling.
- [ ] **Step 5:** Commit: `feat: app-wide sound engine and nature mixer`.

---

### Task 3: Real recordings with fallback, and offline caching

**Files:**
- Modify: `index.html` (`NATURE_SOUNDS` recording entries for rain and crickets only, "Real" switch, "ⓘ Sources" list), `sw.js`
- Test: `tests/sound-real.test.cjs`

**Interfaces:**
- Consumes: `NatureVoice.useRecording`.
- Produces:
  - a `role=switch` named "Real recording" in a row only when that sound has a recording;
  - while loading, the row has `aria-busy="true"`;
  - on failure, `data-source="generated"` and the visible note "using generated sound";
  - recordings play through `<audio crossorigin="anonymous" loop>` → `MediaElementSource` into the voice gain, with a 0.5 s crossfade at the loop point. Under reduced motion, the crossfade is the same; it isn't motion.
  - `sw.js`: hosts added; `CACHE = "one-v6"`.

- [ ] **Step 1: Write failing tests:**
  - rain and crickets show "Real recording"; wind, birds, river, waterfall and ocean don't;
  - switching it on gives `stats().voices.rain.source === "recording"`;
  - with `launch({ blockAudio: true })` it falls back, showing "using generated sound" while still running;
  - the Sources list names "Sound of rain.ogg — CC BY-SA 3.0";
  - `sw.js` has `one-v6` and the hosts.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: real nature recordings with generated fallback`.

---

### Task 4: Track player, Calm music and the mini player

**Files:**
- Modify: `index.html` (`MUSIC_LIBRARY` with the 3 public-domain tracks, engine track API, Music tab: Calm music list, now-playing strip, `MiniPlayer` above the dock, Media Session)
- Test: `tests/sound-music.test.cjs`

**Interfaces:**
- Produces:
  - `MUSIC_LIBRARY: Array<{ id, title, artist, album, kind: "music"|"nasheed", src, licence }>`.
  - Engine:
    - `playQueue(tracks: Track[], index: number)`, `toggle()`, `next()`, `prev()`, `seek(seconds)`;
    - `setRepeat("off"|"all"|"one")`, `setShuffle(boolean)`;
    - `stopTrack()`;
    - `stats().track: { id, title, playing, position, duration, repeat, shuffle, queueLength }`.
  - Each new `playQueue`, `next`, `prev` or `seek` bumps a request counter; a load that resolves for an older request is ignored (Review Focus #3).
  - DOM:
    - `.mini-player` with title text, `button[aria-label="Play"|"Pause"]`, `data-hidden` during a break;
    - the panel's now-playing strip with "Previous", "Play/Pause", "Next", "Stop";
    - a range input with aria-label "Seek".
  - The position is saved every 5 s and restored after a reload (paused, at that position).

- [ ] **Step 1: Write failing tests:**
  - playing "Gymnopédie" shows it in the mini player on every page;
  - next and previous move through the queue;
  - repeat one restarts the track at its end (simulate by seeking near the end);
  - shuffle never repeats until the queue is exhausted;
  - clicking next three times quickly ends on the third track, not an earlier one (Review Focus #3);
  - the mini player hides during a break;
  - the position is restored after a reload.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: music player, calm music library and mini player`.

---

### Task 5: My albums (IndexedDB), nasheeds and "Nasheeds only"

**Files:**
- Modify: `index.html` (`MediaLibrary`, `readTags`, Music tab sections "My albums" and "Nasheeds", "Add music" input `accept="audio/*,.mp3,.m4a,.ogg,.wav"` multiple, plus `webkitdirectory` behind an "Add folder" button where supported; album tiles, album view, rename, delete with a named confirm, a usage line, an album "Nasheed" toggle, the "Nasheeds only" switch)
- Test: `tests/sound-albums.test.cjs`

**Interfaces:**
- Produces:
  - `readTags(file: File): Promise<{ title?, artist?, album?, track?, cover?: Blob }>`, reading ID3v2.3/2.4 (TIT2, TPE1, TALB, TRCK, APIC) and MP4 `©nam/©ART/©alb/trkn/covr`.
  - `MediaLibrary`, a DB `one.media` with stores `tracks` and `blobs`:
    - `add(files: File[]): Promise<{ saved: Track[], skipped: { name, reason }[], full: boolean }>`;
    - `list(): Promise<Track[]>`;
    - `remove(ids: string[])`, `rename(id, title)`, `setKind(albumKey, "music"|"nasheed")`;
    - `url(id): Promise<string>` (an object URL, revoked when the track changes);
    - `usage(): Promise<{ bytes, tracks }>`.
  - Each file is checked before saving: playable means it decodes `canplay` within 3 s in a detached `<audio>`; otherwise it's skipped with "Can't play this file". A non-`audio/*` file is skipped with "Not an audio file". A `QuotaExceededError` stops the import with `full: true` (Review Focus #2 and #5).
  - "Nasheeds only" hides Calm music and My albums and shows Nasheeds (built-in nasheeds plus albums marked Nasheed).

- [ ] **Step 1: Write failing tests:**
  - adding `album/01.mp3` and `album/02.mp3` shows album "Test Album" by "Test Artist" with 2 tracks in track order and a cover;
  - `untagged.mp3` gets the file name as its title;
  - a mixed set of 2 good files + `not-audio.txt` + `broken.mp3` saves 2 and reports 2 skipped by name;
  - after a reload the album is still there and plays;
  - deleting the album asks "Delete “Test Album”?" and frees the usage;
  - when quota is simulated by an init script making `IDBObjectStore.prototype.put` throw `QuotaExceededError` on the 2nd call, 1 is saved and the message names it;
  - marking the album Nasheed plus "Nasheeds only" shows it under Nasheeds and hides Calm music;
  - with no nasheeds, the Nasheeds section shows "Add your own nasheeds".
  - renaming "First Song" to "Morning Song" is kept after a reload;
  - searching "second" in the Music tab shows only "Second Song".
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: own albums kept privately in the browser, nasheeds section`.

---

### Task 6: Quran tab

**Files:**
- Modify: `index.html` (`SURAHS`, `QuranSource`, Quran tab, Keep offline), `sw.js` (`one-quran-offline` is never evicted by the cache-version cleanup)
- Test: `tests/sound-quran.test.cjs`

**Interfaces:**
- Produces:
  - `SURAHS: Array<[number, arabic, english, meaning, ayahs]>`, 114 rows.
  - `QuranSource`:
    - `reciters(): Promise<Array<{ id, name, style? }>>`, ordered: the spec's preferred names first in spec order (matched case-insensitively on "afasy", "abdulbaset|abdul basit" with Murattal, "sudais", "husary", "shuraim", "minshawi"), then the rest alphabetically;
    - `surahUrl(reciterId, n): Promise<string>`, memoised;
    - `keepOffline(reciterId, n)`, `isOffline(reciterId, n)`, `removeOffline(reciterId, n)`.
  - Engine: `playSurah(reciterId, n)`, with `stats().track.kind === "quran"`.
  - Saved `quran: { reciterId, favourites: number[], last: { n, position }, continue: boolean, repeat: boolean }`.
  - On error, the `role=alert` text is the spec's copy, with a "Retry" button.

- [ ] **Step 1: Write failing tests:**
  - `SURAHS.length === 114`; the rows for 1, 2, 36 and 114 show ayah counts 7, 286, 83 and 6;
  - search "Yasin" and "يس" both find surah 36;
  - reciters list Afasy first, then AbdulBaset, then Sudais, then "Zzz Test Reciter";
  - playing Al-Fatiha with Afasy requests `.../7/1.mp3`;
  - "Continue to next surah" moves to surah 2 at the end;
  - "Repeat surah" replays;
  - a ★ favourite is pinned at the top after a reload;
  - "Last listened" resumes;
  - Keep offline shows ✓ and `caches.has("one-quran-offline")`;
  - with `blockAudio`, the error text and Retry appear.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: Quran recitation tab`.

---

### Task 7: The Quran-alone rule

**Files:**
- Modify: `index.html` (engine ducking and restore, confirm prompt)
- Test: `tests/sound-quran-alone.test.cjs`

**Interfaces:**
- Produces:
  - `engine.stats().ducked: boolean`.
  - Starting a surah:
    - snapshot `{ trackId, position, wasPlaying, nature on/volume }`;
    - pause the track;
    - fade the nature master to 0 over 1 s; voices keep their settings.
  - Stop or end (with no continue): fade nature back over 1 s; resume the track at the snapshot position if it was playing.
  - While ducked, turning on a nature sound or a track opens a confirm dialog "Pause the recitation?" (Pause / Cancel). Pause stops the surah and applies the user's action.

- [ ] **Step 1: Write failing tests:**
  - with Rain and Gymnopédie at 20 s playing, start a surah: the track is paused, `ducked`, and the nature gain is 0;
  - press Stop: Rain is back at its volume and the track plays from about 20 s;
  - start a surah, navigate to Tasks and let it end (seek near the end): the same restore happens (Review Focus #4);
  - toggling Wind during recitation asks "Pause the recitation?", and Cancel keeps reciting.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: Quran plays alone and restores what was playing`.

---

### Task 8: Panel polish and final verification

**Files:**
- Modify: `index.html` (panel focus trap and restore, Esc and outside-click close, phone bottom sheet at ≤760px, still bars under reduced motion, playing bars on the button)
- Test: `tests/sound-panel.test.cjs`

- [ ] **Step 1: Write failing tests:**
  - Tab stays inside the panel; Esc closes it and focus returns to "Sounds";
  - at 375px the panel is anchored to the bottom and has no sideways scroll;
  - under reduced motion the bars don't animate;
  - while the panel is open, the global shortcuts C and Ctrl+K don't fire.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: all PASS. Take screenshots of the panel tabs at 1280 and 375, in Morning and Night, and compare by eye.
- [ ] **Step 5:** Commit: `feat: Sounds panel keyboard, phone sheet and reduced motion`. Push.
