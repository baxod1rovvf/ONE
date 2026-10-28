const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, STORE_KEY } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

test("Home is only the meadow: title, subtitle, break button, time control", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "touch grass");
  assert.ok(await page.getByText("without leaving your desk").isVisible());
  assert.ok(await page.getByRole("button", { name: "try a break" }).isVisible());
  assert.ok(await page.getByRole("radio", { name: "Morning" }).isVisible());
  assert.ok(await page.getByRole("radio", { name: "Night" }).isVisible());
  assert.ok(await page.getByRole("button", { name: "Ambient sound" }).isVisible());
  assert.equal(await page.locator(".task-list, .home-shortcuts, .capture-bar, .sample-banner").count(), 0);
  await page.close();
});

test("Morning/Night control switches and saves the theme", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  assert.equal(await page.getByRole("radio", { name: "Morning" }).getAttribute("aria-checked"), "true");
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForFunction(() => document.querySelector(".meadow-home").dataset.time === "night");
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).settings.theme, STORE_KEY);
  assert.equal(saved, "dark");
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Tasks" }).click();
  assert.ok(await page.locator(".backdrop__stars").isVisible());
  await page.close();
});

test("hand cursor shows over grass and hides over buttons", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.mouse.move(400, 600);
  await page.mouse.move(420, 610);
  assert.ok(await page.locator(".hand-cursor").isVisible(), "hand over grass");
  await page.getByRole("button", { name: "try a break" }).hover();
  assert.ok(!(await page.locator(".hand-cursor").isVisible()), "pointer over button");
  await page.close();
});

test("painted meadow shows when WebGL is unavailable", async () => {
  const b = await launch({ webgl: false });
  try {
    const { page, errors } = await openApp(b, server.url, { route: "home" });
    assert.ok(await page.locator(".meadow-fallback").isVisible());
    assert.deepEqual(errors, []);
  } finally {
    await b.close();
  }
});
