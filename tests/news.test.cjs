// The News page: football in Uzbek. Ten blocks two to a line (40% picture,
// 60% short title), a blue dot that turns green once read, the fun fact card,
// the reader with videos played from YouTube only when opened, and the week
// of editions. Editions are served from fixtures built here.
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

// A block: English by default, with its Uzbek translation.
function story(id, short, extra = {}) {
  return {
    id,
    topic: "news",
    short,
    title: `Story ${id}`,
    summary: `Summary ${id}.`,
    body: [`Paragraph one of ${id}.`, `Paragraph two of ${id}.`],
    image: `https://img.test-news.example/${id}.png`,
    url: `https://source.test-news.example/${id}`,
    source: "BBC Sport",
    publishedAt: hoursAgo(3),
    video: null,
    lang: "en",
    tr: { uz: { title: `Yangilik ${id}`, summary: `Qisqacha ${id}.`, body: [`Birinchi xatboshi ${id}.`, `Ikkinchi xatboshi ${id}.`] } },
    ...extra
  };
}
const video = (id, short) => story(id, short, { topic: "moments", video: { provider: "youtube", id: `${id}xxxxxxxxxx`.slice(0, 11) }, url: `https://www.youtube.com/watch?v=${id}`, source: "Premier League", body: null });

const todayEdition = {
  date: TODAY,
  fact: {
    title: "A horse can sleep standing up!",
    text: "Horses can doze on their feet.",
    image: "https://img.test-news.example/horse.png",
    url: "https://en.wikipedia.org/wiki/Horse",
    source: "Wikipedia",
    lang: "en",
    tr: { uz: { title: "Ot tik turib uxlay oladi!", text: "Otlar oyoqda turib mudray oladi." } }
  },
  items: [
    video("m1", "Gol - 2005 - Messi - Manchester United"),
    story("n1", "Transfer - Wirtz - Liverpool"),
    video("m2", "Dribling - Ronaldinho"),
    video("m3", "Gol - 2012 - Ronaldo"),
    story("n2", "Jarohat - Saka", { body: null, tr: { uz: { title: "Yangilik n2", summary: "Qisqacha n2." } } }),
    video("m4", "Gol - Henry - Arsenal"),
    story("n3", "Natija - Paxtakor - Navbahor", { lang: "uz", title: "Paxtakor Navbahorni 3:1 hisobida magʻlub etdi", summary: "Superliga oʻyini.", body: ["Uchrashuv Toshkentda boʻldi.", "Paxtakor ikki gol urdi."], tr: {} }),
    video("m5", "Seyv - Buffon"),
    story("n4", "Natija - Arsenal - Tottenham", { image: "https://img.test-news.example/broken.png" }),
    video("m6", "Gol - 1986 - Maradona")
  ]
};
const yesterdayEdition = {
  date: YESTERDAY,
  fact: { title: "Octopuses have three hearts", text: "And blue blood.", lang: "en", tr: { uz: { title: "Sakkizoyoqning uchta yuragi bor", text: "Va qoni koʻk." } } },
  items: [story("y1", "Transfer - Mbappé - Real Madrid"), video("y2", "Gol - 2002 - Zidane")]
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
const notMissingFiles = (errors) => errors.filter((e) => !/Failed to load resource/.test(e));
// Esc closes the reader once focus has moved into it.
async function closeReader(page) {
  await page.waitForFunction(() => document.activeElement && document.activeElement.closest("[role=dialog]"));
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
}
const grid = (page) => page.locator('main[data-section="news"]').getByRole("list", { name: "Yangiliklar" });
const block = (page, short) => grid(page).getByRole("button", { name: new RegExp(`^(Oʻqish|Koʻrish): ${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(`) });

test("ten blocks, two to a line: picture on the left (40%), short title on the right", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  await grid(page).waitFor();
  const blocks = grid(page).locator(".news-block");
  assert.equal(await blocks.count(), 10);
  assert.deepEqual(await grid(page).locator(".news-block__title").allTextContents(), todayEdition.items.map((s) => s.short), "short titles, in the edition's order");
  const boxes = await blocks.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  assert.equal(Math.round(boxes[0].y), Math.round(boxes[1].y), "two to a line");
  assert.ok(boxes[2].y > boxes[0].y, "then the next line");
  const first = blocks.first();
  const media = await first.locator(".news-block__media").boundingBox();
  const whole = await first.boundingBox();
  assert.ok(Math.abs(media.width / whole.width - 0.4) < 0.03, `picture is ${Math.round((media.width / whole.width) * 100)}% wide`);
  assert.ok(parseFloat(await first.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)) >= 12, "rounded corners");
  // No categories, no ticks.
  assert.equal(await page.locator(".news-side, .news-topic, .badge, .news-card__read").count(), 0);
  // Videos are marked, and nothing of YouTube loads until one is opened.
  assert.equal(await block(page, "Gol - 2005 - Messi - Manchester United").locator(".news-block__play").count(), 1);
  assert.equal(await page.locator("iframe").count(), 0);
  assert.deepEqual(notMissingFiles(errors), []);
  await page.close();
});

test("a blue dot until a block is read, then green, remembered on this device", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  const b = block(page, "Transfer - Wirtz - Liverpool");
  await b.waitFor();
  const dot = b.locator(".news-block__dot");
  const color = () => dot.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(await color(), "rgb(47, 123, 246)", "blue");
  const dotBox = await dot.boundingBox();
  const box = await b.boundingBox();
  assert.ok(dotBox.x + dotBox.width > box.x + box.width - 20 && dotBox.y + dotBox.height > box.y + box.height - 20, "in the bottom-right corner");
  assert.match(await b.getAttribute("aria-label"), /\(oʻqilmagan\)$/);
  await b.click();
  await closeReader(page);
  // (The dot fades from blue to green.)
  await dot.evaluate((el) => new Promise((resolve) => (getComputedStyle(el).backgroundColor === "rgb(34, 165, 91)" ? resolve() : el.addEventListener("transitionend", resolve, { once: true }))));
  assert.equal(await color(), "rgb(34, 165, 91)", "green once read");
  assert.match(await b.getAttribute("aria-label"), /\(oʻqilgan\)$/);
  // Nothing else changes: no tick, no fading.
  assert.equal(await b.evaluate((el) => getComputedStyle(el).opacity), "1");
  assert.equal(await b.locator(".news-block__title").evaluate((el) => getComputedStyle(el).color), await block(page, "Jarohat - Saka").locator(".news-block__title").evaluate((el) => getComputedStyle(el).color));
  assert.ok(await page.getByText("10 tadan 1 tasi oʻqildi").isVisible());
  await page.reload();
  await block(page, "Transfer - Wirtz - Liverpool").waitFor();
  assert.equal(await block(page, "Transfer - Wirtz - Liverpool").locator(".news-block__dot").evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(34, 165, 91)");
  await page.close();
});

test("everything reads in Uzbek inside Core, with Next through all ten", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  await block(page, "Transfer - Wirtz - Liverpool").click();
  const reader = page.getByRole("dialog", { name: "Yangilik n1" });
  await reader.waitFor();
  assert.ok(await reader.getByText("Birinchi xatboshi n1.").isVisible());
  assert.equal(await reader.locator(".news-reader__p").first().getAttribute("lang"), "uz");
  const source = reader.getByRole("link", { name: "BBC Sport saytida oʻqish" });
  assert.equal(await source.getAttribute("href"), "https://source.test-news.example/n1");
  await reader.getByRole("button", { name: "Keyingi yangilik" }).click();
  // The next block (a video) plays inside Core.
  const next = page.getByRole("dialog", { name: "Yangilik m2" });
  await next.locator("iframe").waitFor();
  assert.match(await next.locator("iframe").getAttribute("src"), /^https:\/\/www\.youtube-nocookie\.com\/embed\/m2xxxxxxxxx\?autoplay=1/);
  assert.ok(await next.getByRole("link", { name: "YouTube’da ochish" }).isVisible());
  await closeReader(page);
  assert.equal(await page.locator("iframe").count(), 0, "the player is gone with the reader");
  // A story published in Uzbek reads as it was written.
  await block(page, "Natija - Paxtakor - Navbahor").click();
  const uz = page.getByRole("dialog", { name: "Paxtakor Navbahorni 3:1 hisobida magʻlub etdi" });
  assert.ok(await uz.getByText("Paxtakor ikki gol urdi.").isVisible());
  await closeReader(page);
  // One that came with only a summary says where the full article is.
  await block(page, "Jarohat - Saka").click();
  assert.ok(await page.getByRole("dialog").getByText(/Toʻliq maqola BBC Sport saytida/).isVisible());
  await closeReader(page);
  // The last one ends with Done.
  await block(page, "Gol - 1986 - Maradona").click();
  assert.ok(await page.getByRole("dialog").getByRole("button", { name: "Tayyor" }).isVisible());
  await page.close();
});

test("the fun fact: bulb, Today's Discovery, headline, sentence, source and photo", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  const fact = page.locator("main .news-fact");
  await fact.waitFor();
  assert.equal(await fact.locator("svg.news-fact__art").count(), 1, "the bulb");
  assert.ok(await fact.getByText("Bugungi kashfiyot").isVisible());
  assert.ok(await fact.getByRole("heading", { name: "Ot tik turib uxlay oladi!" }).isVisible());
  assert.ok(await fact.getByText("Otlar oyoqda turib mudray oladi.").isVisible());
  const src = fact.getByRole("link", { name: "Manba: Vikipediya" });
  assert.equal(await src.getAttribute("href"), "https://en.wikipedia.org/wiki/Horse");
  const photo = fact.locator("img.news-fact__photo");
  assert.equal(await photo.getAttribute("src"), "https://img.test-news.example/horse.png");
  // Bulb on the left, photo on the right.
  const art = await fact.locator(".news-fact__art").boundingBox();
  const text = await fact.locator(".news-fact__body").boundingBox();
  const pic = await photo.boundingBox();
  assert.ok(art.x < text.x && text.x < pic.x, "bulb, words, photo");
  assert.deepEqual(notMissingFiles(errors), []);
  await page.close();
});

test("an edition from before the redesign still shows, with titles in its place", async () => {
  const old = {
    date: TODAY,
    fact: { text: "A horse can look forward with one eye and back with the other.", url: null },
    items: [{ id: "o1", side: "serious", topic: "world", title: "Old world story with a fairly long title that goes on", summary: "S.", body: null, image: null, url: "https://x.example/1", source: "BBC News", publishedAt: hoursAgo(30), video: null }]
  };
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews({ days: [TODAY], editions: { [TODAY]: old } }) });
  await grid(page).waitFor();
  assert.ok(await page.getByRole("heading", { name: "A horse can look forward with one eye and back with the other." }).isVisible());
  assert.equal(await grid(page).locator(".news-block").count(), 1);
  assert.match(await grid(page).locator(".news-block__title").textContent(), /^Old world story/);
  await page.close();
});

test("earlier editions of the week can still be read", async () => {
  const requests = [];
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews({ requests }) });
  const days = page.locator("main").getByRole("group", { name: "Son" });
  await days.getByRole("button", { name: "Bugun" }).waitFor();
  assert.ok(!requests.includes(`${YESTERDAY}.json`), "only the open edition is fetched");
  await days.getByRole("button", { name: "Kecha" }).click();
  await page.getByRole("heading", { name: "Sakkizoyoqning uchta yuragi bor" }).waitFor();
  assert.deepEqual(await grid(page).locator(".news-block__title").allTextContents(), ["Transfer - Mbappé - Real Madrid", "Gol - 2002 - Zidane"]);
  await page.close();
});

test("a picture that doesn't load leaves a plain tile, not a broken image", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews() });
  const b = block(page, "Natija - Arsenal - Tottenham");
  await b.locator(".news-block__blank").waitFor();
  assert.equal(await b.locator("img").count(), 0);
  await page.close();
});

test("before the first edition, the page says the news is on its way", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "news", init: serveNews({ days: [] }) });
  await page.getByText("Birinchi son yoʻlda").waitFor();
  assert.deepEqual(errors, []);
  await page.close();
  const missing = await openApp(browser, server.url, { route: "news", init: serveNews({ days: null }) });
  await missing.page.getByText("Birinchi son yoʻlda").waitFor();
  await missing.page.close();
});

test("on a phone: still two to a line, picture on top, nothing off screen", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", viewport: { width: 375, height: 812 }, init: serveNews() });
  await grid(page).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  const boxes = await grid(page).locator(".news-block").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  assert.equal(Math.round(boxes[0].y), Math.round(boxes[1].y), "two to a line");
  for (const b of boxes) assert.ok(b.x >= 0 && b.x + b.width <= 375 && b.height >= 44, `block ${b.x}..${b.x + b.width}`);
  const first = grid(page).locator(".news-block").first();
  const media = await first.locator(".news-block__media").boundingBox();
  const title = await first.locator(".news-block__title").boundingBox();
  assert.ok(media.y + media.height <= title.y + 1, "picture above the title");
  const fact = page.locator("main .news-fact");
  const photo = await fact.locator(".news-fact__photo").boundingBox();
  const heading = await fact.locator(".news-fact__title").boundingBox();
  assert.ok(photo.y < heading.y, "the fact's photo across the top");
  assert.ok(photo.x >= 0 && photo.x + photo.width <= 375);
  await block(page, "Gol - 2005 - Messi - Manchester United").click();
  const frame = await page.locator('[role="dialog"] iframe').boundingBox();
  assert.ok(frame.width > 250 && frame.x >= 0 && frame.x + frame.width <= 375, `player ${frame.x}..${frame.x + frame.width}`);
  await page.close();
});

test("dark theme: the fact card and the dots keep their contrast", async () => {
  const { page } = await openApp(browser, server.url, { route: "news", theme: "dark", init: serveNews() });
  const fact = page.locator("main .news-fact");
  await fact.waitFor();
  const bg = await fact.evaluate((el) => getComputedStyle(el).backgroundImage);
  assert.match(bg, /rgb\(58, 42, 34\)/, "the dark warm card");
  assert.equal(await grid(page).locator(".news-block__dot").first().evaluate((el) => getComputedStyle(el).backgroundColor), "rgb(91, 155, 255)");
  await page.close();
});

test("older days are named in Uzbek", async () => {
  const three = iso(new Date(Date.now() - 2 * 864e5));
  const { page } = await openApp(browser, server.url, { route: "news", init: serveNews({ days: [TODAY, YESTERDAY, three] }) });
  const days = page.locator("main").getByRole("group", { name: "Son" });
  await days.getByRole("button", { name: "Bugun" }).waitFor();
  const label = (await days.getByRole("button").nth(2).textContent()).trim();
  assert.match(label, /^(Yak|Dush|Sesh|Chor|Pay|Jum|Shan), \d{1,2}-(yanvar|fevral|mart|aprel|may|iyun|iyul|avgust|sentabr|oktabr|noyabr|dekabr)$/, label);
  await page.close();
});
