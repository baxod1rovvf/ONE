const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, waitForGames, loadGame } = require("./helpers.cjs");

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.close();
});

async function openSnake(page) {
  await page.locator(".meadow-controls").getByRole("button", { name: "Games" }).click();
  const dialog = page.getByRole("dialog", { name: "Retro games" });
  await dialog.getByRole("button", { name: /Snake/ }).click();
  // The game is listening for keys once its Play button has taken focus.
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("snake-play"));
  return page.getByRole("dialog", { name: "Snake" });
}

test("Snake rules: walls and the tail end the game, fruit grows it", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  await loadGame(page, "snake");
  const r = await page.evaluate(() => {
    const { snakeNew, snakeStep } = window.__oneSnake;
    const zero = () => 0;
    const play = (s) => ({ ...s, status: "playing" });
    // Wall: from (4,5) heading right, the sixth move leaves the field.
    let s = play({ ...snakeNew(zero), food: null });
    let moves = 0;
    while (s.status === "playing") {
      s = snakeStep(s);
      moves++;
    }
    const wall = { status: s.status, crash: s.crash, moves };
    // Reversing is ignored.
    const rev = snakeStep(play({ ...snakeNew(zero), food: null }), "left");
    // Fruit right ahead: grow by one and score its points.
    const fed = snakeStep(play({ ...snakeNew(zero), food: { x: 5, y: 5, fruit: "cherry" } }), "right", zero);
    // Tail: a 5-long snake turning into itself.
    const body = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }, { x: 2, y: 4 }];
    const bitten = snakeStep({ snake: body, dir: "left", food: null, score: 0, eaten: 0, status: "playing" }, "down");
    // Chasing the tail is fine: it moves out of the way.
    const loop = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
    const chase = snakeStep({ snake: loop, dir: "left", food: null, score: 0, eaten: 0, status: "playing" }, "down");
    return { wall, rev: rev.snake[0], fed: { len: fed.snake.length, score: fed.score, food: !!fed.food }, bitten: [bitten.status, bitten.crash], chase: chase.status };
  });
  assert.deepEqual(r.wall, { status: "over", crash: "wall", moves: 6 });
  assert.deepEqual(r.rev, { x: 5, y: 5 });
  assert.deepEqual(r.fed, { len: 4, score: 5, food: true });
  assert.deepEqual(r.bitten, ["over", "tail"]);
  assert.equal(r.chase, "playing");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Snake plays on a 10×10 field with fruit, and keeps the best score", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const snake = await openSnake(page);
  assert.equal(await snake.locator(".snake-cell").count(), 100);
  assert.equal(await snake.locator(".snake-fruit").count(), 1);
  assert.equal(await snake.getByTestId("snake-best").textContent(), "0");
  // Fruit lands straight ahead (a banana at 6,5), so the snake eats it and then hits the wall.
  await page.evaluate(() => (Math.random = () => 0.55));
  await snake.getByRole("button", { name: "Play" }).click();
  await page.waitForFunction(() => document.querySelector(".snake").dataset.status === "over", null, { timeout: 8000 });
  assert.equal(await snake.getByTestId("snake-score").textContent(), "2");
  assert.equal(await snake.getByTestId("snake-best").textContent(), "2");
  assert.ok(await snake.getByText("New record!").isVisible());
  assert.ok(await snake.getByText("Bonk! A wall.").isVisible());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")).snake.best), 2);
  // The same score again is not a new record.
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector(".snake").dataset.status === "playing");
  await page.waitForFunction(() => document.querySelector(".snake").dataset.status === "over", null, { timeout: 8000 });
  assert.equal(await snake.getByText("New record!").count(), 0);
  // Esc goes back to the list, which shows the record; Esc again closes.
  await page.keyboard.press("Escape");
  const list = page.getByRole("dialog", { name: "Retro games" });
  assert.ok(await list.getByText("Best 2").isVisible());
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".games").count(), 0);
  assert.deepEqual(errors, []);
  await page.close();
});

test("arrow keys steer and Space pauses", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openSnake(page);
  await page.keyboard.press("ArrowUp");
  await page.waitForFunction(() => document.querySelector(".snake-board").dataset.head === "4,4");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector(".snake").dataset.status === "paused");
  const head = await page.locator(".snake-board").getAttribute("data-head");
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".snake-board").getAttribute("data-head"), head);
  await page.close();
});

test("Snake fits a phone screen", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home", viewport: { width: 375, height: 740 }, hasTouch: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const snake = await openSnake(page);
  const board = await snake.locator(".snake-board").boundingBox();
  assert.ok(board.x >= 0 && board.x + board.width <= 375, "board inside the screen");
  assert.ok(board.width >= 240, `board is big (${board.width}px)`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 375), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test("Snake plays retro sounds and remembers the mute choice", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const snake = await openSnake(page);
  await page.evaluate(() => (Math.random = () => 0.55));
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector(".snake").dataset.status === "over", null, { timeout: 8000 });
  await page.waitForFunction(() => window.__oneRetroSound.played.includes("record"));
  assert.deepEqual(await page.evaluate(() => window.__oneRetroSound.played), ["start", "eat", "over", "record"]);
  assert.ok(await page.evaluate(() => window.__oneRetroSound.ctx && window.__oneRetroSound.ctx.state !== "closed"), "made sound");
  const mute = snake.getByRole("button", { name: "Game sounds" });
  assert.equal(await mute.getAttribute("aria-pressed"), "true");
  await mute.click();
  assert.equal(await mute.getAttribute("aria-pressed"), "false");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")).sound), false);
  await page.keyboard.press("m");
  assert.equal(await mute.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("m");
  await page.reload();
  const again = await openSnake(page);
  assert.equal(await again.getByRole("button", { name: "Game sounds" }).getAttribute("aria-pressed"), "false");
  assert.deepEqual(errors, []);
  await page.close();
});

test("the snake is one smooth body that glides between squares", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const snake = await openSnake(page);
  assert.equal(await snake.locator(".snake-layer [data-body]").count(), 3);
  await page.keyboard.press("Space");
  // Sample the drawn head for a while: it passes through in-between positions.
  const xs = await page.evaluate(async () => {
    const out = [];
    const face = document.querySelector(".snake-face");
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      out.push(Number(/translate\(([\d.]+)/.exec(face.getAttribute("transform"))[1]));
    }
    return out;
  });
  const between = xs.filter((x) => Math.abs(x - Math.round(x - 0.5) - 0.5) > 0.1);
  assert.ok(between.length > 5, `head glides (${xs.join(", ")})`);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1], "head only moves forward");
  // The body line runs from the head back to the tail.
  const d = await snake.locator(".snake-line--skin").getAttribute("d");
  assert.match(d, /^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+){2,}$/);
  assert.deepEqual(errors, []);
  await page.close();
});
