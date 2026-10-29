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
