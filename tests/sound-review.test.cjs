// Regressions found in the final review of the sounds feature.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
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
const soundsButton = (page) => page.getByRole("toolbar", { name: "Quick actions" }).getByRole("button", { name: "Sounds" });
const stats = (page) => page.evaluate(() => window.__oneSound.stats());
async function openTab(page, tab) {
  if (!(await panel(page).count())) await soundsButton(page).click();
  await panel(page).getByRole("tab", { name: tab }).click();
}
async function playSurah(page, label = "Play 112. Al-Ikhlas") {
  await openTab(page, "Quran");
  await panel(page).getByRole("button", { name: label }).click();
  await page.waitForFunction(() => {
    const t = window.__oneSound.stats().track;
    return t && t.kind === "quran" && t.playing;
  });
}
async function addSpotify(page) {
  await openTab(page, "Music");
  await panel(page).getByRole("textbox", { name: "Spotify link" }).fill("spotify:playlist:37i9dQZF1DX4sWSpwq3LiO");
  await panel(page).getByRole("region", { name: "Spotify" }).getByRole("button", { name: "Add" }).click();
}
async function setPin(page) {
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Home" }).click();
  await page.evaluate(() => {
    location.hash = "preferences";
  });
  await page.getByRole("button", { name: "Set a PIN" }).click();
  for (let step = 0; step < 3 && (await page.locator(".overlay").count()); step++) {
    const field = page.locator(".overlay input[type=password]");
    if (await field.count()) await field.fill("1234");
    const next = page.locator(".overlay").getByRole("button", { name: /Continue|Save|Turn on|Set PIN|Done/ });
    if (await next.count()) await next.first().click();
    await page.waitForTimeout(300);
  }
}

test("replaying a stopped surah from the mini player still plays it alone", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Nature");
  await panel(page).getByRole("switch", { name: "Rain", exact: true }).click();
  await playSurah(page);
  await panel(page).getByRole("group", { name: "Now playing" }).getByRole("button", { name: "Stop" }).click();
  await page.waitForFunction(() => !window.__oneSound.stats().ducked && window.__oneSound.stats().natureGain > 0.99);
  await page.keyboard.press("Escape");
  const mini = page.locator(".mini-player");
  if (await mini.count()) {
    await mini.getByRole("button", { name: "Play" }).click();
    await page.waitForFunction(() => window.__oneSound.stats().track.playing);
    const s = await stats(page);
    assert.equal(s.ducked, true, "a recitation that plays again is alone again");
  }
  await page.close();
});

test("the break chime works when only music is playing", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  const result = await page.evaluate(() => {
    try {
      window.__oneSound.chime();
      return "ok";
    } catch (e) {
      return String(e);
    }
  });
  assert.equal(result, "ok");
  await page.close();
});

test("locking and Stop all also pause Spotify", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await setPin(page);
  await addSpotify(page);
  await panel(page).getByRole("button", { name: /^Play Spotify/ }).click();
  await page.waitForFunction(() => window.__fakeSpotify && window.__fakeSpotify.calls.some((c) => c[0] === "play"));
  await panel(page).getByRole("button", { name: "Stop all" }).click();
  await page.waitForFunction(() => window.__fakeSpotify.calls.some((c) => c[0] === "pause"));
  await panel(page).getByRole("button", { name: /^Play Spotify/ }).click();
  const pauses = await page.evaluate(() => window.__fakeSpotify.calls.filter((c) => c[0] === "pause").length);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Lock ONE now" }).click();
  await page.waitForFunction((n) => window.__fakeSpotify.calls.filter((c) => c[0] === "pause").length > n, pauses);
  await page.close();
});

test("Stop all during a recitation leaves silence, nothing restarts", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await playSurah(page);
  await panel(page).getByRole("button", { name: "Stop all" }).click();
  await page.waitForTimeout(1200);
  const s = await stats(page);
  assert.equal(s.ducked, false);
  assert.ok(!s.track || !s.track.playing, "nothing is playing");
  await page.close();
});

test("pressing play inside Spotify's own player pauses ONE's music", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await page.evaluate(() => {
    window.__fakeSpotifyBlockPlay = true;
  });
  await addSpotify(page);
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await panel(page).getByRole("button", { name: /^Play Spotify/ }).click();
  // play() was blocked: the embed must be shown so it can be pressed.
  await page.waitForSelector(".spotify-host[data-visible='true']");
  await page.waitForFunction(() => typeof window.__fakeSpotify.userPlay === "function");
  await page.evaluate(() => window.__fakeSpotify.userPlay());
  await page.waitForFunction(() => !window.__oneSound.stats().track.playing);
  await page.close();
});

test("pressing play inside Spotify during a recitation asks first", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await page.evaluate(() => {
    window.__fakeSpotifyBlockPlay = true;
  });
  await addSpotify(page);
  await panel(page).getByRole("button", { name: /^Play Spotify/ }).click();
  await page.waitForSelector(".spotify-host[data-visible='true']");
  await playSurah(page);
  await page.waitForFunction(() => typeof window.__fakeSpotify.userPlay === "function");
  await page.evaluate(() => window.__fakeSpotify.userPlay());
  const dialog = page.getByRole("alertdialog");
  await dialog.waitFor();
  assert.match(await dialog.textContent(), /Pause the recitation\?/);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.waitForFunction(() => window.__fakeSpotify.calls.filter((c) => c[0] === "pause").length > 0);
  assert.equal((await stats(page)).track.kind, "quran");
  await page.close();
});

test("a tap outside the panel closes it", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await soundsButton(page).click();
  await panel(page).waitFor();
  await page.mouse.click(300, 500);
  await panel(page).waitFor({ state: "detached" });
  await page.close();
});

test("a seek made while a track is still restoring wins", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.duration > 0);
  await page.evaluate(() => window.__oneSound.seek(20));
  await panel(page).getByRole("group", { name: "Now playing" }).getByRole("button", { name: "Pause" }).click();
  await page.waitForFunction(() => !window.__oneSound.stats().track.playing);
  await page.route(/gymnopedies/i, async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await page.reload();
  await page.locator(".mini-player").waitFor();
  await page.evaluate(() => window.__oneSound.seek(5));
  await page.waitForTimeout(2500);
  const t = (await stats(page)).track;
  assert.ok(Math.abs(t.position - 5) < 0.5, `position ${t.position}`);
  await page.close();
});

test("a file with a broken tag doesn't freeze the page", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await panel(page).getByLabel("Add music").setInputFiles([path.join(__dirname, "fixtures", "audio", "bad-id3.mp3")]);
  await page.waitForFunction(() => {
    const el = document.querySelector(".import-result");
    return el && !/Adding/.test(el.textContent);
  }, null, { timeout: 8000 });
  await page.close();
});

test("opening ONE while it is locked keeps the saved mix silent until unlocked", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await setPin(page);
  await openTab(page, "Nature");
  await panel(page).getByRole("switch", { name: "Rain", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.locator(".lock").waitFor();
  await page.keyboard.press("1");
  await page.waitForTimeout(600);
  assert.equal((await stats(page)).voices.rain.running, false);
  await page.close();
});

test("restoring the last track after a reload only fetches its details", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  await openTab(page, "Music");
  await panel(page).getByRole("button", { name: "Play Gymnopédie No. 1" }).click();
  await page.waitForFunction(() => window.__oneSound.stats().track && window.__oneSound.stats().track.playing);
  await panel(page).getByRole("group", { name: "Now playing" }).getByRole("button", { name: "Pause" }).click();
  await page.reload();
  await page.locator(".mini-player").waitFor();
  assert.equal(await page.evaluate(() => document.querySelector("audio.sound-player").preload), "metadata");
  await page.close();
});
