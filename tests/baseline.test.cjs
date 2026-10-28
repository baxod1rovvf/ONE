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

test("app boots on every route with no console errors", async () => {
  for (const route of ["home", "tasks", "websites", "ideas", "saved", "preferences"]) {
    const { page, errors } = await openApp(browser, server.url, { route });
    assert.ok(await page.locator("#main").isVisible(), `#main visible on ${route}`);
    assert.deepEqual(errors, [], `no console errors on ${route}`);
    await page.close();
  }
});
