// Regressions found in the final whole-branch review.
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

const breakButton = (page) => page.getByRole("button", { name: "try a break" });

test("during a break, Tab never reaches the hidden page bar or dock", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await breakButton(page).click();
  await page.getByRole("timer").waitFor();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 2 ? "Tab" : "Shift+Tab");
    const inHidden = await page.evaluate(() => !!(document.activeElement && document.activeElement.closest(".pagebar, .dock")));
    assert.equal(inHidden, false, `focus reached hidden chrome after ${i + 1} presses`);
  }
  await page.close();
});

test("during a break, shortcuts that open dialogs are paused", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await breakButton(page).click();
  await page.getByRole("timer").waitFor();
  for (const key of ["c", "/", "Control+K"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
    assert.equal(await page.getByRole("dialog").count(), 0, `${key} opened a dialog mid-break`);
  }
  assert.equal(await page.getByRole("timer").count(), 1, "break still running");
  await page.close();
});

test("break keys leave text fields alone", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  // A text field inside the meadow page (stands in for any field focused mid-break).
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "probe";
    document.querySelector(".meadow-home").appendChild(input);
  });
  await breakButton(page).click();
  await page.getByRole("timer").waitFor();
  await page.locator("#probe").focus();
  await page.keyboard.type("moon");
  assert.equal(await page.locator("#probe").inputValue(), "moon");
  assert.equal(await page.evaluate(() => document.querySelector(".meadow-home").dataset.time), "morning");
  await page.close();
});

test("'View' on the Added to Today toast opens Tasks, not the meadow", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.keyboard.press("c");
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest("[role=dialog]"));
  await page.keyboard.type("Water the plants");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "View" }).click();
  await page.waitForFunction(() => location.hash === "#tasks");
  await page.close();
});

test("the storage warning is visible on Home", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new Error("blocked");
    };
  });
  await page.reload();
  const alert = page.locator(".storage-alert");
  await alert.waitFor();
  const onTop = await alert.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(hit);
  });
  assert.ok(onTop, "storage warning is painted above the meadow");
  await page.close();
});
