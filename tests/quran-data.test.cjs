// The committed Quran data (pages/quran/data), made by tools/quran/build-data.mjs.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DIR = path.join(__dirname, "..", "pages", "quran", "data");
const index = JSON.parse(fs.readFileSync(path.join(DIR, "index.json"), "utf8"));
const surah = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), "utf8"));

test("114 surah files and an index sorted by number", () => {
  assert.equal(index.length, 114);
  assert.deepEqual(index.map((s) => s.n), Array.from({ length: 114 }, (_, i) => i + 1));
  for (let n = 1; n <= 114; n++) assert.ok(fs.existsSync(path.join(DIR, `${n}.json`)), `${n}.json`);
});

test("every surah matches its index entry and has its sources", () => {
  for (const entry of index) {
    const f = surah(entry.n);
    assert.equal(f.n, entry.n);
    assert.equal(f.verses.length, entry.verses, `surah ${entry.n} verse count`);
    assert.ok(entry.words > 0, `surah ${entry.n} words`);
    assert.ok(entry.nameUz && entry.nameAr, `surah ${entry.n} names`);
    assert.ok(f.sources.arabic && f.sources.translation && f.sources.reading, `surah ${entry.n} sources`);
    assert.match(f.fetchedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
});

test("no verse is missing its Arabic, reading or translation", () => {
  for (const entry of index) {
    surah(entry.n).verses.forEach((v, i) => {
      const where = `surah ${entry.n} verse ${v.n}`;
      assert.equal(v.n, i + 1, where);
      assert.match(v.ar, /[؀-ۿ]/, `${where} Arabic`);
      assert.ok(v.reading.trim(), `${where} reading`);
      assert.ok(v.uz.trim(), `${where} translation`);
      assert.doesNotMatch(v.uz, /[Ѐ-ӿ]/, `${where} translation still has Cyrillic`);
    });
  }
});

test("every footnote marker in a translation has its note", () => {
  for (const entry of index) {
    for (const v of surah(entry.n).verses) {
      for (const [, k] of v.uz.matchAll(/\[(\d+)\]/g)) assert.ok((v.notes || "").includes(`[${k}]`), `surah ${entry.n} verse ${v.n} note [${k}]`);
    }
  }
});

test("the index carries each surah file's version", () => {
  for (const entry of index) assert.equal(entry.fetchedAt, surah(entry.n).fetchedAt, `surah ${entry.n}`);
});
