const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, waitForGames } = require("./helpers.cjs");

let server, browser, rules;
before(async () => {
  server = await startServer();
  browser = await launch();
  // One page for the rule tests: they only call window.__oneBreakout.
  rules = await openApp(browser, server.url, { route: "home" });
  await waitForGames(rules.page);
});
after(async () => {
  await rules.page.close();
  await browser.close();
  await server.close();
});

// Runs fn(B, arg) in the page, where B is window.__oneBreakout.
function inPage(fn, arg) {
  return rules.page.evaluate(({ src, arg }) => new Function("B", "arg", `return (${src})(B, arg);`)(window.__oneBreakout, arg), { src: fn.toString(), arg });
}

// ---------- Maps ----------

test("there are 30 maps in three tiers, every maker used 2–4 times", async () => {
  const r = await inPage((B) => {
    const tiers = {};
    const makers = {};
    for (const d of B.BREAKOUT_MAPS) {
      tiers[d.tier] = (tiers[d.tier] || 0) + 1;
      makers[d.maker] = (makers[d.maker] || 0) + 1;
    }
    return { n: B.BREAKOUT_MAPS.length, tiers, makers, makerNames: Object.keys(B.breakoutMakers).sort(), ids: new Set(B.BREAKOUT_MAPS.map((d) => d.id)).size };
  });
  assert.equal(r.n, 30);
  assert.equal(r.ids, 30);
  assert.deepEqual(r.tiers, { gentle: 10, medium: 12, tough: 8 });
  assert.deepEqual(r.makerNames, ["caves", "diamonds", "fortress", "mirror", "pillars", "pyramid", "stripes", "twin", "wall", "waves"]);
  for (const name of r.makerNames) assert.ok(r.makers[name] >= 2 && r.makers[name] <= 4, `${name}: ${r.makers[name]}`);
});

test("every map is playable", async () => {
  const r = await inPage((B) =>
    B.BREAKOUT_MAPS.map((d) => {
      const bricks = B.breakoutBuild(d);
      const check = B.breakoutCheck(bricks);
      return { id: d.id, ok: check.ok, reason: check.reason, breakable: check.breakable, inside: bricks.every((b) => b.col >= 0 && b.col < 12 && b.row >= 0 && b.row < 12) };
    })
  );
  for (const m of r) {
    assert.ok(m.ok, `${m.id}: ${m.reason}`);
    assert.ok(m.breakable >= 8, `${m.id}: ${m.breakable} breakable`);
    assert.ok(m.inside, `${m.id}: inside the grid`);
  }
});

test("no two maps are the same", async () => {
  const keys = await inPage((B) =>
    B.BREAKOUT_MAPS.map((d) =>
      B.breakoutBuild(d)
        .map((b) => `${b.col},${b.row},${b.kind},${b.hp}`)
        .sort()
        .join("|")
    )
  );
  assert.equal(new Set(keys).size, 30);
});

test("maps follow their tier", async () => {
  const LIMITS = {
    gentle: { rows: [3, 5], strong: [0, 0.1], steel: [0, 0], explosive: [0, 0.04], maxHp: 2 },
    medium: { rows: [5, 8], strong: [0.15, 0.3], steel: [0, 0.08], explosive: [0.04, 0.06], maxHp: 3 },
    tough: { rows: [7, 12], strong: [0.3, 0.5], steel: [0.08, 0.15], explosive: [0.06, 0.06], maxHp: 5 }
  };
  const r = await inPage((B) =>
    B.BREAKOUT_MAPS.map((d) => {
      const bricks = B.breakoutBuild(d);
      const rows = bricks.map((b) => b.row);
      const share = (kind) => bricks.filter((b) => b.kind === kind).length / bricks.length;
      return {
        id: d.id,
        tier: d.tier,
        n: bricks.length,
        span: Math.max(...rows) - Math.min(...rows) + 1,
        strong: share("strong"),
        steel: share("steel"),
        explosive: share("explosive"),
        maxHp: Math.max(...bricks.filter((b) => b.kind !== "steel").map((b) => b.hp))
      };
    })
  );
  const topHp = {};
  for (const m of r) {
    const L = LIMITS[m.tier];
    const slack = 1 / m.n;
    assert.ok(m.span >= L.rows[0] && m.span <= L.rows[1], `${m.id}: ${m.span} rows`);
    for (const kind of ["strong", "steel", "explosive"]) {
      assert.ok(m[kind] >= L[kind][0] - slack && m[kind] <= L[kind][1] + slack, `${m.id}: ${kind} ${m[kind].toFixed(3)}`);
    }
    topHp[m.tier] = Math.max(topHp[m.tier] || 0, m.maxHp);
  }
  assert.deepEqual(topHp, { gentle: 2, medium: 3, tough: 5 });
});

test("builds are repeatable", async () => {
  const same = await inPage((B) => B.BREAKOUT_MAPS.every((d) => JSON.stringify(B.breakoutBuild(d)) === JSON.stringify(B.breakoutBuild(d))));
  assert.equal(same, true);
});

test("the check finds sealed, unreachable and tiny layouts", async () => {
  const r = await inPage((B) => {
    const brick = (col, row, kind = "normal") => ({ col, row, kind, hp: kind === "steel" ? Infinity : 1, maxHp: 1, color: "#fff" });
    const fill = (rows) => {
      const out = [];
      for (const row of rows) for (let col = 0; col < 12; col++) out.push(brick(col, row));
      return out;
    };
    // A brick boxed in by steel on every side.
    const boxed = [...fill([0]), brick(5, 3), brick(4, 3, "steel"), brick(6, 3, "steel"), brick(5, 2, "steel"), brick(5, 4, "steel")];
    const tiny = [brick(0, 0), brick(1, 0), brick(2, 0), brick(3, 0), brick(4, 0)];
    const sealed = [...fill([0, 1]), ...Array.from({ length: 12 }, (_, col) => brick(col, 2, "steel"))];
    const good = fill([0, 1]);
    return [B.breakoutCheck(boxed).reason, B.breakoutCheck(tiny).reason, B.breakoutCheck(sealed).reason, B.breakoutCheck(good).ok];
  });
  assert.equal(r[0], "unreachable");
  assert.equal(r[1], "too-few");
  assert.ok(r[2] === "sealed" || r[2] === "unreachable", r[2]);
  assert.equal(r[3], true);
});

test("the deck uses all 30 and never repeats a map back to back", async () => {
  const r = await inPage((B) => {
    const first = B.breakoutDeck(B.breakoutRng(1), "none");
    const results = [];
    for (let seed = 1; seed <= 50; seed++) {
      const prev = B.breakoutDeck(B.breakoutRng(seed), "none");
      const next = B.breakoutDeck(B.breakoutRng(seed + 1000), prev[29]);
      results.push(next[0] !== prev[29] && new Set(next).size === 30);
    }
    return { size: new Set(first).size, len: first.length, ok: results.every(Boolean) };
  });
  assert.deepEqual(r, { size: 30, len: 30, ok: true });
});

// ---------- Physics ----------

// Helpers available inside physics tests as h.*
function inGame(fn, arg) {
  return inPage((B, { src, arg }) => {
    const { BREAKOUT: G } = B;
    const brick = (col, row, kind = "normal", hp = 1) => ({ col, row, kind, hp: kind === "steel" ? Infinity : hp, maxHp: kind === "steel" ? Infinity : hp, color: "#fff" });
    // Spare bricks in a far corner keep a map from counting as cleared.
    const spare = () => [brick(0, 0), brick(1, 0), brick(0, 1), brick(1, 1)];
    const rect = (b) => ({ x: G.X0 + b.col * (G.BW + G.GAP), y: G.Y0 + b.row * (G.BH + G.GAP), w: G.BW, h: G.BH });
    const playing = (bricks, balls, extra = {}) => ({ ...B.breakoutWithBricks(B.breakoutNew(1), bricks), status: "playing", balls, ...extra });
    const run = (s, ms, input = {}, step = 16) => {
      const events = [];
      for (let t = 0; t < ms; t += step) {
        s = B.breakoutStep(s, step, { targetX: null, dir: 0, launch: false, ...input });
        events.push(...s.events);
      }
      return { s, events };
    };
    const speed = (b) => Math.hypot(b.vx, b.vy);
    const fromVertical = (b) => (Math.abs(Math.atan2(b.vx, -b.vy)) * 180) / Math.PI;
    const h = { G, brick, spare, rect, playing, run, speed, fromVertical };
    return new Function("B", "h", "arg", `return (${src})(B, h, arg);`)(B, h, arg);
  }, { src: fn.toString(), arg });
}

test("walls and the top bounce the ball and keep its speed", async () => {
  const r = await inGame((B, h) => {
    const left = h.run(h.playing(h.spare(), [{ x: 10, y: 400, vx: -300, vy: -160, stuck: false }]), 48).s.balls[0];
    const top = h.run(h.playing(h.spare(), [{ x: 240, y: 10, vx: 100, vy: -325, stuck: false }]), 48).s.balls[0];
    return { leftVx: left.vx, topVy: top.vy, speeds: [h.speed(left), h.speed(top)] };
  });
  assert.ok(r.leftVx > 0);
  assert.ok(r.topVy > 0);
  for (const sp of r.speeds) assert.ok(Math.abs(sp - 340) < 0.5, `speed ${sp}`);
});

test("the paddle's centre sends the ball up, its edge out at about 60°", async () => {
  const r = await inGame((B, h) => {
    const hit = (offset) => {
      const s = h.playing(h.spare(), [{ x: 240 + offset * 44, y: 585, vx: 0, vy: 340, stuck: false }]);
      s.paddle = { ...s.paddle, x: 240 };
      const { s: after, events } = h.run(s, 48);
      const ball = after.balls[0];
      return { angle: h.fromVertical(ball), up: ball.vy < 0, speed: h.speed(ball), paddle: events.some((e) => e.type === "paddle") };
    };
    return [hit(0), hit(0.95)];
  });
  assert.ok(r[0].up && r[0].paddle && r[0].angle < 1, JSON.stringify(r[0]));
  assert.ok(r[1].up && Math.abs(r[1].angle - 57) <= 3, JSON.stringify(r[1]));
  for (const x of r) assert.ok(Math.abs(x.speed - 340) < 0.5);
});

test("a fast ball never passes through a brick", async () => {
  const r = await inGame((B, h) => {
    const target = h.brick(6, 5);
    const box = h.rect(target);
    const s = h.playing([...h.spare(), target], [{ x: box.x + box.w / 2, y: box.y + box.h + 30, vx: 0, vy: -1020, stuck: false }]);
    const after = B.breakoutStep(s, 50, { targetX: null, dir: 0, launch: false });
    return { broke: after.events.some((e) => e.type === "break"), down: after.balls[0].vy > 0, belowBrick: after.balls[0].y > box.y + box.h };
  });
  assert.deepEqual(r, { broke: true, down: true, belowBrick: true });
});

test("strong bricks lose hits and break on the last one; steel never breaks", async () => {
  const r = await inGame((B, h) => {
    const strongHits = () => {
      let s = h.playing([...h.spare(), h.brick(6, 5, "strong", 3)], []);
      const box = h.rect(h.brick(6, 5));
      const breaks = [];
      for (let i = 0; i < 3; i++) {
        s = { ...s, balls: [{ x: box.x + box.w / 2, y: box.y + box.h + 10, vx: 0, vy: -340, stuck: false }] };
        const out = h.run(s, 48);
        s = out.s;
        breaks.push(out.events.filter((e) => e.type === "break").length);
      }
      return { score: s.score, breaks, left: s.bricks.filter((b) => b.col === 6 && b.row === 5).length };
    };
    const steelHits = () => {
      let s = h.playing([...h.spare(), h.brick(6, 5, "steel")], []);
      const box = h.rect(h.brick(6, 5));
      let clanks = 0;
      for (let i = 0; i < 5; i++) {
        s = { ...s, balls: [{ x: box.x + box.w / 2, y: box.y + box.h + 10, vx: 0, vy: -340, stuck: false }] };
        const out = h.run(s, 48);
        s = out.s;
        clanks += out.events.filter((e) => e.type === "steel").length;
      }
      return { score: s.score, clanks, left: s.bricks.some((b) => b.kind === "steel") };
    };
    return { strong: strongHits(), steel: steelHits() };
  });
  assert.deepEqual(r.strong, { score: 60, breaks: [0, 0, 1], left: 0 });
  assert.deepEqual(r.steel, { score: 0, clanks: 5, left: true });
});

test("explosions break their neighbours, chain once, and spare steel", async () => {
  const r = await inGame((B, h) => {
    const block = [];
    for (let row = 4; row <= 6; row++) for (let col = 5; col <= 7; col++) block.push(h.brick(col, row));
    const at = (col, row) => block.find((b) => b.col === col && b.row === row);
    // The ball hits the explosive at (6,6); it sets off (6,5), which sets off (7,5).
    Object.assign(at(6, 6), { kind: "explosive" });
    Object.assign(at(6, 5), { kind: "explosive" });
    Object.assign(at(7, 5), { kind: "explosive" });
    Object.assign(at(5, 4), { kind: "steel", hp: Infinity, maxHp: Infinity });
    // Only the last explosive in the chain reaches this one.
    block.push(h.brick(8, 5));
    const box = h.rect(at(6, 6));
    const s = h.playing([...h.spare(), ...block], [{ x: box.x + box.w / 2, y: box.y + box.h + 10, vx: 0, vy: -340, stuck: false }]);
    const { s: after, events } = h.run(s, 48);
    const left = after.bricks.filter((b) => b.col >= 5 && b.col <= 8 && b.row >= 4 && b.row <= 6).map((b) => `${b.col},${b.row},${b.kind}`);
    return { booms: events.filter((e) => e.type === "boom").length, left };
  });
  assert.equal(r.booms, 3);
  assert.deepEqual(r.left, ["5,4,steel"]);
});

test("two balls on one brick break it once", async () => {
  const r = await inGame((B, h) => {
    const target = h.brick(6, 5, "bonus");
    const box = h.rect(target);
    const s = h.playing([...h.spare(), target], [
      { x: box.x + 8, y: box.y + box.h + 6, vx: 0, vy: -340, stuck: false },
      { x: box.x + box.w - 8, y: box.y + box.h + 6, vx: 0, vy: -340, stuck: false }
    ]);
    const after = B.breakoutStep(s, 32, { targetX: null, dir: 0, launch: false });
    return { breaks: after.events.filter((e) => e.type === "break").length, capsules: after.capsules.length, score: after.score };
  });
  assert.deepEqual(r, { breaks: 1, capsules: 1, score: 20 });
});

test("power-ups work and wear off", async () => {
  const r = await inGame((B, h) => {
    const catchOne = (kind, extra = {}) => {
      const s = h.playing(h.spare(), [{ x: 100, y: 300, vx: 0, vy: -340, stuck: false }], extra);
      s.paddle = { ...s.paddle, x: 240 };
      s.capsules = [{ x: 240, y: 596, kind }];
      return B.breakoutStep(s, 16, { targetX: 240, dir: 0, launch: false });
    };
    const wide = catchOne("wide");
    const wideLater = h.run(wide, 15100, { targetX: 240 }, 50).s;
    const slow = catchOne("slow");
    const slowSpeed = h.speed(slow.balls[0]);
    const slowLater = h.run(slow, 12100, { targetX: 240 }, 50).s;
    // (The ball may be lost by then; the game's current speed is what matters.)
    const multi = catchOne("multi");
    const life = catchOne("life", { lives: 5 });
    return {
      wide: [wide.paddle.w, wideLater.paddle.w],
      slow: [Math.round(slowSpeed), slowLater.speed],
      multi: multi.balls.length,
      life: life.lives,
      caught: wide.events.some((e) => e.type === "catch")
    };
  });
  assert.deepEqual(r, { wide: [132, 88], slow: [238, 340], multi: 3, life: 5, caught: true });
});

test("losing the last ball costs a life; with none left the game is over", async () => {
  const r = await inGame((B, h) => {
    const fall = (lives) => {
      const s = h.playing(h.spare(), [{ x: 30, y: 636, vx: 0, vy: 340, stuck: false }], { lives, capsules: [{ x: 300, y: 100, kind: "wide" }], effects: { wide: 5000, slow: 0 } });
      s.paddle = { ...s.paddle, x: 400 };
      return B.breakoutStep(s, 50, { targetX: null, dir: 0, launch: false });
    };
    const one = fall(3);
    const last = fall(1);
    return {
      lives: one.lives,
      lost: one.events.some((e) => e.type === "lost"),
      stuck: one.balls.length === 1 && one.balls[0].stuck,
      reset: one.capsules.length === 0 && one.effects.wide === 0,
      over: [last.status, last.events.some((e) => e.type === "over")]
    };
  });
  assert.deepEqual(r, { lives: 2, lost: true, stuck: true, reset: true, over: ["over", true] });
});

test("clearing the map wins over losing the last ball in the same step", async () => {
  const r = await inGame((B, h) => {
    const last = h.brick(6, 5);
    const box = h.rect(last);
    const s = h.playing([last], [
      { x: box.x + box.w / 2, y: box.y + box.h + 6, vx: 0, vy: -340, stuck: false },
      { x: 30, y: 640, vx: 0, vy: 340, stuck: false }
    ]);
    s.paddle = { ...s.paddle, x: 400 };
    const after = B.breakoutStep(s, 32, { targetX: null, dir: 0, launch: false });
    return { status: after.status, lives: after.lives };
  });
  assert.deepEqual(r, { status: "cleared", lives: 3 });
});

test("a cleared map keeps score and lives and deals the next one", async () => {
  const r = await inGame((B, h) => {
    const last = h.brick(6, 5);
    const box = h.rect(last);
    let s = h.playing([last], [{ x: box.x + box.w / 2, y: box.y + box.h + 6, vx: 0, vy: -340, stuck: false }], { lives: 2, score: 100 });
    const firstMap = s.mapId;
    s = B.breakoutStep(s, 32, { targetX: null, dir: 0, launch: false });
    const cleared = { status: s.status, score: s.score, event: s.events.some((e) => e.type === "cleared") };
    s = h.run(s, 1520, {}, 20).s;
    return { cleared, status: s.status, next: s.mapId === s.deck[1] && s.mapId !== firstMap, score: s.score, lives: s.lives, bricks: s.bricks.length > 8 };
  });
  assert.deepEqual(r.cleared, { status: "cleared", score: 100 + 10 + 10 + 500, event: true });
  assert.deepEqual({ ...r, cleared: undefined }, { cleared: undefined, status: "ready", next: true, score: 620, lives: 2, bricks: true });
});

test("the ball is never flatter than 15°", async () => {
  const r = await inGame((B, h) => {
    const a = (5 * Math.PI) / 180;
    const s = h.playing(h.spare(), [{ x: 240, y: 300, vx: 340 * Math.cos(a), vy: -340 * Math.sin(a), stuck: false }]);
    const ball = B.breakoutStep(s, 16, { targetX: null, dir: 0, launch: false }).balls[0];
    return (Math.abs(Math.atan2(-ball.vy, Math.abs(ball.vx))) * 180) / Math.PI;
  });
  assert.ok(r >= 14.9, `angle ${r}`);
});

test("a ball wedged between steel frees itself", async () => {
  const r = await inGame((B, h) => {
    const top = h.brick(6, 4, "steel");
    const bottom = h.brick(6, 6, "steel");
    const box = h.rect(h.brick(6, 5));
    const startX = box.x + box.w / 2;
    let s = h.playing([...h.spare(), top, bottom], [{ x: startX, y: box.y + box.h / 2, vx: 0, vy: -340, stuck: false }]);
    s = h.run(s, 4000, { targetX: 240 }).s;
    const ball = s.balls[0];
    return ball ? Math.abs(ball.x - startX) > 20 || Math.abs(ball.y - (box.y + box.h / 2)) > 20 : true;
  });
  assert.equal(r, true);
});
