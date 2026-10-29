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

const { H, MIN, msg, seed, chatSeed, PREFS } = require("./fixtures/telegram-seeds.cjs");
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

// ---------- Choosing chats and the list ----------
const NO_PREFS = { telegram: { chats: {}, limits: { normal: 180, low: 720 } } };
const levelOf = (page, name) => page.getByRole("group", { name: `Level for ${name}` });

test("first visit: every private chat, newest first, starts as Not in ONE", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "telegram", ...connected({ settings: NO_PREFS }) });
  await page.getByRole("heading", { name: "Choose your chats" }).waitFor({ timeout: 10000 });
  const names = await page.locator(".tg-manage__name").allTextContents();
  assert.deepEqual(names, ["Bek", "Mom", "Dilnoza", "Aziz"]);
  for (const n of names) assert.equal(await levelOf(page, n).getByRole("button", { name: "Not in ONE" }).getAttribute("aria-pressed"), "true");
  await page.getByLabel("Search chats").fill("di");
  assert.deepEqual(await page.locator(".tg-manage__name").allTextContents(), ["Dilnoza"]);
  assert.deepEqual(errors, []);
  await page.close();
});

test("choosing a level keeps it in synced settings and lists the chat", async () => {
  const { page } = await openApp(browser, server.url, { route: "telegram", ...connected({ settings: NO_PREFS }) });
  await page.getByRole("heading", { name: "Choose your chats" }).waitFor({ timeout: 10000 });
  await levelOf(page, "Aziz").getByRole("button", { name: "High" }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")).settings.telegram.chats["11"]);
  assert.equal(stored.level, "high");
  assert.equal(stored.name, "Aziz");
  await page.getByRole("button", { name: "Done" }).click();
  await page.locator(".tg-list").getByText("Aziz").waitFor();
  await badge(page).waitFor();
  assert.equal(await badge(page).getAttribute("aria-label"), "1 waiting");
  await page.close();
});

test("the list: Waiting first in answer order, then the other chats", async () => {
  const s = connected();
  s.settings = { telegram: { ...PREFS.telegram, limits: { normal: 60, low: 720 } } };
  const { page } = await openApp(browser, server.url, { route: "telegram", ...s });
  const waiting = page.locator(".tg-list__group", { has: page.getByRole("heading", { name: "Waiting" }) });
  await waiting.locator(".tg-row").first().waitFor({ timeout: 10000 });
  assert.deepEqual(await waiting.locator(".tg-row__name").allTextContents(), ["Aziz", "Mom"]);
  assert.match(await waiting.locator(".tg-row").nth(0).textContent(), /waiting 5 h/);
  assert.match(await waiting.locator(".tg-row").nth(1).textContent(), /waiting 2 h, moved up from Normal/);
  assert.equal(await waiting.locator(".tg-row").nth(0).locator(".tg-dot--high").count(), 1);
  const others = page.locator(".tg-list__group", { has: page.getByRole("heading", { name: "Other chats" }) });
  assert.deepEqual(await others.locator(".tg-row__name").allTextContents(), ["Dilnoza"]);
  await page.close();
});

test("new people writing shows a quiet line that opens Manage chats", async () => {
  const { page } = await openApp(browser, server.url, { route: "telegram", ...connected() });
  await page.locator(".tg-list .tg-row").first().waitFor({ timeout: 10000 });
  await page.evaluate(() => {
    window.__tgFake.push({ type: "message", message: { id: 2, chatId: "14", out: false, date: Date.now(), text: "You there?", replyToId: null, media: null } });
    window.__tgFake.push({ type: "message", message: { id: 1, chatId: "15", out: false, date: Date.now(), text: "Hi, it's Sardor", replyToId: null, media: null } });
  });
  await page.getByRole("button", { name: "2 new chats in Telegram" }).click();
  await page.getByRole("heading", { name: "Choose your chats" }).waitFor();
  await page.close();
});

test("computer: list and chat side by side; phone: one at a time, with Back", async () => {
  const { page } = await openApp(browser, server.url, { route: "telegram", ...connected() });
  await page.locator(".tg-list .tg-row").first().waitFor({ timeout: 10000 });
  const list = await page.locator(".tg-list").boundingBox();
  const chat = await page.locator(".tg-pane").boundingBox();
  assert.ok(chat.x >= list.x + list.width - 1, "chat to the right of the list");
  await page.close();

  const phone = await openApp(browser, server.url, { route: "telegram", viewport: { width: 375, height: 812 }, ...connected() });
  const p = phone.page;
  await p.locator(".tg-list .tg-row").first().waitFor({ timeout: 10000 });
  assert.equal(await p.locator(".tg-pane").isVisible(), false);
  await p.locator(".tg-list .tg-row", { hasText: "Mom" }).click();
  await p.waitForFunction(() => location.hash === "#telegram/12");
  await p.locator(".tg-pane").getByRole("heading", { name: "Mom" }).waitFor();
  assert.equal(await p.locator(".tg-list").isVisible(), false);
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), 375);
  await p.locator(".tg-pane").getByRole("button", { name: "Back" }).click();
  await p.locator(".tg-list").waitFor();
  assert.equal(await p.evaluate(() => location.hash), "#telegram");
  await p.close();
});

// ---------- A chat ----------
const openChat = async (id = "11", extra = {}) => {
  const r = await openApp(browser, server.url, { route: `telegram/${id}`, telegram: { seed: chatSeed(), device: true }, settings: PREFS, ...extra });
  await r.page.locator(".tg-msg").first().waitFor({ timeout: 10000 });
  return r;
};
const box = (page) => page.getByLabel("Message", { exact: true });

test("opening a chat shows the latest 50, day by day, and marks it read", async () => {
  const { page, errors } = await openChat();
  assert.equal(await page.locator(".tg-msg").count(), 50);
  assert.ok((await page.locator(".tg-msg--in").count()) > 0 && (await page.locator(".tg-msg--out").count()) > 0);
  assert.ok((await page.locator(".tg-day").count()) >= 2);
  assert.equal(await page.locator('.tg-msg[data-id="58"] .tg-msg__tick--read').count(), 1);
  await page.waitForFunction(() => window.__tgFake.reads.some((r) => r.chatId === "11" && r.maxId === 60));
  await page.locator(".tg-chat__status", { hasText: "online" }).waitFor();
  // The newest message is in view.
  const last = await page.locator('.tg-msg[data-id="60"]').boundingBox();
  const pane = await page.locator(".tg-msgs").boundingBox();
  assert.ok(last.y + last.height <= pane.y + pane.height + 2 && last.y >= pane.y);
  assert.deepEqual(errors, []);
  await page.close();
});

test("scrolling to the top loads older messages and keeps your place", async () => {
  const { page } = await openChat();
  const firstBefore = await page.locator(".tg-msg").first().getAttribute("data-id");
  await page.locator(".tg-msgs").evaluate((el) => (el.scrollTop = 0));
  await page.waitForFunction(() => document.querySelectorAll(".tg-msg").length === 60);
  const top = await page.evaluate((id) => {
    const el = document.querySelector(`.tg-msg[data-id="${id}"]`);
    const pane = document.querySelector(".tg-msgs");
    return el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
  }, firstBefore);
  assert.ok(top > -60 && top < 200, `the old first message stays near the top (${top})`);
  await page.close();
});

test("photos, files and stickers", async () => {
  const { page } = await openChat();
  await page.locator('.tg-msg[data-id="55"] img.tg-msg__photo').waitFor();
  assert.match(await page.locator('.tg-msg[data-id="55"] img.tg-msg__photo').getAttribute("src"), /^blob:/);
  const file = page.locator('.tg-msg[data-id="56"]');
  assert.match(await file.textContent(), /plan\.pdf/);
  assert.match(await file.textContent(), /4\.9 KB/);
  await file.getByRole("button", { name: "Download" }).waitFor();
  const sticker = page.locator('.tg-msg[data-id="57"]');
  assert.match(await sticker.textContent(), /Sticker/);
  assert.equal(await sticker.getByRole("link", { name: "Open in Telegram" }).getAttribute("href"), "https://t.me/aziz");
  // Links in text can be clicked; a reply shows what it answers.
  assert.equal(await page.locator('.tg-msg[data-id="59"] a').getAttribute("href"), "https://example.com/agenda");
  assert.match(await page.locator('.tg-msg[data-id="58"] .tg-msg__quote').textContent(), /Here is the plan/);
  await page.close();
});

test("Enter sends, Shift+Enter starts a new line, and ONE says who's next", async () => {
  const { page } = await openChat();
  await box(page).click();
  await box(page).type("Calling");
  await box(page).press("Shift+Enter");
  await box(page).type("now");
  assert.equal(await box(page).inputValue(), "Calling\nnow");
  await box(page).press("Enter");
  await page.locator(".tg-msg--out", { hasText: "Calling" }).last().waitFor();
  assert.equal(await page.evaluate(() => window.__tgFake.sent.at(-1).text), "Calling\nnow");
  assert.equal(await box(page).inputValue(), "");
  await page.waitForFunction(() => document.querySelector('.dock__tab[data-route="telegram"] .dock__badge')?.getAttribute("aria-label") === "1 waiting");
  await page.getByRole("button", { name: "Next: Mom" }).click();
  await page.waitForFunction(() => location.hash === "#telegram/12");
  await page.close();
});

test("replying to a message quotes it", async () => {
  const { page } = await openChat();
  await page.locator('.tg-msg[data-id="59"]').hover();
  await page.locator('.tg-msg[data-id="59"]').getByRole("button", { name: "Reply" }).click();
  assert.match(await page.locator(".tg-compose__quote").textContent(), /Are you free\?/);
  await box(page).fill("Yes");
  await box(page).press("Enter");
  await page.waitForFunction(() => window.__tgFake.sent.length === 1);
  assert.equal(await page.evaluate(() => window.__tgFake.sent[0].replyToId), 59);
  assert.equal(await page.locator(".tg-compose__quote").count(), 0);
  await page.close();
});

test("a message that didn't send stays, with Try again", async () => {
  const { page } = await openChat();
  await page.evaluate(() => (window.__tgFake.fail.send = true));
  await box(page).fill("Hello?");
  await box(page).press("Enter");
  const failed = page.locator(".tg-msg--failed", { hasText: "Hello?" });
  await failed.waitFor();
  await page.evaluate(() => (window.__tgFake.fail.send = null));
  await failed.getByRole("button", { name: "Try again" }).click();
  await page.waitForFunction(() => window.__tgFake.sent.some((m) => m.text === "Hello?"));
  await page.locator(".tg-msg--failed").waitFor({ state: "detached" });
  await page.close();
});

test("when Telegram asks to slow down, ONE says how long", async () => {
  const { page } = await openChat();
  await page.evaluate(() => (window.__tgFake.fail.send = { code: "FLOOD_WAIT", seconds: 30 }));
  await box(page).fill("Hi");
  await box(page).press("Enter");
  await page.getByText("Telegram asks you to wait 30 seconds.").waitFor();
  await page.close();
});

test("No reply needed clears the chat until they write again", async () => {
  const { page } = await openChat();
  await page.getByRole("button", { name: "No reply needed" }).click();
  await page.waitForFunction(() => document.querySelector('.dock__tab[data-route="telegram"] .dock__badge')?.getAttribute("aria-label") === "1 waiting");
  const handled = await page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")).settings.telegram.chats["11"].handled);
  assert.equal(handled, 60);
  await page.evaluate(() => window.__tgFake.push({ type: "message", message: { id: 61, chatId: "11", out: false, date: Date.now(), text: "Hello??", replyToId: null, media: null } }));
  await page.waitForFunction(() => document.querySelector('.dock__tab[data-route="telegram"] .dock__badge')?.getAttribute("aria-label") === "2 waiting");
  await page.close();
});

test("a message arriving while the chat is open shows at once, and typing… shows and goes", async () => {
  const { page } = await openChat();
  await page.evaluate(() => window.__tgFake.push({ type: "typing", chatId: "11" }));
  await page.locator(".tg-chat__status", { hasText: "typing…" }).waitFor();
  await page.evaluate(() => window.__tgFake.push({ type: "message", message: { id: 61, chatId: "11", out: false, date: Date.now(), text: "Still there?", replyToId: null, media: null } }));
  await page.locator('.tg-msg[data-id="61"]').waitFor();
  assert.equal(await page.locator(".tg-chat__status", { hasText: "typing…" }).count(), 0);
  assert.equal(await page.evaluate(() => window.__oneTelegram.getState().waiting.some((w) => w.id === "11")), true);
  await page.evaluate(() => window.__tgFake.push({ type: "typing", chatId: "11" }));
  await page.locator(".tg-chat__status", { hasText: "typing…" }).waitFor();
  await page.locator(".tg-chat__status", { hasText: "typing…" }).waitFor({ state: "detached", timeout: 9000 });
  await page.close();
});

test("the header: last seen, the level, and Open in Telegram", async () => {
  const { page } = await openChat("12");
  await page.locator(".tg-chat__status", { hasText: "last seen 5 min ago" }).waitFor();
  assert.equal(await page.locator(".tg-chat__head").getByRole("link", { name: "Open in Telegram" }).getAttribute("href"), "tg://user?id=12");
  await page.getByLabel("Level", { exact: true }).selectOption("high");
  await page.waitForFunction(() => window.__oneTelegram.getState().waiting.find((w) => w.id === "12")?.current === "high");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("one.workspace.v1")).settings.telegram.chats["12"].level), "high");
  await page.close();
});

test("a lost connection shows Reconnecting…", async () => {
  const { page } = await openChat();
  await page.evaluate(() => window.__tgFake.push({ type: "connection", state: "connecting" }));
  await page.getByText("Reconnecting…").waitFor();
  await page.evaluate(() => window.__tgFake.push({ type: "connection", state: "connected" }));
  await page.getByText("Reconnecting…").waitFor({ state: "detached" });
  await page.close();
});

// ---------- Home ----------
const card = (page) => page.locator(".tg-home");
function homeSeed({ extra = 0 } = {}) {
  const s = seed();
  s.messages["13"].push(msg("13", 3, false, 1 * H, "Are we still on?"));
  s.chats.find((c) => c.id === "13").lastMessage = s.messages["13"][2];
  const chats = { ...PREFS.telegram.chats };
  for (let i = 0; i < extra; i++) {
    const id = String(20 + i);
    s.messages[id] = [msg(id, 1, false, (10 + i) * MIN, "hi")];
    s.chats.push({ id, name: `Friend ${i + 1}`, username: null, lastMessage: s.messages[id][0], unread: 1, readOutboxMaxId: 0 });
    chats[id] = { level: "low", name: `Friend ${i + 1}` };
  }
  return { telegram: { seed: s, device: true }, settings: { telegram: { chats, limits: { normal: 180, low: 720 } } } };
}

test("Home: who has written, and whom to answer first", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home", ...homeSeed() });
  await card(page).getByText("You have messages from").waitFor({ timeout: 10000 });
  assert.equal((await card(page).locator(".tg-home__who").textContent()).trim(), "You have messages from Aziz, Mom and Dilnoza.");
  assert.equal((await card(page).locator(".tg-home__first").textContent()).trim(), "Answer Aziz first: waiting 5 h. Then Mom, then Dilnoza.");
  assert.equal(await card(page).getByRole("button", { name: "Aziz" }).first().locator(".tg-dot--high").count(), 1);
  await card(page).getByRole("button", { name: "Mom" }).first().click();
  await page.waitForFunction(() => location.hash === "#telegram/12");
  await page.locator(".tg-pane").getByRole("heading", { name: "Mom" }).waitFor();
  assert.deepEqual(errors, []);
  await page.close();
});

test("Home: more than three people waiting", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", ...homeSeed({ extra: 2 }) });
  await card(page).getByText("You have messages from").waitFor({ timeout: 10000 });
  assert.equal((await card(page).locator(".tg-home__who").textContent()).trim(), "You have messages from Aziz, Mom, Dilnoza and 2 more.");
  await page.close();
});

test("Home: a chat that moved up says why", async () => {
  const s = homeSeed();
  s.telegram.seed.messages["13"] = [msg("13", 1, false, 13 * H, "Ping")];
  s.settings.telegram.chats = { "13": { level: "low", name: "Dilnoza" } };
  const { page } = await openApp(browser, server.url, { route: "home", ...s });
  await card(page).getByText("You have messages from").waitFor({ timeout: 10000 });
  assert.equal((await card(page).locator(".tg-home__first").textContent()).trim(), "Answer Dilnoza first: waiting 13 h, moved up from Low.");
  await page.close();
});

test("Home: all caught up", async () => {
  const s = homeSeed();
  s.settings.telegram.chats = { "13": { level: "low", name: "Dilnoza" } };
  s.telegram.seed.messages["13"] = [msg("13", 1, false, 3 * H), msg("13", 2, true, 2 * H)];
  const { page } = await openApp(browser, server.url, { route: "home", ...s });
  await card(page).getByText("All caught up on Telegram.").waitFor({ timeout: 10000 });
  await page.close();
});

test("Home: when Telegram can't be reached, the last list shows with a note", async () => {
  const cached = { waiting: [{ id: "11", name: "Aziz", level: "high", current: "high", waitedMs: 5 * H, movedFrom: null }], at: Date.now() - 10 * MIN };
  const { page } = await openApp(browser, server.url, {
    route: "home",
    ...homeSeed(),
    init: (p) =>
      p.addInitScript((c) => {
        localStorage.setItem("one.telegram.cache.v1", JSON.stringify(c));
        window.__tgFake.fail.connect = { code: "NETWORK" };
      }, cached)
  });
  await card(page).getByText("Telegram isn't reachable right now.").waitFor({ timeout: 10000 });
  assert.equal((await card(page).locator(".tg-home__who").textContent()).trim(), "You have messages from Aziz.");
  await page.close();
});

test("Home: no card without a Telegram login", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", telegram: { seed: seed() }, settings: PREFS });
  await page.locator(".meadow-hero").waitFor();
  await page.waitForTimeout(2500);
  assert.equal(await card(page).count(), 0);
  await page.close();
});
