// Core — Quran data: joins the three sources for one surah and checks the
// result. Pure functions; tools/quran/build-data.mjs does the downloading.
// Text is only trimmed, never changed (QuranEnc's terms: no changes).

export const SOURCES = {
  arabic: "Quran.com API v4, text_uthmani (Tanzil text)",
  translation: "QuranEnc, uzbek_sadiq: Shaykh Muhammad Sodiq Muhammad Yusuf (converted to Latin script)",
  reading: "github.com/AbdurazzoqAbdugafforov/uzbek-quran-transliteration, uzbekReading"
};

const ARABIC_LETTER = /[ء-يٱ]/;
// Words with at least one Arabic letter; pause marks standing alone don't count.
export function countWords(arabic) {
  return String(arabic || "").split(/\s+/).filter((w) => ARABIC_LETTER.test(w)).length;
}

// Uzbek Cyrillic to Latin, letter by letter, by the standard alphabet rules.
// Only the letters change; words, punctuation and numbers stay as they are.
const OKINA = "\u02BB"; // the turned comma in oʻ and gʻ
const TUTUQ = "\u02BC"; // the apostrophe for ъ
const LETTERS = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g" + OKINA, д: "d", ж: "j", з: "z", и: "i", й: "y", к: "k", қ: "q", л: "l",
  м: "m", н: "n", о: "o", ў: "o" + OKINA, п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ҳ: "h", ч: "ch",
  ш: "sh", ъ: TUTUQ, ь: "", э: "e", ё: "yo", ю: "yu", я: "ya"
};
const CYR_VOWEL = /[аоуэиеёюяў]/;
const isCyr = (c) => /[\u0400-\u04FF]/.test(c);
export function cyrToLatin(text) {
  const chars = [...String(text)];
  let out = "";
  chars.forEach((ch, i) => {
    const low = ch.toLowerCase();
    if (!isCyr(ch)) {
      out += ch;
      return;
    }
    const prev = (chars[i - 1] || "").toLowerCase();
    const atStart = !isCyr(chars[i - 1] || " ");
    let lat;
    if (low === "е") lat = atStart || CYR_VOWEL.test(prev) || prev === "ъ" || prev === "ь" ? "ye" : "e";
    else if (low === "ц") lat = !atStart && CYR_VOWEL.test(prev) ? "ts" : "s";
    else lat = LETTERS[low] !== undefined ? LETTERS[low] : ch;
    if (ch !== low && lat) {
      // An all-capitals word stays all capitals; otherwise only the first letter is.
      const next = chars[i + 1] || "";
      const wordUpper = next !== next.toLowerCase() || (prev && isCyr(chars[i - 1]) && chars[i - 1] !== prev);
      lat = wordUpper ? lat.toUpperCase() : lat[0].toUpperCase() + lat.slice(1);
    }
    out += lat;
  });
  return out;
}

const clean = (s) => (typeof s === "string" ? s.trim() : "");

// One surah file from the three sources, joined by verse number. `counts`
// keeps how many verses each source had, for validateSurah; the script drops
// it before writing.
export function buildSurah({ n, chapter, arabic, translation, reading }) {
  const tr = new Map(translation.map((t) => [Number(t.aya), t.translation]));
  const fn = new Map(translation.map((t) => [Number(t.aya), t.footnotes]));
  const rd = new Map(reading.map((r) => [Number(r.ayahNumber), r.uzbekReading]));
  const verses = [...arabic]
    .sort((a, b) => a.verse_number - b.verse_number)
    .map((v) => {
      const verse = { n: v.verse_number, ar: clean(v.text_uthmani), reading: clean(rd.get(v.verse_number)), uz: cyrToLatin(clean(tr.get(v.verse_number))) };
      // The translator's footnotes ("[1] …") stay with their verse.
      const notes = clean(fn.get(v.verse_number));
      if (notes) verse.notes = cyrToLatin(notes);
      return verse;
    });
  return {
    n,
    nameAr: clean(chapter.name_arabic),
    nameUz: clean(chapter.name_simple),
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
