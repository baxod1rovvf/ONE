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

// --- The Mood page. The clock stands at Wednesday 2026-11-04, noon: the week is Nov 2 – 8. ---
const WED = (p) => p.clock.setFixedTime(new Date(2026, 10, 4, 12, 0, 0));
const day = (date, mood, note = "") => ({ id: `m-${date}`, date, mood, note, createdAt: `${date}T10:00:00Z` });
const strip = (page) => page.getByRole("group", { name: "Days of the week" });
const openMood = (opts) => openApp(browser, server.url, { route: "mood", init: WED, ...opts });

test("Mood: marked on Home, shown on the page", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home", init: WED, data: withMoods([]) });
  await homeCard(page).getByRole("button", { name: "Good" }).click();
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Mood" }).click();
  await strip(page).getByRole("button", { name: "Wed, Nov 4: Good" }).waitFor();
  await page.getByText("Good · 1 of 7 days").waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("Mood: best and worst, and the week's notes", async () => {
  const { page, errors } = await openMood({ data: withMoods([day("2026-11-02", 5, "Great run"), day("2026-11-03", 1, "Sick"), day("2026-11-04", 3)]) });
  const best = page.getByRole("button", { name: /^Best day/ });
  const worst = page.getByRole("button", { name: /^Worst day/ });
  assert.match(await best.textContent(), /Mon/);
  assert.match(await best.textContent(), /Great run/);
  assert.match(await worst.textContent(), /Tue/);
  const notes = page.getByRole("list", { name: "This week's notes" }).getByRole("listitem");
  assert.deepEqual((await notes.allTextContents()).map((t) => /Sick/.test(t) ? "Sick" : /Great run/.test(t) ? "Great run" : t), ["Sick", "Great run"]);
  await best.click();
  assert.equal(await strip(page).getByRole("button", { name: "Mon, Nov 2: Great" }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByLabel("Why was it like that?").inputValue(), "Great run");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Mood: not enough days yet", async () => {
  const { page } = await openMood({ data: withMoods([day("2026-11-04", 3)]) });
  await page.getByText("Mark a few more days to see your best and worst.").waitFor();
  await page.close();
});

test("Mood: an empty week offers today's faces", async () => {
  const { page, errors } = await openMood({ data: withMoods([]) });
  const empty = page.locator(".mood-empty");
  await empty.getByText("How was today?").waitFor();
  await empty.getByRole("button", { name: "Okay" }).click();
  await strip(page).getByRole("button", { name: "Wed, Nov 4: Okay" }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("Mood: a past day's note saves and survives a reload", async () => {
  const { page, errors } = await openMood({ data: withMoods([day("2026-11-04", 4)]) });
  await strip(page).getByRole("button", { name: "Mon, Nov 2: not marked" }).click();
  await page.getByRole("group", { name: "Mood for the day" }).getByRole("button", { name: "Bad" }).click();
  await page.getByLabel("Why was it like that?").fill("Late train");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.workspace.v1")).moods.some((m) => m.date === "2026-11-02" && m.note === "Late train"));
  await page.reload();
  await strip(page).getByRole("button", { name: "Mon, Nov 2: Bad" }).click();
  assert.equal(await page.getByLabel("Why was it like that?").inputValue(), "Late train");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Mood: step back a week, never into the future", async () => {
  const { page } = await openMood({ data: withMoods([]) });
  const next = page.getByRole("button", { name: "Next week" });
  const prev = page.getByRole("button", { name: "Previous week" });
  assert.equal(await next.isDisabled(), true);
  await page.getByText("Nov 2 – 8").waitFor();
  assert.equal(await strip(page).getByRole("button", { name: "Thu, Nov 5: not marked" }).isDisabled(), true);
  await prev.click();
  await page.getByText("Oct 26 – Nov 1").waitFor();
  assert.equal(await next.isDisabled(), false);
  await next.click();
  await page.getByText("Nov 2 – 8").waitFor();
  await page.close();
});

test("Mood: phone width and dark theme, with a very long note", async () => {
  const { page, errors } = await openMood({ viewport: { width: 375, height: 812 }, theme: "dark", data: withMoods([day("2026-11-04", 4, "x".repeat(500))]) });
  await strip(page).waitFor();
  await page.getByRole("list", { name: "This week's notes" }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  assert.deepEqual(errors, []);
  await page.close();
});

// --- Fixes from the final review ---
test("removing sample content removes the sample moods too", async () => {
  const sampleMood = { ...day("2026-11-01", 4, "Long walk"), sample: true };
  const { page, errors } = await openApp(browser, server.url, { route: "preferences", data: withMoods([sampleMood, day("2026-11-02", 3)]) });
  await page.getByRole("button", { name: "Remove samples" }).first().click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Remove samples" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.workspace.v1")).moods.length === 1);
  assert.equal((await stored(page)).moods[0].date, "2026-11-02");
  assert.deepEqual(errors, []);
  await page.close();
});

test("clearing a day marked on two devices clears it, not just the newer mark", async () => {
  const a = { ...day("2026-11-04", 2), id: "a", _m: 100 };
  const b = { ...day("2026-11-04", 5), id: "b", _m: 200 };
  const { page, errors } = await openMood({ data: withMoods([a, b]) });
  await strip(page).getByRole("button", { name: "Wed, Nov 4: Great" }).waitFor();
  await page.getByRole("group", { name: "Mood for the day" }).getByRole("button", { name: "Great" }).click();
  await strip(page).getByRole("button", { name: "Wed, Nov 4: not marked" }).waitFor();
  assert.deepEqual((await stored(page)).moods, []);
  assert.deepEqual(errors, []);
  await page.close();
});

test("Mood: the page moves on to the new day at midnight", async () => {
  const { page, errors } = await openApp(browser, server.url, {
    route: "mood", data: withMoods([day("2026-11-03", 4)]),
    init: (p) => p.clock.install({ time: new Date(2026, 10, 3, 23, 59, 0) })
  });
  const wed = strip(page).getByRole("button", { name: "Wed, Nov 4: not marked" });
  assert.equal(await wed.isDisabled(), true);
  await page.clock.fastForward("02:00");
  await page.waitForFunction(() => {
    const b = document.querySelector('[aria-label="Wed, Nov 4: not marked"]');
    return b && !b.disabled && b.classList.contains("is-today");
  });
  assert.deepEqual(errors, []);
  await page.close();
});

test("Mood: on an empty week, tapping an earlier day opens it", async () => {
  const { page, errors } = await openMood({ data: withMoods([]) });
  await strip(page).getByRole("button", { name: "Mon, Nov 2: not marked" }).click();
  await page.getByRole("group", { name: "Mood for the day" }).getByRole("button", { name: "Bad" }).click();
  await strip(page).getByRole("button", { name: "Mon, Nov 2: Bad" }).waitFor();
  assert.equal((await stored(page)).moods[0].date, "2026-11-02");
  assert.deepEqual(errors, []);
  await page.close();
});
