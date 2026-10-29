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
