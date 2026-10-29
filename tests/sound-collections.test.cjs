const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startServer, launch, openApp } = require("./helpers.cjs");

const AUDIO = path.join(__dirname, "fixtures", "audio");
// Fixture files as base64, to build File objects inside the page.
const b64 = (name) => fs.readFileSync(path.join(AUDIO, name)).toString("base64");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

// Runs fn(M, files, arg) in the page, where M is window.__oneMedia and files
// are File objects made from the named fixtures.
function inPage(page, fn, { files = [], arg } = {}) {
  return page.evaluate(
    async ({ src, files, arg }) => {
      const toFile = ({ name, data }) => new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], name.split("/").pop(), { type: "audio/mpeg" });
      return new Function("M", "files", "arg", `return (${src})(M, files, arg);`)(window.__oneMedia, files.map(toFile), arg);
    },
    { src: fn.toString(), files: files.map((name) => ({ name, data: b64(name) })), arg }
  );
}
const countBlobs = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("one.media");
        req.onsuccess = () => {
          const db = req.result;
          const r = db.transaction("blobs").objectStore("blobs").count();
          r.onsuccess = () => {
            db.close();
            resolve(r.result);
          };
        };
      })
  );

test("albums are created, renamed and deleted with their tracks", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks" });
  const r = await inPage(
    page,
    async (M, files) => {
      const album = await M.createAlbum("Road trip", "music");
      const added = await M.add(files, album.id);
      const tracks = await M.list();
      await M.renameAlbum(album.id, "Summer");
      const renamed = (await M.albums())[0].name;
      await M.renameAlbum(album.id, "   ");
      const kept = (await M.albums())[0].name;
      const removed = await M.deleteAlbum(album.id);
      return { saved: added.saved.length, inAlbum: tracks.every((t) => t.albumId === album.id), titles: tracks.map((t) => t.title), renamed, kept, removed, left: (await M.list()).length, albums: (await M.albums()).length };
    },
    { files: ["album/01.mp3", "album/02.mp3"] }
  );
  assert.deepEqual(r, { saved: 2, inAlbum: true, titles: ["First Song", "Second Song"], renamed: "Summer", kept: "Summer", removed: 2, left: 0, albums: 0 });
  assert.equal(await countBlobs(page), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("an empty album name is refused and long names are clipped", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const r = await inPage(page, async (M) => {
    const empty = await M.createAlbum("   ", "music").then(() => "made", (e) => e.message);
    const long = await M.createAlbum("x".repeat(70), "nasheed");
    return { empty, length: long.name.length, kind: long.kind };
  });
  assert.deepEqual(r, { empty: "empty-name", length: 60, kind: "nasheed" });
  await page.close();
});

test("albums and tracks survive a reload", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await inPage(page, async (M, files) => M.add(files, (await M.createAlbum("Keep", "music")).id), { files: ["album/01.mp3"] });
  await page.reload();
  await page.waitForFunction(() => !!window.__oneMedia);
  const r = await inPage(page, async (M) => ({ albums: (await M.albums()).map((a) => a.name), tracks: (await M.list()).map((t) => t.title) }));
  assert.deepEqual(r, { albums: ["Keep"], tracks: ["First Song"] });
  await page.close();
});

test("a version 1 library becomes named albums, keeping every file", async () => {
  const { page, errors } = await openApp(browser, server.url, {
    route: "tasks",
    init: (p) =>
      p.evaluate(
        () =>
          new Promise((resolve, reject) => {
            // The helper's first visit already made a new database: start over at version 1.
            indexedDB.deleteDatabase("one.media");
            const req = indexedDB.open("one.media", 1);
            req.onupgradeneeded = () => {
              req.result.createObjectStore("tracks", { keyPath: "id" });
              req.result.createObjectStore("blobs", { keyPath: "id" });
            };
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction(["tracks", "blobs"], "readwrite");
              const t = tx.objectStore("tracks");
              const b = tx.objectStore("blobs");
              t.put({ id: "t1", title: "One", artist: "A", album: "Hits", albumKey: "A\u0000Hits", kind: "music", addedAt: 100 });
              t.put({ id: "t2", title: "Two", artist: "A", album: "Hits", albumKey: "A\u0000Hits", kind: "music", addedAt: 50 });
              t.put({ id: "t3", title: "Three", artist: "B", album: "Praise", albumKey: "B\u0000Praise", kind: "nasheed", addedAt: 70 });
              // An old row with no album key and no file.
              t.put({ id: "t4", title: "Lost", addedAt: 90 });
              for (const id of ["t1", "t2", "t3"]) b.put({ id, blob: new Blob(["x"]) });
              tx.oncomplete = () => {
                db.close();
                resolve();
              };
              tx.onerror = () => reject(tx.error);
            };
          })
      )
  });
  const r = await inPage(page, async (M) => {
    const albums = await M.albums();
    const tracks = await M.list();
    const byId = Object.fromEntries(albums.map((a) => [a.id, a]));
    return {
      albums: albums.map((a) => `${a.name}/${a.kind}`).sort(),
      everyTrackPlaced: tracks.every((t) => byId[t.albumId]),
      hitsOrder: tracks.filter((t) => byId[t.albumId].name === "Hits").map((t) => t.title),
      lost: byId[tracks.find((t) => t.id === "t4").albumId].name
    };
  });
  assert.deepEqual(r, { albums: ["Hits/music", "Praise/nasheed", "Singles/music"], everyTrackPlaced: true, hitsOrder: ["Two", "One"], lost: "Singles" });
  assert.equal(await countBlobs(page), 3);
  assert.equal(await page.evaluate(() => new Promise((res) => (indexedDB.open("one.media").onsuccess = (e) => (res(e.target.result.version), e.target.result.close())))), 2);
  assert.deepEqual(errors, []);
  await page.close();
});

test("ONE lets go of the database when a newer version needs it", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const ok = await page.evaluate(async () => {
    await window.__oneMedia.open();
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 2000);
      const req = indexedDB.open("one.media", 3);
      req.onsuccess = () => {
        clearTimeout(timer);
        req.result.close();
        resolve(true);
      };
    });
  });
  assert.equal(ok, true);
  await page.close();
});

test("asks the browser to keep the music, once", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: (p) =>
      p.addInitScript(() => {
        window.__persistCalls = 0;
        if (navigator.storage) navigator.storage.persist = async () => (window.__persistCalls++, true);
      })
  });
  const r = await inPage(
    page,
    async (M, files) => {
      const album = await M.createAlbum("Keep", "music");
      await M.add([files[0]], album.id);
      const first = window.__persistCalls;
      await M.add([files[1]], album.id);
      return [first, window.__persistCalls];
    },
    { files: ["album/01.mp3", "album/02.mp3"] }
  );
  assert.deepEqual(r, [1, 1]);
  await page.close();
});

test("Calm music and both Nasheed switches are gone", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  const panel = page.getByRole("dialog", { name: "Sounds" });
  await panel.getByRole("tab", { name: "Music" }).click();
  const text = await panel.innerText();
  for (const gone of ["Calm music", "Gymnopédie", "Nasheeds only"]) assert.ok(!text.includes(gone), gone);
  assert.equal(await panel.getByRole("switch", { name: /^Nasheed/ }).count(), 0);
  for (const region of ["My albums", "Spotify", "Nasheeds"]) assert.equal(await panel.getByRole("region", { name: region }).count(), 1, region);
  await page.close();
});

// ---------- Review fixes ----------

test("a track added to a collection is saved as a nasheed", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const kinds = await inPage(
    page,
    async (M, files) => {
      const music = await M.createAlbum("Road trip", "music");
      const nasheeds = await M.createAlbum("Morning", "nasheed");
      await M.add([files[0]], music.id);
      await M.add([files[1]], nasheeds.id);
      return (await M.list()).map((t) => `${t.title}:${t.kind}`).sort();
    },
    { files: ["album/01.mp3", "album/02.mp3"] }
  );
  assert.deepEqual(kinds, ["First Song:music", "Second Song:nasheed"]);
  await page.close();
});

test("an older ONE tab holding the music says so, instead of looking empty", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  // Another (older) ONE holds the database at version 1 and never lets go.
  const holder = await page.context().newPage();
  await holder.goto(`${server.url}/__blank`);
  await holder.evaluate(
    () =>
      new Promise((resolve) => {
        indexedDB.deleteDatabase("one.media").onsuccess = () => {
          const req = indexedDB.open("one.media", 1);
          req.onupgradeneeded = () => {
            req.result.createObjectStore("tracks", { keyPath: "id" });
            req.result.createObjectStore("blobs", { keyPath: "id" });
          };
          req.onsuccess = () => {
            window.__held = req.result;
            resolve();
          };
        };
      })
  );
  await page.reload();
  await page.mouse.click(2, 2);
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  const panel = page.getByRole("dialog", { name: "Sounds" });
  await panel.getByRole("tab", { name: "Music" }).click();
  await panel.getByText("Close other ONE tabs to finish updating your music.").waitFor({ timeout: 4000 });
  assert.equal(await panel.getByText("No music added yet").count(), 0);
  // The other tab closes: the music comes back by itself.
  await holder.close();
  await panel.getByText("Close other ONE tabs to finish updating your music.").waitFor({ state: "detached", timeout: 4000 });
  await page.close();
});

test("creating an album twice quickly makes one album", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  const panel = page.getByRole("dialog", { name: "Sounds" });
  await panel.getByRole("tab", { name: "Music" }).click();
  const mine = panel.getByRole("region", { name: "My albums" });
  await mine.getByRole("button", { name: "New album" }).click();
  await mine.getByRole("textbox", { name: "Album name" }).fill("Once");
  await mine.getByRole("textbox", { name: "Album name" }).evaluate((el) => {
    const form = el.form;
    form.requestSubmit();
    form.requestSubmit();
  });
  await mine.getByRole("button", { name: /^Open album Once/ }).first().waitFor();
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(() => window.__oneMedia.albums())).length, 1);
  await page.close();
});

test("a saved Calm music track from before the update is dropped", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: (p) =>
      p.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem("one.sound.v2") || "{}");
        saved.track = { item: { id: "satie-gymnopedie-1", title: "Gymnopédie No. 1", artist: "Erik Satie · Robin Alciatore", album: "Calm music", kind: "music", file: "Erik Satie - gymnopedies - la 1 ere. lent et douloureux.ogg" }, position: 12 };
        localStorage.setItem("one.sound.v2", JSON.stringify(saved));
      })
  });
  await page.waitForTimeout(500);
  assert.equal(await page.locator(".mini-player").count(), 0);
  assert.equal(await page.evaluate(() => window.__oneSound.stats().track), null);
  await page.close();
});
