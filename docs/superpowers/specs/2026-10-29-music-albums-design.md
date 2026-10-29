# Music tab: your own albums, nasheeds and Spotify — design

Date: 2026-10-29
Status: draft, waiting for review
Builds on: `2026-10-28-sounds-and-music-design.md` (Sounds panel, Music tab, `MediaLibrary` in IndexedDB, Spotify section)

## Why

The owner wants the Music tab to hold only their own things:

- **My albums:** albums they create and name, filled with music files they have.
- **Spotify:** links to Spotify music.
- **Nasheeds:** collections they create and name, the same way as albums.

Everything stays until they delete it. The built-in "Calm music" recordings go. Today the owner can't create or name an album: uploaded files are grouped automatically by the album tag written inside each file.

## Decisions already made

| Question | Decision |
|---|---|
| Sections | Only My albums, Spotify and Nasheeds. Calm music and the built-in library are removed. |
| Albums | The owner creates and names them, uploads files into them, and can rename and delete them or remove single tracks. |
| Nasheeds | They work exactly like albums ("collections"). |
| Spotify | The owner pastes a link, which is saved until removed. The link shows its real name. |
| "Nasheeds only" switch and the per-link Nasheed switch | Both are removed. |
| Existing uploaded music | It is kept and becomes named albums (see Migration). |
| Keeping data | Files stay in IndexedDB and links in the sound settings. ONE asks the browser for permanent storage. |

## Constraints

- One static `index.html`, no build step, no new dependencies.
- Files never leave the device: there is no sync, and nothing is uploaded to a server.
- The player engine (`playQueue`, the mini player, the Quran behaviour, the Spotify dock) is unchanged.
- The copy is fixed by this spec, listed in the sections below.

## 1. Data

IndexedDB `one.media` goes from version 1 to version 2 and gains a store `albums` (keyPath `id`):

```
Album = { id: "a…", name: string, kind: "music" | "nasheed", createdAt: ms }
Track (existing store "tracks") gains: albumId: string, order: number
```

- A track belongs to exactly one album.
- Tracks are ordered by the track-number tag when present, then by `order` (upload order), then by title.
- `MediaLibrary` gains the following:
  - **Albums:**
    - `albums()` lists them by `createdAt`;
    - `createAlbum(name, kind)` returns the new Album;
    - `renameAlbum(id, name)`;
    - `deleteAlbum(id)` removes the album, its tracks and their blobs.
  - **Tracks:**
    - `add(files, albumId)` keeps today's checks (audio only, playable, the storage-full stop) and puts every saved track in `albumId`;
    - the existing `remove(ids)`.
  - **Removed:** `setKind`, and grouping by `albumKey`.
- **Names:** an album name is trimmed. It must be 1–60 characters, and names don't have to be unique.

**Migration** (run once, in `onupgradeneeded` from version 1):
1. Each distinct `albumKey` among the existing tracks becomes one Album:
   - its name is that group's album tag (for example "Moonlight Sonatas"), or "Singles" when there is no tag;
   - its kind is that group's `kind`;
   - its `createdAt` is the group's earliest `addedAt`.
2. Each track gets that album's `albumId` and an `order` from its `addedAt`.
3. No blobs are touched, and nothing is deleted.

**Keeping data:** the first time music is added, and also at the start if a library exists, ONE calls `navigator.storage.persist()` once. It ignores the result and shows nothing.

## 2. The Music tab

**Top to bottom:** the now-playing card (unchanged), a search box ("Search music"), then the **My albums**, **Spotify** and **Nasheeds** sections.

**My albums section:**
- A header "My albums" with a "New album" button (Plus icon).
- The button opens an inline name field with the label "Album name" and the placeholder "Road trip". Enter creates the album, and Escape cancels.
- An empty name shows "Give the album a name." under the field, checked on submit.
- **Album tiles:**
  - each shows the name, "N tracks", and the cover from the first track that has one;
  - an album with no tracks shows "Empty";
  - pressing a tile opens the album.
- **Empty section:** "Create an album and add music you own. It stays private on this device."
- **Storage line** (as today): "12 tracks · 85 MB on this device", or "No music added yet".

**Nasheeds section:** the same as My albums, with these words:
- the button is "New collection", the field label "Collection name", and the placeholder "Morning nasheeds";
- the empty text is "Create a collection and add nasheed files you have."

**Inside an album or collection:**
- **Top:** a back button "All music" and the album name.
- **Rename:** an inline rename (the name becomes an input). Enter or blur saves, Escape cancels, and an empty name restores the old one.
- **Buttons:** "Play all", "Add music" ("Add nasheeds" in a collection) and "Add folder" (where the browser supports folders), plus "Delete album" ("Delete collection").
- **Tracks:** each row has play and a ✕ "Remove <title>". Removing a track asks nothing and shows the usual undo toast.
- **Uploads:** after an upload, the existing import status line shows, for example "Added 3 tracks. Skipped: notes.txt (Not an audio file)."
- **Delete:** it confirms with *"Delete "<name>" and its N tracks? They'll be removed from this device."* using the confirm label "Delete album" ("Delete collection"). After deleting, the view goes back to the list.

**Search:**
- With a query, the sections are replaced by one list of matching tracks (title, artist or album name) from albums and collections, plus matching Spotify link names.
- Spotify matches play through the Spotify dock, as their rows do in the Spotify section.
- No matches shows "Nothing matches that."

## 3. Spotify

- The add form stays the same: "Paste a playlist, album or song link" and Add, with the same error for a bad link.
- **Real names:** when a link is added, ONE fetches `https://open.spotify.com/oembed?url=<the open.spotify.com link>` and saves the response's `title`, shown as for example "Lo-fi Beats".
  - The type ("Playlist", "Album" or "Song") is shown as the second line.
  - If the request fails, the title stays today's placeholder ("Spotify playlist …a1b2"), and ONE tries again the next time the Music tab opens, for items still on the placeholder.
- **Removed:** the Nasheed switch and the `kind` field. Existing items keep working; their `kind` is ignored.
- Items are saved in `one.sound.v2` → `spotify` (as today) and stay until removed with ✕ "Remove <name>".

## 4. Removed

- `MUSIC_LIBRARY` (Calm music), its section, and its note "Public-domain recordings from Musopen…".
- The "Nasheeds only" switch and the `nasheedsOnly` setting. The setting is read and then ignored, so it doesn't need a migration.
- The automatic grouping by tags (`groupAlbums`) and "Mark as nasheed".
- Nothing in Nature or Quran changes.

## Testing

Changes go in the existing `tests/sound-albums.test.cjs` and `tests/sound-music.test.cjs`, plus a new `tests/sound-collections.test.cjs`, using the existing fixture audio.

- **Albums:**
  - create a named album, upload 2 fixture files into it, and see 2 tracks;
  - reload: the album and tracks are still there;
  - rename it, remove one track, then delete it with the confirm, and the tracks and blobs are gone;
  - an empty name shows the message.
- **Nasheeds:** the same flow under "New collection", kept separate from My albums.
- **Migration:**
  1. Seed IndexedDB version 1 with 3 tracks in 2 tag groups (one with kind nasheed).
  2. Open the app.
  3. There are 2 albums with the right names and kinds, all 3 tracks keep their blobs, and they still play.
- **Removed:** there is no "Calm music" text, no "Nasheeds only", and no Nasheed switch on Spotify items.
- **Spotify:**
  - with oEmbed routed to a fixture, the added link shows its real title;
  - with oEmbed aborted, it shows the placeholder, and reopening the tab after un-routing shows the real title;
  - links survive a reload, and ✕ removes one.
- **Persistent storage:** `navigator.storage.persist` is called after the first upload (spied in the page).
- **Search:** a query matches a track in an album and a Spotify name.
- **Regression:** all other sound tests (nature, Quran, panel, the Spotify dock) and Home still pass. The tests that used Calm music are changed to use uploaded fixture tracks.

## Not included

Moving tracks between albums, reordering tracks by hand, album artwork upload, syncing albums across devices, and Spotify search.
