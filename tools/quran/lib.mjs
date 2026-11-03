// Core — Quran data: joins the three sources for one surah and checks the
// result. Pure functions; tools/quran/build-data.mjs does the downloading.
// Text is only trimmed, never changed (QuranEnc's terms: no changes).

export const SOURCES = {
  arabic: "Quran.com API v4, text_uthmani (Tanzil text)",
  translation: "QuranEnc, uzbek_sadiq: Shaykh Muhammad Sodiq Muhammad Yusuf",
  reading: "github.com/AbdurazzoqAbdugafforov/uzbek-quran-transliteration, uzbekReading"
};

const ARABIC_LETTER = /[ء-يٱ]/;
// Words with at least one Arabic letter; pause marks standing alone don't count.
export function countWords(arabic) {
  return String(arabic || "").split(/\s+/).filter((w) => ARABIC_LETTER.test(w)).length;
}

const clean = (s) => (typeof s === "string" ? s.trim() : "");

// One surah file from the three sources, joined by verse number. `counts`
// keeps how many verses each source had, for validateSurah; the script drops
// it before writing.
export function buildSurah({ n, chapter, arabic, translation, reading }) {
  const tr = new Map(translation.map((t) => [Number(t.aya), t.translation]));
  const rd = new Map(reading.map((r) => [Number(r.ayahNumber), r.uzbekReading]));
  const verses = [...arabic]
    .sort((a, b) => a.verse_number - b.verse_number)
    .map((v) => ({ n: v.verse_number, ar: clean(v.text_uthmani), reading: clean(rd.get(v.verse_number)), uz: clean(tr.get(v.verse_number)) }));
  return {
    n,
    nameAr: clean(chapter.name_arabic),
    nameUz: clean(chapter.name_simple),
    meaningUz: clean(chapter.translated_name && chapter.translated_name.name),
    verses,
    sources: { ...SOURCES },
    counts: { arabic: arabic.length, translation: translation.length, reading: reading.length }
  };
}

// Problems with one surah file; empty when it's fine.
export function validateSurah(file) {
  const out = [];
  const c = file.counts || { arabic: file.verses.length, translation: file.verses.length, reading: file.verses.length };
  if (c.reading !== c.arabic) out.push(`surah ${file.n}: ${c.arabic} Arabic verses, ${c.reading} readings`);
  if (c.translation !== c.arabic) out.push(`surah ${file.n}: ${c.arabic} Arabic verses, ${c.translation} translations`);
  file.verses.forEach((v, i) => {
    if (v.n !== i + 1) out.push(`surah ${file.n}: verse ${i + 1} is numbered ${v.n}`);
    for (const [key, name] of [["ar", "Arabic"], ["reading", "reading"], ["uz", "translation"]]) {
      if (!v[key]) out.push(`surah ${file.n} verse ${v.n}: empty ${name}`);
    }
  });
  if (!file.nameUz || !file.nameAr) out.push(`surah ${file.n}: missing name`);
  return out;
}
