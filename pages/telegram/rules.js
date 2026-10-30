// ONE — Telegram: who is waiting, and in what order. Plain functions with no
// dependencies, used by the Telegram service in the browser
// (window.__oneTelegramRules) and by the tests in Node (module.exports).
(function (root) {
  "use strict";
  const LEVELS = ["high", "normal", "low"];
  const LEVEL_LABEL = { high: "High", normal: "Normal", low: "Low" };
  // Minutes a chat may wait at a level before it moves up one.
  const DEFAULT_LIMITS = { normal: 180, low: 720 };
  const MIN = 60e3;
  const HOUR = 60 * MIN;

  // When they started waiting: the date of their first message after my last
  // one, skipping messages up to `handled` ("No reply needed"). Messages are
  // in ascending id order.
  function waitingSince(messages, handled) {
    let since = null;
    for (const m of messages) {
      if (m.out) since = null;
      else if (!(handled >= m.id) && since === null) since = m.date;
    }
    return since;
  }

  // The level a chat is at after waiting `waitedMs`: up one level each time
  // it waits past the limit of the level it is at.
  function currentLevel(level, waitedMs, limits) {
    let at = level;
    let total = 0;
    while (at !== "high") {
      total += (at === "low" ? limits.low : limits.normal) * MIN;
      if (waitedMs < total) break;
      at = at === "low" ? "normal" : "high";
    }
    return { level: at, movedFrom: at === level ? null : level };
  }

  // The waiting chats, in the order to answer them: higher level first,
  // then whoever has waited longest.
  function waitingOrder(chats, now, limits) {
    return chats
      .filter((c) => c.since !== null && c.since !== undefined)
      .map((c) => {
        const waitedMs = Math.max(0, now - c.since);
        const { level, movedFrom } = currentLevel(c.level, waitedMs, limits);
        return { id: c.id, name: c.name, level: c.level, current: level, waitedMs, movedFrom };
      })
      .sort((a, b) => LEVELS.indexOf(a.current) - LEVELS.indexOf(b.current) || b.waitedMs - a.waitedMs || a.name.localeCompare(b.name));
  }

  // "2 min", "5 h", "2 days".
  function formatWait(ms) {
    if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / MIN))} min`;
    if (ms < 48 * HOUR) return `${Math.floor(ms / HOUR)} h`;
    return `${Math.floor(ms / (24 * HOUR))} days`;
  }

  const api = { LEVELS, LEVEL_LABEL, DEFAULT_LIMITS, waitingSince, currentLevel, waitingOrder, formatWait };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__oneTelegramRules = api;
})(typeof window !== "undefined" ? window : globalThis);
