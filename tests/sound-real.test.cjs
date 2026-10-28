const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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

const panel = (page) => page.getByRole("dialog", { name: "Sounds" });
async function openPanel(page) {
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  await panel(page).waitFor();
}
const realSwitch = (page, label) => panel(page).getByRole("switch", { name: `Real recording for ${label}` });

test("only sounds with a confirmed free recording offer a Real switch", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  for (const label of ["Rain", "Crickets"]) assert.equal(await realSwitch(page, label).count(), 1, label);
  for (const label of ["Wind", "Birds", "River", "Waterfall", "Ocean"]) assert.equal(await realSwitch(page, label).count(), 0, label);
  await page.close();
});

test("switching Real on plays the recording, and it is remembered", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  await panel(page).getByRole("switch", { name: "Rain", exact: true }).click();
  await realSwitch(page, "Rain").click();
  await page.waitForFunction(() => window.__oneSound.stats().voices.rain.source === "recording");
  assert.equal((await page.evaluate(() => window.__oneSound.stats())).voices.rain.running, true);
  await page.reload();
  await page.mouse.click(2, 2);
  await page.waitForFunction(() => window.__oneSound.stats().voices.rain.source === "recording");
  await page.close();
});

test("when a recording can't load, the generated sound keeps playing", async () => {
  const b = await launch({ blockAudio: true });
  try {
    const { page } = await openApp(b, server.url, { route: "tasks" });
    await openPanel(page);
    await panel(page).getByRole("switch", { name: "Rain", exact: true }).click();
    await realSwitch(page, "Rain").click();
    await panel(page).getByText("using generated sound").waitFor();
    const v = (await page.evaluate(() => window.__oneSound.stats())).voices.rain;
    assert.equal(v.source, "generated");
    assert.equal(v.running, true);
  } finally {
    await b.close();
  }
});

test("Sources lists each recording with its licence", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  await panel(page).getByText("Sources").click();
  assert.ok(await panel(page).getByText("Sound of rain.ogg — CC BY-SA 3.0").isVisible());
  assert.ok(await panel(page).getByText("Crickets choir.ogg — CC BY-SA 4.0").isVisible());
  await page.close();
});

test("the service worker caches the sound sources", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.match(sw, /const CACHE = "one-v6"/);
  for (const host of ["commons.wikimedia.org", "upload.wikimedia.org", "api.quran.com"]) assert.ok(sw.includes(`"${host}"`), host);
});
