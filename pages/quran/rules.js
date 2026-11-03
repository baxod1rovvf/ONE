// Core — Quran learning: the path of surahs, its blocks of four, each step's
// state and the block's day. Plain functions with no dependencies, used by the
// Quran page in the browser (window.__oneQuranRules) and by the tests in Node.
(function (root) {
  "use strict";
  const STATES = ["learning", "learned", "needs-work", "solid", "known"];
  const BLOCK = 4;
  const DAY = 864e5;
  const toTime = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };

  // One entry per surah: when two devices changed it before syncing, the one
  // changed last wins.
  function progressMap(entries) {
    const out = new Map();
    const newer = (a, b) => ((a._m || 0) !== (b._m || 0) ? (a._m || 0) > (b._m || 0) : (a.updatedAt || "") > (b.updatedAt || ""));
    for (const e of entries || []) {
      const have = out.get(e.surah);
      if (!have || newer(e, have)) out.set(e.surah, e);
    }
    return out;
  }
  const stateOf = (progress, n) => (progress.get(n) || {}).state || null;
  const isDone = (s) => s === "learned" || s === "solid";

  // Shortest first (by Arabic word count), ties by surah number; known
  // surahs leave the path; the rest in blocks of four.
  function buildPath(index, progress) {
    const order = [...index]
      .filter((s) => stateOf(progress, s.n) !== "known")
      .sort((a, b) => a.words - b.words || a.n - b.n)
      .map((s) => s.n);
    const blocks = [];
    for (let i = 0; i < order.length; i += BLOCK) blocks.push(order.slice(i, i + BLOCK));
    return blocks;
  }
  // Studying until every surah is learned or solid; then the review, until
  // every one is solid.
  function blockState(block, progress) {
    const next = block.find((n) => !isDone(stateOf(progress, n)));
    if (next !== undefined) return { status: "studying", current: next };
    if (block.every((n) => stateOf(progress, n) === "solid")) return { status: "done", current: null };
    return { status: "review", current: null };
  }
  function stepState(n, block, progress) {
    const s = stateOf(progress, n);
    if (isDone(s)) return "done";
    if (s === "needs-work") return "needs-work";
    return blockState(block, progress).current === n ? "current" : "locked";
  }
  function currentBlock(path, progress) {
    const i = path.findIndex((b) => blockState(b, progress).status !== "done");
    return i === -1 ? path.length : i;
  }
  // "Day N of 14", counted from the block's earliest start (day 1).
  function dayCount(block, progress, today) {
    const starts = block.map((n) => (progress.get(n) || {}).startedAt).filter(Boolean).sort();
    if (!starts.length) return null;
    return { day: Math.round((toTime(today) - toTime(starts[0])) / DAY) + 1, of: 14 };
  }

  const api = { STATES, buildPath, blockState, stepState, currentBlock, dayCount, progressMap };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__oneQuranRules = api;
})(typeof window !== "undefined" ? window : globalThis);
