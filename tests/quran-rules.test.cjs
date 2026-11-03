// The Quran learning rules (pages/quran/rules.js), in Node. The index here is
// made up (surah numbers and word counts only), never Quran text.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { STATES, buildPath, blockState, stepState, currentBlock, dayCount, progressMap } = require("../pages/quran/rules.js");

const idx = [[1, 29], [2, 6100], [103, 14], [108, 10], [110, 19], [112, 15], [113, 23], [114, 20]].map(([n, words]) => ({ n, words }));
const P = (o) => new Map(Object.entries(o).map(([n, v]) => [Number(n), { surah: Number(n), ...v }]));

test("states", () => {
  assert.deepEqual(STATES, ["learning", "learned", "needs-work", "solid", "known"]);
});

test("path: shortest first, ties by number, blocks of 4, last block shorter", () => {
  assert.deepEqual(buildPath(idx, P({})), [[108, 103, 112, 110], [114, 113, 1, 2]]);
  const tie = [{ n: 5, words: 10 }, { n: 4, words: 10 }];
  assert.deepEqual(buildPath(tie, P({})), [[4, 5]]);
});

test("known surahs leave the path and blocks refill", () => {
  assert.deepEqual(buildPath(idx, P({ 112: { state: "known" } })), [[108, 103, 110, 114], [113, 1, 2]]);
});

test("marking the current surah known moves on and keeps other progress", () => {
  const p = P({ 108: { state: "learned" }, 103: { state: "known" } });
  const path = buildPath(idx, p);
  assert.deepEqual(path[0], [108, 112, 110, 114]);
  assert.deepEqual(blockState(path[0], p), { status: "studying", current: 112 });
  assert.equal(stepState(108, path[0], p), "done");
  assert.equal(stepState(112, path[0], p), "current");
  assert.equal(stepState(110, path[0], p), "locked");
});

test("review opens when all four are done, block done when all are solid", () => {
  const b = [108, 103, 112, 110];
  const learned = P({ 108: { state: "learned" }, 103: { state: "learned" }, 112: { state: "learned" }, 110: { state: "learned" } });
  assert.deepEqual(blockState(b, learned), { status: "review", current: null });
  const mixed = P({ 108: { state: "solid" }, 103: { state: "needs-work" }, 112: { state: "solid" }, 110: { state: "solid" } });
  assert.deepEqual(blockState(b, mixed), { status: "studying", current: 103 });
  assert.equal(stepState(103, b, mixed), "needs-work");
  const solid = P({ 108: { state: "solid" }, 103: { state: "solid" }, 112: { state: "solid" }, 110: { state: "solid" } });
  assert.deepEqual(blockState(b, solid), { status: "done", current: null });
  assert.equal(currentBlock([b, [114]], solid), 1);
  assert.equal(currentBlock([b], solid), 1);
});

test("day count from the earliest start, and past 14", () => {
  const b = [108, 103];
  assert.equal(dayCount(b, P({}), "2026-11-03"), null);
  assert.deepEqual(dayCount(b, P({ 108: { state: "learned", startedAt: "2026-11-01" }, 103: { state: "learning", startedAt: "2026-11-02" } }), "2026-11-03"), { day: 3, of: 14 });
  assert.equal(dayCount(b, P({ 108: { state: "learning", startedAt: "2026-10-01" } }), "2026-11-03").day, 34);
});

test("one entry per surah when two devices changed it", () => {
  const m = progressMap([{ id: "a", surah: 112, state: "learning", _m: 1 }, { id: "b", surah: 112, state: "learned", _m: 2 }]);
  assert.equal(m.get(112).state, "learned");
});
