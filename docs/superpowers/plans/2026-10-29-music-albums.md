# Music Albums Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Music tab holds only the owner's things: **My albums** and **Nasheeds**, which are named collections they create and fill with their own files, and **Spotify** links that show their real names. Everything is kept until the owner deletes it, and Calm music and the Nasheed switches are gone.

**Architecture:**
- IndexedDB `one.media` moves to version 2. It gets an `albums` store, and each track gets `albumId` and `order`. A one-time migration in `onupgradeneeded` turns today's tag groups into named albums.
- `MediaLibrary` gains an album API. The Music tab renders three sections and an album view on top of it.
- `SpotifySection` fetches names from Spotify's oEmbed endpoint. The player engine is unchanged.

**Tech Stack:** the single-file React 18 app in `index.html`, IndexedDB, `navigator.storage.persist()`; tests use `node:test` + Playwright through `tests/helpers.cjs`.

**Spec:** `docs/superpowers/specs/2026-10-29-music-albums-design.md`

## Global Constraints

- All code stays in `index.html` (the Sounds code isn't part of `games/`). No new dependencies.
- Files never leave the device. The player engine (`AudioEngine`, `playQueue`, the mini player, the Quran behaviour, `SpotifyDock`) is not changed.
- Data model:
  - `Album = { id: "a…", name, kind: "music" | "nasheed", createdAt }`;
  - tracks gain `albumId` and `order`;
  - an album name is trimmed and 1–60 characters, and names may repeat.
- Copy fixed by the spec:
  - section and button labels: "My albums", "Nasheeds", "Spotify", "New album", "New collection", "Album name" / "Road trip", "Collection name" / "Morning nasheeds", "All music", "Play all", "Add music", "Add nasheeds", "Add folder", "Delete album", "Delete collection", "Empty";
  - messages:
    - "Give the album a name.";
    - "Create an album and add music you own. It stays private on this device.";
    - "Create a collection and add nasheed files you have.";
    - "Delete "<name>" and its N tracks? They'll be removed from this device.";
    - "Nothing matches that.".
- Removed: `MUSIC_LIBRARY` and Calm music, the `nasheedsOnly` setting and its switch, the per-Spotify-link Nasheed switch and `kind`, `groupAlbums`, and `MediaLibrary.setKind`.

## Review Focus

1. **An upgrade with tracks but a broken or missing blob, or a track with no `albumKey`:** the migration still finishes, and every track lands in an album ("Singles"). It never throws and leaves the database stuck at version 1. *(Task 1 test)*
2. **Deleting an album while one of its tracks is playing:** playback stops cleanly, or the queue skips past it, and nothing tries to play a deleted blob forever. *(Task 2 test)*
3. **A newer version opening the database while ONE has it open** (another tab after a later update): ONE closes its connection on `versionchange`, so the upgrade isn't stuck. *(Task 1 test)*
4. **The oEmbed response has no title, or returns HTML or an error:** the placeholder stays and nothing breaks. A link added twice is still saved once. *(Task 3 test)*
5. **Renaming to an empty or whitespace-only name:** the old name is restored and nothing is saved. *(Task 2 test)*

---

### Task 1: Storage — albums store, migration, album API, persistent storage

**Files:**
- Modify: `index.html` (`MediaLibrary`)
- Create: `tests/sound-collections.test.cjs`

**Interfaces:**
- Produces, on `MediaLibrary`:
  - `open()` opens version 2:
    - from version 0 it creates `tracks`, `blobs` and `albums`;
    - from version 1 it creates `albums` and migrates;
    - `db.onversionchange = () => { db.close(); this.db = null }`.
  - `albums() -> Promise<Album[]>`, sorted by `createdAt`.
  - `createAlbum(name, kind) -> Promise<Album>`: rejects `new Error("empty-name")` when the trimmed name is empty; the name is clipped to 60 characters.
  - `renameAlbum(id, name) -> Promise<void>`: an empty trimmed name is ignored and resolves with no change.
  - `deleteAlbum(id) -> Promise<number>`: removes the album, its tracks and their blobs, and returns the number of tracks removed.
  - `add(files, albumId) -> { saved, skipped, full }`: the same checks as today. Each saved track gets `albumId` and `order` = the next order in that album. It still reads the tags (title, artist, cover, track number).
  - `list()` returns tracks sorted by `(albumId, track ?? Infinity, order, title)`.
  - `remove(ids)` is unchanged.
  - `ensurePersisted()`: calls `navigator.storage?.persist?.()` at most once per page load, ignoring errors. It's called after a successful `add`, and on Music tab mount when the library isn't empty.
- Produces the test hook `window.__oneMedia = MediaLibrary`.
- **Migration**, inside `onupgradeneeded` when `oldVersion === 1`, using the upgrade transaction:
  1. Read all tracks and group them by `albumKey`, using `"\u0000Singles"` when it's missing.
  2. For each group, put an Album: name = the group's `album` tag, or "Singles"; kind = the group's `kind`, defaulting to "music"; `createdAt` = the minimum `addedAt`.
  3. Put each track back with `albumId` and `order` = its rank by `addedAt` in the group.
  4. Never read or write `blobs`.

- [ ] **Step 1: Write the failing tests** in `tests/sound-collections.test.cjs`. Each test opens the app on route "tasks", and seeds or inspects IndexedDB in the page.
  - `albums are created, renamed and deleted with their tracks`:
    1. `createAlbum("Road trip", "music")`, then `add([File from fixtures/album/01.mp3, 02.mp3], id)` (send the bytes with `page.evaluate` as Uint8Arrays and build `File`s).
    2. `albums()` holds 1, and `list()` holds 2 with that `albumId`.
    3. `renameAlbum(id, "Summer")` changes the name.
    4. `renameAlbum(id, "   ")` keeps "Summer".
    5. `deleteAlbum(id)` returns 2. Then `list()` is empty, the `blobs` store is empty, and `albums()` is empty.
  - `an empty album name is refused`: `createAlbum("  ", "music")` rejects with `empty-name`, and a 70-character name is saved as 60.
  - `albums and tracks survive a reload`: create, add, reload, and both are still there.
  - `version 1 libraries become named albums` (Review Focus 1):
    1. Before the app opens (`openApp` with `init`), create `one.media` at version 1 with the `tracks` and `blobs` stores, holding:
       - 2 tracks with `albumKey` "A\u0000Hits", album "Hits", kind music;
       - 1 track with `albumKey` "B\u0000Praise", album "Praise", kind nasheed;
       - 1 track with no `albumKey` and no blob.
    2. Open the app.
    3. There are 3 albums: Hits/music, Praise/nasheed and Singles/music.
    4. Every track has an `albumId` that matches one of them.
    5. The blob count is unchanged, and the database version is 2.
  - `ONE lets go of the database when a newer version needs it` (Review Focus 3): in the page, `await __oneMedia.open()`. Then `indexedDB.open("one.media", 3)` must succeed within 2 s, which only happens if ONE closes its connection on `versionchange`. Afterwards, delete the test database version by reloading with a fresh context.
  - `asks to keep storage after the first upload`: wrap `navigator.storage.persist` in `init` to count calls. After `add`, the count is 1; after a second `add`, it's still 1.
- [ ] **Step 2: Run** `cd tests && node --test sound-collections.test.cjs`. Expected: FAIL (`__oneMedia` is undefined).
- [ ] **Step 3: Implement the Interfaces above.** Keep `albumKey` on old tracks (it's harmless) but stop using it for grouping.
- [ ] **Step 4: Run** `cd tests && node --test sound-collections.test.cjs`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -am "feat: music albums are stored as named collections"`

### Task 2: The Music tab — My albums, Nasheeds, album view, search; Calm music and switches removed

**Files:**
- Modify: `index.html`:
  - `MusicTab`, `AlbumTile`, `AlbumView`, `localTrack` usage and CSS;
  - remove `MUSIC_LIBRARY`, `groupAlbums`, the `nasheedsOnly` UI, and `MediaLibrary.setKind`.
- Modify: `tests/fixtures/make-audio.cjs` (add `long.mp3`: 60 s tone, ID3 title "Long Song", artist "Test Artist", album "Long Album")
- Modify: `tests/helpers.cjs` (add `addAlbum(page, name, files, { kind })`)
- Modify:
  - `tests/sound-albums.test.cjs`: rewrite it for named albums;
  - `tests/sound-music.test.cjs`, `tests/sound-review.test.cjs`, `tests/sound-quran-alone.test.cjs`, `tests/sound-panel.test.cjs`: replace Calm-music playback with an uploaded album;
  - `tests/sound-collections.test.cjs`.

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `addAlbum(page, name, files, { kind = "music" } = {})` in `tests/helpers.cjs`:
    1. It opens Sounds → Music if needed.
    2. It presses "New album" (or "New collection" for nasheed), fills the name field ("Album name" or "Collection name") and presses Enter.
    3. It opens the album tile, uploads `files` with the album's "Add music" (or "Add nasheeds") input, and waits for the `.import-result` text to stop reading "Adding…".
    4. It returns with the album view open.
  - **DOM:**
    - section landmarks `aria-label` "My albums", "Nasheeds" and "Spotify";
    - album tiles are buttons named `Open album <name>` (kept from today);
    - in the album view: "All music", the rename input labelled "Album name" (or "Collection name"), and "Play all";
    - each track row has `Play <title>` and `Remove <title>`;
    - the delete button is "Delete album" or "Delete collection".

- [ ] **Step 1: Write the failing tests.**
  - In `tests/sound-albums.test.cjs`, replace today's tests with:
    - `New album creates a named album and uploads go into it`: `addAlbum(page, "Road trip", [01.mp3, 02.mp3])`. The view shows "First Song" and "Second Song" in that order. "All music" goes back, and the tile `Open album Road trip` shows "2 tracks".
    - `an empty name shows the message`: "New album" then Enter → "Give the album a name." and no tile.
    - `an album with no tracks says Empty`: create "Later" with no uploads → the tile text contains "Empty".
    - `rename keeps the new name after a reload, and an empty rename restores the old one` (Review Focus 5).
    - `removing a track and deleting an album`:
      - "Remove First Song" leaves 1 track;
      - "Delete album" shows the exact confirm text "Delete "Road trip" and its 1 tracks? They'll be removed from this device." (keep the spec's wording; the count is a plain number);
      - confirming returns to the list with no tile, and the storage line reads "No music added yet".
    - `deleting the album that is playing stops it cleanly` (Review Focus 2): play "Long Song", then delete its album. Within 2 s `__oneSound.stats().track` is null or not playing, and there are no console errors.
    - `nasheed collections are separate from albums`: `addAlbum(page, "Morning", [01.mp3], { kind: "nasheed" })`. It's listed under the "Nasheeds" section and not under "My albums".
    - `skipped and storage-full imports` (the existing two tests, moved to run inside a named album).
    - `search finds tracks across albums and collections`.
  - In `tests/sound-collections.test.cjs`, add `Calm music and both Nasheed switches are gone`:
    - the Music tab has no text "Calm music", "Gymnopédie" or "Nasheeds only";
    - there's no switch named /^Nasheed/.
  - In the tests that used Calm music (`sound-music`, `sound-review`, `sound-quran-alone`, `sound-panel`): call `addAlbum(page, "Test", [long.mp3, 01.mp3, 02.mp3])`, play "Long Song" where they played "Gymnopédie No. 1", and match `/Long Song/` where they matched `/Gymnop/`. The next/previous and shuffle tests use the 3 album tracks.
- [ ] **Step 2: Run** `cd tests && node fixtures/make-audio.cjs && node --test --test-concurrency=1 sound-albums.test.cjs sound-collections.test.cjs`. Expected: the new UI tests fail.
- [ ] **Step 3: Implement the Interfaces above.**
  - The "New album" / "New collection" inline form uses the `labels` + `forms` skills patterns already in the app:
    - a visible label;
    - the error shown on submit;
    - the error cleared on input.
  - The rename uses an inline input: Enter or blur saves, Escape cancels.
  - The delete uses `useConfirm` with the spec copy.
  - When the deleted album holds the current track, call `engine.stopTrack()` (or the existing stop for tracks) before `deleteAlbum`.
  - The search lists the album and collection tracks, plus the Spotify items whose name matches; Spotify rows play through `SpotifyDock.load`.
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 sound-albums.test.cjs sound-collections.test.cjs sound-music.test.cjs sound-review.test.cjs sound-quran-alone.test.cjs sound-panel.test.cjs sound-fixtures.test.cjs`. Expected: all pass.
- [ ] **Step 5: Take screenshots** of the Music tab (the list and an album view) at 1280×800 and 390×844, and check the layout.
- [ ] **Step 6: Commit** `git commit -am "feat: Music tab — named albums and nasheed collections; Calm music removed"`

### Task 3: Spotify — real names, no Nasheed switch

**Files:**
- Modify: `index.html` (`SpotifySection`)
- Modify: `tests/sound-spotify.test.cjs`

**Interfaces:**
- Produces:
  - `spotifyName(openUrl) -> Promise<string | null>`:
    - it fetches `https://open.spotify.com/oembed?url=${encodeURIComponent(openUrl)}` with a 6 s AbortController timeout;
    - it returns `json.title` when that is a non-empty string, else `null`;
    - it never throws.
  - The item shape becomes `{ uri, title, type: "playlist" | "album" | "track", named: boolean }`. Old items without `type` derive it from `uri`.
  - On add, the item is saved at once with the placeholder title and `named: false`, then updated with the oEmbed title and `named: true` when that arrives.
  - When `SpotifySection` mounts, it retries every item with `named: false` (at most once per mount).
  - Row: the title, then a second line "Playlist", "Album" or "Song", and ✕ "Remove <title>". The `SoundSwitch` is removed.

- [ ] **Step 1: Write the failing tests** in `tests/sound-spotify.test.cjs`:
  - `a pasted link shows its real name`: route `https://open.spotify.com/oembed**` to `{ "title": "Lo-fi Beats" }`. Add a playlist link and the row shows "Lo-fi Beats" and "Playlist".
  - `without the name service the placeholder stays, and the name comes later` (Review Focus 4):
    1. Abort oEmbed and add a link; the row shows the placeholder.
    2. Route oEmbed to `{ "title": "Later Name" }`, close and reopen Sounds → Music, and the row shows "Later Name".
    3. With oEmbed returning HTML (status 200, text/html) the placeholder stays.
    4. Adding the same link again leaves 1 row.
  - `no Nasheed switch on Spotify items`: there's no switch whose name starts with "Nasheed:".
  - Delete `Nasheeds only hides Spotify items labelled Music`. Keep the other Spotify tests and make them pass.
- [ ] **Step 2: Run** `cd tests && node --test sound-spotify.test.cjs`. Expected: the new tests fail.
- [ ] **Step 3: Implement the Interfaces above.**
- [ ] **Step 4: Run** `cd tests && node --test --test-concurrency=1 sound-spotify.test.cjs sound-review.test.cjs sound-albums.test.cjs sound-collections.test.cjs home.test.cjs`. Expected: all pass.
- [ ] **Step 5: Commit and push** `git commit -am "feat: Spotify links show their real names; Nasheed switch removed" && git push -u origin ccr-f62deaf2-d44ra0`
