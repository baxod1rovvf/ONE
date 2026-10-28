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

const breakButton = (page) => page.getByRole("button", { name: "try a break" });
const dock = (page) => page.locator(".dock");

test("try a break hides the UI and counts down from 1:00", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000); // fake time stands still between steps
  await breakButton(page).click();
  const timer = page.getByRole("timer");
  assert.match(await timer.textContent(), /break\s*1:00/);
  assert.equal(await dock(page).getAttribute("data-hidden"), "true");
  assert.equal(await page.locator(".pagebar").getAttribute("data-hidden"), "true");
  await page.waitForFunction(() => getComputedStyle(document.querySelector(".meadow-hero")).opacity === "0");
  await page.clock.runFor(1000);
  assert.match(await timer.textContent(), /0:59/);
  await page.clock.runFor(59000);
  assert.ok(await page.getByText("welcome back 🌱").isVisible());
  assert.equal(await page.getByRole("timer").count(), 0);
  assert.equal(await dock(page).getAttribute("data-hidden"), null);
  await page.close();
});

test("end button and Esc stop the break early", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await breakButton(page).click();
  await page.getByRole("button", { name: "end" }).click();
  assert.equal(await page.getByRole("timer").count(), 0);
  await breakButton(page).click();
  assert.equal(await page.getByRole("timer").count(), 1);
  await page.keyboard.press("Escape");
  await page.getByRole("timer").waitFor({ state: "detached" });
  await page.waitForSelector(".dock:not([data-hidden])"); // updates a tick after the timer goes
  await page.close();
});

test("M and N switch time of day during a break", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await breakButton(page).click();
  await page.keyboard.press("n");
  await page.waitForFunction(() => document.querySelector(".meadow-home").dataset.time === "night");
  await page.keyboard.press("m");
  await page.waitForFunction(() => document.querySelector(".meadow-home").dataset.time === "morning");
  await page.close();
});

test("leaving Home mid-break restores the dock and ends the break", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await breakButton(page).click();
  await page.evaluate(() => {
    location.hash = "tasks";
  });
  await page.waitForSelector(".dock:not([data-hidden])");
  assert.equal(await page.locator(".pagebar").getAttribute("data-hidden"), null);
  await page.evaluate(() => {
    location.hash = "home";
  });
  await breakButton(page).waitFor();
  assert.equal(await page.getByRole("timer").count(), 0);
  await page.close();
});

test("countdown ends on time even if the tab was hidden", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.clock.install();
  await breakButton(page).click();
  const setHidden = (hidden) =>
    page.evaluate((h) => {
      Object.defineProperty(document, "hidden", { value: h, configurable: true });
      Object.defineProperty(document, "visibilityState", { value: h ? "hidden" : "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await setHidden(true);
  // A hidden tab barely runs timers; jump the wall clock without firing them.
  await page.clock.setSystemTime(Date.now() + 61000);
  await setHidden(false);
  await page.clock.runFor(10);
  assert.equal(await page.getByRole("timer").count(), 0);
  await page.close();
});

test("sound is off until tapped, and no AudioContext exists before that", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const sound = page.getByRole("button", { name: "Ambient sound" });
  assert.equal(await sound.getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => window.__oneSound == null), true);
  await sound.click();
  assert.equal(await sound.getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => window.__oneSound.playing), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("one.sound")), "on");
  await sound.click();
  assert.equal(await sound.getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => window.__oneSound.playing), false);
  await page.close();
});

test("leaving Home stops the sound", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.getByRole("button", { name: "Ambient sound" }).click();
  await page.evaluate(() => {
    window.__soundRef = window.__oneSound;
    location.hash = "tasks";
  });
  await page.waitForSelector(".dock:not([data-hidden])");
  assert.equal(await page.evaluate(() => window.__soundRef.playing), false);
  await page.close();
});
