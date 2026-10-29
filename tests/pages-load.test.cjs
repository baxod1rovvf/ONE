const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startServer, launch, openApp, ROOT } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

const PAGE_IDS = ["home", "tasks", "websites", "ideas", "saved", "goals", "knowledge", "preferences"];
const dockOf = (page) => page.getByRole("navigation", { name: "Pages" });
const allPagesLoaded = (page) =>
  page.waitForFunction((ids) => ids.every((id) => window.__onePages && window.__onePages[id]), PAGE_IDS, { timeout: 15000 });

test("every page has its own script and stylesheet", () => {
  for (const id of PAGE_IDS) {
    assert.ok(fs.existsSync(path.join(ROOT, "pages", id, `${id}.js`)), `${id}.js`);
    assert.ok(fs.existsSync(path.join(ROOT, "pages", id, `${id}.css`)), `${id}.css`);
  }
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for (const name of ["function TasksPage", "function IdeasPage", "function HomePage", "function PreferencesPage"]) assert.ok(!html.includes(name), `index.html still has ${name}`);
});

test("the open page loads first, the others in the background", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks" });
  await page.locator('main[data-section="tasks"] .panel').first().waitFor();
  await allPagesLoaded(page);
  const scripts = await page.evaluate(() => [...document.querySelectorAll("script[src*='pages/']")].map((s) => s.getAttribute("src")));
  assert.equal(scripts[0], "pages/tasks/tasks.js");
  assert.equal(new Set(scripts).size, PAGE_IDS.length);
  assert.deepEqual(errors, []);
  await page.close();
});

test("switching pages is instant once loaded", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await allPagesLoaded(page);
  // Home is left out: its first open draws the meadow, which takes as long
  // as it always has; loading is not part of it.
  for (const id of ["websites", "ideas", "saved", "goals", "knowledge", "preferences", "tasks"]) {
    const ms = await page.evaluate(async (id) => {
      const link = document.querySelector(`.dock__tab[data-route="${id}"]`) || document.querySelector('[aria-label="Settings"]');
      const t = performance.now();
      if (id === "goals" || id === "knowledge") location.hash = id;
      else link.click();
      while (!document.querySelector(`main[data-section="${id}"] > *`)) await new Promise((r) => requestAnimationFrame(r));
      return performance.now() - t;
    }, id);
    assert.ok(ms < 100, `${id} opened in ${Math.round(ms)} ms`);
  }
  await page.close();
});

test("a slow page keeps the current one on screen until it arrives", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: (p) => p.route("**/pages/saved/saved.js", (r) => setTimeout(() => r.continue(), 2500))
  });
  await page.locator('main[data-section="tasks"] .panel').first().waitFor();
  await dockOf(page).getByRole("link", { name: "Saved" }).click();
  // Still Tasks, and marked busy, while Saved is on its way.
  assert.equal(await page.locator("main").getAttribute("data-section"), "tasks");
  assert.equal(await page.locator(".app").getAttribute("aria-busy"), "true");
  await page.locator('main[data-section="saved"]').waitFor({ timeout: 6000 });
  assert.equal(await page.locator(".app").getAttribute("aria-busy"), null);
  await page.close();
});

test("a page that can't load says so and goes back", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: (p) => p.route("**/pages/ideas/ideas.js", (r) => r.abort())
  });
  await page.locator('main[data-section="tasks"] .panel').first().waitFor();
  await dockOf(page).getByRole("link", { name: "Ideas" }).click();
  await page.getByText("Couldn't open this page. Check your connection and try again.").waitFor();
  await page.waitForFunction(() => location.hash === "#tasks");
  assert.equal(await page.locator("main").getAttribute("data-section"), "tasks");
  await page.close();
});

test("the first page failing offers Try again", async () => {
  let fail = true;
  const { page } = await openApp(browser, server.url, {
    route: "saved",
    init: (p) => p.route("**/pages/saved/saved.js", (r) => (fail ? r.abort() : r.continue()))
  });
  await page.getByRole("alert").getByText("Couldn't open this page.").waitFor();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await page.locator('main[data-section="saved"] > :not(.page-load-failed)').first().waitFor({ timeout: 6000 });
  assert.equal(await page.locator(".page-load-failed").count(), 0);
  await page.close();
});
