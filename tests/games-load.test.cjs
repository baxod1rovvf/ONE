const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startServer, launch, openApp, waitForGames, ROOT } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

const gamesButton = (page) => page.locator(".meadow-controls").getByRole("button", { name: "Games" });

test("game files load in the background", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  await page.waitForFunction(() => performance.getEntriesByType("resource").some((e) => e.name.endsWith("/games/games.js")), null, { timeout: 4000 });
  await waitForGames(page);
  assert.equal(await page.evaluate(() => typeof window.__oneGames.GamesPanel), "function");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Games opens within 100 ms once loaded", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await waitForGames(page);
  const ms = await page.evaluate(async () => {
    const button = document.querySelector(".meadow-games");
    const t = performance.now();
    button.click();
    while (!document.querySelector(".games")) await new Promise((r) => requestAnimationFrame(r));
    return performance.now() - t;
  });
  assert.ok(ms < 100, `opened in ${Math.round(ms)} ms`);
  await page.close();
});

test("a slow games file shows the spinner, then opens", async () => {
  // The file is held back until after the press, so the background load
  // can't finish first, however slow the machine.
  let release;
  const pressed = new Promise((r) => (release = r));
  const { page } = await openApp(browser, server.url, {
    route: "home",
    init: (p) => p.route("**/games/games.js", (r) => pressed.then(() => setTimeout(() => r.continue(), 1500)))
  });
  await gamesButton(page).click();
  release();
  await page.waitForFunction(() => document.querySelector(".meadow-games").getAttribute("aria-busy") === "true", null, { timeout: 1400 });
  await page.getByRole("dialog", { name: "Retro games" }).waitFor({ timeout: 4000 });
  assert.equal(await gamesButton(page).getAttribute("aria-busy"), null);
  await page.close();
});

test("a failed load shows the message and a second press works", async () => {
  let fail = true;
  const { page } = await openApp(browser, server.url, {
    route: "home",
    init: (p) => p.route("**/games/games.js", (r) => (fail ? r.abort() : r.continue()))
  });
  await gamesButton(page).click();
  await page.getByText("Couldn't open the games. Check your connection and try again.").waitFor();
  assert.equal(await page.locator(".games").count(), 0);
  fail = false;
  await gamesButton(page).click();
  await page.getByRole("dialog", { name: "Retro games" }).waitFor({ timeout: 4000 });
  await page.close();
});

test("two quick presses open one panel", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "home",
    init: (p) => p.route("**/games/games.js", (r) => setTimeout(() => r.continue(), 800))
  });
  await gamesButton(page).click();
  await gamesButton(page).click({ force: true });
  await page.getByRole("dialog", { name: "Retro games" }).waitFor({ timeout: 4000 });
  assert.equal(await page.evaluate(() => document.querySelectorAll("script[src$='games/games.js']").length), 1);
  assert.equal(await page.locator(".games").count(), 1);
  await page.close();
});

test("index.html no longer carries the game code", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const games = fs.readFileSync(path.join(ROOT, "games", "games.js"), "utf8");
  assert.ok(!html.includes("function SnakeGame") && !html.includes("function TetrisGame"));
  assert.ok(games.includes("function SnakeGame") && games.includes("function TetrisGame"));
});
