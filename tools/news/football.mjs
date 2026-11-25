// What a football story is about, for its short title on the News page:
// "Gol - 2005 - Messi - Manchester United". The kind (goal, dribble, transfer,
// …), a year when the title names one, then the player and team it mentions.
// When no known player or team is named, the (Uzbek) title itself, shortened.

const KINDS = {
  moments: [
    ["Dribling", /dribbl|skills?\b|nutmeg|rabona|tricks?\b|solo run|dribling|mahorat|finta/i],
    ["Seyv", /\bsaves?\b|goalkeeper|keeper|darvozabon|seyv/i],
    ["Gol", /goal|golazo|screamer|worldie|volley|free[- ]?kick|bicycle|overhead|scissor|panenka|\bstrike\b|\bgol/i]
  ],
  news: [
    ["Jarohat", /injur|ruled out|surgery|hamstring|sidelined|knee|ankle|jarohat/i],
    ["Transfer", /transfer|\bsigns?\b|signing|\bjoins?\b|\bloan\b|\bdeal\b|\bbid\b|contract|move to|ijara|shartnoma|o[ʻ'‘]tadi|qo[ʻ'‘]shil/i],
    ["Natija", /\b\d+\s?[-–:]\s?\d+\b|\bbeat\b|\bwins?\b|\bwon\b|\bdraw\b|\bdrew\b|\bdefeat|thrash|victory|\blos[et]\b|g[ʻ'‘]alaba|mag[ʻ'‘]lub|durang|hisob/i]
  ]
};
const DEFAULT_KIND = { moments: "Lahza", news: "Yangilik" };

export function kindOf(story) {
  const text = `${story.title} ${story.topic === "moments" ? story.summary || "" : ""}`;
  for (const [kind, re] of KINDS[story.topic] || []) if (re.test(text)) return kind;
  return DEFAULT_KIND[story.topic] || "Yangilik";
}

// [display name, ...ways titles write it (English, Uzbek)]. Longer ways first
// where one contains another.
const PLAYERS = [
  ["Ronaldo Nazário", "ronaldo nazário", "ronaldo nazario", "r9"],
  ["Ronaldinho", "ronaldinho", "ronaldinyo"],
  ["Cristiano Ronaldo", "cristiano ronaldo", "cristiano", "ronaldo", "ronaldu", "cr7"],
  ["Messi", "messi"], ["Neymar", "neymar"], ["Mbappé", "mbappé", "mbappe"], ["Haaland", "haaland", "xolann", "holand"],
  ["Zidane", "zidane", "zidan"], ["Kaká", "kaká", "kaka"], ["Henry", "thierry henry"], ["Beckham", "beckham", "bekxem"],
  ["Rooney", "rooney", "runi"], ["Salah", "salah"], ["Bellingham", "bellingham", "bellingem"],
  ["Vinícius Jr", "vinícius", "vinicius", "vini jr", "vinisius"], ["Lamine Yamal", "lamine yamal", "yamal"],
  ["Kane", "harry kane", "kane", "kein"], ["De Bruyne", "de bruyne"], ["Saka", "saka"], ["Ødegaard", "ødegaard", "odegaard"],
  ["Isak", "isak"], ["Wirtz", "wirtz", "virts"], ["Pedri", "pedri"], ["Modrić", "modrić", "modric"], ["Kroos", "kroos"],
  ["Benzema", "benzema"], ["Lewandowski", "lewandowski", "levandovski"], ["Suárez", "suárez", "suarez", "suares"],
  ["Ibrahimović", "ibrahimović", "ibrahimovic", "zlatan"], ["Pelé", "pelé", "pele"], ["Maradona", "maradona"],
  ["Cruyff", "cruyff"], ["Iniesta", "iniesta"], ["Xavi", "xavi"], ["Sergio Ramos", "sergio ramos"], ["Gerrard", "gerrard"],
  ["Lampard", "lampard"], ["Drogba", "drogba"], ["Agüero", "agüero", "aguero"], ["Dembélé", "dembélé", "dembele"],
  ["Griezmann", "griezmann"], ["Son Heung-min", "son heung-min", "heung-min son"], ["Foden", "foden"], ["Palmer", "cole palmer"],
  ["Rashford", "rashford"], ["Bruno Fernandes", "bruno fernandes"], ["Van Persie", "van persie"], ["Robben", "robben"],
  ["Bale", "gareth bale"], ["Roberto Carlos", "roberto carlos"], ["Di María", "di maría", "di maria"], ["Musiala", "musiala"],
  ["Raphinha", "raphinha", "rafinya"], ["Gyökeres", "gyökeres", "gyokeres"], ["Olise", "olise"], ["Rodri", "rodri"],
  ["Valverde", "valverde"], ["Garnacho", "garnacho"], ["Osimhen", "osimhen"], ["Lautaro", "lautaro"], ["Kvaratskhelia", "kvaratskhelia"],
  ["Shomurodov", "shomurodov"], ["Husanov", "husanov", "xusanov"], ["Fayzullaev", "fayzullaev", "fayzullayev"], ["Masharipov", "masharipov"]
];
const TEAMS = [
  ["Inter Miami", "inter miami"],
  ["Real Madrid", "real madrid"], ["Barcelona", "barcelona", "barça", "barca", "barselona"],
  ["Atlético Madrid", "atlético", "atletico", "atletiko"],
  ["Manchester United", "manchester united", "man utd", "man united", "manchester yunayted"],
  ["Manchester City", "manchester city", "man city", "manchester siti"],
  ["Liverpool", "liverpool", "liverpul"], ["Arsenal", "arsenal"], ["Chelsea", "chelsea", "chelsi"],
  ["Tottenham", "tottenham", "spurs", "tottenxem"], ["Newcastle", "newcastle", "nyukasl"], ["Aston Villa", "aston villa"],
  ["PSG", "paris saint-germain", "paris st-germain", "psg", "psj", "pari sen-jermen"], ["Bayern", "bayern", "bavariya"],
  ["Dortmund", "dortmund"], ["Juventus", "juventus", "yuventus"], ["Inter", "inter milan", "internazionale"], ["Milan", "ac milan", "milan"],
  ["Napoli", "napoli"], ["Benfica", "benfica"], ["Porto", "porto"], ["Ajax", "ajax", "ayaks"], ["Galatasaray", "galatasaray"],
  ["Fenerbahçe", "fenerbahçe", "fenerbahce"], ["Al-Nassr", "al-nassr", "al nassr"], ["Al-Hilal", "al-hilal", "al hilal"],
  ["Oʻzbekiston", "uzbekistan", "oʻzbekiston", "o'zbekiston", "o‘zbekiston"], ["Paxtakor", "pakhtakor", "paxtakor"],
  ["Navbahor", "navbahor"], ["Nasaf", "nasaf"], ["Bunyodkor", "bunyodkor"],
  ["Braziliya", "brazil", "braziliya"], ["Argentina", "argentina"], ["Fransiya", "france", "fransiya"], ["Angliya", "england", "angliya"],
  ["Ispaniya", "spain", "ispaniya"], ["Portugaliya", "portugal", "portugaliya"], ["Germaniya", "germany", "germaniya"],
  ["Italiya", "italy", "italiya"], ["Niderlandiya", "netherlands", "niderlandiya"]
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Uzbek adds endings to names: Navbahorni, Messining, Barselonadan.
const ENDINGS = "(?:ning|ni|ga|ka|qa|da|dan|dagi|niki|lar|ning)?";
const compile = (list) => list.map(([name, ...ways]) => [name, new RegExp(`(?<![\\p{L}\\p{N}])(${ways.map(escape).join("|")})${ENDINGS}(?![\\p{L}\\p{N}])`, "iu")]);
const PLAYER_RES = compile(PLAYERS);
const TEAM_RES = compile(TEAMS);

// Names found in a text, in the order they appear; one name per real-world
// match (Ronaldinho isn't also Ronaldo, Inter Miami isn't also Inter).
function namesIn(text, list) {
  const hits = [];
  const covered = [];
  for (const [name, re] of list) {
    const m = re.exec(text);
    if (!m) continue;
    const from = m.index;
    const to = from + m[0].length;
    if (covered.some(([a, b]) => from < b && to > a)) continue;
    covered.push([from, to]);
    hits.push({ name, at: from });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.name);
}
export const playersIn = (text) => namesIn(text || "", PLAYER_RES);
export const teamsIn = (text) => namesIn(text || "", TEAM_RES);

export function yearOf(text) {
  const m = /(?<!\d)(19[5-9]\d|20[0-3]\d)(?!\d)/.exec(text || "");
  return m ? m[1] : null;
}

// A video title without its channel boilerplate, hashtags and emoji:
// "WHAT A GOAL 😱 | Premier League #shorts" → "WHAT A GOAL".
export function cleanVideoTitle(title) {
  const parts = String(title)
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, " ")
    .split(/\s[|｜]\s|\s[|｜]|[|｜]\s/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^(premier league|laliga( ea sports)?|bundesliga|uefa|fifa|champions league|fc barcelona|real madrid( c\.?f\.?)?|official|highlights?|shorts?)$/i.test(p));
  return (parts.join(" - ") || String(title)).trim();
}

function cut(text, max) {
  if (text.length <= max) return text;
  const s = text.slice(0, max);
  const at = s.lastIndexOf(" ");
  return `${(at > max * 0.5 ? s.slice(0, at) : s).replace(/[\s,;:.–—-]+$/, "")}…`;
}

// "Gol - 2005 - Messi - Manchester United".
export function shortTitle(story, uzTitle) {
  const kind = kindOf(story);
  const year = story.topic === "moments" ? yearOf(story.title) || yearOf(story.summary) : null;
  const player = playersIn(story.title)[0] || (story.topic === "moments" ? playersIn(story.summary)[0] : null);
  const teams = teamsIn(story.title);
  // A result names both teams; anything else the player and their team.
  const named = kind === "Natija" && teams.length >= 2 ? teams.slice(0, 2) : [player, ...teams.slice(0, player ? 1 : 2)].filter(Boolean);
  const parts = [kind, year];
  if (named.length) parts.push(...named);
  else parts.push(cut(String(uzTitle || story.title).replace(/^["“”«»']+|["“”«»']+$/g, ""), 48));
  return parts.filter(Boolean).join(" - ");
}

// Two lists mixed evenly, so the page doesn't show six videos and then four
// stories: M N M M N M N M M N for six and four.
export function interleave(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const takeA = j >= b.length || (i < a.length && (i + 1) / (a.length + 1) <= (j + 1) / (b.length + 1));
    out.push(takeA ? a[i++] : b[j++]);
  }
  return out;
}
