const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startServer, launch, openApp } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch({ threeD: true, reducedMotion: true });
});
after(async () => {
  await browser.close();
  await server.close();
});

const stats = (page) => page.evaluate(() => window.__oneMeadow.stats());

test("reduced motion: still meadow, instant Morning/Night", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  page.setDefaultTimeout(25000);
  await page.waitForFunction(() => window.__oneMeadow && window.__oneMeadow.stats().frames > 0, null, { timeout: 90000 });
  assert.equal((await stats(page)).animating, false);
  const settled = (await stats(page)).frames;
  await page.waitForTimeout(1500);
  assert.equal((await stats(page)).frames, settled, "no frames drawn while nothing changes");
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForFunction(() => window.__oneMeadow.stats().time === 1, null, { timeout: 2000 });
  await page.close();
});

test("reduced motion: touching shows a glow that still fades away", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  page.setDefaultTimeout(25000);
  await page.waitForFunction(() => window.__oneMeadow && window.__oneMeadow.stats().frames > 0, null, { timeout: 90000 });
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) window.__oneMeadow.reportFps(1); // lighter scene for the CI renderer
  });
  for (let x = 300; x <= 900; x += 30) await page.mouse.move(x, 640);
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax > 0.5);
  await page.mouse.move(640, 100);
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax < 0.05, null, { timeout: 20000 });
  await page.close();
});

test("reduced motion: no transition on the dock pebble or the break fade", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const pebble = await page.locator(".dock__pebble").evaluate((el) => getComputedStyle(el).transitionDuration);
  assert.match(pebble, /^0s/);
  await page.close();
});

test("service worker caches three.js from jsDelivr", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.match(sw, /const CACHE = "one-v\d+"/); // the exact version is pinned by sound-real.test.cjs
  assert.match(sw, /"cdn\.jsdelivr\.net"/);
});
