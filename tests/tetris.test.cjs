const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp } = require("./helpers.cjs");

let server, browser, rules;
before(async () => {
  server = await startServer();
  browser = await launch();
  // One page for the rule tests: they only call window.__oneTetris.
  rules = await openApp(browser, server.url, { route: "home" });
});
after(async () => {
  await rules.page.close();
  await browser.close();
  await server.close();
});

// Runs fn(T, helpers) in the page, where T is window.__oneTetris.
function inPage(fn, arg) {
  return rules.page.evaluate(
    ({ src, arg }) => {
      const T = window.__oneTetris;
      const playing = (s) => ({ ...s, status: "playing" });
      const empty = () => Array.from({ length: T.TETRIS_H }, () => Array(T.TETRIS_W).fill(null));
      const withPiece = (shape, extra = {}) => {
        const s = playing(T.tetrisNew(1));
        const spawn = T.tetrisNew(1);
        return { ...s, field: empty(), piece: { shape, rot: 0, x: shape === "O" ? 4 : 3, y: shape === "I" ? -1 : 0 }, ...extra, _spawn: spawn };
      };
      return new Function("T", "h", "arg", `return (${src})(T, h, arg);`)(T, { playing, empty, withPiece }, arg);
    },
    { src: fn.toString(), arg }
  );
}

test("bag deals all 7 shapes before repeating", async () => {
  const r = await inPage((T) => {
    const order = (seed) => {
      let s = T.tetrisNew(seed);
      const out = [s.piece.shape];
      for (let i = 0; i < 13; i++) {
        s = T.tetrisDeal(s);
        out.push(s.piece.shape);
      }
      return out;
    };
    return { a: order(1), again: order(1), b: order(2) };
  });
  assert.deepEqual([...r.a.slice(0, 7)].sort(), ["I", "J", "L", "O", "S", "T", "Z"]);
  assert.deepEqual([...r.a.slice(7, 14)].sort(), ["I", "J", "L", "O", "S", "T", "Z"]);
  assert.deepEqual(r.again, r.a);
  assert.notDeepEqual(r.b, r.a);
});

test("pieces spawn centred with their colours", async () => {
  const r = await inPage((T, h) => {
    const out = {};
    for (const shape of "IOTSZJL") {
      const s = h.withPiece(shape);
      out[shape] = { cells: T.tetrisCells(s.piece).sort((a, b) => a[1] - b[1] || a[0] - b[0]), color: T.TETRIS_SHAPES[shape].color };
    }
    const fresh = T.tetrisNew(5);
    out.spawn = T.tetrisCells(fresh.piece).every(([x, y]) => x >= 3 && x <= 6 && y >= 0 && y <= 1);
    return out;
  });
  assert.deepEqual(r.I.cells, [[3, 0], [4, 0], [5, 0], [6, 0]]);
  assert.deepEqual(r.O.cells, [[4, 0], [5, 0], [4, 1], [5, 1]]);
  assert.deepEqual(r.T.cells, [[4, 0], [3, 1], [4, 1], [5, 1]]);
  assert.deepEqual(r.S.cells, [[4, 0], [5, 0], [3, 1], [4, 1]]);
  assert.deepEqual(r.Z.cells, [[3, 0], [4, 0], [4, 1], [5, 1]]);
  assert.deepEqual(r.J.cells, [[3, 0], [3, 1], [4, 1], [5, 1]]);
  assert.deepEqual(r.L.cells, [[5, 0], [3, 1], [4, 1], [5, 1]]);
  const colors = Object.fromEntries("IOTSZJL".split("").map((s) => [s, r[s].color]));
  assert.deepEqual(colors, { I: "white", O: "yellow", T: "pink", S: "green", Z: "red", J: "blue", L: "orange" });
  assert.equal(r.spawn, true);
});

test("moves stop at walls and blocks", async () => {
  const r = await inPage((T, h) => {
    let s = h.withPiece("T");
    for (let i = 0; i < 10; i++) s = T.tetrisMove(s, -1);
    const minX = Math.min(...T.tetrisCells(s.piece).map((c) => c[0]));
    const stuck = T.tetrisMove(s, -1) === s;
    const b = h.withPiece("T");
    b.field[1][6] = "Z";
    const blocked = T.tetrisMove(b, 1) === b;
    const ready = T.tetrisNew(1);
    return { minX, stuck, blocked, readyIgnored: T.tetrisMove(ready, 1) === ready };
  });
  assert.deepEqual(r, { minX: 0, stuck: true, blocked: true, readyIgnored: true });
});

test("rotation kicks off a wall, refuses when boxed in, and O never turns", async () => {
  const r = await inPage((T, h) => {
    const wall = h.withPiece("I", {});
    wall.piece = { shape: "I", rot: 1, x: 7, y: 5 };
    const kicked = T.tetrisRotate(wall, 1);
    const kickedCells = T.tetrisCells(kicked.piece);
    const boxed = h.withPiece("T");
    boxed.piece = { shape: "T", rot: 0, x: 3, y: 8 };
    const mine = new Set(T.tetrisCells(boxed.piece).map(([x, y]) => `${x},${y}`));
    for (let y = 0; y < T.TETRIS_H; y++) for (let x = 0; x < T.TETRIS_W; x++) if (!mine.has(`${x},${y}`)) boxed.field[y][x] = "Z";
    const o = h.withPiece("O");
    return {
      turned: kicked.piece.rot,
      inside: kickedCells.every(([x]) => x >= 0 && x <= 9),
      boxedSame: T.tetrisRotate(boxed, 1) === boxed && T.tetrisRotate(boxed, -1) === boxed,
      oSame: T.tetrisRotate(o, 1) === o
    };
  });
  assert.deepEqual(r, { turned: 2, inside: true, boxedSame: true, oSame: true });
});

test("rotation at the top never leaves the field", async () => {
  const r = await inPage((T, h) => {
    const out = [];
    for (const shape of "IOTSZJL") {
      for (const dir of [1, -1]) {
        let s = h.withPiece(shape);
        for (let i = 0; i < 4; i++) {
          s = T.tetrisRotate(s, dir);
          out.push(T.tetrisCells(s.piece).every(([x, y]) => y >= 0 && x >= 0 && x < 10));
        }
      }
    }
    const i = T.tetrisRotate(h.withPiece("I"), 1);
    return { allInside: out.every(Boolean), iTurns: i.piece.rot === 1 };
  });
  assert.deepEqual(r, { allInside: true, iTurns: true });
});

test("ghost lands on the floor or on blocks", async () => {
  const r = await inPage((T, h) => {
    const floor = T.tetrisCells(T.tetrisGhost(h.withPiece("T")));
    const s = h.withPiece("T");
    s.field[10][4] = "Z";
    const onBlock = T.tetrisCells(T.tetrisGhost(s));
    return { floor: Math.max(...floor.map((c) => c[1])), onBlock: Math.max(...onBlock.map((c) => c[1])) };
  });
  assert.deepEqual(r, { floor: 17, onBlock: 9 });
});

test("gravity speeds up per level and stops at 80 ms", async () => {
  const r = await inPage((T) => [1, 2, 10, 11, 12, 40].map((l) => T.tetrisGravity(l)));
  assert.deepEqual(r, [800, 730, 170, 100, 80, 80]);
});

test("tick falls one row and reports grounded as soon as it lands", async () => {
  const r = await inPage((T, h) => {
    let s = h.withPiece("O");
    for (let i = 0; i < 15; i++) s = T.tetrisTick(s);
    const flying = s.grounded;
    s = T.tetrisTick(s);
    const bottom = Math.max(...T.tetrisCells(s.piece).map((c) => c[1]));
    const after = T.tetrisTick(s);
    return { flying, bottom, grounded: s.grounded, y: s.piece.y, again: after === s };
  });
  assert.deepEqual(r, { flying: false, bottom: 17, grounded: true, y: 16, again: true });
});

test("soft drop scores 1 per row, hard drop lands on the ghost and scores 2 per row", async () => {
  const r = await inPage((T, h) => {
    const s = h.withPiece("T");
    const soft = T.tetrisSoftDrop(s);
    const ghostY = T.tetrisGhost(s).y;
    const hard = T.tetrisHardDrop(s);
    const tCells = [];
    hard.field.forEach((row, y) => row.forEach((c, x) => c === "T" && tCells.push([x, y])));
    return { soft: soft.score, ghostY, hard: hard.score, tCells: tCells.sort((a, b) => a[1] - b[1] || a[0] - b[0]), nextIn: hard.piece.shape === s.next };
  });
  assert.equal(r.soft, 1);
  assert.equal(r.ghostY, 16);
  assert.equal(r.hard, 32);
  assert.deepEqual(r.tCells, [[4, 16], [3, 17], [4, 17], [5, 17]]);
  assert.equal(r.nextIn, true);
});

test("clearing 1–4 lines scores 100/300/500/800 × level and drops the rows above", async () => {
  const r = await inPage((T, h) => {
    const run = (n, level) => {
      const s = h.withPiece("I", { level, lines: (level - 1) * 10 });
      for (let y = 17; y > 17 - n; y--) for (let x = 1; x < 10; x++) s.field[y][x] = "Z";
      s.field[17 - n][5] = "S";
      s.piece = { shape: "I", rot: 1, x: -2, y: 0 };
      const dropped = T.tetrisHardDrop(s);
      const cleared = T.tetrisClear(dropped);
      return { flashing: dropped.clearing.length, points: cleared.score - dropped.score, marker: cleared.field[17][5], last: cleared.last.lines, clearingAfter: cleared.clearing.length };
    };
    return [run(1, 1), run(2, 1), run(3, 1), run(4, 1), run(4, 3)];
  });
  assert.deepEqual(r.map((x) => x.points), [100, 300, 500, 800, 2400]);
  assert.deepEqual(r.map((x) => x.flashing), [1, 2, 3, 4, 4]);
  assert.ok(r.every((x) => x.marker === "S" && x.clearingAfter === 0));
  assert.deepEqual(r.map((x) => x.last), [1, 2, 3, 4, 4]);
});

test("level rises every 10 lines and scores the clear at the old level", async () => {
  const r = await inPage((T, h) => {
    const s = h.withPiece("I", { lines: 9, level: 1 });
    for (let x = 1; x < 10; x++) s.field[17][x] = "Z";
    s.piece = { shape: "I", rot: 1, x: -2, y: 0 };
    const dropped = T.tetrisHardDrop(s);
    const cleared = T.tetrisClear(dropped);
    return { lines: cleared.lines, level: cleared.level, points: cleared.score - dropped.score, levelUp: cleared.last.levelUp };
  });
  assert.deepEqual(r, { lines: 10, level: 2, points: 100, levelUp: true });
});

test("a blocked spawn ends the game", async () => {
  const r = await inPage((T, h) => {
    const s = h.withPiece("T");
    for (let y = 0; y < 2; y++) for (let x = 3; x < 7; x++) s.field[y][x] = "Z";
    return T.tetrisSpawn(s).status;
  });
  assert.equal(r, "over");
});

test("input is ignored during the line-clear flash", async () => {
  const r = await inPage((T, h) => {
    const s = h.withPiece("T", { clearing: [17] });
    return [T.tetrisMove(s, 1), T.tetrisRotate(s, 1), T.tetrisSoftDrop(s), T.tetrisHardDrop(s), T.tetrisTick(s), T.tetrisLock(s)].every((x) => x === s);
  });
  assert.equal(r, true);
});

// ---------- On screen ----------

// Opens Games → Tetris. With a shape, picks a seed whose first piece is that shape.
async function openTetris(page, { seed, shape } = {}) {
  await page.evaluate(
    ({ seed, shape }) => {
      if (shape) {
        for (let s = 1; s < 500; s++) {
          if (window.__oneTetris.tetrisNew(s).piece.shape === shape) {
            window.__oneTetrisSeed = s;
            break;
          }
        }
      } else if (seed != null) window.__oneTetrisSeed = seed;
      window.__oneRetroSound.played = [];
    },
    { seed, shape }
  );
  await page.locator(".meadow-controls").getByRole("button", { name: "Games" }).click();
  await page.getByRole("dialog", { name: "Retro games" }).getByRole("button", { name: /Tetris/ }).click();
  return page.getByRole("dialog", { name: "Tetris" });
}
const boardAttr = (page, name) => page.locator(".tetris-board").getAttribute(`data-${name}`);
const status = (page) => page.locator(".tetris").getAttribute("data-status");
const played = (page) => page.evaluate(() => window.__oneRetroSound.played);

test("Tetris shows a 10×18 field and the next piece", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openTetris(page, { seed: 7 });
  assert.equal(await game.locator(".tetris-cell").count(), 180);
  assert.equal(await game.locator(".tetris-mini").count(), 16);
  const next = await game.locator(".tetris-next").getAttribute("data-shape");
  assert.match(next, /^[IOTSZJL]$/);
  assert.notEqual(next, await boardAttr(page, "piece"));
  for (const label of ["Next", "Score", "Lines", "Level", "Best"]) assert.ok(await game.getByText(label, { exact: true }).isVisible(), label);
  assert.deepEqual(errors, []);
  await page.close();
});

test("keys move, rotate and hard-drop", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  await openTetris(page, { shape: "T" });
  await page.keyboard.press("Space");
  assert.equal(await status(page), "playing");
  const x = Number(await boardAttr(page, "x"));
  await page.keyboard.press("ArrowLeft");
  assert.equal(Number(await boardAttr(page, "x")), x - 1);
  await page.keyboard.press("ArrowUp");
  assert.equal(await boardAttr(page, "rot"), "1");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelectorAll(".tetris-cell[data-shape='T']:not([data-active])").length === 4);
  assert.notEqual(await boardAttr(page, "piece"), "T");
  assert.ok(Number(await page.getByTestId("tetris-score").textContent()) > 0);
  assert.ok((await played(page)).includes("tlock"));
  assert.deepEqual(errors, []);
  await page.close();
});

test("P pauses and the piece stops falling", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openTetris(page, { seed: 4 });
  await page.keyboard.press("Space");
  await page.keyboard.press("p");
  assert.equal(await status(page), "paused");
  const y = await boardAttr(page, "y");
  await page.waitForTimeout(1200);
  assert.equal(await boardAttr(page, "y"), y);
  await page.keyboard.press("p");
  assert.equal(await status(page), "playing");
  await page.close();
});

test("Esc pauses first, then goes back to the list", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openTetris(page, { seed: 4 });
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  assert.equal(await status(page), "paused");
  assert.ok(await page.getByRole("dialog", { name: "Tetris" }).isVisible());
  await page.keyboard.press("Escape");
  assert.ok(await page.getByRole("dialog", { name: "Retro games" }).isVisible());
  await page.close();
});

test("game over saves the best score", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openTetris(page, { seed: 3 });
  await page.keyboard.press("Space");
  for (let i = 0; i < 60 && (await status(page)) !== "over"; i++) await page.keyboard.press("Space");
  assert.equal(await status(page), "over");
  const score = Number(await game.getByTestId("tetris-score").textContent());
  assert.ok(score > 0);
  assert.ok(await game.getByText("Game over").isVisible());
  assert.ok(await game.getByText("New record!").isVisible());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")).tetris.best), score);
  await page.keyboard.press("Escape");
  assert.ok(await page.getByRole("dialog", { name: "Retro games" }).getByText(`Best ${score}`).first().isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

test("a hard drop during the lock delay locks once", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openTetris(page, { shape: "T" });
  await page.keyboard.press("Space");
  await page.keyboard.down("ArrowDown");
  await page.waitForFunction(() => document.querySelector(".tetris-board").dataset.grounded === "true", null, { timeout: 8000 });
  await page.keyboard.up("ArrowDown");
  const before = Number(await page.getByTestId("tetris-score").textContent());
  await page.evaluate(() => (window.__oneRetroSound.played = []));
  await page.keyboard.press("Space");
  await page.waitForTimeout(600);
  assert.equal((await played(page)).filter((c) => c === "tlock").length, 1);
  assert.equal(Number(await page.getByTestId("tetris-score").textContent()), before);
  await page.close();
});

test("a held arrow stops repeating on blur and after a pause", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openTetris(page, { shape: "T" });
  await page.keyboard.press("Space");
  await page.keyboard.down("ArrowLeft");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const x = await boardAttr(page, "x");
  await page.waitForTimeout(400);
  assert.equal(await boardAttr(page, "x"), x);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.down("ArrowRight");
  await page.keyboard.press("p");
  await page.keyboard.press("p");
  const x2 = await boardAttr(page, "x");
  await page.waitForTimeout(400);
  assert.equal(await boardAttr(page, "x"), x2);
  await page.keyboard.up("ArrowRight");
  await page.close();
});

test("Space on a focused Play button starts one game", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const game = await openTetris(page, { seed: 5 });
  await game.getByRole("button", { name: "Play" }).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
  assert.equal((await played(page)).filter((c) => c === "start").length, 1);
  await page.close();
});

// ---------- Phones ----------

const PHONE = { viewport: { width: 375, height: 740 }, hasTouch: true };

test("Tetris fits a phone with touch buttons", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home", ...PHONE });
  const game = await openTetris(page, { seed: 4 });
  const board = await game.locator(".tetris-board").boundingBox();
  assert.ok(board.x >= 0 && board.x + board.width <= 375, "board inside the screen");
  assert.ok(board.y + board.height <= 740, "board above the bottom");
  // Square size = the step from one square to the next.
  const [a, b] = await Promise.all([game.locator(".tetris-cell").nth(0).boundingBox(), game.locator(".tetris-cell").nth(1).boundingBox()]);
  assert.ok(b.x - a.x >= 22, `squares are big enough (${b.x - a.x}px)`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= 375), true);
  const touch = game.getByRole("group", { name: "Tetris controls" });
  for (const name of ["Left", "Right", "Rotate", "Soft drop", "Hard drop"]) assert.ok(await touch.getByRole("button", { name }).isVisible(), name);
  const pad = await touch.boundingBox();
  assert.ok(pad.y + pad.height <= 740, "touch buttons on screen");
  assert.deepEqual(errors, []);
  await page.close();
});

test("touch buttons steer the piece", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", ...PHONE });
  const game = await openTetris(page, { shape: "T" });
  await game.getByRole("button", { name: "Play" }).click();
  const touch = game.getByRole("group", { name: "Tetris controls" });
  const x = Number(await boardAttr(page, "x"));
  await touch.getByRole("button", { name: "Left" }).click();
  assert.equal(Number(await boardAttr(page, "x")), x - 1);
  await touch.getByRole("button", { name: "Rotate" }).click();
  assert.equal(await boardAttr(page, "rot"), "1");
  await touch.getByRole("button", { name: "Hard drop" }).click();
  await page.waitForFunction(() => window.__oneRetroSound.played.includes("tlock"));
  await page.close();
});

test("with reduced motion a full line clears without a flash", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const field = Array.from({ length: 18 }, () => Array(10).fill(null));
    for (let x = 0; x < 10; x++) if (x < 3 || x > 6) field[17][x] = "Z";
    window.__oneTetrisField = field;
  });
  await openTetris(page, { shape: "I" });
  await page.keyboard.press("Space");
  await page.keyboard.press("Space");
  const gone = await page.evaluate(async () => {
    const t = performance.now();
    while (document.querySelectorAll(".tetris-cell[data-shape='Z']:not([data-active])").length && performance.now() - t < 1000) await new Promise((r) => setTimeout(r, 5));
    return performance.now() - t;
  });
  assert.ok(gone < 100, `cleared in ${Math.round(gone)}ms`);
  assert.equal(await page.getByTestId("tetris-lines").textContent(), "1");
  await page.close();
});

test("Tetris stays playable on small and sideways phones", async () => {
  for (const [width, height, minStep] of [[375, 667, 20], [320, 568, 15], [740, 375, 12]]) {
    const { page, errors } = await openApp(browser, server.url, { route: "home", viewport: { width, height }, hasTouch: true });
    const game = await openTetris(page, { seed: 4 });
    const [a, b] = await Promise.all([game.locator(".tetris-cell").nth(0).boundingBox(), game.locator(".tetris-cell").nth(1).boundingBox()]);
    assert.ok(b.x - a.x >= minStep, `${width}×${height}: squares ${b.x - a.x}px`);
    const panel = await page.evaluate(() => {
      const g = document.querySelector(".games");
      return { sideways: g.scrollWidth > g.clientWidth, page: document.documentElement.scrollWidth };
    });
    assert.equal(panel.sideways, false, `${width}×${height}: no sideways scroll in the panel`);
    assert.ok(panel.page <= width, `${width}×${height}: page fits`);
    const board = await game.locator(".tetris-board").boundingBox();
    assert.ok(board.y >= 0 && board.y + board.height <= height + 1, `${width}×${height}: whole field on screen`);
    for (const name of ["Left", "Right", "Rotate", "Soft drop", "Hard drop"]) {
      const box = await game.getByRole("group", { name: "Tetris controls" }).getByRole("button", { name }).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y + box.height <= height + 1, `${width}×${height}: ${name} on screen`);
    }
    const close = await page.getByRole("button", { name: "Close games" }).boundingBox();
    assert.ok(close.x + close.width <= width, `${width}×${height}: close on screen`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});
