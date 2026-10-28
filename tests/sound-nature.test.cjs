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

const stats = (page) => page.evaluate(() => window.__oneSound.stats());
const soundsButton = (page) => page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" });
const panel = (page) => page.getByRole("dialog", { name: "Sounds" });
async function openPanel(page) {
  await soundsButton(page).click();
  await panel(page).waitFor();
  return panel(page);
}
const sw = (page, label) => panel(page).getByRole("switch", { name: label, exact: true });
const dockLink = (page, name) => page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name });

test("Sounds button is on every page and opens the panel with three tabs", async () => {
  for (const route of ["tasks", "websites", "home"]) {
    const { page } = await openApp(browser, server.url, { route });
    const p = await openPanel(page);
    for (const tab of ["Nature", "Music", "Quran"]) assert.ok(await p.getByRole("tab", { name: tab }).isVisible(), `${tab} on ${route}`);
    for (const label of ["Wind", "Birds", "Crickets", "River", "Waterfall", "Rain", "Ocean"]) {
      assert.ok(await sw(page, label).isVisible(), `${label} switch`);
      assert.ok(await p.getByRole("slider", { name: `${label} volume` }).isVisible(), `${label} volume`);
    }
    await page.close();
  }
});

test("each nature sound toggles on and off with its own volume", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  assert.equal((await stats(page)).voices.rain.volume, 0.4, "default 40%");
  await sw(page, "Rain").click();
  await page.waitForFunction(() => window.__oneSound.stats().voices.rain.running);
  assert.equal(await sw(page, "Rain").getAttribute("aria-checked"), "true");
  await panel(page).getByRole("slider", { name: "Rain volume" }).fill("70");
  assert.equal((await stats(page)).voices.rain.volume, 0.7);
  assert.equal((await stats(page)).voices.wind.running, false, "other sounds stay off");
  await sw(page, "Rain").click();
  await page.waitForFunction(() => !window.__oneSound.stats().voices.rain.running, null, { timeout: 3000 });
  await page.close();
});

test("sound keeps playing while moving between every page", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openPanel(page);
  await sw(page, "Rain").click();
  await page.keyboard.press("Escape");
  for (const name of ["Tasks", "Websites", "Ideas", "Saved", "Home"]) {
    await dockLink(page, name).click();
    const s = await stats(page);
    assert.equal(s.voices.rain.running, true, `still playing on ${name}`);
    assert.equal(s.context, "running");
  }
  assert.equal(await soundsButton(page).getAttribute("data-playing"), "true");
  await page.close();
});

test("rapid toggling and presets never stack voices", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  for (let i = 0; i < 9; i++) await sw(page, "Rain").click();
  for (const preset of ["Rainy day", "Forest stream", "Seaside", "Night meadow", "Deep focus"]) {
    await panel(page).getByRole("button", { name: preset }).click();
  }
  await page.waitForTimeout(1500);
  const s = await stats(page);
  const running = Object.values(s.voices).filter((v) => v.running).length;
  const checked = await panel(page).locator('[role=switch][aria-checked="true"][data-sound]').count();
  assert.equal(running, checked);
  assert.equal(s.nodes, running, "one live sound graph per running voice");
  await page.close();
});

test("presets replace the mix", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  await sw(page, "Rain").click();
  await panel(page).getByRole("button", { name: "Seaside" }).click();
  await page.waitForTimeout(1300);
  const on = Object.entries((await stats(page)).voices).filter(([, v]) => v.on).map(([k]) => k).sort();
  assert.deepEqual(on, ["ocean", "wind"]);
  await page.close();
});

test("Follow the meadow switches birds and crickets with Morning/Night", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", theme: "light" });
  await openPanel(page);
  assert.equal(await panel(page).getByRole("switch", { name: "Follow the meadow" }).getAttribute("aria-checked"), "true");
  await sw(page, "Wind").click();
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Night" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().voices.crickets.on && !window.__oneSound.stats().voices.birds.on);
  await page.getByRole("radio", { name: "Morning" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().voices.birds.on && !window.__oneSound.stats().voices.crickets.on);
  await page.close();
});

test("mix and volumes come back after a reload, and play after the first tap", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  await sw(page, "Rain").click();
  await panel(page).getByRole("slider", { name: "Rain volume" }).fill("70");
  await sw(page, "Wind").click();
  await page.reload();
  await soundsButton(page).waitFor();
  assert.equal(await soundsButton(page).getAttribute("data-playing"), null, "silent before a tap");
  await page.mouse.click(2, 2);
  await page.waitForFunction(() => {
    const v = window.__oneSound.stats().voices;
    return v.rain.running && v.wind.running && v.rain.volume === 0.7;
  });
  await page.close();
});

test("Stop all and the master volume", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openPanel(page);
  await sw(page, "Rain").click();
  await sw(page, "Ocean").click();
  await panel(page).getByRole("slider", { name: "Master volume" }).fill("50");
  assert.equal((await stats(page)).master, 0.5);
  await panel(page).getByRole("button", { name: "Stop all" }).click();
  await page.waitForFunction(() => Object.values(window.__oneSound.stats().voices).every((v) => !v.on));
  await page.close();
});

test("locking pauses everything and unlocking doesn't resume", async () => {
  const { page } = await openApp(browser, server.url, { route: "preferences" });
  await page.getByRole("button", { name: "Set a PIN" }).click();
  for (let step = 0; step < 3 && (await page.locator(".overlay").count()); step++) {
    const field = page.locator(".overlay input[type=password]");
    if (await field.count()) await field.fill("1234");
    const next = page.locator(".overlay").getByRole("button", { name: /Continue|Save|Turn on|Set PIN|Done/ });
    if (await next.count()) await next.first().click();
    await page.waitForTimeout(300);
  }
  await openPanel(page);
  await sw(page, "Rain").click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lock ONE now" }).click();
  await page.waitForFunction(() => !window.__oneSound.stats().voices.rain.running);
  for (const d of "1234") await page.keyboard.press(d);
  await page.locator(".lock").waitFor({ state: "detached" });
  await page.waitForTimeout(500);
  assert.equal((await stats(page)).voices.rain.running, false);
  await page.close();
});

test("the Home sound button opens the Sounds panel", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.locator(".meadow-controls").getByRole("button", { name: "Sounds" }).click();
  await panel(page).waitFor();
  await page.close();
});
