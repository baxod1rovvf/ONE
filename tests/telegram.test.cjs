// Telegram in ONE, against the fake Telegram (tests/fixtures/telegram-fake.js).
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

const H = 3600e3;
const MIN = 60e3;
// A message from them (out: false) or from me (out: true), `ago` ms ago.
const msg = (chatId, id, out, ago, text = out ? "ok" : "hello") => ({ id, chatId, out, date: Date.now() - ago, text, replyToId: null, media: null });
// Aziz (High) waiting 5 h, Mom (Normal) waiting 2 h, Dilnoza (Low) answered,
// plus Bek, who isn't in ONE.
function seed() {
  const messages = {
    "11": [msg("11", 1, true, 6 * H), msg("11", 2, false, 5 * H, "Are you free?"), msg("11", 3, false, 4 * H, "Call me")],
    "12": [msg("12", 1, false, 2 * H, "Dinner at 7?")],
    "13": [msg("13", 1, false, 3 * H), msg("13", 2, true, 2 * H)],
    "14": [msg("14", 1, false, 10 * MIN, "Hey")]
  };
  const chat = (id, name, username) => ({ id, name, username, lastMessage: messages[id][messages[id].length - 1], unread: 0, readOutboxMaxId: 0 });
  return {
    me: { id: "1", name: "Owner", username: "owner" },
    chats: [chat("14", "Bek", "bek"), chat("12", "Mom", null), chat("11", "Aziz", "aziz"), chat("13", "Dilnoza", "dilnoza")],
    messages
  };
}
const PREFS = {
  telegram: {
    chats: { "11": { level: "high", name: "Aziz" }, "12": { level: "normal", name: "Mom" }, "13": { level: "low", name: "Dilnoza" } },
    limits: { normal: 180, low: 720 }
  }
};
const connected = (extra = {}) => ({ telegram: { seed: seed(), device: true }, settings: PREFS, ...extra });
const badge = (page) => page.locator('.dock__tab[data-route="telegram"] .dock__badge');

test("no Telegram files load without a login on this device", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks", telegram: { seed: seed() } });
  await page.locator('main[data-section="tasks"] .panel').first().waitFor();
  await page.waitForTimeout(2500);
  const loaded = await page.evaluate(() => [...document.querySelectorAll("script[src]")].map((e) => e.getAttribute("src")).filter((n) => /pages\/telegram\/(service|client|rules|gramjs)/.test(n)));
  assert.deepEqual(loaded, []);
  assert.equal(await page.locator('.dock__tab[data-route="telegram"]').count(), 1);
  assert.equal(await badge(page).count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("with a login, the dock badge shows how many are waiting", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "tasks", ...connected() });
  await badge(page).waitFor({ timeout: 10000 });
  assert.equal(await badge(page).getAttribute("aria-label"), "2 waiting");
  assert.equal((await badge(page).textContent()).trim(), "2");
  assert.deepEqual(errors, []);
  await page.close();
});

test("a reply from another device clears the chat", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", ...connected() });
  await badge(page).waitFor({ timeout: 10000 });
  await page.evaluate(() => window.__tgFake.push({ type: "message", message: { id: 4, chatId: "11", out: true, date: Date.now(), text: "Calling now", replyToId: null, media: null } }));
  await page.waitForFunction(() => document.querySelector('.dock__tab[data-route="telegram"] .dock__badge')?.getAttribute("aria-label") === "1 waiting");
  await page.close();
});

test("a new message from them adds the chat to the waiting count", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", ...connected() });
  await badge(page).waitFor({ timeout: 10000 });
  await page.evaluate(() => window.__tgFake.push({ type: "message", message: { id: 3, chatId: "13", out: false, date: Date.now(), text: "One more thing", replyToId: null, media: null } }));
  await page.waitForFunction(() => document.querySelector('.dock__tab[data-route="telegram"] .dock__badge')?.getAttribute("aria-label") === "3 waiting");
  await page.close();
});

test("locked, nothing from Telegram shows or loads", async () => {
  const lockRec = { salt: "AAAA", iterations: 1, hash: "x", len: 4, autoLock: 1, fails: 0, until: 0 };
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    ...connected(),
    init: (p) => p.addInitScript((rec) => localStorage.setItem("one.lock.v1", JSON.stringify(rec)), lockRec)
  });
  await page.getByText("ONE is locked").waitFor();
  await page.waitForTimeout(2500);
  assert.equal(await badge(page).count(), 0);
  const loaded = await page.evaluate(() => !!document.querySelector("script[src*='pages/telegram/service']"));
  assert.equal(loaded, false);
  await page.close();
});
