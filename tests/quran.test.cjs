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


// --- A surah ---
const openSurah = (n, opts = {}) => openApp(browser, server.url, { route: `quran/${n}`, data: withHifz([]), init: TUE, ...opts });
const ayahs = (page) => page.locator("article.ayah");

test("Quran: a surah shows Arabic, reading and translation for every verse", async () => {
  const n = order[0];
  const file = surahFile(n);
  const { page, errors } = await openSurah(n);
  await ayahs(page).first().waitFor();
  assert.equal(await ayahs(page).count(), file.verses.length);
  const first = ayahs(page).first();
  assert.equal((await first.locator(".ayah__ar").textContent()).trim(), file.verses[0].ar);
  assert.equal((await first.locator(".ayah__reading").textContent()).trim(), file.verses[0].reading);
  assert.equal((await first.locator(".ayah__uz").textContent()).trim(), file.verses[0].uz);
  assert.equal(await first.locator(".ayah__ar").getAttribute("dir"), "rtl");
  await page.getByText("Uzbek reading not checked yet.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Mark reading as checked" }).click();
  await page.getByText("Reading checked").waitFor();
  await page.reload();
  await page.getByText("Reading checked").waitFor();
  assert.equal((await stored(page)).hifz.find((e) => e.surah === n).readingChecked, true);
  await page.getByText("Translation: Shaykh Muhammad Sodiq Muhammad Yusuf, via QuranEnc, converted to Latin script.", { exact: false }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("Quran: Test me hides, a tap reveals, Hide all again hides", async () => {
  const n = order[0];
  const file = surahFile(n);
  const { page } = await openSurah(n);
  await ayahs(page).first().waitFor();
  await page.getByRole("switch", { name: "Test me" }).click();
  const first = ayahs(page).first();
  assert.equal((await first.locator(".ayah__ar").textContent()).trim(), file.verses[0].ar.split(/\s+/)[0]);
  assert.equal(await first.locator(".ayah__reading").isVisible(), false);
  assert.equal(await first.locator(".ayah__uz").isVisible(), true);
  await first.click();
  assert.equal((await first.locator(".ayah__ar").textContent()).trim(), file.verses[0].ar);
  await page.getByRole("button", { name: "Hide all again" }).click();
  assert.equal((await first.locator(".ayah__ar").textContent()).trim(), file.verses[0].ar.split(/\s+/)[0]);
  await page.getByRole("switch", { name: "Show translation" }).click();
  assert.equal(await first.locator(".ayah__uz").isVisible(), false);
  await page.close();
});

test("Quran: I've learned it moves to the next step, and after four to the review", async () => {
  let { page } = await openSurah(order[0]);
  await page.getByRole("button", { name: "I've learned it" }).click();
  await page.waitForFunction((n) => location.hash === `#quran/${n}`, order[1]);
  assert.equal((await stored(page)).hifz.find((e) => e.surah === order[0]).state, "learned");
  await page.close();
  ({ page } = await openSurah(order[3], { data: withHifz([h(order[0], "learned"), h(order[1], "learned"), h(order[2], "learned")]) }));
  await page.getByRole("button", { name: "I've learned it" }).click();
  await page.waitForFunction(() => location.hash === "#quran/review");
  await page.close();
});

test("Quran: I've learned it only shows on the step you're on", async () => {
  const { page } = await openSurah(order[2]);
  await ayahs(page).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "I've learned it" }).count(), 0);
  await page.close();
});

test("Quran: footnotes fold under their verse", async () => {
  const { page } = await openSurah(1);
  await ayahs(page).first().waitFor();
  const notes = ayahs(page).first().locator("details.ayah__notes");
  assert.equal(await notes.count(), 1);
  assert.match(await notes.locator("summary").textContent(), /Notes/);
  await page.close();
});

test("Quran: the longest verse wraps on a phone", async () => {
  const { page, errors } = await openSurah(2, { viewport: { width: 375, height: 812 } });
  await page.getByRole("article", { name: "Verse 282" }).waitFor({ timeout: 15000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  assert.deepEqual(errors, []);
  await page.close();
});

// --- The review ---
test("Quran: the review needs all four Solid", async () => {
  const four = order.slice(0, 4);
  const { page, errors } = await openApp(browser, server.url, { route: "quran/review", data: withHifz(four.map((n) => h(n, "learned"))), init: TUE });
  const part = (n) => page.getByRole("region", { name: name(n) });
  await part(four[0]).waitFor();
  for (const n of four.slice(0, 3)) await part(n).getByRole("button", { name: "Solid" }).click();
  await part(four[3]).getByRole("button", { name: "Needs work" }).click();
  assert.equal(await page.getByText("Block done").count(), 0);
  assert.equal(await part(four[3]).getByRole("link", { name: "Study again" }).getAttribute("href"), `#quran/${four[3]}`);
  assert.equal(await part(four[0]).getByRole("button", { name: "Solid" }).getAttribute("aria-pressed"), "true");
  await part(four[3]).getByRole("button", { name: "Solid" }).click();
  await page.getByText("Block done").waitFor();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForFunction((n) => location.hash === `#quran/${n}`, order[4]);
  const states = (await stored(page)).hifz.filter((e) => four.includes(e.surah)).map((e) => e.state);
  assert.deepEqual(states, ["solid", "solid", "solid", "solid"]);
  assert.deepEqual(errors, []);
  await page.close();
});

test("Quran: the review waits until the four are learned", async () => {
  const { page } = await openApp(browser, server.url, { route: "quran/review", data: withHifz([]), init: TUE });
  await page.getByText("Finish the four surahs first.").waitFor();
  await page.close();
});

test("Quran: a surah marked Needs work can be studied and learned again", async () => {
  const four = order.slice(0, 4);
  const data = withHifz([h(four[0], "solid"), h(four[1], "needs-work"), h(four[2], "solid"), h(four[3], "solid")]);
  const { page } = await openApp(browser, server.url, { route: `quran/${four[1]}`, data, init: TUE });
  await page.getByRole("button", { name: "I've learned it" }).click();
  await page.waitForFunction(() => location.hash === "#quran/review");
  await page.close();
});
