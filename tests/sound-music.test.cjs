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

const track = (page) => page.evaluate(() => window.__oneSound.stats().track);
const panel = (page) => page.getByRole("dialog", { name: "Sounds" });
async function openMusic(page) {
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  await panel(page).getByRole("tab", { name: "Music" }).click();
}
const playCalm = (page, title) => panel(page).getByRole("button", { name: `Play ${title}` }).click();
const now = (page) => panel(page).getByRole("group", { name: "Now playing" });
const mini = (page) => page.locator(".mini-player");
const dockLink = (page, name) => page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name });

test("a calm track plays and the mini player follows you to every page", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await page.keyboard.press("Escape");
  for (const name of ["Websites", "Ideas", "Saved", "Home", "Tasks"]) {
    await dockLink(page, name).click();
    assert.match(await mini(page).textContent(), /Gymnopédie No. 1/, name);
    assert.equal((await track(page)).playing, true, `still playing on ${name}`);
  }
  await mini(page).getByRole("button", { name: "Pause" }).click();
  assert.equal((await track(page)).playing, false);
  await page.close();
});

test("next and previous move through the list", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await page.waitForFunction(() => window.__oneSound.stats().track);
  assert.equal((await track(page)).index, 0);
  await now(page).getByRole("button", { name: "Next" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track.index === 1);
  await now(page).getByRole("button", { name: "Previous" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track.index === 0);
  await page.close();
});

test("repeat one replays the track when it ends", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.duration > 0);
  const repeat = now(page).getByRole("button", { name: /^Repeat/ });
  await repeat.click(); // all
  await repeat.click(); // one
  assert.equal((await track(page)).repeat, "one");
  const id = (await track(page)).id;
  await page.evaluate(() => window.__oneSound.seek(window.__oneSound.stats().track.duration - 0.2));
  await page.waitForFunction((tid) => {
    const t = window.__oneSound.stats().track;
    return t.id === tid && t.position < 1 && t.playing && t.plays > 1;
  }, id);
  await page.close();
});

test("shuffle plays every track once before repeating", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await page.waitForFunction(() => window.__oneSound.stats().track);
  await now(page).getByRole("switch", { name: "Shuffle" }).click();
  const seen = new Set([(await track(page)).id]);
  for (let i = 0; i < 2; i++) {
    const before = (await track(page)).id;
    await now(page).getByRole("button", { name: "Next" }).click();
    await page.waitForFunction((b) => window.__oneSound.stats().track.id !== b, before);
    seen.add((await track(page)).id);
  }
  assert.equal(seen.size, 3);
  await page.close();
});

test("quick taps on Next land on the newest choice even while a track is loading", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  // Make the first track slow to arrive.
  await page.route(/gymnopedies/i, async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fallback();
  });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await now(page).getByRole("button", { name: "Next" }).click();
  await now(page).getByRole("button", { name: "Next" }).click();
  await page.waitForTimeout(2000);
  const t = await track(page);
  assert.equal(t.index, 2);
  assert.match(t.title, /Presto/);
  await page.close();
});

test("the mini player hides during a break", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await page.keyboard.press("Escape");
  await mini(page).waitFor();
  await page.getByRole("button", { name: "try a break" }).click();
  await page.waitForSelector(".mini-player[data-hidden='true']");
  await page.close();
});

test("the track and its position come back after a reload, paused", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.duration > 0);
  await page.evaluate(() => window.__oneSound.seek(1.2));
  await now(page).getByRole("button", { name: "Pause" }).click();
  await page.reload();
  await mini(page).waitFor();
  assert.match(await mini(page).textContent(), /Gymnopédie No. 1/);
  const t = await track(page);
  assert.equal(t.playing, false);
  assert.ok(Math.abs(t.position - 1.2) < 0.3, `position ${t.position}`);
  await page.close();
});

test("Stop all also stops the music", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openMusic(page);
  await playCalm(page, "Gymnopédie No. 1");
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await panel(page).getByRole("button", { name: "Stop all" }).click();
  await page.waitForFunction(() => !window.__oneSound.stats().track || !window.__oneSound.stats().track.playing);
  await page.close();
});
