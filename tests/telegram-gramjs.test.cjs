const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch } = require("./helpers.cjs");
// The bundle's name carries a fingerprint (see the last test).
const BUNDLE = require("node:fs").readdirSync(require("node:path").join(__dirname, "..", "pages", "telegram")).find((f) => f.startsWith("gramjs-"));

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
  await page.addScriptTag({ url: `${server.url}/pages/telegram/${BUNDLE}` });
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
  await page.addScriptTag({ url: `${server.url}/pages/telegram/${BUNDLE}` });
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

// ONE keeps app files on the device and treats a name as never changing, so
// the bundle's name carries a fingerprint of its contents: a rebuilt bundle
// always gets a new name, and devices fetch it fresh.
test("the bundle's file name carries a fingerprint of its contents", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const dir = path.join(__dirname, "..", "pages", "telegram");
  const bundles = fs.readdirSync(dir).filter((f) => f.startsWith("gramjs-"));
  assert.equal(bundles.length, 1, `one bundle: ${bundles}`);
  const m = /^gramjs-\d+\.\d+\.\d+\.([0-9a-f]{10})\.js$/.exec(bundles[0]);
  assert.ok(m, bundles[0]);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, bundles[0]))).digest("hex").slice(0, 10);
  assert.equal(m[1], hash);
  assert.ok(fs.readFileSync(path.join(dir, "client.js"), "utf8").includes(`"pages/telegram/${bundles[0]}"`), "client.js loads it");
});
