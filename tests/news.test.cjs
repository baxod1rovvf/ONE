// The News page: the daily edition (fun fact, light and serious sides), the
// reader, videos played from YouTube only when opened, the week of editions,
// and what has been read. Editions are served from fixtures built here.
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

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = iso(new Date());
const YESTERDAY = iso(new Date(Date.now() - 864e5));
const hoursAgo = (n) => new Date(Date.now() - n * 36e5).toISOString();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function story(id, side, topic, extra = {}) {
  return {
    id,
    side,
    topic,
    title: `Story ${id} about ${topic}`,
    summary: `A short summary of story ${id}.`,
    body: [`First paragraph of story ${id}.`, `Second paragraph of story ${id}.`],
    image: `https://img.test-news.example/${id}.png`,
    url: `https://source.test-news.example/${id}`,
    source: "Test News",
    publishedAt: hoursAgo(5),
    video: null,
    ...extra
  };
}

const todayEdition = {
  date: TODAY,
  fact: { text: "Octopuses have three hearts and blue blood.", url: "https://facts.test-news.example/1", source: null },
  items: [
    story("w1", "serious", "world"),
    story("w2", "serious", "world", { video: { provider: "youtube", id: "abcdefghijk" }, image: "https://img.test-news.example/v.png", body: null, url: "https://www.youtube.com/watch?v=abcdefghijk" }),
    story("w3", "serious", "world", { body: null }),
    story("t1", "serious", "tech"),
    story("t2", "serious", "tech", { image: null }),
    story("f1", "light", "funny"),
    story("f2", "light", "funny", { image: "https://img.test-news.example/broken.png" }),
    story("a1", "light", "animals"),
    story("a2", "light", "animals")
  ]
};
const yesterdayEdition = {
  date: YESTERDAY,
  fact: { text: "Wombats make cube-shaped droppings.", url: null },
  items: [story("y1", "serious", "world", { title: "Yesterday's big story" }), story("y2", "light", "animals")]
};

// Serves news/ from the fixtures above; pictures and YouTube's player are stand-ins.
function serveNews({ days = [TODAY, YESTERDAY], editions = { [TODAY]: todayEdition, [YESTERDAY]: yesterdayEdition }, requests } = {}) {
  return async (page) => {
    await page.route(/\/news\/[^/]+\.json(\?.*)?$/, (route) => {
      const name = new URL(route.request().url()).pathname.split("/").pop();
      if (requests) requests.push(name);
      if (name === "index.json") return days ? route.fulfill({ json: { updated: new Date().toISOString(), days } }) : route.fulfill({ status: 404, body: "" });
      const ed = editions[name.replace(/\.json$/, "")];
      return ed ? route.fulfill({ json: ed }) : route.fulfill({ status: 404, body: "" });
    });
    await page.route(/img\.test-news\.example/, (route) => (/broken/.test(route.request().url()) ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ body: PNG, contentType: "image/png" })));
    await page.route(/youtube-nocookie\.com/, (route) => {
      if (requests) requests.push(route.request().url());
      return route.fulfill({ body: "<!doctype html><title>player</title><p>YouTube player</p>", contentType: "text/html" });
    });
  };
}
// Esc closes the reader once focus has moved into it.
async function closeReader(page) {
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest("[role=dialog]"));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
}
const notMissingFiles = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));

test("today's edition: the fun fact, then the light side and the serious side", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  const main = page.locator('main[data-section="news"]');
  await main.getByRole("heading", { name: "Fun fact of the day" }).waitFor();
  assert.ok(await main.getByText("Octopuses have three hearts and blue blood.").isVisible());
  const light = main.getByRole("region", { name: "The light side" });
  const serious = main.getByRole("region", { name: "The serious side" });
  assert.equal(await light.locator(".news-card").count(), 4);
  assert.equal(await serious.locator(".news-card").count(), 5);
  assert.ok(await light.getByText("Funny & odd").first().isVisible());
  assert.ok(await serious.getByText("World & politics").first().isVisible());
  // The video is marked, and nothing of YouTube is loaded until it's opened.
  assert.ok(await serious.getByRole("button", { name: /^Watch: Story w2/ }).isVisible());
  assert.equal(await page.locator("iframe").count(), 0);
  // The week's editions, newest first.
  const days = main.getByRole("group", { name: "Edition" });
  assert.deepEqual((await days.getByRole("button").allTextContents()).map((t) => t.trim()), ["Today", "Yesterday"]);
  assert.equal(await days.getByRole("button", { name: "Today" }).getAttribute("aria-pressed"), "true");
  assert.ok(await main.getByText("0 of 9 read").isVisible());
  assert.deepEqual(notMissingFiles(errors), []);
  await page.close();
});

test("reading a story: its text inside Core, a link to the original, then the next story", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  const main = page.locator('main[data-section="news"]');
  await main.getByRole("button", { name: /^Read: Story f1/ }).click();
  const reader = page.getByRole("dialog", { name: "Story f1 about funny" });
  await reader.waitFor();
  assert.ok(await reader.getByText("First paragraph of story f1.").isVisible());
  assert.ok(await reader.getByText("Second paragraph of story f1.").isVisible());
  const source = reader.getByRole("link", { name: "Read on Test News" });
  assert.equal(await source.getAttribute("href"), "https://source.test-news.example/f1");
  assert.equal(await source.getAttribute("target"), "_blank");
  // Next goes through the light side, then the serious side.
  await reader.getByRole("button", { name: "Next story" }).click();
  await page.getByRole("dialog", { name: "Story f2 about funny" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.ok(await main.getByText("2 of 9 read").isVisible());
  assert.ok(await main.getByRole("button", { name: /^Read: Story f1 about funny \(read\)$/ }).isVisible());
  // What was read is remembered on this device.
  await page.reload();
  await main.getByText("2 of 9 read").waitFor();
  await page.close();
});

test("a story that came with only a summary says where the full article is", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  await page.locator("main").getByRole("button", { name: /^Read: Story w3/ }).click();
  const reader = page.getByRole("dialog", { name: "Story w3 about world" });
  assert.ok(await reader.getByText("A short summary of story w3.").isVisible());
  assert.ok(await reader.getByText(/full article is on Test News/).isVisible());
  await page.close();
});

test("a video plays inside Core from YouTube, and stops when closed", async () => {
  const requests = [];
  const { page, errors } = await openApp(browser, server.url, { route: "news", init: serveNews({ requests }) });
  await page.locator("main").getByRole("button", { name: /^Watch: Story w2/ }).click();
  const reader = page.getByRole("dialog", { name: "Story w2 about world" });
  const frame = reader.locator("iframe");
  await frame.waitFor();
  const src = await frame.getAttribute("src");
  assert.match(src, /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk\?autoplay=1/);
  assert.match(await frame.getAttribute("allow"), /fullscreen/);
  await page.frameLocator('[role="dialog"] iframe').getByText("YouTube player").waitFor();
  assert.ok(await reader.getByRole("link", { name: "Open on YouTube" }).isVisible());
  await reader.getByRole("button", { name: "Close" }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await page.locator("iframe").count(), 0, "the player is gone with the reader");
  assert.deepEqual(notMissingFiles(errors), []);
  await page.close();
});

test("earlier editions of the week can still be read", async () => {
  const requests = [];
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews({ requests }) });
  const main = page.locator('main[data-section="news"]');
  await main.getByText("Octopuses have three hearts and blue blood.").waitFor();
  assert.ok(!requests.includes(`${YESTERDAY}.json`), "only the open edition is fetched");
  await main.getByRole("group", { name: "Edition" }).getByRole("button", { name: "Yesterday" }).click();
  await main.getByText("Wombats make cube-shaped droppings.").waitFor();
  assert.ok(await main.getByRole("button", { name: /^Read: Yesterday's big story/ }).isVisible());
  assert.ok(await main.getByText("0 of 2 read").isVisible());
  await page.close();
});

test("a picture that doesn't load leaves a plain tile, not a broken image", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  const card = page.locator("main").getByRole("button", { name: /^Read: Story f2/ });
  await card.locator(".news-thumb__blank").waitFor();
  assert.equal(await card.locator("img").count(), 0);
  await page.close();
});

test("before the first edition, the page says the news is on its way", async () => {
  // news/index.json as it was committed, listing no days until the first run.
  const { page, errors } = await openApp(browser, server.url, { route: "news", init: serveNews({ days: [] }) });
  await page.getByText("The first edition is on its way").waitFor();
  assert.deepEqual(errors, []);
  await page.close();
  // A site without the file at all says the same.
  const missing = await openApp(browser, server.url, { route: "news", init: serveNews({ days: null }) });
  await missing.page.getByText("The first edition is on its way").waitFor();
  await missing.page.close();
});

test("on a phone the news fits the screen, with no sideways scroll", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", viewport: { width: 375, height: 812 }, init: serveNews() });
  await page.locator(".news-card").first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  const boxes = await page.locator(".news-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  for (const b of boxes) assert.ok(b.x >= 0 && b.x + b.width <= 375 && b.height >= 44, `card ${b.x}..${b.x + b.width}`);
  await page.locator("main").getByRole("button", { name: /^Watch: Story w2/ }).click();
  const frame = await page.locator('[role="dialog"] iframe').boundingBox();
  assert.ok(frame.width > 250 && frame.x >= 0 && frame.x + frame.width <= 375, `player ${frame.x}..${frame.x + frame.width}`);
  await page.close();
});

// ---------- Languages and the new sections ----------

const tr = (id, lang) => ({ title: `[${lang}] Story ${id}`, summary: `[${lang}] Summary ${id}.`, body: [`[${lang}] Paragraph one of ${id}.`, `[${lang}] Paragraph two of ${id}.`] });
const multilingual = {
  date: TODAY,
  fact: { text: "Octopuses have three hearts.", lang: "en", url: null, tr: { uz: { text: "Sakkizoyoqlarning uchta yuragi bor." }, ru: { text: "У осьминогов три сердца." } } },
  items: [
    { ...story("tr1", "trending", "trending"), lang: "en", trend: { query: "barcelona", traffic: "500K+" }, tr: { uz: tr("tr1", "uz"), ru: tr("tr1", "ru") } },
    { ...story("uz1", "uzbekistan", "uzbekistan"), title: "Toshkentda yangi metro bekati", summary: "Qisqacha.", body: ["Birinchi xatboshi.", "Ikkinchi xatboshi."], lang: "uz", tr: { en: tr("uz1", "en"), ru: tr("uz1", "ru") } },
    { ...story("fb1", "football", "football"), lang: "en", tr: { uz: { title: "[uz] Story fb1", summary: "[uz] Summary fb1." }, ru: tr("fb1", "ru") } },
    { ...story("w1", "serious", "world"), lang: "en", tr: {} },
    { ...story("a1", "light", "animals"), lang: "en", tr: { uz: tr("a1", "uz"), ru: tr("a1", "ru") } }
  ]
};
const serveMultilingual = (extra) => serveNews({ days: [TODAY], editions: { [TODAY]: multilingual }, ...extra });

test("sections: trending across the top, then Uzbekistan and football, then the two sides", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "news", init: serveMultilingual() });
  const main = page.locator('main[data-section="news"]');
  await main.getByRole("region", { name: "Trending now" }).waitFor();
  const titles = await main.locator(".news-side__title").allTextContents();
  assert.deepEqual(titles, ["Trending now", "Uzbekistan", "Football", "The light side", "The serious side"]);
  const trending = main.getByRole("region", { name: "Trending now" });
  assert.ok(await trending.getByText("barcelona · 500K+").isVisible(), "what was searched, and how much");
  // Next goes through the sections in the order they're shown.
  await trending.getByRole("button", { name: /^Read: Story tr1/ }).click();
  for (const title of ["[en] Story uz1", "Story fb1 about football", "Story a1 about animals", "Story w1 about world"]) {
    await page.getByRole("dialog").getByRole("button", { name: "Next story" }).or(page.getByRole("dialog").getByRole("button", { name: "Done" })).first().click();
    await page.getByRole("dialog", { name: title }).waitFor();
  }
  assert.ok(await page.getByRole("dialog").getByRole("button", { name: "Done" }).isVisible(), "the last story ends with Done");
  assert.deepEqual(notMissingFiles(errors), []);
  await page.close();
});

test("switching the language: stories, the fun fact and the page's own words", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveMultilingual() });
  const main = page.locator('main[data-section="news"]');
  // The switch is named in the language shown: "News language", "Yangiliklar tili", …
  const langs = main.locator(".news-lang [role=group]");
  await main.getByRole("group", { name: "News language" }).waitFor();
  assert.equal(await langs.getByRole("button", { name: "English" }).getAttribute("aria-pressed"), "true");
  // In English, the Uzbek story reads in its English translation.
  assert.ok(await main.getByText("[en] Story uz1").isVisible());
  assert.ok(await main.getByText("Octopuses have three hearts.").isVisible());

  await langs.getByRole("button", { name: "Oʻzbekcha" }).click();
  assert.ok(await main.getByText("Sakkizoyoqlarning uchta yuragi bor.").isVisible());
  assert.ok(await main.getByRole("heading", { name: "Kunning qiziqarli fakti" }).isVisible());
  assert.ok(await main.getByRole("region", { name: "Hozir trendda" }).isVisible());
  assert.ok(await main.getByText("Toshkentda yangi metro bekati").isVisible(), "an Uzbek story as it was published");
  assert.ok(await main.getByText("[uz] Story tr1").isVisible());
  assert.ok(await main.getByRole("group", { name: "Son" }).getByRole("button", { name: "Bugun" }).isVisible());
  assert.equal(await main.locator(".news-card__title", { hasText: "[uz] Story tr1" }).getAttribute("lang"), "uz");

  // The reader, in Uzbek.
  await main.getByRole("button", { name: /^Oʻqish: \[uz\] Story a1/ }).click();
  const reader = page.getByRole("dialog", { name: "[uz] Story a1" });
  assert.ok(await reader.getByText("[uz] Paragraph one of a1.").isVisible());
  assert.ok(await reader.getByRole("button", { name: "Keyingi yangilik" }).isVisible());
  await closeReader(page);

  // A story with no Uzbek translation is shown as published, and says so.
  await main.getByRole("button", { name: /^Oʻqish: Story w1/ }).click();
  assert.ok(await page.getByRole("dialog").getByText(/hali oʻzbekchaga tarjima qilinmagan/).isVisible());
  await closeReader(page);
  // One whose summary was translated but not its article: the article as published, with a note.
  await main.getByRole("button", { name: /^Oʻqish: \[uz\] Story fb1/ }).click();
  const fb = page.getByRole("dialog", { name: "[uz] Story fb1" });
  assert.ok(await fb.getByText("First paragraph of story fb1.").isVisible());
  assert.ok(await fb.getByText(/Toʻliq matnni tarjima qilib boʻlmadi/).isVisible());
  await closeReader(page);

  await langs.getByRole("button", { name: "Русский" }).click();
  assert.ok(await main.getByText("У осьминогов три сердца.").isVisible());
  assert.ok(await main.getByRole("region", { name: "Узбекистан" }).isVisible());
  assert.ok(await main.getByText("[ru] Story uz1").isVisible());

  // The choice is remembered.
  await page.reload();
  await main.getByText("У осьминогов три сердца.").waitFor();
  assert.equal(await main.getByRole("group", { name: "Язык новостей" }).getByRole("button", { name: "Русский" }).getAttribute("aria-pressed"), "true");
  await page.close();
});

test("an edition from before translations reads as it always did in English", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  const main = page.locator('main[data-section="news"]');
  await main.getByRole("button", { name: /^Read: Story f1/ }).click();
  assert.equal(await page.getByRole("dialog").locator(".news-reader__note").count(), 0, "no note in English");
  await page.close();
});

test("the language switch fits a phone", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", viewport: { width: 375, height: 812 }, init: serveMultilingual() });
  const langs = page.getByRole("group", { name: "News language" });
  await langs.waitFor();
  const box = await langs.boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375, `switch ${box.x}..${box.x + box.width}`);
  for (const b of await langs.getByRole("button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) assert.ok(b.height >= 28 && b.x + b.width <= 375);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  await page.close();
});
