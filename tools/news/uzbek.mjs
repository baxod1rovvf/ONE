// Uzbek text in the usual Latin spelling (oʻ, gʻ, sh, ch), whichever way a
// source writes it: in Cyrillic (Gazeta.uz), in the proposed new Latin with
// ş, ç, ö, ğ (Kun.uz), or with plain apostrophes (o', g').

const VOWELS = "аеёиоуэюяўАЕЁИОУЭЮЯЎ";
const SIGNS = "ъьЪЬ";
const MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ч: "ch", ш: "sh", щ: "sh",
  ъ: "ʼ", ы: "i", ь: "", э: "e", ю: "yu", я: "ya", ў: "oʻ", қ: "q", ғ: "gʻ", ҳ: "h"
};
const isLetter = (c) => !!c && /\p{L}/u.test(c);
const isUpper = (c) => !!c && c !== c.toLowerCase();

// One Cyrillic letter, given its neighbours.
function letter(c, prev, next) {
  const low = c.toLowerCase();
  let out;
  if (low === "е") {
    // "ye" at the start of a word and after a vowel or a sign: ер → yer, лекин → lekin.
    out = !isLetter(prev) || VOWELS.includes(prev) || SIGNS.includes(prev) ? "ye" : "e";
  } else if (low === "ц") {
    // "s" at the start of a word or after a consonant (Цезарь → Sezar), "ts" after a vowel.
    out = isLetter(prev) && VOWELS.includes(prev) ? "ts" : "s";
  } else if (low in MAP) {
    out = MAP[low];
  } else {
    return c;
  }
  if (!isUpper(c) || !out) return out;
  // A capital: "Sh" in a word, "SH" in a word written all in capitals.
  const allCaps = isUpper(next) || (!isLetter(next) && isUpper(prev));
  return allCaps ? out.toUpperCase() : out.charAt(0).toUpperCase() + out.slice(1);
}

export function cyrillicToLatin(text) {
  if (!/[Ѐ-ӿ]/.test(text)) return text;
  const chars = [...text];
  return chars.map((c, i) => letter(c, chars[i - 1], chars[i + 1])).join("");
}

// The proposed alphabet's letters, and apostrophe look-alikes, in the usual spelling.
export function standardLatin(text) {
  return text
    .replace(/Ş(?=\p{Lu})/gu, "SH")
    .replace(/Ç(?=\p{Lu})/gu, "CH")
    .replace(/Ş/g, "Sh")
    .replace(/ş/g, "sh")
    .replace(/Ç/g, "Ch")
    .replace(/ç/g, "ch")
    .replace(/Ö/g, "Oʻ")
    .replace(/ö/g, "oʻ")
    .replace(/Ğ/g, "Gʻ")
    .replace(/ğ/g, "gʻ")
    .replace(/Ñ/g, "Ng")
    .replace(/ñ/g, "ng")
    // ’ and ʼ are left alone: they also stand for the tutuq belgisi (moʼjiza).
    .replace(/([oOgG])['‘`](?=\p{L})/gu, "$1ʻ");
}

export function toUzbekLatin(text) {
  return typeof text === "string" ? standardLatin(cyrillicToLatin(text)) : text;
}
