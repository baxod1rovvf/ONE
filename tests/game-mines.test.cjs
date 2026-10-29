const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openApp, waitForGames, loadGame } = require("./helpers.cjs");

let server, browser, rules;
before(async () => {
  server = await startServer();
  browser = await launch();
  rules = await openApp(browser, server.url, { route: "home" });
  await loadGame(rules.page, "minesweeper");
});
after(async () => {
  await rules.page.close();
  await browser.close();
  await server.close();
});

const inPage = (fn, arg) => rules.page.evaluate(({ src, arg }) => new Function("M", "arg", `return (${src})(M, arg);`)(window.__oneMines, arg), { src: fn.toString(), arg });

test("the first click is safe and opens an area, even in a corner", async () => {
  const r = await inPage((M) => {
    const out = [];
    for (let seed = 1; seed <= 30; seed++) {
      const s = M.minesOpen(M.minesNew("easy", seed), 0, 0);
      const at = (r, c) => s.cells[r * s.cols + c];
      const corner = [at(0, 0), at(0, 1), at(1, 0), at(1, 1)].some((x) => x.mine);
      out.push({ lost: s.status === "lost", mines: s.cells.filter((x) => x.mine).length, corner, open: s.cells.filter((x) => x.open).length });
    }
    return out;
  });
  for (const x of r) {
    assert.equal(x.lost, false);
    assert.equal(x.mines, 10);
    assert.equal(x.corner, false);
    assert.ok(x.open > 1, `opened ${x.open}`);
  }
});

test("levels have the classic sizes; Hard stands upright on a phone", async () => {
  const r = await inPage((M) => {
    const size = (s) => [s.rows, s.cols, s.mines];
    return [size(M.minesNew("easy", 1)), size(M.minesNew("medium", 1)), size(M.minesNew("hard", 1)), size(M.minesNew("hard", 1, { portrait: true }))];
  });
  assert.deepEqual(r, [[9, 9, 10], [16, 16, 40], [16, 30, 99], [30, 16, 99]]);
});

test("opening an empty square opens up to the numbers, never a mine", async () => {
  const r = await inPage((M) => {
    // 5×5 with mines down column 4.
    let s = M.minesFromLayout(5, 5, [4, 9, 14, 19, 24]);
    s = M.minesOpen(s, 2, 0);
    return { open: s.cells.map((x, i) => (x.open ? i % 5 : -1)).filter((c) => c >= 0), mineOpen: s.cells.some((x) => x.mine && x.open), status: s.status };
  });
  assert.deepEqual([...new Set(r.open)].sort(), [0, 1, 2, 3]);
  assert.equal(r.mineOpen, false);
  assert.equal(r.status, "won");
});

test("flags toggle only on closed squares; chording opens around a satisfied number", async () => {
  const r = await inPage((M) => {
    // 3×3 with one mine in the corner (0,0).
    let s = M.minesFromLayout(3, 3, [0]);
    s = M.minesOpen(s, 1, 1); // the 1 in the middle
    const middleFlag = M.minesFlag(s, 1, 1) === s;
    s = M.minesFlag(s, 0, 0);
    const flagged = s.cells[0].flag;
    s = M.minesChord(s, 1, 1);
    const unflag = M.minesFlag(s, 0, 0).cells[0].flag;
    return { middleFlag, flagged, status: s.status, open: s.cells.filter((x) => x.open).length, unflag, left: s.mines - s.cells.filter((x) => x.flag).length };
  });
  assert.deepEqual(r, { middleFlag: true, flagged: true, status: "won", open: 8, unflag: true, left: 0 });
});

test("opening a mine loses and marks it", async () => {
  const r = await inPage((M) => {
    let s = M.minesFromLayout(3, 3, [8]);
    s = M.minesOpen(s, 1, 1); // a number (no flood)
    s = M.minesOpen(s, 2, 2);
    return { status: s.status, hit: s.hit };
  });
  assert.deepEqual(r, { status: "lost", hit: 8 });
});

test("mines left counts flags and can go below zero", async () => {
  const r = await inPage((M) => {
    let s = M.minesFromLayout(3, 3, [0]);
    s = M.minesOpen(s, 1, 1); // a number (no flood)
    for (const [rr, cc] of [[0, 0], [0, 1], [1, 0]]) s = M.minesFlag(s, rr, cc);
    return M.minesLeft(s);
  });
  assert.equal(r, -2);
});

// ---------- On screen ----------

async function openMines(page, seams = {}) {
  await waitForGames(page);
  await page.evaluate((seams) => Object.assign(window, seams), seams);
  await page.locator(".meadow-controls").getByRole("button", { name: "Games" }).click();
  await page.getByRole("dialog", { name: "Retro games" }).getByRole("button", { name: /Minesweeper/ }).click();
  const game = page.getByRole("dialog", { name: "Minesweeper" });
  await game.waitFor();
  return game;
}
const cell = (page, r, c) => page.locator(`.ms-cell[data-r='${r}'][data-c='${c}']`);

test("the timer starts on the first open and each level keeps its best time", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  const game = await openMines(page, { __oneMinesSeed: 4 });
  assert.equal(await game.getByTestId("ms-time").textContent(), "0:00");
  await cell(page, 4, 4).click();
  await page.waitForFunction(() => document.querySelector("[data-testid=ms-time]").textContent === "0:01", null, { timeout: 3000 });
  await page.evaluate(() => window.__oneMinesSolve());
  await game.getByText(/You cleared it in \d+:\d\d!/).waitFor();
  assert.ok(await game.getByText("🏆 New best time!").isVisible());
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("one.games.v1")));
  assert.ok(records["mines-easy"].best >= 1);
  assert.equal(records["mines-medium"], undefined);
  assert.deepEqual(errors, []);
  await page.close();
});

test("right-click flags, a long press flags, and Flag mode makes taps flag", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", hasTouch: true });
  const game = await openMines(page, { __oneMinesSeed: 4 });
  await cell(page, 4, 4).click();
  const closed = await page.evaluate(() => [...document.querySelectorAll(".ms-cell[data-state='closed']")].slice(0, 3).map((el) => [el.dataset.r, el.dataset.c]));
  await cell(page, ...closed[0]).click({ button: "right" });
  assert.equal(await cell(page, ...closed[0]).getAttribute("data-state"), "flag");
  const box = await cell(page, ...closed[1]).boundingBox();
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await page.waitForTimeout(500);
  await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", clientX: x, clientY: y, bubbles: true })), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  assert.equal(await cell(page, ...closed[1]).getAttribute("data-state"), "flag");
  await game.getByRole("switch", { name: "Flag mode" }).click();
  await cell(page, ...closed[2]).click();
  assert.equal(await cell(page, ...closed[2]).getAttribute("data-state"), "flag");
  await page.close();
});

test("the keyboard plays: arrows move, Enter opens, F flags", async () => {
  const { page } = await openApp(browser, server.url, { route: "home" });
  await openMines(page, { __oneMinesSeed: 4 });
  await cell(page, 0, 0).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => [document.activeElement.dataset.r, document.activeElement.dataset.c].join()), "4,4");
  await page.keyboard.press("Enter");
  assert.equal(await cell(page, 4, 4).getAttribute("data-state"), "open");
  const target = await page.evaluate(() => {
    const el = document.querySelector(".ms-cell[data-state='closed']");
    return [el.dataset.r, el.dataset.c];
  });
  await cell(page, ...target).focus();
  await page.keyboard.press("f");
  assert.equal(await cell(page, ...target).getAttribute("data-state"), "flag");
  await page.close();
});

test("Hard scrolls inside its frame on a phone, never sideways", async () => {
  const { page } = await openApp(browser, server.url, { route: "home", viewport: { width: 375, height: 740 }, hasTouch: true });
  const game = await openMines(page, { __oneMinesSeed: 4 });
  await game.getByRole("radio", { name: "Hard" }).click();
  assert.equal(await page.locator(".ms-grid").getAttribute("data-rows"), "30");
  const r = await page.evaluate(() => {
    const frame = document.querySelector(".ms-frame");
    const g = document.querySelector(".games");
    const sq = document.querySelector(".ms-cell").getBoundingClientRect();
    return { scrolls: frame.scrollHeight > frame.clientHeight, sideways: g.scrollWidth > g.clientWidth, square: sq.width };
  });
  assert.equal(r.scrolls, true);
  assert.equal(r.sideways, false);
  assert.ok(r.square >= 20, `square ${r.square}`);
  await page.close();
});

test("leaving while the clock runs raises no errors", async () => {
  const { page, errors } = await openApp(browser, server.url, { route: "home" });
  await openMines(page, { __oneMinesSeed: 4 });
  await cell(page, 4, 4).click();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "All games" }).click();
  await page.waitForTimeout(1200);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => window.__oneActiveGame), undefined);
  await page.close();
});
