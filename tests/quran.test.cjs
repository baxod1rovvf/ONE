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

const EMPTY_DATA = {
  version: 1, tasks: [], goals: [], notes: [], saved: [], shortcuts: [], websiteCategories: [],
  ideas: [], ideaCategories: [], recent: [], moods: [],
  settings: { name: "", theme: "light", sidebarCollapsed: false, sampleBannerDismissed: true }
};
const withHifz = (hifz) => ({ ...EMPTY_DATA, hifz });
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")));
const DATA = path.join(__dirname, "..", "pages", "quran", "data");
const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
const byN = new Map(index.map((s) => [s.n, s]));
const order = [...index].sort((a, b) => a.words - b.words || a.n - b.n).map((s) => s.n);
const name = (n) => byN.get(n).nameUz;
const surahFile = (n) => JSON.parse(fs.readFileSync(path.join(DATA, `${n}.json`), "utf8"));
const block = (page, k) => page.getByRole("region", { name: `Block ${k}` });
const TUE = (p) => p.clock.setFixedTime(new Date(2026, 10, 3, 12, 0, 0));
const h = (surah, state, extra = {}) => ({ id: `h-${surah}`, surah, state, readingChecked: false, startedAt: "2026-11-01", updatedAt: "2026-11-01T10:00:00Z", ...extra });

// --- The path ---
test("Quran: block 1 holds the four shortest surahs", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "quran", data: withHifz([]), init: TUE });
  const steps = block(page, 1).getByRole("listitem");
  await steps.first().waitFor();
  assert.equal(await steps.count(), 5);
  for (let i = 0; i < 4; i++) assert.match(await steps.nth(i).textContent(), new RegExp(name(order[i]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(await steps.nth(4).textContent(), /Review/);
  assert.equal(await steps.nth(0).getAttribute("data-state"), "current");
  for (let i = 1; i < 4; i++) assert.equal(await steps.nth(i).getAttribute("data-state"), "locked");
  await page.waitForFunction((n) => (JSON.parse(localStorage.getItem("one.workspace.v1")).hifz || []).some((e) => e.surah === n), order[0]);
  const e = (await stored(page)).hifz.find((x) => x.surah === order[0]);
  assert.equal(e.state, "learning");
  assert.equal(e.startedAt, "2026-11-03");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Quran: I know this refills the block", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "quran", data: withHifz([]), init: TUE });
  await page.getByRole("button", { name: `I know this: ${name(order[4])}` }).click();
  await page.getByRole("button", { name: `Learn it after all: ${name(order[4])}` }).waitFor();
  assert.match(await block(page, 2).getByRole("listitem").first().textContent(), new RegExp(name(order[5]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await block(page, 1).getByRole("button", { name: `I know this: ${name(order[0])}` }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Block 1"] li[data-state="current"]'));
  const steps = block(page, 1).getByRole("listitem");
  assert.match(await steps.nth(0).textContent(), new RegExp(name(order[1]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(await steps.nth(3).textContent(), new RegExp(name(order[5]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.getByRole("button", { name: `Learn it after all: ${name(order[4])}` }).click();
  await page.getByRole("button", { name: `I know this: ${name(order[4])}` }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("Quran: the block shows its day", async () => {
  const { page } = await openApp(browser, server.url, { route: "quran", data: withHifz([h(order[0], "learning")]), init: TUE });
  await block(page, 1).getByText("Day 3 of 14").waitFor();
  await page.close();
});

test("Quran: 8 dock tabs fit a phone, no sideways scroll, dark theme", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "quran", theme: "dark", viewport: { width: 375, height: 812 }, data: withHifz([]) });
  await block(page, 1).waitFor();
  const boxes = await page.locator(".dock__tab").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  assert.equal(boxes.length, 8);
  for (const b of boxes) assert.ok(b.width >= 44 && b.height >= 44, `tab ${b.width}x${b.height}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  assert.deepEqual(errors, []);
  await page.close();
});

