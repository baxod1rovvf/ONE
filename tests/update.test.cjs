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

const FILES = ["/index.html", "/games/games.js", "/games/games.css", "/manifest.webmanifest"];
const local = (...parts) => new Date(...parts).getTime();

// Serves the four app files fresh (marked with x-one-fresh) and counts them.
// fail(path) may return a status to answer with, or "abort".
async function watchUpdates(page, { fail } = {}) {
  const seen = [];
  await page.route((url) => FILES.includes(url.pathname) && url.href.startsWith(server.url), async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (!req.headers()["x-one-fresh"]) return route.fallback();
    seen.push(path);
    const how = fail && fail(path);
    if (how === "abort") return route.abort();
    if (how) return route.fulfill({ status: how, body: "nope" });
    return route.fulfill({ status: 200, body: `fresh ${path}`, contentType: "text/plain" });
  });
  return seen;
}
// Counts reloads of the page after the first load.
function countReloads(page) {
  const box = { n: 0 };
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) box.n++;
  });
  return box;
}
const setLast = (page, ms) => page.evaluate((ms) => localStorage.setItem("one.update.v1", JSON.stringify({ last: ms })), ms);

test("lastDailyBoundary picks the latest 23:59", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks" });
  const r = await page.evaluate(() => {
    const f = window.__oneUpdate.lastDailyBoundary;
    return [f(new Date(2026, 9, 29, 10, 0).getTime()), f(new Date(2026, 9, 29, 23, 59, 30).getTime()), f(new Date(2026, 9, 30, 0, 0).getTime())];
  });
  assert.deepEqual(r, [local(2026, 9, 28, 23, 59), local(2026, 9, 29, 23, 59), local(2026, 9, 29, 23, 59)]);
  await page.close();
});

test("Refresh fetches fresh files, saves them and reloads", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", init: (p) => setLast(p, Date.now()) });
  const seen = await watchUpdates(page);
  const reloads = countReloads(page);
  await page.getByRole("button", { name: "Refresh" }).click();
  await page.waitForFunction(() => true);
  await page.waitForEvent("framenavigated", { timeout: 6000 });
  assert.deepEqual([...seen].sort(), [...FILES].sort());
  assert.equal(reloads.n, 1);
  const saved = await page.evaluate(async () => {
    const cache = await caches.open("one-v7");
    const read = async (p) => {
      const hit = await cache.match(new URL(p, location.href).href);
      return hit && (await hit.text());
    };
    return [await read("./index.html"), await read("./games/games.js"), await read("./")];
  });
  assert.deepEqual(saved, ["fresh /index.html", "fresh /games/games.js", "fresh /index.html"]);
  await page.close();
});

test("Refresh offline shows the message and stays on the page", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", init: (p) => setLast(p, Date.now()) });
  await watchUpdates(page, { fail: () => "abort" });
  const reloads = countReloads(page);
  const button = page.getByRole("button", { name: "Refresh" });
  await button.click();
  await page.getByText("Couldn't reach ONE. You're still on the saved version.").waitFor();
  await page.waitForTimeout(1000);
  assert.equal(reloads.n, 0);
  assert.equal(await button.getAttribute("data-busy"), null);
  await page.close();
});

test("a half-failed update saves nothing", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", init: (p) => setLast(p, Date.now()) });
  await watchUpdates(page, { fail: (p) => (p === "/index.html" ? 500 : 0) });
  const r = await page.evaluate(async () => {
    const key = (p) => new URL(p, location.href).href;
    // Start from a clean saved copy (the helper's warm-up visit may have saved one).
    await caches.delete("one-v7");
    const cache = await caches.open("one-v7");
    await cache.put(key("./index.html"), new Response("old"));
    const result = await window.__oneUpdate.updateApp().then(() => "ok", () => "failed");
    const index = await (await cache.match(key("./index.html"))).text();
    const games = await cache.match(key("./games/games.js"));
    return { result, index, games: !!games };
  });
  assert.deepEqual(r, { result: "failed", index: "old", games: false });
  await page.close();
});

test("two Refresh presses make one update and one reload", async () => {
  const { page } = await openApp(browser, server.url, { route: "tasks", init: (p) => setLast(p, Date.now()) });
  const seen = await watchUpdates(page);
  const reloads = countReloads(page);
  await page.getByRole("button", { name: "Refresh" }).dblclick();
  await page.waitForEvent("framenavigated", { timeout: 6000 });
  await page.waitForTimeout(800);
  assert.equal(seen.length, 4);
  assert.equal(reloads.n, 1);
  await page.close();
});

test("opening after a missed 23:59 updates once, with no reload", async () => {
  let seen;
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: async (p) => {
      await p.clock.install({ time: new Date(2026, 9, 29, 9, 0) });
      await setLast(p, local(2026, 9, 27, 12, 0));
      seen = await watchUpdates(p);
    }
  });
  const reloads = countReloads(page);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.update.v1")).last >= new Date(2026, 9, 29, 9, 0).getTime(), null, { timeout: 6000 });
  await page.waitForTimeout(500);
  assert.equal(seen.length, 4);
  assert.equal(reloads.n, 0);
  await page.close();
});

test("no update when today's is already done", async () => {
  let seen;
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: async (p) => {
      await p.clock.install({ time: new Date(2026, 9, 29, 9, 0) });
      await setLast(p, local(2026, 9, 29, 0, 30));
      seen = await watchUpdates(p);
    }
  });
  await page.waitForTimeout(4000);
  assert.equal(seen.length, 0);
  await page.close();
});

test("the 23:59 timer updates while ONE is open, without reloading", async () => {
  let seen;
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: async (p) => {
      await p.clock.install({ time: new Date(2026, 9, 29, 23, 58, 0) });
      await setLast(p, local(2026, 9, 29, 0, 30));
      seen = await watchUpdates(p);
    }
  });
  const reloads = countReloads(page);
  await page.waitForTimeout(500);
  assert.equal(seen.length, 0, "nothing before 23:59");
  await page.clock.runFor(70_000);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("one.update.v1")).last >= new Date(2026, 9, 29, 23, 59).getTime(), null, { timeout: 6000 });
  assert.equal(seen.length, 4);
  assert.equal(reloads.n, 0);
  await page.close();
});

test("hidden through 23:59, then visible again, updates once", async () => {
  let seen;
  const { page } = await openApp(browser, server.url, {
    route: "tasks",
    init: async (p) => {
      await p.clock.install({ time: new Date(2026, 9, 29, 23, 58, 0) });
      await setLast(p, local(2026, 9, 29, 0, 30));
      seen = await watchUpdates(p);
    }
  });
  const setVisible = (visible) =>
    page.evaluate((visible) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (visible ? "visible" : "hidden") });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => !visible });
      document.dispatchEvent(new Event("visibilitychange"));
    }, visible);
  await setVisible(false);
  await page.clock.runFor(70_000);
  await setVisible(true);
  await page.waitForTimeout(1500);
  assert.equal(seen.length, 4);
  await page.close();
});
