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

// ---------- On screen ----------

async function openBreakout(page, seams = {}) {
  await waitForGames(page);
  await page.evaluate((seams) => {
    for (const [k, v] of Object.entries(seams)) window[k] = v;
    window.__oneRetroSound.played = [];
  }, seams);
  await page.locator(".meadow-controls").getByRole("button", { name: "Games" }).click();
  await page.getByRole("dialog", { name: "Retro games" }).getByRole("button", { name: /Breakout/ }).click();
  // The game is listening for keys once its Play button has taken focus.
  await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("snake-play"));
  return page.getByRole("dialog", { name: "Breakout" });
}
const field = (page, name) => page.locator("canvas.breakout-field").getAttribute(`data-${name}`);
const bstatus = (page) => page.locator(".breakout").getAttribute("data-status");
const waitAttr = (page, name, pred, arg) =>
  page.waitForFunction(({ name, src, arg }) => new Function("v", "arg", `return (${src})(v, arg)`)(document.querySelector("canvas.breakout-field").dataset[name], arg), { name, src: pred.toString(), arg }, { timeout: 6000 });

test("Breakout opens from its card with a field and a score bar", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openBreakout(page, { __oneBreakoutSeed: 3 });
  assert.ok(await game.locator("canvas.breakout-field").isVisible());
  assert.ok(await game.getByText("Ready?").isVisible());
  for (const label of ["Score", "Lives", "Best"]) assert.ok(await game.getByText(label, { exact: true }).isVisible(), label);
  assert.equal(await game.getByTestId("breakout-lives").textContent(), "3");
  assert.doesNotMatch(await game.innerText(), /level|map \d/i);
  assert.deepEqual(errors, []);
  await page.close();
});

test("Space launches the ball; keys and the mouse move the paddle", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openBreakout(page, { __oneBreakoutSeed: 3 });
  await page.keyboard.press("Space");
  assert.equal(await bstatus(page), "playing");
  const x0 = Number(await field(page, "paddle-x"));
  // Hold the key until the paddle has travelled (slow test machines drop frames).
  await page.keyboard.down("ArrowRight");
  await waitAttr(page, "paddleX", (v, x0) => Number(v) >= x0 + 100, x0);
  await page.keyboard.up("ArrowRight");
  const box = await game.locator("canvas.breakout-field").boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await waitAttr(page, "paddleX", (v) => Number(v) <= 60);
  assert.deepEqual(errors, []);
  await page.close();
});

test("after the mouse leaves the field, the keys still move the paddle", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const game = await openBreakout(page, { __oneBreakoutSeed: 3 });
  const box = await game.locator("canvas.breakout-field").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width + 40, box.y + 10);
  await page.waitForTimeout(100);
  const x0 = Number(await field(page, "paddle-x"));
  await page.keyboard.down("ArrowLeft");
  await waitAttr(page, "paddleX", (v, x0) => Number(v) < x0 - 50, x0);
  await page.keyboard.up("ArrowLeft");
  await page.close();
});

test("P and Esc pause; Restart starts a fresh run", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  let game = await openBreakout(page, { __oneBreakoutSeed: 3 });
  await page.keyboard.press("Space");
  await page.keyboard.press("p");
  assert.equal(await bstatus(page), "paused");
  await page.keyboard.press("p");
  assert.equal(await bstatus(page), "playing");
  await page.keyboard.press("Escape");
  assert.equal(await bstatus(page), "paused");
  assert.ok(await page.getByRole("dialog", { name: "Breakout" }).isVisible());
  await page.keyboard.press("Escape");
  assert.ok(await page.getByRole("dialog", { name: "Retro games" }).isVisible());
  await page.getByRole("dialog", { name: "Retro games" }).getByRole("button", { name: /Breakout/ }).click();
  game = page.getByRole("dialog", { name: "Breakout" });
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  await page.keyboard.press("p");
  await game.getByRole("button", { name: "Restart" }).click();
  assert.equal(await bstatus(page), "ready");
  assert.equal(await game.getByTestId("breakout-score").textContent(), "0");
  assert.equal(await game.getByTestId("breakout-lives").textContent(), "3");
  await page.close();
});

test("game over saves the best score", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const bricks = await rules.page.evaluate(() => Array.from({ length: 10 }, (_, i) => ({ col: i + 1, row: 9, kind: "normal", hp: 1, maxHp: 1, color: "#4dd8f0" })));
  const game = await openBreakout(page, { __oneBreakoutSeed: 5, __oneBreakoutLives: 1, __oneBreakoutBricks: bricks });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => Number(document.querySelector("[data-testid=breakout-score]").textContent) > 0, null, { timeout: 8000 });
  await page.evaluate(() => window.__oneBreakoutControl.loseBall());
  await page.waitForFunction(() => document.querySelector(".breakout").dataset.status === "over", null, { timeout: 6000 });
  const score = Number(await game.getByTestId("breakout-score").textContent());
  assert.ok(await game.getByText("Game over").isVisible());
  assert.ok(await game.getByText("New record!").isVisible());
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")).breakout.best), score);
  await page.keyboard.press("Escape");
  assert.ok(await page.getByRole("dialog", { name: "Retro games" }).getByText(`Best ${score}`).first().isVisible());
  assert.deepEqual(errors, []);
  await page.close();
});

test("game sounds come from what happens in play", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const bricks = await rules.page.evaluate(() => Array.from({ length: 12 }, (_, i) => ({ col: i, row: 11, kind: "normal", hp: 1, maxHp: 1, color: "#4dd8f0" })));
  await openBreakout(page, { __oneBreakoutSeed: 5, __oneBreakoutBricks: bricks });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => window.__oneRetroSound.played.includes("bhit"), null, { timeout: 8000 });
  await page.close();
});

// ---------- Phones ----------

test("Breakout fits phones, upright and on their side", async () => {
  for (const [width, height] of [[375, 740], [320, 568], [740, 375]]) {
    const { page, errors } = await openApp(browser, server.url, { route: "home", viewport: { width, height }, hasTouch: true });
    const game = await openBreakout(page, { __oneBreakoutSeed: 3 });
    const box = await game.locator("canvas.breakout-field").boundingBox();
    const where = `${width}×${height}`;
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height + 1, `${where}: field on screen ${JSON.stringify(box)}`);
    if (width < height) assert.ok(box.width >= 240, `${where}: field ${box.width}px wide`);
    else assert.ok(box.height >= 250, `${where}: field ${box.height}px tall`);
    assert.equal(await page.evaluate(() => document.querySelector(".games").scrollWidth <= document.querySelector(".games").clientWidth), true, `${where}: no sideways scroll`);
    assert.ok(await game.getByText("Score", { exact: true }).isVisible());
    assert.ok(await game.getByText("Lives", { exact: true }).isVisible());
    const close = await page.getByRole("button", { name: "Close games" }).boundingBox();
    assert.ok(close.x + close.width <= width && close.y >= 0, `${where}: close on screen`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test("dragging a finger moves the paddle", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", viewport: { width: 375, height: 740 }, hasTouch: true });
  const game = await openBreakout(page, { __oneBreakoutSeed: 3 });
  const box = await game.locator("canvas.breakout-field").boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.75, box.y + box.height * 0.6);
  assert.equal(await bstatus(page), "playing");
  await page.evaluate(({ x0, x1, y }) => {
    const canvas = document.querySelector("canvas.breakout-field");
    const fire = (type, x) => canvas.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 7, buttons: type === "pointerup" ? 0 : 1, clientX: x, clientY: y, bubbles: true }));
    fire("pointerdown", x0);
    for (let i = 1; i <= 10; i++) fire("pointermove", x0 + ((x1 - x0) * i) / 10);
    fire("pointerup", x1);
  }, { x0: box.x + box.width / 2, x1: box.x + 2, y: box.y + box.height * 0.8 });
  await waitAttr(page, "paddleX", (v) => Number(v) <= 80);
  await page.close();
});

test("with reduced motion no particles are drawn", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const bricks = await rules.page.evaluate(() => Array.from({ length: 12 }, (_, i) => ({ col: i, row: 11, kind: "normal", hp: 1, maxHp: 1, color: "#4dd8f0" })));
  await openBreakout(page, { __oneBreakoutSeed: 5, __oneBreakoutBricks: bricks });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => Number(document.querySelector("[data-testid=breakout-score]").textContent) > 0, null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => window.__oneBreakoutFx.particles.length), 0);
  await page.close();
});

// ---------- Review fixes ----------

test("a ball in open space never changes direction on its own", async () => {
  const r = await inGame((B, h) => {
    // One brick in a far corner; the paddle follows the ball, so it rallies in open space.
    let s = h.playing([h.brick(0, 0), h.brick(1, 0), h.brick(0, 1), h.brick(1, 1), h.brick(2, 0), h.brick(3, 0), h.brick(2, 1), h.brick(3, 1)], [{ x: 300, y: 560, vx: 120, vy: -318, stuck: false }]);
    const swerves = [];
    for (let t = 0; t < 12000; t += 16) {
      const before = s.balls[0];
      s = B.breakoutStep(s, 16, { targetX: before ? before.x : null, dir: 0, launch: false });
      const after = s.balls[0];
      if (!before || !after || s.status !== "playing") break;
      const turned = Math.abs(Math.atan2(after.vy, after.vx) - Math.atan2(before.vy, before.vx)) > 0.01;
      const nearEdge = after.x < 12 || after.x > 468 || after.y < 12 || after.y > 585;
      if (turned && !nearEdge && !s.events.length) swerves.push(`${Math.round(after.x)},${Math.round(after.y)}`);
    }
    return swerves;
  });
  assert.deepEqual(r, []);
});

test("Breakout fits common laptop screens without scrolling", async () => {
  for (const [width, height] of [[1280, 800], [1366, 768]]) {
    const { page } = await openApp(browser, server.url, { route: "home", viewport: { width, height } });
    const game = await openBreakout(page, { __oneBreakoutSeed: 3 });
    const fit = await page.evaluate(() => {
      const g = document.querySelector(".games");
      const hint = document.querySelector(".breakout-hint").getBoundingClientRect();
      return { scrolls: g.scrollHeight > g.clientHeight + 1, hintInside: hint.bottom <= g.getBoundingClientRect().bottom };
    });
    assert.deepEqual(fit, { scrolls: false, hintInside: true }, `${width}×${height}`);
    assert.ok(await game.locator("canvas.breakout-field").isVisible());
    await page.close();
  }
});

test("hit numbers on strong bricks stay readable when the field is small", async () => {
  const r = await inPage((B) => [480, 301, 246].map((px) => (B.breakoutDigitSize(px / 480) * px) / 480));
  assert.ok(r[0] >= 11, `full size ${r[0]}`);
  assert.ok(r[1] >= 9, `375-wide phone ${r[1]}`);
  assert.ok(r[2] >= 7.4, `320-wide phone ${r[2]}`);
  const capped = await inPage((B) => B.breakoutDigitSize(0.2));
  assert.ok(capped <= 15, "never taller than a brick");
});

test("game over stays on screen and keeps the record, even with keys and taps", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  const bricks = await rules.page.evaluate(() => Array.from({ length: 10 }, (_, i) => ({ col: i + 1, row: 9, kind: "normal", hp: 1, maxHp: 1, color: "#4dd8f0" })));
  const game = await openBreakout(page, { __oneBreakoutSeed: 5, __oneBreakoutLives: 1, __oneBreakoutBricks: bricks });
  await page.keyboard.press("Space");
  await page.waitForFunction(() => Number(document.querySelector("[data-testid=breakout-score]").textContent) > 0, null, { timeout: 8000 });
  await page.evaluate(() => window.__oneBreakoutControl.loseBall());
  await page.waitForFunction(() => document.querySelector(".breakout").dataset.status === "over", null, { timeout: 6000 });
  // A player still mashing Space and tapping the field as the ball drops.
  const box = await game.locator("canvas.breakout-field").boundingBox();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Space");
    await page.mouse.click(box.x + 20, box.y + box.height - 20);
  }
  assert.equal(await bstatus(page), "over");
  assert.ok(await game.getByText("New record!").isVisible());
  assert.ok((await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")).breakout.best)) > 0);
  await game.getByRole("button", { name: "Play again" }).click();
  assert.notEqual(await bstatus(page), "over");
  await page.close();
});
