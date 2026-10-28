# Sounds and music: design

Date: 2026-10-28
Status: draft, waiting for review
Builds on: `2026-10-28-touch-grass-design.md`

## Why

Today ONE has one "Ambient sound" toggle on Home (generated wind with birds or crickets) that stops when you leave Home. The owner wants a proper sound space:

- a nature mixer with a separate switch and volume for each sound;
- a music player, including their own albums;
- nasheeds and Quran recitation for people who avoid music;
- sound that keeps playing on every page.

ONE is used by one person, but the repo and the GitHub Pages site are public. So no copyrighted albums go into the repo: the owner's own albums stay private in their browser, and the built-in library uses only freely licensed or public-domain audio and a free Quran audio service.

## Decisions already made

| Question | Decision |
|---|---|
| Famous artists' albums | Not bundled. "My albums": the owner adds their own files, stored privately in the browser on that device. Spotify music plays through Spotify's official embed player (Spotify section); nothing is downloaded from Spotify. |
| Built-in library | Free-licensed calm music, free-licensed nasheeds, and Quran recitation streamed from a free Quran audio service. |
| "Current sound" | Both: keep the meadow wind and add a river stream. |
| Quran with other audio | Quran plays alone: starting a surah pauses music/nasheeds and fades nature sounds out; they come back when the recitation stops. |
| Nature sound source | Both: generated in the browser by default, with a per-sound "Real" switch that streams a freely licensed recording when online. |
| Wind | Must be soft: lower and smoother than today, with slow gentle swells and a low default volume. |
| Volume | Every nature sound has its own volume slider, plus a master volume. |

## Constraints

- Still one static `index.html` on GitHub Pages; no build step; libraries only from CDNs at exact versions.
- Nothing copyrighted in the repo. Own albums never leave the browser and are never synced.
- Every page keeps working as now. The Touch Grass Home, the break mode and reduced-motion support stay.
- Sound never starts without a tap, because browsers block it until the page has been touched.
- Sound settings are stored per device and not synced through Supabase.

## 1. Where the sound lives and how it keeps playing

- **One audio engine for the whole app.**
  - `SoundProvider` wraps the app above `Shell` and owns one `AudioContext`, one `<audio>` element for tracks and surahs, and the nature mixer.
  - Page changes don't touch it, so sound continues on Home, Tasks, Websites, Ideas, Saved and Settings.
  - The old Home-only `AmbientSound` is replaced.
- **Reload or reopen:**
  - The mix, volumes, last tab and the position in the current track or surah are restored.
  - Nothing plays until the first tap anywhere. Then it resumes, or shows "Tap to resume" in the mini player.
- **Sound button:**
  - It lives in the corner cluster on every page and stays in the Home Morning/Night pill.
  - Its label is "Sounds". It shows small animated bars while anything plays (still bars under reduced motion).
- **Sounds panel:**
  - Desktop: a glass card under the button. Phone: a sheet sliding up from the bottom.
  - Tabs: **Nature · Music · Quran**.
  - A "Now playing" strip at the top of every tab, with play/pause, next and stop.
  - A master volume and **Stop all** at the bottom.
  - Esc or a tap outside closes it, focus is trapped while it's open and returns to the button when it closes.
- **Mini player:**
  - While a track or surah is loaded and the panel is closed, a slim glass strip sits above the dock: title, artist or reciter, play/pause, and a tap to open the panel.
  - It is hidden during a break.
- **Lock:** locking ONE pauses everything. Unlocking does not auto-resume.
- **Break mode:** sound keeps playing. The old break "chime" plays only if any sound is on.

## 2. Nature tab

Seven sounds, each a row with an on/off toggle, an icon, a volume slider (0–100%, default 40%) and a "Real" switch:

| Sound | Generated (Web Audio) | Real recording |
|---|---|---|
| Wind | Brown noise through a low-pass around 350 Hz, slow gain swells every 6–12 s; soft | Meadow wind |
| Birds | Varied chirps and short phrases, random gaps of 2–7 s, stereo-panned | Morning birdsong |
| Crickets | Gentle 4–5 kHz pulse groups, quiet | Night crickets |
| River | Band-passed noise with fast small gain wobble (trickle) | Stream |
| Waterfall | Low-passed white noise, steady, slight high "spray" layer | Waterfall |
| Rain | Pink-noise patter plus sparse single drops | Rain |
| Ocean | Noise with a slow gain and filter envelope, a wave about every 8 s | Shore waves |

- **Mixing:** any number of sounds at once. Toggles and volume changes ramp over about 1 s with no clicks.
- **"Follow the meadow"** (on by default): birds on in Morning and crickets on at Night when the Morning/Night switch changes. Turned off, they're fully manual.
- **Presets** replace the current mix:

| Preset | Sounds |
|---|---|
| Rainy day | rain + wind |
| Forest stream | river + birds |
| Seaside | ocean + wind |
| Night meadow | crickets + wind |
| Deep focus | waterfall + rain |

- **Real recordings:**
  - Freely licensed files from Wikimedia Commons, one per sound, listed with exact URLs and licences in a catalog in `index.html`. The implementation plan verifies each URL.
  - Credits appear under "ⓘ Sources".
  - The first switch-on shows a spinner on the row. The file is cached by the service worker for offline use and looped with a short crossfade.
  - If loading fails, the row falls back to the generated sound and shows "using generated sound".

## 3. Music tab

- **Calm music:** public-domain classical and freely licensed calm or ambient tracks, streamed, from a catalog with titles, artists, licences and URLs, verified in the plan.
- **Nasheeds:** a separate section of freely licensed nasheeds in the same catalog, verified in the plan. If few verified ones exist, the section starts small and the owner can add their own under My albums.
- **"Nasheeds only" setting:** hides Calm music and My albums, for people who avoid music.
- **My albums:**
  - "Add music" opens a file picker for MP3, M4A, OGG and WAV files, plus folder picking where the browser supports it.
  - Built-in tags (ID3 / MP4) give title, artist, album, track number and cover art. Untagged files fall back to the file name. Tracks can be renamed.
  - Files are stored in IndexedDB (`one.media`). A line shows the space used. Tracks and albums can be deleted after a confirmation that names them.
  - Unplayable files are skipped with a note. If storage is full, the panel says so and lists what was saved.
- **Browsing:** album tiles with covers; tapping an album shows its tracks; search filters by title, artist or album.
- **Player:**
  - play/pause, previous, next, a seek bar and shuffle;
  - repeat: off, the album or list, or one track;
  - the queue is the list you started from.
- **Media Session:** title, artist and cover on phone lock screens and headphone buttons, with play/pause/next/previous wired up.

## 3b. Spotify (inside the Music tab)

- A **Spotify** section lists saved Spotify playlists and albums. "Add from Spotify" accepts a pasted `open.spotify.com/playlist/…` or `/album/…` link (or a `spotify:` URI). Each item can be removed.
- Playback uses Spotify's official embed player through its iFrame API (`https://open.spotify.com/embed/iframe-api/v1`, `IFrameAPI.createController`). The player stays mounted at the app level, so it keeps playing on every page.
  - With the panel closed, it sits off-screen. It is never `display: none`, so playback isn't interrupted.
- You must be logged in to Spotify in the same browser. Premium plays full tracks; on a free account Spotify decides (previews or ads). A note in the section says so.
- ONE never downloads or copies Spotify audio.
- **Rules with the rest of the sound:**
  - Starting a Spotify item pauses ONE's own track player; nature sounds keep playing.
  - Starting a surah pauses Spotify through the controller (`controller.pause()`) as part of the Quran-alone rule. It does not auto-resume Spotify afterwards: the user presses play.
- "Nasheeds only" hides Spotify items marked as music. Each item has a Music/Nasheed label (default Music).
- The Spotify playlists themselves can be created in the owner's Spotify account through Claude's Spotify connector. That happens outside the app.

## 4. Quran tab

- **Source:** the Quran.com API v4.
  - Reciters come from `GET https://api.quran.com/api/v4/resources/chapter_reciters`.
  - A surah's audio comes from `GET https://api.quran.com/api/v4/chapter_recitations/{reciter_id}/{chapter}`, which returns `audio_file.audio_url`.
  - Resolved URLs are cached.
- **Reciters:**
  - Whatever the API offers, with Mishary Alafasy as the default. Shown first if present: Alafasy, Abdul Basit (murattal), Abdur-Rahman As-Sudais, Mahmoud Khalil Al-Husary, Saud Ash-Shuraim, Muhammad Siddiq Al-Minshawi. The rest follow alphabetically.
  - The choice is remembered.
- **Surahs:**
  - All 114, from a built-in table: number, Arabic name, English name, meaning, ayah count.
  - Search works in English or Arabic, e.g. "Yasin" or "يس".
  - ★ favourites are pinned at the top, plus a "Last listened" shortcut that resumes where you stopped.
- **Playback options:** "Continue to next surah" and "Repeat surah".
- **Keep offline:** a button stores the surah's audio in the service-worker cache; ✓ marks saved ones and they can be removed.
- **The Quran-alone rule:**
  - Starting a surah pauses any track and fades the nature mix to silence.
  - Stopping or ending the recitation (or stopping the last one when continuing) restores exactly what was playing.
  - While a surah plays, turning on a nature sound or a track first asks "Pause the recitation?".
- **Errors:** "Couldn't reach the recitation. Check your connection or try another reciter." with a Retry button.

## 5. Code structure (inside `index.html`)

| Unit | Responsibility |
|---|---|
| `NATURE_SOUNDS` | Catalog: id, label, icon, generator recipe, recording URL, licence, credit. |
| `NatureVoice` (class) | One sound: generated graph plus optional recording, own gain. `start()`, `stop()`, `setVolume(v)`, `useRecording(on)`. |
| `AudioEngine` (class) | `AudioContext`, master gain, voices, the `<audio>` track player, Quran-alone ducking and restore, Media Session. |
| `SoundProvider` / `useSound()` | React state for the panel and mini player; persistence (`one.sound.v2` in localStorage). |
| `MediaLibrary` | IndexedDB wrapper for own albums: `add(files)`, `list()`, `remove(id)`, `url(id)`, `usage()`. |
| `readTags(file)` | Minimal ID3v2 / MP4 tag reader (title, artist, album, track, cover). |
| `QuranSource` | Reciter list and surah URL resolution (Quran.com API), plus the `SURAHS` table. |
| `SpotifyDock` | Loads the Spotify iFrame API once, owns one embed controller mounted at app level, exposes `load(uri)`, `pause()`, `onState(cb)`. |
| `SoundsButton`, `SoundsPanel`, `NatureTab`, `MusicTab`, `QuranTab`, `MiniPlayer` | UI. |

`sw.js`:
- add `api.quran.com`, the Quran audio host returned by the API, and `upload.wikimedia.org` to the cacheable hosts;
- add an explicit cache for "Keep offline" surahs;
- bump the cache to `one-v6`.

## 6. Testing

- **Browser tests serve local audio:**
  - Small generated WAV fixtures stand in for the Wikimedia, music and Quran URLs.
  - A fixture JSON stands in for the Quran.com API.
  - The same routing the suite already uses for three.js.
- **What's tested:**
  - each nature toggle and volume, and that they're kept after a reload;
  - presets; follow-the-meadow;
  - sound continuing across every page;
  - the Quran-alone pause and exact restore;
  - adding albums from fixture files: tags read, kept after a reload, deletable, usage shown;
  - queue, next/previous, repeat, shuffle;
  - "Nasheeds only";
  - the fallback to generated sound when a recording fails;
  - a Quran stream error with Retry;
  - lock pausing everything; the mini player hiding during a break;
  - keyboard and focus in the panel.
- **Not testable from the build container:**
  - whether the sounds are pleasant;
  - the real Wikimedia and Quran.com URLs, which the container can't reach. The plan verifies them with web lookups, and the owner listens after release.

## Out of scope

- Syncing sound settings or own albums between devices.
- Lyrics, playlists beyond album and queue, equalizer.
- Downloading copyrighted music from anywhere.
