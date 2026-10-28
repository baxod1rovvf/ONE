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

test("Morning and Night give the page a sky backdrop", async () => {
  for (const theme of ["light", "dark"]) {
    const { page } = await openApp(browser, server.url, { route: "tasks", theme });
    assert.ok(await page.locator(".backdrop").isVisible(), `backdrop in ${theme}`);
    assert.equal(await page.locator(".backdrop__stars").isVisible(), theme === "dark", `stars only at night (${theme})`);
    await page.close();
  }
});

test("each page sets its own section colour", async () => {
  const seen = new Set();
  for (const route of ["tasks", "websites", "ideas", "saved", "preferences"]) {
    const { page } = await openApp(browser, server.url, { route });
    assert.equal(await page.locator("main").getAttribute("data-section"), route);
    seen.add(await page.evaluate(() => getComputedStyle(document.querySelector("main")).getPropertyValue("--section").trim()));
    await page.close();
  }
  assert.equal(seen.size, 5);
  assert.ok(![...seen].includes(""));
});

test("headings use the rounded display font", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  assert.match(await page.locator(".page-title").first().evaluate((el) => getComputedStyle(el).fontFamily), /Fredoka/);
  await page.close();
});

test("theme setting is labelled Morning / Night / Follow device", async () => {
  const { page } = await openApp(browser, server.url, { route: "preferences" });
  for (const label of ["Morning", "Night", "Follow device"]) {
    assert.ok(await page.getByText(label, { exact: true }).first().isVisible(), label);
  }
  await page.close();
});
