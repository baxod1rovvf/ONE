const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, waitForGames, loadGame } = require("./helpers.cjs");

let server, browser, rules;
before(async () => {
  server = await startServer();
  browser = await launch();
  rules = await openApp(browser, server.url, { route: "home" });
  await loadGame(rules.page, "2048");
});
after(async () => {
  await rules.page.close();
  await browser.close();
  await server.close();
});

const inPage = (fn, arg) => rules.page.evaluate(({ src, arg }) => new Function("G", "arg", `return (${src})(G, arg);`)(window.__one2048, arg), { src: fn.toString(), arg });

test("a row merges each tile once", async () => {
  const r = await inPage((G) => {
    const row = (cells) => {
      const s = G.t48FromCells([cells, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 1);
      const out = G.t48Move(s, "left");
      return { row: G.t48Cells(out.state)[0].map((v, i) => (i < 4 ? v : v)), gained: out.gained };
    };
    return [row([2, 2, 2, 2]), row([2, 2, 4, 0]), row([4, 0, 0, 4])];
  });
  assert.deepEqual(r[0].row.slice(0, 2), [4, 4]);
  assert.equal(r[0].gained, 8);
  assert.deepEqual(r[1].row.slice(0, 2), [4, 4]);
  assert.equal(r[1].gained, 4);
  assert.deepEqual(r[2].row.slice(0, 1), [8]);
});

test("only a real move adds a tile, a 2 or a 4", async () => {
  const r = await inPage((G) => {
    const s = G.t48FromCells([[2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 3);
    const still = G.t48Move(s, "left");
    const moved = G.t48Move(s, "right");
    const count = (st) => G.t48Cells(st).flat().filter(Boolean).length;
    const added = G.t48Cells(moved.state).flat().filter((v, i) => v && ![3, 7].includes(i));
    return { stillMoved: still.moved, stillCount: count(still.state), movedCount: count(moved.state), added };
  });
  assert.equal(r.stillMoved, false);
  assert.equal(r.stillCount, 2);
  assert.equal(r.movedCount, 3);
  assert.ok(r.added.length === 1 && [2, 4].includes(r.added[0]), JSON.stringify(r.added));
});

test("2048 wins once; Keep going continues without the card again", async () => {
  const r = await inPage((G) => {
    let s = G.t48FromCells([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 1);
    s = G.t48Move(s, "left").state;
    const won = s.won;
    s = G.t48Keep(s);
    return { won, kept: s.kept, showCard: G.t48ShowWin(s) };
  });
  assert.deepEqual(r, { won: true, kept: true, showCard: false });
});

test("a full board with one merge left is not over", async () => {
  const r = await inPage((G) => {
    const one = G.t48FromCells([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 4]], 1);
    const none = G.t48FromCells([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]], 1);
    const after = G.t48Move(one, "left");
    return { one: G.t48CanMove(one), none: G.t48CanMove(none), moved: after.moved };
  });
  assert.deepEqual(r, { one: true, none: false, moved: true });
});

test("Undo restores the board and score once", async () => {
  const r = await inPage((G) => {
    const s0 = G.t48FromCells([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], 5);
    const s1 = G.t48Move(s0, "left").state;
    const back = G.t48Undo(s1);
    const again = G.t48Undo(back);
    return { score1: s1.score, backCells: G.t48Cells(back)[0], backScore: back.score, again: again === back, canUndo: !!back.undo };
  });
  assert.equal(r.score1, 4);
  assert.deepEqual(r.backCells, [2, 2, 0, 0]);
  assert.equal(r.backScore, 0);
  assert.equal(r.again, true);
  assert.equal(r.canUndo, false);
});

// ---------- On screen ----------

async function open2048(page, seams = {}) {
  await waitForGames(page);
  await page.evaluate((seams) => Object.assign(window, seams), seams);
  await page.locator(".meadow-controls").getByRole("button", { name: "Games" }).click();
  await page.getByRole("dialog", { name: "Retro games" }).getByRole("button", { name: /2048/ }).click();
  const game = page.getByRole("dialog", { name: "2048" });
  await game.waitFor();
  return game;
}

test("each size keeps its own best score, updated as you score", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await open2048(page, { __one2048Seed: 2, __one2048Cells: [[2, 2, 0], [0, 0, 0], [0, 0, 0]] });
  await game.getByRole("radio", { name: "3×3" }).click();
  await game.getByRole("button", { name: "Play" }).click();
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.querySelector("[data-testid=g48-score]").textContent === "4");
  assert.equal(await game.getByTestId("g48-best").textContent(), "4");
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")));
  assert.equal(records["2048-3"].best, 4);
  assert.equal(records["2048-4"], undefined);
  assert.deepEqual(errors, []);
  await page.close();
});

test("a board with no moves left is game over", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const game = await open2048(page, { __one2048Seed: 2, __one2048Cells: [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]] });
  await game.getByRole("button", { name: "Play" }).click();
  await page.waitForFunction(() => document.querySelector(".g48").dataset.status === "over", null, { timeout: 4000 });
  assert.ok(await game.getByText("Game over").isVisible());
  assert.ok(await game.getByRole("button", { name: "Play again" }).isVisible());
  await page.close();
});

test("keys and swipes move the tiles", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", hasTouch: true });
  const game = await open2048(page, { __one2048Seed: 4, __one2048Cells: [[0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
  await game.getByRole("button", { name: "Play" }).click();
  const col = () => page.evaluate(() => document.querySelector(".g48-tile[data-value='2'][data-r='0']") && document.querySelector(".g48-tile[data-value='2'][data-r='0']").dataset.c);
  await page.keyboard.press("ArrowLeft");
  assert.equal(await col(), "0");
  const box = await game.locator(".g48-board").boundingBox();
  await page.evaluate(({ x0, x1, y }) => {
    const board = document.querySelector(".g48-board");
    board.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", clientX: x0, clientY: y, bubbles: true }));
    board.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", clientX: x1, clientY: y, bubbles: true }));
  }, { x0: box.x + 40, x1: box.x + box.width - 20, y: box.y + 30 });
  // The swipe moved the tile right; a third tile appears only after a real move.
  await page.waitForFunction(() => document.querySelectorAll(".g48-tile").length === 3 || document.querySelector("[data-testid=g48-score]").textContent !== "0");
  assert.ok(await game.getByRole("button", { name: "Undo" }).isEnabled());
  await page.close();
});

test("2048 fits phones and never scrolls sideways", async () => {
  for (const [width, height] of [[375, 740], [740, 375], [320, 568]]) {
    const { page } = await openApp(browser, server.url, { route: "home", viewport: { width, height }, hasTouch: true });
    const game = await open2048(page, { __one2048Seed: 4 });
    await game.getByRole("button", { name: "Play" }).click();
    const box = await game.locator(".g48-board").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height + 1, `${width}×${height} ${JSON.stringify(box)}`);
    assert.equal(await page.evaluate(() => document.querySelector(".games").scrollWidth <= document.querySelector(".games").clientWidth), true);
    await page.close();
  }
});

test("leaving mid-slide raises no errors", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await open2048(page, { __one2048Seed: 4 });
  await game.getByRole("button", { name: "Play" }).click();
  await page.keyboard.press("ArrowLeft");
  await page.getByRole("button", { name: "All games" }).click();
  await page.waitForTimeout(500);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.__oneActiveGame), undefined);
  await page.close();
});

test("a win that fills the board ends the game after Keep going", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const game = await open2048(page, { __one2048Seed: 1, __one2048Cells: [[1024, 1024, 32, 8], [2, 4, 2, 16], [4, 2, 4, 2], [2, 4, 2, 4]] });
  await game.getByRole("button", { name: "Play" }).click();
  await page.keyboard.press("ArrowLeft");
  await game.getByText("You win!").waitFor();
  assert.equal(await game.getByRole("button", { name: "Undo" }).first().isDisabled(), true, "Undo does nothing on the win card");
  await game.getByRole("button", { name: "Keep going" }).click();
  await page.waitForFunction(() => document.querySelector(".g48").dataset.status === "over");
  assert.ok(await game.getByText("Game over").isVisible());
  await page.close();
});
