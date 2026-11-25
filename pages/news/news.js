// Core — News page: football, in Uzbek. Every morning a GitHub Action
// (tools/news, see .github/workflows/news.yml) writes the day's edition to
// news/<date>.json: ten blocks (great goals, classic goals, dribbles, and the
// latest transfers, results and injuries) and one fun fact. The past seven
// days are kept (news/index.json lists them). Pictures and videos stay where
// they are published: videos play here in YouTube's own player, loaded only
// when one is opened.
//
// It loads into the same page as index.html (see loadPage there); index.html
// shares what the page needs through window.__oneApp and the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const { ArrowRight, BookOpen, Button, EmptyState, Modal, React2, createLucideIcon, todayISO, addDays, parseISODate } = window.__oneApp;
  const h = React2.createElement;
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Play = createLucideIcon("Play", [["polygon", { points: "6 3 20 12 6 21 6 3", key: "1oa8hb" }]]);
  const ExternalLink = createLucideIcon("ExternalLink", [
    ["path", { d: "M15 3h6v6", key: "1q9fwt" }],
    ["path", { d: "M10 14 21 3", key: "gplh6r" }],
    ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", key: "a6xqqp" }]
  ]);

  const NEWS_DIR = "news/";
  const WEEKDAYS = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Jum", "Shan"];
  const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  // The page's words, all in Uzbek.
  const T = {
    title: "Yangiliklar",
    desc: "Har kuni: futbolning eng chiroyli lahzalari, soʻnggi futbol yangiliklari va bitta qiziqarli fakt.",
    edition: "Son",
    today: "Bugun",
    yesterday: "Kecha",
    discovery: "Bugungi kashfiyot",
    source: (s) => `Manba: ${s}`,
    wikipedia: "Vikipediya",
    progress: (n, m) => `${m} tadan ${n} tasi oʻqildi`,
    allRead: "Hammasi oʻqildi",
    readOn: (s) => `${s} saytida oʻqish`,
    openYouTube: "YouTube’da ochish",
    next: "Keyingi yangilik",
    done: "Tayyor",
    read: "Oʻqish",
    watch: "Koʻrish",
    isRead: "oʻqilgan",
    isUnread: "oʻqilmagan",
    summaryOnly: (s) => `Bu yangilik bilan faqat qisqacha mazmun keldi. Toʻliq maqola ${s} saytida.`,
    notTranslated: "Bu yangilik hali oʻzbekchaga tarjima qilinmagan, shuning uchun asl holida koʻrsatilgan.",
    bodyNotTranslated: "Toʻliq matnni tarjima qilib boʻlmadi, shuning uchun asl holida koʻrsatilgan.",
    loading: "Yangiliklar yuklanmoqda…",
    failedTitle: "Yangiliklarni olib boʻlmadi",
    failedBody: "Internetni tekshirib, qaytadan urinib koʻring.",
    tryAgain: "Qayta urinish",
    emptyTitle: "Birinchi son yoʻlda",
    emptyBody: "Har kuni ertalab Core futbol yangiliklari va qiziqarli faktni yigʻadi. Ular keyingi yigʻilishdan soʻng shu yerda paydo boʻladi.",
    goneTitle: "Bu son mavjud emas",
    goneBody: "U bir haftadan soʻng oʻchirilgan boʻlishi mumkin.",
    ago: (n, unit) => (n < 1 && unit === "minute" ? "hozirgina" : `${n} ${{ minute: "daqiqa", hour: "soat", day: "kun" }[unit]} oldin`)
  };

  // A story (or the fact) in Uzbek: its translation when it has one,
  // otherwise as published, with a note saying so.
  function inUzbek(story) {
    if (story.lang === "uz") return { title: story.title, summary: story.summary, body: story.body, lang: "uz", note: null };
    const tr = story.tr && story.tr.uz;
    if (!tr || !tr.title) return { title: story.title, summary: story.summary, body: story.body, lang: story.lang !== "auto" ? story.lang : void 0, note: "notTranslated" };
    const body = tr.body || (story.body && story.body.length ? story.body : null);
    return {
      title: tr.title,
      summary: tr.summary || story.summary,
      body,
      bodyLang: tr.body ? "uz" : story.lang !== "auto" ? story.lang : void 0,
      lang: "uz",
      note: !tr.body && story.body && story.body.length ? "bodyNotTranslated" : null
    };
  }
  // The block's short title: "Gol - 2005 - Messi - Manchester United".
  function shortOf(story) {
    if (story.short) return story.short;
    const t = inUzbek(story).title;
    return t.length > 70 ? `${t.slice(0, 68).replace(/\s+\S*$/, "")}…` : t;
  }

  function timeAgo(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (min < 60) return T.ago(min, "minute");
    const hrs = Math.round(min / 60);
    if (hrs < 24) return T.ago(hrs, "hour");
    return T.ago(Math.round(hrs / 24), "day");
  }
  function dayLabel(date) {
    const today = todayISO();
    if (date === today) return T.today;
    if (date === addDays(today, -1)) return T.yesterday;
    // Written out here: browsers don't all know Uzbek month and day names.
    const d = parseISODate(date);
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}-${MONTHS[d.getMonth()]}`;
  }

  // Which stories have been opened, per device: { [story id]: edition date }.
  const READ_KEY = "one.news.read.v1";
  function loadRead() {
    try {
      const raw = JSON.parse(window.localStorage.getItem(READ_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }
  function saveRead(read) {
    // Editions are kept a week; what was read in them is kept a day longer.
    const oldest = addDays(todayISO(), -8);
    const kept = {};
    for (const [id, date] of Object.entries(read)) if (typeof date === "string" && date >= oldest) kept[id] = date;
    try {
      window.localStorage.setItem(READ_KEY, JSON.stringify(kept));
    } catch {}
    return kept;
  }

  async function getJSON(path) {
    const res = await fetch(NEWS_DIR + path, { cache: "no-cache" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // An edition, cleaned of anything unexpected, so a bad file can't break the page.
  const str = (v) => (typeof v === "string" ? v : null);
  const strings = (xs) => (Array.isArray(xs) ? xs.filter((p) => typeof p === "string") : null);
  const httpsUrl = (v) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
  function tidyUz(tr) {
    const t = tr && typeof tr === "object" && tr.uz;
    if (!t || typeof t !== "object") return {};
    return { uz: { title: str(t.title), summary: str(t.summary), body: strings(t.body), text: str(t.text) } };
  }
  function tidyEdition(raw, date) {
    const items = (raw && Array.isArray(raw.items) ? raw.items : [])
      .filter((s) => s && typeof s.id === "string" && typeof s.title === "string" && typeof s.url === "string")
      .map((s) => ({
        id: s.id,
        short: str(s.short),
        title: s.title,
        summary: str(s.summary) || "",
        body: strings(s.body),
        image: httpsUrl(s.image),
        url: /^https?:\/\//.test(s.url) ? s.url : null,
        source: str(s.source) || "",
        publishedAt: str(s.publishedAt),
        video: s.video && s.video.provider === "youtube" && /^[\w-]{6,20}$/.test(s.video.id || "") ? { provider: "youtube", id: s.video.id } : null,
        // Editions from before translations were all in English.
        lang: str(s.lang) || "en",
        tr: tidyUz(s.tr)
      }));
    const f = raw && raw.fact;
    const fact =
      f && typeof f.text === "string"
        ? { title: str(f.title), text: f.text, image: httpsUrl(f.image), url: /^https?:\/\//.test(f.url || "") ? f.url : null, source: str(f.source), lang: str(f.lang) || "en", tr: tidyUz(f.tr) }
        : null;
    return { date: (raw && raw.date) || date, fact, items };
  }

  function NewsPage() {
    const [days, setDays] = React2.useState(null); // null while loading
    const [failed, setFailed] = React2.useState(false);
    const [day, setDay] = React2.useState(null);
    const [editions, setEditions] = React2.useState({});
    const [read, setRead] = React2.useState(loadRead);
    const [openId, setOpenId] = React2.useState(null);
    const [attempt, setAttempt] = React2.useState(0);

    // Coming back to Core after a while looks for a newer edition.
    const lastCheck = React2.useRef(0);
    const latest = React2.useRef(null);
    React2.useEffect(() => {
      const onShow = () => {
        if (document.visibilityState === "visible" && Date.now() - lastCheck.current > 30 * 6e4) setAttempt((n) => n + 1);
      };
      document.addEventListener("visibilitychange", onShow);
      return () => document.removeEventListener("visibilitychange", onShow);
    }, []);

    React2.useEffect(() => {
      let live = true;
      setFailed(false);
      lastCheck.current = Date.now();
      getJSON("index.json").then(
        (idx) => {
          if (!live) return;
          const list = idx && Array.isArray(idx.days) ? idx.days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse().slice(0, 7) : [];
          const wasLatest = latest.current;
          latest.current = list[0] || null;
          setDays(list);
          // Someone reading the newest edition moves on to a newer one; an
          // older day picked on purpose stays open while it's kept.
          setDay((d) => (d && list.includes(d) && d !== wasLatest ? d : list[0] || null));
        },
        () => {
          if (!live) return;
          setFailed(true);
          setDays((d) => d || []);
        }
      );
      return () => {
        live = false;
      };
    }, [attempt]);

    React2.useEffect(() => {
      if (!day || editions[day]) return;
      let live = true;
      getJSON(`${day}.json`).then(
        (raw) => live && setEditions((e) => ({ ...e, [day]: raw ? tidyEdition(raw, day) : { date: day, fact: null, items: [], missing: true } })),
        () => live && setEditions((e) => ({ ...e, [day]: { date: day, fact: null, items: [], failed: true } }))
      );
      return () => {
        live = false;
      };
    }, [day, editions]);

    const edition = day ? editions[day] : null;
    const items = edition ? edition.items : [];
    const openIndex = items.findIndex((s) => s.id === openId);
    const open = openIndex >= 0 ? items[openIndex] : null;
    const openStory = (story) => {
      if (!read[story.id]) setRead((r) => saveRead({ ...r, [story.id]: day }));
      setOpenId(story.id);
    };
    const readCount = items.filter((s) => read[s.id]).length;

    const head = h("div", { className: "page-head", lang: "uz" }, h("div", { className: "page-head__text" }, h("h1", { className: "page-title" }, T.title), h("p", { className: "page-desc" }, T.desc)));

    if (days === null) {
      return h(React2.Fragment, null, head, h("section", { className: "panel news-loading", "aria-busy": "true", lang: "uz" }, h("p", { className: "muted" }, T.loading)));
    }
    if (!days.length) {
      return h(
        React2.Fragment,
        null,
        head,
        h(
          "section",
          { className: "panel", lang: "uz" },
          failed
            ? h(EmptyState, { art: "cloud", title: T.failedTitle, body: T.failedBody, action: h(Button, { variant: "primary", onClick: () => setAttempt((n) => n + 1) }, T.tryAgain) })
            : h(EmptyState, { art: "seed", title: T.emptyTitle, body: T.emptyBody })
        )
      );
    }

    return h(
      React2.Fragment,
      null,
      head,
      h(
        "div",
        { className: "news-bar", lang: "uz" },
        h(
          "div",
          { className: "filter-chips news-days", role: "group", "aria-label": T.edition },
          days.map((d) => h("button", { key: d, type: "button", className: "chip", "aria-pressed": d === day, onClick: () => setDay(d) }, dayLabel(d)))
        ),
        items.length > 0 && h("p", { className: "news-progress num", "aria-live": "polite" }, readCount === items.length ? T.allRead : T.progress(readCount, items.length))
      ),
      !edition
        ? h("section", { className: "panel news-loading", "aria-busy": "true", lang: "uz" }, h("p", { className: "muted" }, T.loading))
        : edition.failed || edition.missing
          ? h("section", { className: "panel", lang: "uz" }, h(EmptyState, { art: "cloud", title: T.goneTitle, body: edition.failed ? T.failedBody : T.goneBody, compact: true }))
          : h(
              React2.Fragment,
              null,
              edition.fact && h(FunFact, { fact: edition.fact }),
              h("ul", { className: "news-grid", "aria-label": T.title }, items.map((s) => h("li", { key: s.id }, h(Block, { story: s, read: !!read[s.id], onOpen: () => openStory(s) }))))
            ),
      h(Reader, {
        story: open,
        onClose: () => setOpenId(null),
        next: openIndex >= 0 && openIndex < items.length - 1 ? items[openIndex + 1] : null,
        onNext: (s) => openStory(s)
      })
    );
  }

  // A light bulb on a little cloud, for the fun fact.
  function BulbArt() {
    return h(
      "svg",
      { className: "news-fact__art", viewBox: "0 0 120 120", "aria-hidden": true, focusable: "false" },
      h(
        "defs",
        null,
        h("radialGradient", { id: "news-bulb-glow", cx: "50%", cy: "42%", r: "55%" }, h("stop", { offset: "0", stopColor: "#fff6c2" }), h("stop", { offset: ".55", stopColor: "#ffd24a" }), h("stop", { offset: "1", stopColor: "#f5a524" }))
      ),
      // Rays.
      h(
        "g",
        { stroke: "#f59e0b", strokeWidth: "4", strokeLinecap: "round" },
        h("line", { x1: "60", y1: "6", x2: "60", y2: "15" }),
        h("line", { x1: "30", y1: "16", x2: "35", y2: "23" }),
        h("line", { x1: "90", y1: "16", x2: "85", y2: "23" }),
        h("line", { x1: "17", y1: "40", x2: "25", y2: "42" }),
        h("line", { x1: "103", y1: "40", x2: "95", y2: "42" })
      ),
      // Glass, filament and screw.
      h("path", { d: "M60 20c-17 0-30 13-30 29 0 11 6 19 12 25 3 3 4 7 4 11h28c0-4 1-8 4-11 6-6 12-14 12-25 0-16-13-29-30-29z", fill: "url(#news-bulb-glow)", stroke: "#f59e0b", strokeWidth: "2" }),
      h("path", { d: "M52 66c0-8 4-14 8-14s8 6 8 14", fill: "none", stroke: "#d97706", strokeWidth: "2.5", strokeLinecap: "round" }),
      h("rect", { x: "46", y: "85", width: "28", height: "6", rx: "3", fill: "#94a3b8" }),
      h("rect", { x: "47", y: "91", width: "26", height: "6", rx: "3", fill: "#64748b" }),
      h("rect", { x: "50", y: "97", width: "20", height: "5", rx: "2.5", fill: "#94a3b8" }),
      // Cloud.
      h(
        "g",
        { fill: "#dbeafe", stroke: "#bfdbfe", strokeWidth: "1.5" },
        h("ellipse", { cx: "30", cy: "106", rx: "22", ry: "11" }),
        h("ellipse", { cx: "88", cy: "107", rx: "24", ry: "10" }),
        h("ellipse", { cx: "60", cy: "110", rx: "34", ry: "9" })
      )
    );
  }

  function FunFact({ fact }) {
    const tr = fact.tr && fact.tr.uz;
    const uz = fact.lang === "uz" || (tr && (tr.title || tr.text));
    const title = (uz && tr && tr.title) || fact.title;
    const text = (uz && tr && tr.text) || fact.text;
    const lang = uz ? "uz" : fact.lang;
    const source = fact.source === "Wikipedia" ? T.wikipedia : fact.source;
    return h(
      "section",
      { className: "news-fact", "aria-labelledby": "news-fact-title", "data-has-photo": fact.image ? "true" : void 0 },
      h(BulbArt),
      h(
        "div",
        { className: "news-fact__body" },
        h("span", { className: "news-fact__tag", lang: "uz" }, T.discovery),
        h("h2", { id: "news-fact-title", className: "news-fact__title", lang }, title || text),
        title && h("p", { className: "news-fact__text", lang }, text),
        fact.url && h("a", { className: "news-fact__source", href: fact.url, target: "_blank", rel: "noopener noreferrer", lang: "uz" }, h(BookOpen, { size: 15, "aria-hidden": true }), T.source(source || T.wikipedia))
      ),
      fact.image && h("img", { className: "news-fact__photo", src: fact.image, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" })
    );
  }

  function Block({ story, read, onOpen }) {
    const [broken, setBroken] = React2.useState(false);
    const short = shortOf(story);
    return h(
      "button",
      {
        type: "button",
        className: "news-block",
        "data-read": read ? "true" : void 0,
        onClick: onOpen,
        lang: "uz",
        "aria-label": `${story.video ? T.watch : T.read}: ${short} (${read ? T.isRead : T.isUnread})`
      },
      h(
        "span",
        { className: "news-block__media" },
        story.image && !broken ? h("img", { src: story.image, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer", onError: () => setBroken(true) }) : h("span", { className: "news-block__blank", "aria-hidden": true }),
        story.video && h("span", { className: "news-block__play", "aria-hidden": true }, h(Play, { size: 14, fill: "currentColor" }))
      ),
      h("span", { className: "news-block__title" }, short),
      h("span", { className: "news-block__dot", "aria-hidden": true })
    );
  }

  // YouTube's own player, made only when the story is opened.
  function Video({ id, title }) {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&hl=uz`;
    return h(
      "div",
      { className: "news-video" },
      h("iframe", { src, title, allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowFullScreen: true, referrerPolicy: "strict-origin-when-cross-origin" })
    );
  }

  function Reader({ story, onClose, next, onNext }) {
    const bodyRef = React2.useRef(null);
    React2.useEffect(() => {
      const el = bodyRef.current && bodyRef.current.closest(".modal__body");
      if (el) el.scrollTop = 0;
    }, [story && story.id]);
    if (!story) return null;
    const shown = inUzbek(story);
    const hasBody = shown.body && shown.body.length;
    const paragraphs = hasBody ? shown.body : shown.summary ? [shown.summary] : [];
    const paraLang = hasBody ? shown.bodyLang || shown.lang : shown.lang;
    const footer = h(
      React2.Fragment,
      null,
      story.url && h("a", { className: "btn btn--secondary news-reader__source", href: story.url, target: "_blank", rel: "noopener noreferrer", lang: "uz" }, h(ExternalLink, { size: 15, "aria-hidden": true }), story.video ? T.openYouTube : T.readOn(story.source)),
      h("span", { className: "spacer" }),
      next ? h(Button, { variant: "primary", onClick: () => onNext(next), lang: "uz" }, T.next, h(ArrowRight, { size: 15, "aria-hidden": true })) : h(Button, { variant: "primary", onClick: onClose, lang: "uz" }, T.done)
    );
    return h(
      Modal,
      { open: true, onClose, title: shown.title, wide: true, footer },
      h(
        "article",
        { ref: bodyRef, className: "news-reader", key: story.id },
        story.video ? h(Video, { id: story.video.id, title: shown.title }) : story.image && h("img", { className: "news-reader__image", src: story.image, alt: "", referrerPolicy: "no-referrer" }),
        h("p", { className: "news-reader__meta", lang: "uz" }, h("span", { className: "news-reader__short" }, shortOf(story)), h("span", null, story.source, story.publishedAt ? ` · ${timeAgo(story.publishedAt)}` : "")),
        shown.note && h("p", { className: "news-reader__note muted", lang: "uz" }, T[shown.note]),
        paragraphs.map((p, i) => h("p", { key: i, className: "news-reader__p", lang: paraLang }, p)),
        !story.video && !hasBody && story.url && h("p", { className: "news-reader__note muted", lang: "uz" }, T.summaryOnly(story.source))
      )
    );
  }

  window.__onePages = window.__onePages || {};
  window.__onePages.news = NewsPage;
})();
