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

const dockOf = (page) => page.getByRole("navigation", { name: "Pages" });

test("no sidebar or top bar; one glass dock at the bottom", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  assert.equal(await page.locator(".sidebar, .topbar, .tabbar").count(), 0);
  assert.equal(await dockOf(page).count(), 1);
  const box = await dockOf(page).boundingBox();
  assert.ok(800 - (box.y + box.height) >= 16, "dock floats at least 16px above the bottom");
  assert.match(await dockOf(page).evaluate((el) => getComputedStyle(el).backdropFilter), /blur/);
  await page.close();
});

test("dock tabs navigate and mark the current page", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  for (const name of ["Websites", "Ideas", "Saved", "Home", "Tasks"]) {
    await dockOf(page).getByRole("link", { name }).click();
    assert.equal(await dockOf(page).getByRole("link", { name }).getAttribute("aria-current"), "page", name);
  }
  await page.close();
});

test("dock tabs are at least 44px and the page never scrolls sideways at 375px", async () => {
  for (const route of ["home", "tasks", "websites", "ideas", "saved", "preferences"]) {
    const { page } = await openApp(browser, server.url, { route, viewport: { width: 375, height: 812 } });
    const boxes = await page.locator(".dock__tab").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    assert.equal(boxes.length, 5);
    for (const b of boxes) assert.ok(b.width >= 44 && b.height >= 44, `tab ${b.width}x${b.height} on ${route}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375, `no sideways scroll on ${route}`);
    await page.close();
  }
});

test("corner cluster: search (Ctrl+K), capture (C), settings; lock only when enabled", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const cluster = page.getByRole("toolbar", { name: "Quick actions" });
  assert.ok(await cluster.getByRole("button", { name: "Search" }).isVisible());
  assert.ok(await cluster.getByRole("button", { name: "Quick capture" }).isVisible());
  const focusInDialog = () => page.waitForFunction(() => document.activeElement && document.activeElement.closest("[role=dialog]"));
  await page.keyboard.press("Control+K");
  await focusInDialog();
  assert.ok(await page.getByRole("dialog").first().isVisible(), "search opens");
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  await page.keyboard.press("c");
  await focusInDialog();
  assert.ok(await page.getByRole("dialog").first().isVisible(), "capture opens");
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  await cluster.getByRole("button", { name: "Settings" }).click();
  assert.match(page.url(), /#preferences$/);
  assert.equal(await page.getByRole("button", { name: "Lock ONE now" }).count(), 0);
  await page.close();
});

test("last list item is not covered by the dock", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", viewport: { width: 375, height: 812 } });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(100);
  const last = await page.locator(".task-list > *").last().boundingBox();
  const dock = await page.locator(".dock").boundingBox();
  assert.ok(last.y + last.height <= dock.y, `last item bottom ${last.y + last.height} vs dock top ${dock.y}`);
  await page.close();
});
