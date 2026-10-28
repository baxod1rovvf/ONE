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

const stats = (page) => page.evaluate(() => window.__oneMeadow.stats());
// CI renders in software: lighter scene and longer timeouts (see meadow.test.cjs).
async function ready(page) {
  page.setDefaultTimeout(25000);
  await page.waitForFunction(() => window.__oneMeadow && window.__oneMeadow.stats().frames > 0, null, { timeout: 90000 });
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++) window.__oneMeadow.reportFps(1);
  });
}
async function brush(page, y = 640) {
  for (let x = 300; x <= 900; x += 30) await page.mouse.move(x, y);
}

test("brushing the grass leaves a trail that springs back in about 3s", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await ready(page);
  await page.evaluate(() => {
    window.__oneMeadow.paused = true;
  });
  const clip = { x: 300, y: 560, width: 600, height: 160 };
  await page.evaluate(() => window.__oneMeadow.renderOnce());
  const before = await page.screenshot({ clip });
  await brush(page);
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax > 0.5);
  await page.evaluate(() => window.__oneMeadow.renderOnce());
  const after = await page.screenshot({ clip });
  assert.notDeepEqual(before, after, "the trail changes the grass");
  await page.evaluate(() => {
    window.__oneMeadow.paused = false;
  });
  await page.mouse.move(640, 100); // over the sky: no new dabs
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax < 0.05);
  await page.close();
});

test("pressure fades below 5% within about 3 seconds of game time", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await ready(page);
  await brush(page);
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax > 0.5);
  await page.mouse.move(640, 100);
  const left = await page.evaluate(() => {
    const m = window.__oneMeadow;
    m.paused = true;
    for (let i = 0; i < 30; i++) m.step(0.1); // 3.0 s
    return m.stats().touchMax;
  });
  assert.ok(left < 0.05, `pressure after 3 s: ${left}`);
  await page.close();
});

test("leaving the window mid-stroke stops the trail and hides the hand", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await ready(page);
  await page.mouse.move(500, 640);
  await page.mouse.down();
  await page.mouse.move(520, 640);
  await page.locator(".meadow-home").dispatchEvent("pointerleave", { pointerType: "mouse" });
  assert.ok(!(await page.locator(".hand-cursor").isVisible()));
  assert.equal(await page.evaluate(() => window.__oneMeadow.pointerActive), false);
  await page.mouse.up();
  await page.close();
});

test("fireflies only at night, and more of them along a fresh trail", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await ready(page);
  assert.equal((await stats(page)).fireflies, 0);
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForFunction(() => window.__oneMeadow.stats().time === 1);
  const ambient = (await stats(page)).fireflies;
  assert.ok(ambient >= 40, `ambient fireflies: ${ambient}`);
  await brush(page);
  await page.waitForFunction((n) => window.__oneMeadow.stats().fireflies > n, ambient);
  await page.close();
});

test("a finger drag on a phone touches the grass", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", viewport: { width: 375, height: 812 }, hasTouch: true });
  await ready(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 60, y: 600 }] });
  for (let x = 60; x <= 320; x += 20) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: 600 }] });
  await page.waitForFunction(() => window.__oneMeadow.stats().touchMax > 0.5);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await page.locator(".hand-cursor").isVisible(), false);
  await page.close();
});
