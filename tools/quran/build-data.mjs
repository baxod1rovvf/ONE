// Core — downloads the Quran text for the learning section and writes
// pages/quran/data/<n>.json and index.json. Run by hand:
//   node tools/quran/build-data.mjs
// It needs api.quran.com, quranenc.com and raw.githubusercontent.com. It
// writes nothing when any surah's sources disagree or a field is empty.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSurah, countWords, validateSurah } from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "../../pages/quran/data");
const QURAN = "https://api.quran.com/api/v4";
const ENC = "https://quranenc.com/api/v1/translation/sura/uzbek_sadiq";
const READING = "https://raw.githubusercontent.com/AbdurazzoqAbdugafforov/uzbek-quran-transliteration/main/quran_json/surahs";

async function getJSON(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

const { chapters } = await getJSON(`${QURAN}/chapters?language=uz`);
const files = [];
const problems = [];
for (let n = 1; n <= 114; n++) {
  const chapter = chapters.find((c) => c.id === n);
  const [{ verses }, enc, reading] = await Promise.all([
    getJSON(`${QURAN}/verses/by_chapter/${n}?fields=text_uthmani&per_page=300`),
    getJSON(`${ENC}/${n}`),
    getJSON(`${READING}/${n}.json`)
  ]);
  const file = buildSurah({ n, chapter, arabic: verses, translation: enc.result, reading: reading.ayahs });
  problems.push(...validateSurah(file));
  files.push(file);
  process.stdout.write(`\r${n}/114`);
}
process.stdout.write("\n");
if (problems.length) {
  console.error(`Not written. ${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
const fetchedAt = new Date().toISOString().slice(0, 10);
await mkdir(OUT, { recursive: true });
for (const f of files) {
  const { counts, ...file } = f;
  await writeFile(path.join(OUT, `${f.n}.json`), JSON.stringify({ ...file, fetchedAt }, null, 1) + "\n");
}
const index = files.map((f) => ({ n: f.n, nameAr: f.nameAr, nameUz: f.nameUz, verses: f.verses.length, words: f.verses.reduce((s, v) => s + countWords(v.ar), 0), fetchedAt }));
await writeFile(path.join(OUT, "index.json"), JSON.stringify(index, null, 1) + "\n");
console.log(`wrote ${files.length} surahs`);
