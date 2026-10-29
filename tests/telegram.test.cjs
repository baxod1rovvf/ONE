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

// ---------- Connecting ----------
const fill = async (page, label, value) => page.getByLabel(label, { exact: true }).fill(value);
async function enterKey(page) {
  await page.getByRole("heading", { name: "Connect Telegram" }).waitFor({ timeout: 10000 });
  await fill(page, "api_id", "12345");
  await fill(page, "api_hash", "0123456789abcdef0123456789abcdef");
  await page.getByRole("button", { name: "Continue" }).click();
}

test("the app key step explains where the key comes from and checks it", async () => {
  const { page } = await openApp(browser, server.url, { route: "telegram", telegram: { seed: seed() } });
  await page.getByRole("heading", { name: "Connect Telegram" }).waitFor({ timeout: 10000 });
  assert.equal(await page.getByRole("link", { name: "my.telegram.org" }).getAttribute("href"), "https://my.telegram.org");
  const go = page.getByRole("button", { name: "Continue" });
  assert.equal(await go.isDisabled(), true);
  await fill(page, "api_id", "12a");
  await fill(page, "api_hash", "0123456789abcdef0123456789abcdef");
  assert.equal(await go.isDisabled(), true);
  await fill(page, "api_id", "12345");
  assert.equal(await go.isDisabled(), false);
  await fill(page, "api_hash", "short");
  assert.equal(await go.isDisabled(), true);
  await page.close();
});

test("QR login connects, keeps the login on this device, and starts Telegram", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "telegram", telegram: { seed: seed() }, settings: PREFS });
  await enterKey(page);
  await page.getByRole("img", { name: "QR code to scan with Telegram" }).waitFor();
  await page.evaluate(() => window.__tgFake.scanQr());
  await page.getByText("Connected as Owner (@owner)").waitFor();
  const device = await page.evaluate(() => JSON.parse(localStorage.getItem("one.telegram.device.v1")));
  assert.equal(device.session, "fake-session");
  assert.equal(device.apiId, 12345);
  await badge(page).waitFor({ timeout: 10000 });
  assert.equal(await badge(page).getAttribute("aria-label"), "2 waiting");
  assert.deepEqual(errors, []);
  await page.close();
});

test("phone login: a wrong code says so, the right one connects", async () => {
  const { page } = await openApp(browser, server.url, { route: "telegram", telegram: { seed: seed() } });
  await enterKey(page);
  await page.getByRole("button", { name: "Phone number" }).click();
  await fill(page, "Phone number", "+998901234567");
  await page.getByRole("button", { name: "Send code" }).click();
  await fill(page, "Code", "11111");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("That code didn't work. Send a new one?").waitFor();
  await fill(page, "Code", "12345");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("Connected as Owner (@owner)").waitFor();
  await page.close();
});

test("a cloud password is asked for after the code", async () => {
  const s = { ...seed(), needsPassword: true };
  const { page } = await openApp(browser, server.url, { route: "telegram", telegram: { seed: s } });
  await enterKey(page);
  await page.getByRole("button", { name: "Phone number" }).click();
  await fill(page, "Phone number", "+998901234567");
  await page.getByRole("button", { name: "Send code" }).click();
  await fill(page, "Code", "12345");
  await page.getByRole("button", { name: "Log in" }).click();
  await fill(page, "Cloud password", "wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("That password didn't work. Try again.").waitFor();
  await fill(page, "Cloud password", "secret");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("Connected as Owner (@owner)").waitFor();
  await page.close();
});

test("QR login with a cloud password asks for it, and again if it's wrong", async () => {
  const s = { ...seed(), needsPassword: true };
  const { page } = await openApp(browser, server.url, { route: "telegram", telegram: { seed: s } });
  await enterKey(page);
  await page.getByRole("img", { name: "QR code to scan with Telegram" }).waitFor();
  await page.evaluate(() => window.__tgFake.scanQr());
  await fill(page, "Cloud password", "wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("That password didn't work. Try again.").waitFor();
  await fill(page, "Cloud password", "secret");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("Connected as Owner (@owner)").waitFor();
  await page.close();
});

test("when Telegram asks to wait, ONE says how long", async () => {
  const { page } = await openApp(browser, server.url, {
    route: "telegram",
    telegram: { seed: seed() },
    init: (p) => p.addInitScript(() => window.addEventListener("one-telegram-ready", () => (window.__tgFake.fail.sendCode = { code: "FLOOD_WAIT", seconds: 240 })))
  });
  await enterKey(page);
  await page.getByRole("button", { name: "Phone number" }).click();
  await fill(page, "Phone number", "+998901234567");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByText("Telegram asks you to wait 4 minutes before trying again.").waitFor();
  await page.close();
});

test("Settings: who is connected, log out, and the time limits", async () => {
  const { page } = await openApp(browser, server.url, { route: "preferences", ...connected() });
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Telegram" }) });
  await section.getByText("Connected as Owner (@owner)").waitFor({ timeout: 10000 });
  assert.equal(await section.getByLabel("Normal moves up after (hours)").inputValue(), "3");
  assert.equal(await section.getByLabel("Low moves up after (hours)").inputValue(), "12");
  await badge(page).waitFor({ timeout: 10000 });
  // Mom (Normal) has waited 2 h: a 1 h limit puts her at High, ahead of Aziz.
  await section.getByLabel("Normal moves up after (hours)").fill("1");
  await page.waitForFunction(() => window.__oneTelegram.getState().waiting[0]?.name === "Aziz" && window.__oneTelegram.getState().waiting[1]?.current === "high");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")).settings.telegram.limits);
  assert.deepEqual(stored, { normal: 60, low: 720 });
  await section.getByRole("button", { name: "Log out" }).click();
  await section.getByText("Not connected").waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("one.telegram.device.v1")), null);
  assert.equal(await badge(page).count(), 0);
  await page.close();
});

test("logged out from the phone: ONE says so and can connect again", async () => {
  const { page } = await openApp(browser, server.url, { route: "telegram", ...connected() });
  await badge(page).waitFor({ timeout: 10000 });
  await page.evaluate(() => window.__tgFake.revoke());
  await page.getByText("You were logged out of Telegram.").waitFor();
  assert.equal(await badge(page).count(), 0);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByRole("heading", { name: "Connect Telegram" }).waitFor();
  // The key is remembered; only the login is gone.
  assert.equal(await page.getByLabel("api_id", { exact: true }).inputValue(), "12345");
  await page.close();
});
