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
