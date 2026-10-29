const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, waitForGames, loadGame } = require("./helpers.cjs");

let server, browser, rules;
before(async () => {
  server = await startServer();
  browser = await launch();
  rules = await openApp(browser, server.url, { route: "home" });
  await loadGame(rules.page, "memory");
});
after(async () => {
  await rules.page.close();
  await browser.close();
  await server.close();
});

const inPage = (fn, arg) => rules.page.evaluate(({ src, arg }) => new Function("G", "arg", `return (${src})(G, arg);`)(window.__oneMemory, arg), { src: fn.toString(), arg });

test("the sequence grows by one each round and keeps its start", async () => {
  const r = await inPage((G) => {
    let s = G.memNew(4, 7);
    const seqs = [];
    for (let i = 0; i < 5; i++) {
      s = G.memNextRound(s);
      seqs.push([...s.sequence]);
    }
    return { seqs, round: s.round, step: s.step, status: s.status, inRange: seqs[4].every((v) => v >= 0 && v < 4) };
  });
  r.seqs.forEach((seq, i) => {
    assert.equal(seq.length, i + 1);
    assert.deepEqual(seq.slice(0, i), r.seqs[Math.max(0, i - 1)].slice(0, i));
  });
  assert.deepEqual([r.round, r.step, r.status, r.inRange], [5, 0, "watch", true]);
  const six = await inPage((G) => {
    let s = G.memNew(6, 3);
    for (let i = 0; i < 60; i++) s = G.memNextRound(s);
    return [Math.min(...s.sequence), Math.max(...s.sequence)];
  });
  assert.deepEqual(six, [0, 5]);
});

test("a wrong press ends the game; presses outside input are ignored", async () => {
  const r = await inPage((G) => {
    let s = G.memNextRound(G.memNextRound(G.memNew(4, 7)));
    const ignored = G.memPress(s, s.sequence[0]);
    s = { ...s, status: "input" };
    s = G.memPress(s, s.sequence[0]);
    const afterOne = { step: s.step, status: s.status };
    const done = G.memPress(s, s.sequence[1]);
    const wrongI = (s.sequence[1] + 1) % 4;
    const wrong = G.memPress(s, wrongI);
    return { ignoredStep: ignored.step, ignoredStatus: ignored.status, afterOne, done: { status: done.status, score: done.score }, wrong: { status: wrong.status, wrong: wrong.wrong, score: wrong.score }, wrongI, expected: s.sequence[1] };
  });
  assert.deepEqual([r.ignoredStep, r.ignoredStatus], [0, "watch"]);
  assert.deepEqual(r.afterOne, { step: 1, status: "input" });
  assert.deepEqual(r.done, { status: "done", score: 2 });
  assert.deepEqual(r.wrong, { status: "over", wrong: { pressed: r.wrongI, expected: r.expected }, score: 0 });
});

test("playback speeds up and stops at 300 ms", async () => {
  const r = await inPage((G) => [1, 11, 16, 40].map(G.memStepMs));
  assert.deepEqual(r, [600, 400, 300, 300]);
});

// The screen.
async function openMemory(page, seams = {}) {
  await waitForGames(page);
  await page.evaluate((seams) => Object.assign(window, seams), seams);
  // Every slice that lights up is recorded, in order.
  await page.evaluate(() => {
    window.__lit = [];
    new MutationObserver((list) => {
      for (const m of list) if (m.target.getAttribute("data-lit") === "true") window.__lit.push(Number(m.target.dataset.i));
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-lit"] });
  });
  await page.locator(".meadow-controls").getByRole("button", { name: "Games" }).click();
  await page.getByRole("dialog", { name: "Retro games" }).getByRole("button", { name: /Memory/ }).click();
  const game = page.getByRole("dialog", { name: "Memory" });
  await game.waitFor();
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("snake-play"));
  return game;
}
const status = (page) => page.locator(".mem").getAttribute("data-status");
const waitStatus = (page, s) => page.waitForFunction((s) => document.querySelector(".mem").dataset.status === s, s, { timeout: 8000 });
const seq = (page) => page.evaluate(() => window.__oneMemoryControl.state().sequence);
// Waits for the player's turn and repeats the sequence with the number keys.
async function repeat(page) {
  await waitStatus(page, "input");
  for (const i of await seq(page)) await page.keyboard.press(String(i + 1));
}

test("4 and 6 colour modes with number keys", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openMemory(page, { __oneMemorySeed: 3 });
  assert.equal(await page.locator(".mem-slice").count(), 4);
  await game.getByRole("radio", { name: "6 colours" }).click();
  assert.equal(await page.locator(".mem-slice").count(), 6);
  const names = await page.locator(".mem-slice").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  assert.deepEqual(names, ["Green", "Red", "Yellow", "Blue", "Purple", "Orange"]);
  // Key 1 is the top-left slice; the rest follow clockwise.
  const centre = await page.locator(".mem-round").boundingBox();
  const first = await page.locator(".mem-slice[data-i='0']").boundingBox();
  assert.ok(first.x + first.width / 2 < centre.x + centre.width / 2 && first.y + first.height / 2 < centre.y + centre.height / 2, "slice 1 is top-left");
  await game.getByRole("button", { name: "Play" }).click();
  await waitStatus(page, "input");
  const lit = await page.evaluate(() => window.__lit);
  assert.deepEqual(lit, await seq(page), "the lit order is the sequence");
  for (const i of lit) await page.keyboard.press(String(i + 1));
  await page.waitForFunction(() => document.querySelector("[data-testid=mem-score]").textContent === "1");
  await page.waitForFunction(() => document.querySelector(".mem-round").textContent === "2");
  assert.deepEqual(errors, []);
  await page.close();
});

test("taps during playback are ignored and pause replays from the start", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openMemory(page, { __oneMemorySeed: 5 });
  await game.getByRole("button", { name: "Play" }).click();
  await repeat(page);
  // Round 2 plays back: a tap now does nothing.
  await waitStatus(page, "watch");
  await page.evaluate(() => (window.__lit = []));
  await game.getByRole("button", { name: "Green" }).click();
  assert.equal(await status(page), "watch");
  assert.equal(await game.getByTestId("mem-score").textContent(), "1");
  await page.waitForFunction(() => window.__lit.length >= 1);
  await page.keyboard.press("p");
  assert.equal(await status(page), "paused");
  await page.evaluate(() => (window.__lit = []));
  await page.keyboard.press("p");
  await page.waitForFunction(() => window.__lit.length >= 1);
  const s = await seq(page);
  assert.equal(s.length, 2);
  assert.equal(await page.evaluate(() => window.__lit[0]), s[0]);
  await waitStatus(page, "input");
  assert.deepEqual(await page.evaluate(() => window.__lit), s, "the whole sequence plays again");
  assert.deepEqual(errors, []);
  await page.close();
});

test("a wrong press shows the message and keeps the best score per mode", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openMemory(page, { __oneMemorySeed: 3 });
  await game.getByRole("radio", { name: "6 colours" }).click();
  await game.getByRole("button", { name: "Play" }).click();
  await repeat(page);
  await waitStatus(page, "input");
  const [first] = await seq(page);
  await page.keyboard.press(String(((first + 1) % 6) + 1));
  await game.getByText("Wrong colour! You reached round 2.").waitFor();
  assert.ok(await game.getByText("🏆 New record!").isVisible());
  // The right slice flashes.
  assert.equal(await page.locator(`.mem-slice[data-i='${first}']`).getAttribute("data-right"), "true");
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")));
  assert.equal(records["memory-6"].best, 1);
  assert.equal(records["memory-4"], undefined);
  assert.equal(await game.getByTestId("mem-best").textContent(), "1");
  await game.getByRole("radio", { name: "4 colours" }).click();
  assert.equal(await game.getByTestId("mem-best").textContent(), "0");
  assert.deepEqual(errors, []);
  await page.close();
});

for (const viewport of [{ width: 375, height: 740 }, { width: 320, height: 568 }, { width: 740, height: 375 }]) {
  test(`fits phones (${viewport.width}×${viewport.height})`, async () => {
    const { page, errors } = await openApp(browser, server.url, { route: "home", viewport, hasTouch: true });
    const game = await openMemory(page);
    await game.getByRole("radio", { name: "6 colours" }).click();
    await game.getByRole("button", { name: "Play" }).click();
    const circle = await page.locator(".mem-circle").boundingBox();
    assert.ok(circle.width >= 200, `circle ${circle.width}px`);
    assert.ok(circle.x >= 0 && circle.y >= 0 && circle.x + circle.width <= viewport.width && circle.y + circle.height <= viewport.height, JSON.stringify(circle));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

test("leaving during playback raises no errors", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openMemory(page, { __oneMemorySeed: 3 });
  await game.getByRole("button", { name: "Play" }).click();
  await waitStatus(page, "watch");
  await page.getByRole("button", { name: "All games" }).click();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.__oneMemoryControl), undefined);
  assert.notEqual(await page.evaluate(() => window.__oneActiveGame), "memory");
  assert.deepEqual(errors, []);
  await page.close();
});
