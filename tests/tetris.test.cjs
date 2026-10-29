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

test("tick falls one row, then reports grounded", async () => {
  const r = await inPage((T, h) => {
    let s = h.withPiece("O");
    for (let i = 0; i < 16; i++) s = T.tetrisTick(s);
    const bottom = Math.max(...T.tetrisCells(s.piece).map((c) => c[1]));
    const after = T.tetrisTick(s);
    return { bottom, grounded: [s.grounded, after.grounded], y: [s.piece.y, after.piece.y] };
  });
  assert.deepEqual(r, { bottom: 17, grounded: [false, true], y: [16, 16] });
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
