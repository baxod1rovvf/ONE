const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, waitForGames } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

// Which games' code has started in the page (downloads for the offline copy don't count).
const started = (page) => page.evaluate(() => Object.keys(window.__oneGameModules || {}).sort());
async function openList(page) {
  await waitForGames(page);
  await page.locator(".meadow-controls").getByRole("button", { name: "Games" }).click();
  return page.getByRole("dialog", { name: "Retro games" });
}
const card = (page, name) => page.getByRole("dialog", { name: "Retro games" }).getByRole("button", { name: new RegExp(name) });

test("only the games list loads in the background", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  await waitForGames(page);
  await page.waitForTimeout(500);
  assert.deepEqual(await started(page), []);
  assert.equal(await page.evaluate(() => document.querySelectorAll("script[src^='games/']").length), 1, "only games/panel.js is on the page");
  assert.deepEqual(errors, []);
  await page.close();
});

test("opening a game loads only that game", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openList(page);
  await card(page, "Tetris").click();
  await page.getByRole("dialog", { name: "Tetris" }).waitFor();
  assert.deepEqual(await started(page), ["tetris"]);
  await page.close();
});

test("switching games switches the old one off", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  await openList(page);
  await card(page, "Breakout").click();
  await page.getByRole("dialog", { name: "Breakout" }).waitFor();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("snake-play"));
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__oneBreakoutFrames > 5);
  assert.equal(await page.evaluate(() => window.__oneActiveGame), "breakout");
  await page.getByRole("button", { name: "All games" }).click();
  await card(page, "Snake").click();
  await page.getByRole("dialog", { name: "Snake" }).waitFor();
  const frames = await page.evaluate(() => window.__oneBreakoutFrames);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__oneBreakoutFrames), frames, "Breakout stopped drawing");
  assert.equal(await page.evaluate(() => window.__oneBreakoutControl), undefined);
  assert.equal(await page.evaluate(() => window.__oneActiveGame), "snake");
  assert.deepEqual(errors, []);
  await page.close();
});

test("closing the panel leaves no game running", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openList(page);
  await card(page, "Tetris").click();
  await page.getByRole("dialog", { name: "Tetris" }).waitFor();
  assert.equal(await page.evaluate(() => window.__oneActiveGame), "tetris");
  await page.getByRole("button", { name: "Close games" }).click();
  assert.equal(await page.evaluate(() => window.__oneActiveGame), undefined);
  await page.close();
});

test("choosing another game while one is loading opens only the last", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "home",
    init: (p) => p.route("**/games/tetris.js", (r) => setTimeout(() => r.continue(), 800))
  });
  await openList(page);
  await card(page, "Tetris").click();
  await card(page, "Snake").click();
  await page.waitForTimeout(1500);
  assert.equal(await page.getByRole("dialog", { name: "Snake" }).count(), 1);
  assert.equal(await page.evaluate(() => window.__oneActiveGame), "snake");
  await page.close();
});

test("a game that can't load says so, and a second try works", async () => {
  let fail = true;
  const { page } = await openApp(browser, server.url, {
    route: "home",
    init: (p) => p.route("**/games/snake.js", (r) => (fail ? r.abort() : r.continue()))
  });
  await openList(page);
  await card(page, "Snake").click();
  await page.getByText("Couldn't open this game. Check your connection and try again.").waitFor();
  fail = false;
  await card(page, "Snake").click();
  await page.getByRole("dialog", { name: "Snake" }).waitFor();
  await page.close();
});
