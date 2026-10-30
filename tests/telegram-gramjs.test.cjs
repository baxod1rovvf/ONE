const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

test("the GramJS bundle builds a client in a browser", async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${server.url}/__blank`);
  await page.addScriptTag({ url: `${server.url}/pages/telegram/gramjs-2.26.22.js` });
  const r = await page.evaluate(() => {
    const { TelegramClient, StringSession, Api } = window.GramJS;
    const client = new TelegramClient(new StringSession(""), 1, "0".repeat(32), { useWSS: true });
    return { connect: typeof client.connect, send: typeof Api.messages.SendMessage, session: client.session.save() };
  });
  assert.deepEqual(r, { connect: "function", send: "function", session: "" });
  assert.deepEqual(errors, []);
  await page.close();
});

// Connecting must get as far as the network (unreachable in tests); a crash
// inside GramJS before that (as when its crypto was wired wrong) is a bug.
test("connecting reaches the network step without crashing", async () => {
  const page = await browser.newPage();
  await page.goto(`${server.url}/__blank`);
  await page.addScriptTag({ url: `${server.url}/pages/telegram/gramjs-2.26.22.js` });
  const r = await page.evaluate(async () => {
    const { TelegramClient, StringSession } = window.GramJS;
    const client = new TelegramClient(new StringSession(""), 1, "0".repeat(32), { connectionRetries: 1, useWSS: true });
    try {
      await Promise.race([client.connect(), new Promise((resolve) => setTimeout(resolve, 8000))]);
      return "ok";
    } catch (e) {
      return `${e && e.name}: ${e && e.message}`;
    } finally {
      client.disconnect().catch(() => {});
    }
  });
  assert.doesNotMatch(String(r), /TypeError|ReferenceError|Cannot read properties|is not a function/);
  await page.close();
});
