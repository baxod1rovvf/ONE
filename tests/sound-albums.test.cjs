const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { startServer, launch, openApp } = require("./helpers.cjs");

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
async function addFiles(page, files) {
  await panel(page).getByLabel("Add music").setInputFiles(files);
  // The status reads "Adding…" while files are checked, then the result.
  await page.waitForFunction(() => {
    const el = document.querySelector(".import-result");
    return el && !/Adding/.test(el.textContent);
  });
}
const album = (page, name) => panel(page).getByRole("button", { name: new RegExp(`^Open album ${name}`) });

test("adding tagged files makes an album with its tracks in order and a cover", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await addFiles(page, [f("album/02.mp3"), f("album/01.mp3")]);
  assert.match(await panel(page).locator(".import-result").textContent(), /Added 2 tracks/);
  await album(page, "Test Album").click();
  assert.ok(await panel(page).getByText("Test Artist").first().isVisible());
  const titles = await panel(page).locator(".album-view .track-row__title").allTextContents();
  assert.deepEqual(titles, ["First Song", "Second Song"]);
  assert.ok(await panel(page).locator(".album-view img.album-cover").isVisible());
  await page.close();
});

test("an untagged file is named after the file", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await addFiles(page, [f("untagged.mp3")]);
  await panel(page).getByRole("searchbox", { name: "Search music" }).fill("untagged");
  assert.ok(await panel(page).getByRole("button", { name: "Play untagged" }).isVisible());
  await page.close();
});

test("non-audio and broken files are skipped by name, good ones are kept", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await addFiles(page, [f("album/01.mp3"), f("not-audio.txt"), f("broken.mp3"), f("album/02.mp3")]);
  const msg = await panel(page).locator(".import-result").textContent();
  assert.match(msg, /Added 2 tracks/);
  assert.match(msg, /not-audio\.txt/);
  assert.match(msg, /broken\.mp3/);
  await page.close();
});

test("albums stay after a reload and play", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await addFiles(page, [f("album/01.mp3"), f("album/02.mp3")]);
  await page.reload();
  await page.mouse.click(2, 2);
  await openMusic(page);
  await album(page, "Test Album").click();
  await panel(page).getByRole("button", { name: "Play First Song" }).click();
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return t && t.title === "First Song" && t.playing;
  });
  await page.close();
});

test("deleting an album asks first and frees the space", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await addFiles(page, [f("album/01.mp3"), f("album/02.mp3")]);
  assert.match(await panel(page).locator(".music-usage").textContent(), /2 tracks/);
  await album(page, "Test Album").click();
  await panel(page).getByRole("button", { name: "Delete album" }).click();
  const dialog = page.getByRole("alertdialog");
  assert.match(await dialog.textContent(), /Delete “Test Album”\?/);
  await dialog.getByRole("button", { name: "Delete album" }).click();
  await panel(page).locator(".music-usage").filter({ hasText: "No music added yet" }).waitFor();
  assert.equal(await album(page, "Test Album").count(), 0);
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
  await openMusic(page);
  await addFiles(page, [f("album/01.mp3"), f("album/02.mp3")]);
  const msg = await panel(page).locator(".import-result").textContent();
  assert.match(msg, /Storage is full/);
  assert.match(msg, /First Song/);
  await album(page, "Test Album").click();
  assert.deepEqual(await panel(page).locator(".album-view .track-row__title").allTextContents(), ["First Song"]);
  await page.close();
});

test("an album marked Nasheed shows under Nasheeds, and Nasheeds only hides music", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  const nasheeds = panel(page).getByRole("region", { name: "Nasheeds" });
  assert.ok(await nasheeds.getByRole("button", { name: "Add your own nasheeds" }).isVisible());
  await addFiles(page, [f("album/01.mp3"), f("album/02.mp3")]);
  await album(page, "Test Album").click();
  await panel(page).getByRole("switch", { name: "Nasheed album" }).click();
  await panel(page).getByRole("button", { name: "All music" }).click();
  await panel(page).getByRole("switch", { name: "Nasheeds only" }).click();
  assert.equal(await panel(page).getByRole("region", { name: "Calm music" }).count(), 0);
  assert.equal(await panel(page).getByRole("region", { name: "My albums" }).count(), 0);
  assert.equal(await nasheeds.getByRole("button", { name: /^Open album Test Album/ }).count(), 1);
  await page.close();
});

test("a renamed track keeps its new name after a reload", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await addFiles(page, [f("album/01.mp3")]);
  await album(page, "Test Album").click();
  await panel(page).getByRole("button", { name: "Rename First Song" }).click();
  const field = panel(page).getByRole("textbox", { name: "Track name" });
  await field.fill("Morning Song");
  await field.press("Enter");
  await page.reload();
  await openMusic(page);
  await album(page, "Test Album").click();
  assert.ok(await panel(page).getByRole("button", { name: "Play Morning Song" }).isVisible());
  await page.close();
});

test("searching music filters by title, artist or album", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await addFiles(page, [f("album/01.mp3"), f("album/02.mp3")]);
  await panel(page).getByRole("searchbox", { name: "Search music" }).fill("second");
  const results = await panel(page).locator(".search-results .track-row__title").allTextContents();
  assert.deepEqual(results, ["Second Song"]);
  await page.close();
});
