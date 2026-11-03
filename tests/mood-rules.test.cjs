// The Mood rules (pages/mood/rules.js), in Node.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { weekStart, weekDays, shiftWeek, canMark, hasNote, latestByDate, summarize } = require("../pages/mood/rules.js");

const e = (date, mood, note = "", extra = {}) => ({ id: date + mood, date, mood, note, createdAt: "2026-11-01T00:00:00Z", ...extra });

test("weeks run Monday to Sunday, across months, years and clock changes", () => {
  assert.equal(weekStart("2026-11-02"), "2026-11-02"); // Monday
  assert.equal(weekStart("2026-11-08"), "2026-11-02"); // Sunday
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
  assert.deepEqual(weekDays("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.deepEqual(weekDays("2026-03-23").slice(5), ["2026-03-28", "2026-03-29"]);
  assert.equal(weekStart("2026-03-29"), "2026-03-23");
  assert.equal(shiftWeek("2026-11-02", -1), "2026-10-26");
  assert.equal(shiftWeek("2026-12-28", 1), "2027-01-04");
});

test("today and past days can be marked, future days cannot", () => {
  assert.equal(canMark("2026-11-02", "2026-11-02"), true);
  assert.equal(canMark("2026-11-01", "2026-11-02"), true);
  assert.equal(canMark("2026-11-03", "2026-11-02"), false);
});

test("the week's mood is the rounded average of marked days", () => {
  const s = summarize([e("2026-11-02", 4), e("2026-11-03", 3), e("2026-11-04", null, "just a note")], "2026-11-02");
  assert.equal(s.marked, 2);
  assert.equal(s.average, 4); // 3.5 rounds up
  assert.equal(summarize([e("2026-11-02", 2), e("2026-11-03", 3), e("2026-11-04", 3)], "2026-11-02").average, 3); // 2.67
  assert.equal(summarize([], "2026-11-02").average, null);
  assert.equal(summarize([e("2026-10-30", 5)], "2026-11-02").marked, 0); // another week
});

test("best and worst: ties go to a day with a note, then the later day", () => {
  const s = summarize([e("2026-11-02", 5, "run"), e("2026-11-04", 5), e("2026-11-03", 1), e("2026-11-05", 1)], "2026-11-02");
  assert.equal(s.best.date, "2026-11-02");
  assert.equal(s.worst.date, "2026-11-05");
});

test("a note of only spaces is no note", () => {
  const s = summarize([e("2026-11-02", 5, "   "), e("2026-11-03", 5), e("2026-11-04", 2)], "2026-11-02");
  assert.equal(s.best.date, "2026-11-03");
  assert.deepEqual(s.notes, []);
  assert.equal(hasNote({ note: " \n " }), false);
});

test("best and worst need two marked days that differ", () => {
  assert.equal(summarize([e("2026-11-02", 4)], "2026-11-02").best, null);
  const same = summarize([e("2026-11-02", 3), e("2026-11-03", 3)], "2026-11-02");
  assert.equal(same.best, null);
  assert.equal(same.worst, null);
});

test("one entry per day when two devices marked the same day", () => {
  const a = e("2026-11-02", 2, "", { id: "a", _m: 100 });
  const b = e("2026-11-02", 5, "", { id: "b", _m: 200 });
  assert.equal(latestByDate([a, b]).get("2026-11-02").id, "b");
  const s = summarize([a, b, e("2026-11-03", 3)], "2026-11-02");
  assert.equal(s.marked, 2);
  assert.equal(s.best.id, "b");
});

test("the week's notes, newest first", () => {
  const s = summarize([e("2026-11-02", 4, "a"), e("2026-11-04", null, "c"), e("2026-11-03", 2, "b")], "2026-11-02");
  assert.deepEqual(s.notes.map((x) => x.note), ["c", "b", "a"]);
});
