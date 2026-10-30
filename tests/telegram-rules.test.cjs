// The waiting and priority rules (pages/telegram/rules.js), in Node.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { waitingSince, currentLevel, waitingOrder, formatWait, DEFAULT_LIMITS, LEVELS, LEVEL_LABEL } = require("../pages/telegram/rules.js");

const H = 3600e3;
const msg = (id, out, date) => ({ id, chatId: "1", out, date, text: "", replyToId: null, media: null });

test("defaults: Normal 3 h, Low 12 h", () => {
  assert.deepEqual(DEFAULT_LIMITS, { normal: 180, low: 720 });
  assert.deepEqual(LEVELS, ["high", "normal", "low"]);
  assert.deepEqual(LEVEL_LABEL, { high: "High", normal: "Normal", low: "Low" });
});

test("a chat with no messages, or only mine, is not waiting", () => {
  assert.equal(waitingSince([]), null);
  assert.equal(waitingSince([msg(1, true, 10), msg(2, true, 20)]), null);
});

test("waiting counts from their first message after my last reply", () => {
  const list = [msg(1, false, 10), msg(2, true, 20), msg(3, false, 30), msg(4, false, 40)];
  assert.equal(waitingSince(list), 30);
  assert.equal(waitingSince([msg(1, false, 10), msg(2, false, 20)]), 10);
});

test("No reply needed covers messages up to the one it was given", () => {
  const list = [msg(1, false, 10), msg(2, true, 20), msg(3, false, 30), msg(4, false, 40)];
  assert.equal(waitingSince(list, 4), null);
  assert.equal(waitingSince([...list, msg(5, false, 50)], 4), 50);
});

test("moving up happens exactly at each limit", () => {
  const L = DEFAULT_LIMITS;
  assert.deepEqual(currentLevel("low", 12 * H - 1, L), { level: "low", movedFrom: null });
  assert.deepEqual(currentLevel("low", 12 * H, L), { level: "normal", movedFrom: "low" });
  assert.deepEqual(currentLevel("low", 15 * H - 1, L), { level: "normal", movedFrom: "low" });
  assert.deepEqual(currentLevel("low", 15 * H, L), { level: "high", movedFrom: "low" });
  assert.deepEqual(currentLevel("normal", 3 * H, L), { level: "high", movedFrom: "normal" });
  assert.deepEqual(currentLevel("high", 100 * H, L), { level: "high", movedFrom: null });
});

test("custom limits move chats sooner", () => {
  assert.deepEqual(currentLevel("low", 6 * H, { normal: 60, low: 360 }), { level: "normal", movedFrom: "low" });
});

test("order: higher level first, then the longest wait", () => {
  const now = 100 * H;
  const order = waitingOrder(
    [
      { id: "n", name: "Normal 2h", level: "normal", since: now - 2 * H },
      { id: "h", name: "High 5m", level: "high", since: now - 5 * 60e3 },
      { id: "q", name: "Quiet", level: "high", since: null }
    ],
    now,
    DEFAULT_LIMITS
  );
  assert.deepEqual(order.map((c) => c.id), ["h", "n"]);
  assert.deepEqual(order[1], { id: "n", name: "Normal 2h", level: "normal", current: "normal", waitedMs: 2 * H, movedFrom: null });
});

test("a chat that moved up goes ahead of a newer one at that level", () => {
  const now = 100 * H;
  const order = waitingOrder(
    [
      { id: "h", name: "High 1h", level: "high", since: now - H },
      { id: "n", name: "Normal 4h", level: "normal", since: now - 4 * H }
    ],
    now,
    DEFAULT_LIMITS
  );
  assert.deepEqual(order.map((c) => [c.id, c.current, c.movedFrom]), [["n", "high", "normal"], ["h", "high", null]]);
});

test("equal waits go by name", () => {
  const now = 10 * H;
  const order = waitingOrder(
    [
      { id: "b", name: "Bek", level: "low", since: now - H },
      { id: "a", name: "Ali", level: "low", since: now - H }
    ],
    now,
    DEFAULT_LIMITS
  );
  assert.deepEqual(order.map((c) => c.id), ["a", "b"]);
});

test("waits read as minutes, hours or days", () => {
  assert.equal(formatWait(0), "1 min");
  assert.equal(formatWait(90e3), "2 min");
  assert.equal(formatWait(59 * 60e3), "59 min");
  assert.equal(formatWait(H), "1 h");
  assert.equal(formatWait(5 * H + 20 * 60e3), "5 h");
  assert.equal(formatWait(47 * H), "47 h");
  assert.equal(formatWait(48 * H), "2 days");
  assert.equal(formatWait(49 * H), "2 days");
});
