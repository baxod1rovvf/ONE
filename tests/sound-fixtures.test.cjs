const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startServer, launch, openApp } = require("./helpers.cjs");

const AUDIO = path.join(__dirname, "fixtures", "audio");
const RAIN = "https://commons.wikimedia.org/wiki/Special:FilePath/Sound%20of%20rain.ogg";

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

test("fixture files exist and the album tracks carry ID3 tags", () => {
  for (const f of ["tone.wav", "loop.wav", "album/01.mp3", "album/02.mp3", "untagged.mp3", "not-audio.txt", "broken.mp3"]) {
    assert.ok(fs.existsSync(path.join(AUDIO, f)), f);
  }
  assert.equal(fs.readFileSync(path.join(AUDIO, "album/01.mp3")).subarray(0, 3).toString(), "ID3");
});

test("Commons recordings and the Quran API are served from fixtures", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const playable = await page.evaluate(
    (src) =>
      new Promise((resolve) => {
        const a = new Audio();
        a.crossOrigin = "anonymous";
        a.oncanplaythrough = () => resolve(true);
        a.onerror = () => resolve(false);
        a.src = src;
        a.load();
      }),
    RAIN
  );
  assert.equal(playable, true);
  const reciters = await page.evaluate(() => fetch("https://api.quran.com/api/v4/resources/chapter_reciters?language=en").then((r) => r.json()));
  assert.equal(reciters.reciters.length, 4);
  const one = await page.evaluate(() => fetch("https://api.quran.com/api/v4/chapter_recitations/7/1").then((r) => r.json()));
  assert.equal(one.audio_file.audio_url, "https://audio.test-quran.example/7/1.mp3");
  await page.close();
});

test("blockAudio makes those sources fail", async () => {
  const b = await launch({ blockAudio: true });
  try {
    const { page } = await openApp(b, server.url, { route: "tasks" });
    const ok = await page.evaluate(() => fetch("https://api.quran.com/api/v4/resources/chapter_reciters").then(() => true, () => false));
    assert.equal(ok, false);
  } finally {
    await b.close();
  }
});
