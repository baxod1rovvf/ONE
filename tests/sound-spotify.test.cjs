const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp } = require("./helpers.cjs");

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
const spotify = (page) => panel(page).getByRole("region", { name: "Spotify" });
async function openTab(page, tab) {
  if (!(await panel(page).count())) await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  await panel(page).getByRole("tab", { name: tab }).click();
}
async function addLink(page, link) {
  await spotify(page).getByRole("textbox", { name: "Spotify link" }).fill(link);
  await spotify(page).getByRole("button", { name: "Add" }).click();
}
const calls = (page) => page.evaluate(() => (window.__fakeSpotify ? window.__fakeSpotify.calls : []));
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO?si=abc123";

test("playlist, album (any region) and track links are accepted; other links are not", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await addLink(page, PLAYLIST);
  await addLink(page, "open.spotify.com/intl-de/album/1A2B3C4D5E");
  await addLink(page, "spotify:track:6rqhFgbbKwnb9MLmUQDhG6");
  assert.equal(await spotify(page).locator(".spotify-item").count(), 3);
  await addLink(page, "https://example.com/x");
  assert.ok(await spotify(page).getByText("That isn't a Spotify playlist, album or track link.").isVisible());
  assert.equal(await spotify(page).locator(".spotify-item").count(), 3);
  await page.close();
});

test("saved Spotify items stay after a reload", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await addLink(page, PLAYLIST);
  await page.reload();
  await openTab(page, "Music");
  assert.equal(await spotify(page).locator(".spotify-item").count(), 1);
  await page.close();
});

test("playing an item loads it in Spotify's player and pauses ONE's own music", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await addLink(page, PLAYLIST);
  await spotify(page).getByRole("button", { name: /^Play Spotify/ }).click();
  await page.waitForFunction(() => window.__fakeSpotify && window.__fakeSpotify.calls.some((c) => c[0] === "play"));
  const c = await calls(page);
  assert.ok(c.some((x) => x[0] === "loadUri" && x[1] === "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO") || c.some((x) => x[0] === "create" && x[1] === "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO"));
  await page.waitForFunction(() => !window.__oneSound.stats().track.playing);
  await page.close();
});

test("the Spotify player stays mounted while moving between pages", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await addLink(page, PLAYLIST);
  await spotify(page).getByRole("button", { name: /^Play Spotify/ }).click();
  await page.waitForFunction(() => window.__fakeSpotify && window.__fakeSpotify.created === 1);
  await page.keyboard.press("Escape");
  for (const name of ["Websites", "Home", "Tasks"]) await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name }).click();
  assert.equal(await page.evaluate(() => window.__fakeSpotify.destroyed), false);
  assert.equal(await page.evaluate(() => window.__fakeSpotify.created), 1);
  assert.equal(await page.locator(".fake-spotify-embed").count(), 1);
  await page.close();
});

test("starting a surah pauses Spotify", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await addLink(page, PLAYLIST);
  await spotify(page).getByRole("button", { name: /^Play Spotify/ }).click();
  await page.waitForFunction(() => window.__fakeSpotify && window.__fakeSpotify.calls.some((c) => c[0] === "play"));
  await openTab(page, "Quran");
  await panel(page).getByRole("button", { name: "Play 112. Al-Ikhlas" }).click();
  await page.waitForFunction(() => window.__fakeSpotify.calls.some((c) => c[0] === "pause"));
  await page.close();
});

test("Nasheeds only hides Spotify items labelled Music", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await addLink(page, PLAYLIST);
  await addLink(page, "spotify:album:1A2B3C4D5E");
  await spotify(page).locator(".spotify-item").nth(1).getByRole("switch", { name: /^Nasheed/ }).click();
  await panel(page).getByRole("switch", { name: "Nasheeds only" }).click();
  assert.equal(await spotify(page).locator(".spotify-item").count(), 1);
  assert.match(await spotify(page).locator(".spotify-item").textContent(), /album/i);
  await page.close();
});
