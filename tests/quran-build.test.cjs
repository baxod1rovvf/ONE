// The Quran data script's logic (tools/quran/lib.mjs), in Node. The fixture
// is a verbatim copy of the reading project's file for surah 112, downloaded
// with curl; nothing here is typed by hand.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const g = require("./fixtures/quran/112-reading.json").ayahs;

const lib = () => import("../tools/quran/lib.mjs");
const chapter = { name_arabic: "x", name_simple: "Al-Ikhlas", translated_name: { name: "y" } };
const sources = (over = {}) => ({
  n: 112,
  chapter,
  arabic: g.map((a) => ({ verse_number: a.ayahNumber, text_uthmani: a.arabic })),
  translation: g.map((a) => ({ aya: String(a.ayahNumber), translation: a.uzbekTranslation })),
  reading: g,
  ...over
});

test("countWords counts Arabic words, not pause marks", async () => {
  const { countWords } = await lib();
  assert.equal(countWords("كلمة ۖ كلمة"), 2); // two made-up words and a pause mark
  assert.equal(countWords(""), 0);
});

test("buildSurah joins the three sources by verse number", async () => {
  const { buildSurah, validateSurah } = await lib();
  const file = buildSurah(sources());
  assert.equal(file.n, 112);
  assert.equal(file.nameUz, "Al-Ikhlas");
  assert.equal(file.verses.length, g.length);
  assert.deepEqual(file.verses.map((v) => v.n), g.map((a) => a.ayahNumber));
  assert.equal(file.verses[1].ar, g[1].arabic.trim());
  assert.equal(file.verses[1].reading, g[1].uzbekReading.trim());
  assert.equal(file.verses[1].uz, g[1].uzbekTranslation.trim());
  assert.ok(file.sources.arabic && file.sources.translation && file.sources.reading);
  assert.deepEqual(validateSurah(file), []);
});

test("validateSurah names count mismatches and empty fields", async () => {
  const { buildSurah, validateSurah } = await lib();
  const tr = g.map((a) => ({ aya: String(a.ayahNumber), translation: a.uzbekTranslation }));
  tr[1].translation = "  ";
  const file = buildSurah(sources({ reading: g.slice(0, 3), translation: tr }));
  const problems = validateSurah(file);
  assert.ok(problems.includes("surah 112: 4 Arabic verses, 3 readings"), problems.join("\n"));
  assert.ok(problems.includes("surah 112 verse 2: empty translation"), problems.join("\n"));
});
