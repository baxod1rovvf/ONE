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
async function openQuran(page) {
  await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
  await panel(page).getByRole("tab", { name: "Quran" }).click();
  await panel(page).getByRole("combobox", { name: "Reciter" }).locator("option").first().waitFor({ state: "attached" });
}
const search = (page, q) => panel(page).getByRole("searchbox", { name: "Search surahs" }).fill(q);
const rows = (page) => panel(page).locator(".surah-list--all .surah-row");
const track = (page) => page.evaluate(() => window.__oneSound.stats().track);

test("all 114 surahs are listed with their ayah counts", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  assert.equal(await rows(page).count(), 114);
  for (const [n, name, ayahs] of [[1, "Al-Fatihah", 7], [2, "Al-Baqarah", 286], [36, "Ya-Sin", 83], [114, "An-Nas", 6]]) {
    const row = rows(page).nth(n - 1);
    assert.match(await row.textContent(), new RegExp(`${name}.*${ayahs} ayahs`), name);
  }
  const total = await rows(page).evaluateAll((els) => els.reduce((sum, el) => sum + Number(el.dataset.ayahs), 0));
  assert.equal(total, 6236);
  await page.close();
});

test("search finds Ya-Sin in English or Arabic", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  for (const q of ["Yasin", "يس"]) {
    await search(page, q);
    const texts = await rows(page).allTextContents();
    assert.equal(texts.length, 1, q);
    assert.match(texts[0], /Ya-Sin/);
  }
  await page.close();
});

test("reciters are ordered: preferred names first, then the rest", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  const names = await panel(page).getByRole("combobox", { name: "Reciter" }).locator("option").allTextContents();
  assert.deepEqual(
    names.map((n) => n.split(" (")[0]),
    ["Mishari Rashid al-`Afasy", "AbdulBaset AbdulSamad", "Abdur-Rahman as-Sudais", "Zzz Test Reciter"]
  );
  await page.close();
});

test("playing Al-Fatihah with Alafasy streams that recitation", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  const req = page.waitForRequest("https://audio.test-quran.example/7/1.mp3");
  await panel(page).getByRole("button", { name: "Play 1. Al-Fatihah" }).click();
  await req;
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return t && t.kind === "quran" && t.playing;
  });
  await page.close();
});

test("Continue to next surah moves on when one ends", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  await panel(page).getByRole("switch", { name: "Continue to next surah" }).click();
  await panel(page).getByRole("button", { name: "Play 1. Al-Fatihah" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.duration > 0);
  await page.evaluate(() => window.__oneSound.seek(window.__oneSound.stats().track.duration - 0.2));
  await page.waitForFunction(() => /Al-Baqarah/.test(window.__oneSound.stats().track.title));
  await page.close();
});

test("Repeat surah plays it again", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  await panel(page).getByRole("switch", { name: "Repeat surah" }).click();
  await panel(page).getByRole("button", { name: "Play 112. Al-Ikhlas" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.duration > 0);
  await page.evaluate(() => window.__oneSound.seek(window.__oneSound.stats().track.duration - 0.2));
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return /Al-Ikhlas/.test(t.title) && t.plays > 1;
  });
  await page.close();
});

test("a favourite is pinned at the top, also after a reload", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  await panel(page).getByRole("button", { name: "Favourite An-Nas", exact: true }).click();
  await page.reload();
  await openQuran(page);
  const fav = panel(page).getByRole("region", { name: "Favourites" });
  assert.match(await fav.locator(".surah-row").first().textContent(), /An-Nas/);
  assert.equal(await panel(page).getByRole("button", { name: "Favourite An-Nas", exact: true }).first().getAttribute("aria-pressed"), "true");
  await page.close();
});

test("Last listened resumes where you stopped", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  await panel(page).getByRole("button", { name: "Play 36. Ya-Sin" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.duration > 0);
  await page.evaluate(() => window.__oneSound.seek(1));
  await panel(page).getByRole("group", { name: "Now playing" }).getByRole("button", { name: "Pause" }).click();
  await page.waitForFunction(() => !window.__oneSound.stats().track.playing);
  await page.evaluate(() => window.__oneSound.stopTrack());
  await page.reload();
  await openQuran(page);
  await panel(page).getByRole("button", { name: "Resume 36. Ya-Sin" }).click();
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return t && /Ya-Sin/.test(t.title) && t.position >= 0.9;
  });
  await page.close();
});

test("Keep offline saves a surah and marks it", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openQuran(page);
  await panel(page).getByRole("button", { name: "Keep Al-Fatihah offline" }).click();
  await panel(page).getByRole("button", { name: "Remove Al-Fatihah from offline" }).waitFor();
  assert.equal(await page.evaluate(() => caches.has("one-quran-offline")), true);
  await page.close();
});

test("when a recitation can't be reached, it says so and offers Retry", async () => {
  const b = await launch({ blockAudio: true });
  try {
    const { page } = await openApp(b, server.url, { route: "tasks" });
    await page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" }).click();
    await panel(page).getByRole("tab", { name: "Quran" }).click();
    const alert = panel(page).getByRole("alert");
    await alert.waitFor();
    assert.match(await alert.textContent(), /Couldn't reach the recitation\. Check your connection or try another reciter\./);
    assert.ok(await alert.getByRole("button", { name: "Retry" }).isVisible());
  } finally {
    await b.close();
  }
});
