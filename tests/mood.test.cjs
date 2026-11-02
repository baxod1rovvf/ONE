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

const EMPTY_DATA = {
  version: 1, tasks: [], goals: [], notes: [], saved: [], shortcuts: [], websiteCategories: [],
  ideas: [], ideaCategories: [], recent: [],
  settings: { name: "", theme: "light", sidebarCollapsed: false, sampleBannerDismissed: true }
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")));
const withMoods = (moods) => ({ ...EMPTY_DATA, moods });

test("an older workspace without moods opens with an empty list", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks", data: EMPTY_DATA });
  await page.waitForFunction(() => Array.isArray(JSON.parse(localStorage.getItem("one.workspace.v1")).moods));
  assert.deepEqual((await stored(page)).moods, []);
  assert.deepEqual(errors, []);
  await page.close();
});

test("the sample workspace has three marked days before today", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const moods = (await stored(page)).moods;
  assert.deepEqual(moods.map((m) => m.mood), [4, 2, 5]);
  const today = await page.evaluate(() => window.__oneApp.todayISO());
  assert.ok(moods.every((m) => m.sample === true && m.date < today));
  assert.deepEqual(await page.evaluate(() => window.__oneApp.MOODS.map((m) => m.word)), ["Awful", "Bad", "Okay", "Good", "Great"]);
  await page.close();
});
