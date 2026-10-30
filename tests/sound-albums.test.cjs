const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { startServer, launch, openApp, addAlbum } = require("./helpers.cjs");

const AUDIO = path.join(__dirname, "fixtures", "audio");
const f = (name) => path.join(AUDIO, name);

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

const panel = (page) => page.getByRole("dialog", { name: "Sounds" });
async function openMusic(page) {
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  await panel(page).getByRole("tab", { name: "Music" }).click();
}
// Adds files to the album that is open in the panel.
async function addFiles(page, files) {
  await panel(page).getByLabel("Add music").setInputFiles(files);
  // The status reads "Adding…" while files are checked, then the result.
  await page.waitForFunction(() => {
    const el = document.querySelector(".import-result");
    return el && !/Adding/.test(el.textContent);
  });
}
const album = (page, name) => panel(page).getByRole("button", { name: new RegExp(`^Open album ${name}`) });

test("New album creates a named album and uploads go into it", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Road trip", ["album/02.mp3", "album/01.mp3"]);
  assert.match(await panel(page).locator(".import-result").textContent(), /Added 2 tracks/);
  assert.deepEqual(await panel(page).locator(".album-view .track-row__title").allTextContents(), ["First Song", "Second Song"]);
  assert.ok(await panel(page).locator(".album-view img.album-cover").isVisible());
  await panel(page).getByRole("button", { name: "All music" }).click();
  assert.match(await album(page, "Road trip").textContent(), /2 tracks/);
  assert.deepEqual(errors, []);
  await page.close();
});

test("an empty album name shows a message and makes nothing", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  const mine = panel(page).getByRole("region", { name: "My albums" });
  assert.ok(await mine.getByText("Create an album and add music you own. It stays private on this device.").isVisible());
  await mine.getByRole("button", { name: "New album" }).click();
  await mine.getByRole("textbox", { name: "Album name" }).press("Enter");
  assert.ok(await mine.getByText("Give the album a name.").isVisible());
  assert.equal(await mine.getByRole("button", { name: /^Open album/ }).count(), 0);
  await page.close();
});

test("an album with no tracks says Empty", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  const mine = panel(page).getByRole("region", { name: "My albums" });
  await mine.getByRole("button", { name: "New album" }).click();
  await mine.getByRole("textbox", { name: "Album name" }).fill("Later");
  await mine.getByRole("textbox", { name: "Album name" }).press("Enter");
  assert.match(await album(page, "Later").textContent(), /Empty/);
  await page.close();
});

test("a renamed album keeps its name after a reload; an empty rename keeps the old one", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Road trip", ["album/01.mp3"]);
  await panel(page).getByRole("button", { name: "Rename album" }).click();
  const field = panel(page).getByRole("textbox", { name: "Album name" });
  await field.fill("Summer");
  await field.press("Enter");
  await panel(page).getByRole("heading", { name: "Summer" }).waitFor();
  await panel(page).getByRole("button", { name: "Rename album" }).click();
  await panel(page).getByRole("textbox", { name: "Album name" }).fill("   ");
  await panel(page).getByRole("textbox", { name: "Album name" }).press("Enter");
  await panel(page).getByRole("heading", { name: "Summer" }).waitFor();
  await page.reload();
  await page.mouse.click(2, 2);
  await openMusic(page);
  assert.equal(await album(page, "Summer").count(), 1);
  await page.close();
});

test("removing a track and deleting an album", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Road trip", ["album/01.mp3", "album/02.mp3"]);
  await panel(page).getByRole("button", { name: "Delete First Song" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete track" }).click();
  await panel(page).getByRole("button", { name: "Play First Song" }).waitFor({ state: "detached" });
  await panel(page).getByRole("button", { name: "Delete album" }).click();
  const dialog = page.getByRole("alertdialog");
  assert.match(await dialog.textContent(), /Delete “Road trip” and its 1 track\?/);
  assert.match(await dialog.textContent(), /They’ll be removed from this device\./);
  await dialog.getByRole("button", { name: "Delete album" }).click();
  await panel(page).locator(".music-usage").filter({ hasText: "No music added yet" }).waitFor();
  assert.equal(await album(page, "Road trip").count(), 0);
  await page.close();
});

test("deleting the album that is playing stops it cleanly", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Long", ["long.mp3"]);
  await panel(page).getByRole("button", { name: "Play Long Song" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await panel(page).getByRole("button", { name: "Delete album" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete album" }).click();
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return !t || !t.playing;
  }, null, { timeout: 2000 });
  assert.deepEqual(errors, []);
  await page.close();
});

test("nasheed collections are separate from albums", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  assert.ok(await panel(page).getByText("Create a collection and add nasheed files you have.").isVisible());
  await addAlbum(page, "Morning", ["album/01.mp3"], { kind: "nasheed" });
  await panel(page).getByRole("button", { name: "All music" }).click();
  assert.equal(await panel(page).getByRole("region", { name: "Nasheeds" }).getByRole("button", { name: /^Open album Morning/ }).count(), 1);
  assert.equal(await panel(page).getByRole("region", { name: "My albums" }).getByRole("button", { name: /^Open album Morning/ }).count(), 0);
  await page.close();
});

test("non-audio and broken files are skipped by name, good ones are kept", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Mixed", ["album/01.mp3", "not-audio.txt", "broken.mp3", "album/02.mp3"]);
  const msg = await panel(page).locator(".import-result").textContent();
  assert.match(msg, /Added 2 tracks/);
  assert.match(msg, /not-audio\.txt/);
  assert.match(msg, /broken\.mp3/);
  await page.close();
});

test("albums stay after a reload and play", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Road trip", ["album/01.mp3", "album/02.mp3"]);
  await page.reload();
  await page.mouse.click(2, 2);
  await openMusic(page);
  await album(page, "Road trip").click();
  await panel(page).getByRole("button", { name: "Play First Song" }).click();
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return t && t.title === "First Song" && t.playing;
  });
  await page.close();
});

test("when storage runs out mid-import, what was saved stays and is named", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let blobs = 0;
    IDBObjectStore.prototype.put = function (value, ...rest) {
      if (value && value.blob && !String(value.id).startsWith("cover:") && ++blobs === 2) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      return put.call(this, value, ...rest);
    };
  });
  await addAlbum(page, "Road trip", ["album/01.mp3", "album/02.mp3"]);
  const msg = await panel(page).locator(".import-result").textContent();
  assert.match(msg, /Storage is full/);
  assert.match(msg, /First Song/);
  assert.deepEqual(await panel(page).locator(".album-view .track-row__title").allTextContents(), ["First Song"]);
  await page.close();
});

test("a renamed track keeps its new name after a reload", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Road trip", ["album/01.mp3"]);
  await panel(page).getByRole("button", { name: "Rename First Song" }).click();
  const field = panel(page).getByRole("textbox", { name: "Track name" });
  await field.fill("Morning Song");
  await field.press("Enter");
  await panel(page).getByRole("button", { name: "Play Morning Song" }).waitFor();
  await page.reload();
  await openMusic(page);
  await album(page, "Road trip").click();
  await panel(page).getByRole("button", { name: "Play Morning Song" }).waitFor();
  await page.close();
});

test("an untagged file is named after the file, and search finds tracks across albums and collections", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await addAlbum(page, "Road trip", ["untagged.mp3", "album/01.mp3"]);
  await addAlbum(page, "Morning", ["album/02.mp3"], { kind: "nasheed" });
  await panel(page).getByRole("button", { name: "All music" }).click();
  const search = panel(page).getByRole("searchbox", { name: "Search music" });
  await search.fill("untagged");
  assert.ok(await panel(page).getByRole("button", { name: "Play untagged" }).isVisible());
  await search.fill("song");
  assert.deepEqual((await panel(page).locator(".search-results .track-row__title").allTextContents()).sort(), ["First Song", "Second Song"]);
  await search.fill("zzz");
  assert.ok(await panel(page).getByText("Nothing matches that.").isVisible());
  await page.close();
});
