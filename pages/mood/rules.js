// Core — Mood: weeks, the week's mood, and its best and worst day. Plain
// functions with no dependencies, used by the Mood page in the browser
// (window.__oneMoodRules) and by the tests in Node (module.exports).
// Dates are local days written YYYY-MM-DD; the maths reads them as UTC so
// clock changes and time zones never shift a day.
(function (root) {
  "use strict";
  const DAY = 864e5;
  const toTime = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const toISO = (t) => new Date(t).toISOString().slice(0, 10);

  // The Monday on or before this day.
  function weekStart(iso) {
    const t = toTime(iso);
    const back = (new Date(t).getUTCDay() + 6) % 7;
    return toISO(t - back * DAY);
  }
  function weekDays(startIso) {
    const t = toTime(startIso);
    return Array.from({ length: 7 }, (_, i) => toISO(t + i * DAY));
  }
  function shiftWeek(startIso, n) {
    return toISO(toTime(startIso) + n * 7 * DAY);
  }
  function canMark(iso, today) {
    return iso <= today;
  }
  function hasNote(entry) {
    return !!entry && typeof entry.note === "string" && entry.note.trim() !== "";
  }
  // One entry per day: when two devices marked the same day before they
  // synced, the one changed last wins.
  function latestByDate(entries) {
    const out = new Map();
    const newer = (a, b) => (a._m || 0) !== (b._m || 0) ? (a._m || 0) > (b._m || 0) : (a.createdAt || "") > (b.createdAt || "");
    for (const e of entries) {
      const have = out.get(e.date);
      if (!have || newer(e, have)) out.set(e.date, e);
    }
    return out;
  }
  // Best first: higher mood, then a day with a note, then the later day.
  function rank(list, dir) {
    return [...list].sort((a, b) => dir * (b.mood - a.mood) || hasNote(b) - hasNote(a) || b.date.localeCompare(a.date));
  }
  function summarize(entries, startIso) {
    const byDate = latestByDate(entries);
    const days = weekDays(startIso).map((d) => byDate.get(d)).filter(Boolean);
    const marked = days.filter((e) => e.mood >= 1 && e.mood <= 5);
    const average = marked.length ? Math.floor(marked.reduce((s, e) => s + e.mood, 0) / marked.length + 0.5) : null;
    const differ = marked.length >= 2 && marked.some((e) => e.mood !== marked[0].mood);
    return {
      marked: marked.length,
      average,
      best: differ ? rank(marked, 1)[0] : null,
      worst: differ ? rank(marked, -1)[0] : null,
      notes: days.filter(hasNote).sort((a, b) => b.date.localeCompare(a.date))
    };
  }

  const api = { weekStart, weekDays, shiftWeek, canMark, hasNote, latestByDate, summarize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__oneMoodRules = api;
})(typeof window !== "undefined" ? window : globalThis);
