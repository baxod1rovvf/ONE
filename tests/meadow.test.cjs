const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch({ threeD: true });
});
after(async () => {
  await browser.close();
  await server.close();
});

const stats = (page) => page.evaluate(() => window.__oneMeadow && window.__oneMeadow.stats());
// The software renderer used in CI stalls for seconds at a time, so pages
// showing the 3D meadow get a longer default timeout.
const ready = (page) => {
  page.setDefaultTimeout(25000);
  return page.waitForFunction(() => window.__oneMeadow && window.__oneMeadow.stats().frames > 0);
};
// Software rendering in CI is slow; drop to the 9k floor (as a slow device would)
// before tests that depend on frame timing.
const lite = (page) => page.evaluate(() => {
  for (let i = 0; i < 8; i++) window.__oneMeadow.reportFps(1);
});
const dock = (page) => page.getByRole("navigation", { name: "Pages" });

test("meadow picks 60k blades on desktop and 18k on phones", async () => {
  let { page, errors } = await openApp(browser, server.url, { route: "home" });
  await ready(page);
  assert.equal((await stats(page)).bladesTarget, 60000);
  await page.waitForSelector(".meadow-fallback[data-hidden='true']");
  assert.deepEqual(errors, []);
  await page.close();
  ({ page } = await openApp(browser, server.url, { route: "home", viewport: { width: 375, height: 812 }, hasTouch: true }));
  await ready(page);
  assert.equal((await stats(page)).bladesTarget, 18000);
  await page.close();
});

test("Night blends over ~2.5s and reverses from where it is", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await ready(page);
  await lite(page);
  assert.equal((await stats(page)).time, 0);
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForFunction(() => window.__oneMeadow.stats().time > 0.3, null, { timeout: 20000 });
  const mid = (await stats(page)).time;
  assert.ok(mid > 0.3 && mid < 0.95, `mid-blend ${mid}`);
  await page.getByRole("radio", { name: "Morning" }).click();
  const after = (await stats(page)).time;
  assert.ok(Math.abs(after - mid) < 0.2, `no jump: ${mid} -> ${after}`);
  await page.waitForFunction(() => window.__oneMeadow.stats().time === 0, null, { timeout: 20000 });
  await page.close();
});

test("canvas follows a resize without stretching", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await ready(page);
  await lite(page);
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForFunction(() => {
    const s = window.__oneMeadow.stats();
    return s.width === 812 && s.height === 375 && Math.abs(s.aspect - 812 / 375) < 0.01;
  });
  await page.close();
});

test("leaving Home stops and frees the meadow", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await ready(page);
  await lite(page);
  await page.evaluate(() => {
    window.__meadowRef = window.__oneMeadow;
  });
  await dock(page).getByRole("link", { name: "Tasks" }).click();
  assert.equal(await page.evaluate(() => window.__oneMeadow), undefined);
  assert.equal(await page.locator(".meadow-canvas").count(), 0);
  assert.equal(await page.evaluate(() => window.__meadowRef.stats().disposed), true);
  await page.close();
});

test("painted meadow stays when three.js cannot load", async () => {
  const b = await launch({ threeD: true, blockThree: true });
  try {
    const { page } = await openApp(b, server.url, { route: "home" });
    await page.waitForTimeout(1500);
    assert.ok(await page.locator(".meadow-fallback").isVisible());
    assert.equal(await page.locator(".meadow-fallback").getAttribute("data-hidden"), null);
    assert.ok(await page.getByRole("button", { name: "try a break" }).isEnabled());
  } finally {
    await b.close();
  }
});

test("blade count steps down (not below 9000) when frames are slow", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await ready(page);
  await page.evaluate(() => window.__oneMeadow.reportFps(20));
  await page.evaluate(() => window.__oneMeadow.reportFps(20));
  const s = await stats(page);
  assert.ok(s.blades <= 30000 && s.blades >= 9000, `halved: ${s.blades}`);
  assert.ok(s.pixelRatio <= 1.5);
  for (let i = 0; i < 6; i++) await page.evaluate(() => window.__oneMeadow.reportFps(20));
  assert.equal((await stats(page)).blades, 9000);
  await page.close();
});
