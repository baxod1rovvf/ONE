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

const panel = (page) => page.getByRole("dialog", { name: "Sounds" });
const stats = (page) => page.evaluate(() => window.__oneSound.stats());
async function openTab(page, tab) {
  if (!(await panel(page).count())) await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  await panel(page).getByRole("tab", { name: tab }).click();
}
// Rain on, and Gymnopédie playing from 20 s.
async function startMix(page) {
  await openTab(page, "Nature");
  await panel(page).getByRole("switch", { name: "Rain", exact: true }).click();
  await openTab(page, "Music");
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.duration > 0);
  await page.evaluate(() => window.__oneSound.seek(20));
  await page.waitForFunction(() => window.__oneSound.stats().track.playing && window.__oneSound.stats().track.position >= 20);
}
async function startSurah(page, label = "Play 112. Al-Ikhlas") {
  await openTab(page, "Quran");
  await panel(page).getByRole("button", { name: label }).click();
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return t && t.kind === "quran" && t.playing;
  });
}

test("a surah plays alone: music pauses and nature fades out", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await startMix(page);
  await startSurah(page);
  const s = await stats(page);
  assert.equal(s.ducked, true);
  assert.equal(s.voices.rain.on, true, "the mix is kept, only silenced");
  await page.waitForFunction(() => window.__oneSound.stats().natureGain < 0.01, null, { timeout: 3000 });
  await page.close();
});

test("stopping the recitation brings back exactly what was playing", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await startMix(page);
  await startSurah(page);
  await panel(page).getByRole("group", { name: "Now playing" }).getByRole("button", { name: "Stop" }).click();
  await page.waitForFunction(() => {
    const s = window.__oneSound.stats();
    return !s.ducked && s.natureGain > 0.99 && s.track && /Gymnop/.test(s.track.title) && s.track.playing && s.track.position >= 19.5;
  }, null, { timeout: 5000 });
  await page.close();
});

test("a surah that ends on another page still restores the mix", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await startMix(page);
  await startSurah(page);
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Websites" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track.duration > 0);
  await page.evaluate(() => window.__oneSound.seek(window.__oneSound.stats().track.duration - 0.2));
  await page.waitForFunction(() => {
    const s = window.__oneSound.stats();
    return !s.ducked && s.natureGain > 0.99 && s.track && /Gymnop/.test(s.track.title) && s.track.playing;
  }, null, { timeout: 6000 });
  assert.match(page.url(), /#websites$/);
  await page.close();
});

test("turning on a sound during a recitation asks first; Cancel keeps reciting", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await startSurah(page);
  await openTab(page, "Nature");
  await panel(page).getByRole("switch", { name: "Wind", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /Pause the recitation\?/);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  const s = await stats(page);
  assert.equal(s.track.kind, "quran");
  assert.equal(s.voices.wind.on, false);
  await page.close();
});

test("choosing Pause stops the recitation and does what was asked", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await startSurah(page);
  await openTab(page, "Music");
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Pause" }).click();
  await page.waitForFunction(() => {
    const s = window.__oneSound.stats();
    return !s.ducked && s.track && /Gymnop/.test(s.track.title) && s.track.playing;
  });
  await page.close();
});
