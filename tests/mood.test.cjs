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

// --- Home: "How was today?" ---
const homeCard = (page) => page.getByRole("region", { name: "How was today?" });
const todayOf = (page) => page.evaluate(() => window.__oneApp.todayISO());

test("Home: mark today, change it, clear it", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home", data: withMoods([]) });
  const card = homeCard(page);
  await card.getByRole("button", { name: "Good" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.workspace.v1")).moods.length === 1);
  let moods = (await stored(page)).moods;
  assert.equal(moods[0].date, await todayOf(page));
  assert.equal(moods[0].mood, 4);
  assert.equal(await card.getByRole("button", { name: "Good" }).getAttribute("aria-pressed"), "true");
  await card.getByRole("button", { name: "Great" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.workspace.v1")).moods[0].mood === 5);
  assert.equal((await stored(page)).moods.length, 1);
  await card.getByRole("button", { name: "Great" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.workspace.v1")).moods.length === 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("Home: the note saves as you type and survives a reload", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home", data: withMoods([]) });
  await homeCard(page).getByRole("button", { name: "Okay" }).click();
  await homeCard(page).getByRole("button", { name: "Why?" }).click();
  await homeCard(page).getByLabel("Why was it like that?").fill("Rainy, stayed in");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.workspace.v1")).moods[0].note === "Rainy, stayed in");
  await page.reload();
  await homeCard(page).getByRole("button", { name: "Okay" }).waitFor();
  assert.equal(await homeCard(page).getByRole("button", { name: "Okay" }).getAttribute("aria-pressed"), "true");
  await homeCard(page).getByRole("button", { name: "Why?" }).click();
  assert.equal(await homeCard(page).getByLabel("Why was it like that?").inputValue(), "Rainy, stayed in");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Home: past midnight the card asks about the new day", async () => {
  const moods = [{ id: "x", date: "2026-11-02", mood: 5, note: "", createdAt: "2026-11-02T10:00:00Z" }];
  const { page, errors } = await openApp(browser, server.url, {
    route: "home", data: withMoods(moods),
    init: (p) => p.clock.install({ time: new Date(2026, 10, 2, 23, 59, 0) })
  });
  const great = homeCard(page).getByRole("button", { name: "Great" });
  assert.equal(await great.getAttribute("aria-pressed"), "true");
  await page.clock.fastForward("02:00");
  await page.waitForFunction(() => !document.querySelector('[aria-label="How was today?"] [aria-pressed="true"]'));
  assert.deepEqual(errors, []);
  await page.close();
});

test("Home: from 21:00 an unmarked day is more noticeable", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "home", data: withMoods([]),
    init: (p) => p.clock.install({ time: new Date(2026, 10, 2, 21, 30, 0) })
  });
  const card = homeCard(page);
  await card.waitFor();
  assert.match(await card.getAttribute("class"), /\bis-evening\b/);
  await card.getByRole("button", { name: "Okay" }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="How was today?"]').classList.contains("is-evening"));
  await page.close();
});
