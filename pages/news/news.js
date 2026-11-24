// Core — News page. Every morning a GitHub Action (tools/news, see
// .github/workflows/news.yml) writes the day's edition to news/<date>.json:
// what's trending, Uzbekistan, football, a light side and a serious side, and
// one fun fact, each also translated into English, Uzbek and Russian. The
// past seven days are kept (news/index.json lists them). Pictures and videos
// stay where they are published: videos play here in YouTube's own player,
// loaded only when one is opened.
//
// It loads into the same page as index.html (see loadPage there); index.html
// shares what the page needs through window.__oneApp and the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const { ArrowRight, Button, Check, EmptyState, Lightbulb, Modal, React2, Segmented, createLucideIcon, todayISO, addDays, parseISODate } = window.__oneApp;
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
  const TrendingUp = createLucideIcon("TrendingUp", [
    ["polyline", { points: "22 7 13.5 15.5 8.5 10.5 2 17", key: "126l90" }],
    ["polyline", { points: "16 7 22 7 22 13", key: "kwv8wd" }]
  ]);

  const NEWS_DIR = "news/";

  // ---------- Languages ----------
  const LANGS = [
    { value: "en", label: "English", locale: undefined },
    { value: "uz", label: "Oʻzbekcha", locale: "uz-Latn" },
    { value: "ru", label: "Русский", locale: "ru" }
  ];
  const T = {
    en: {
      desc: "Every day: what’s trending, Uzbekistan, football, the light side and the serious side, and one fun fact.",
      language: "News language",
      edition: "Edition",
      today: "Today",
      yesterday: "Yesterday",
      fact: "Fun fact of the day",
      source: "Source",
      video: "Video",
      read: "Read",
      progress: (n, m) => `${n} of ${m} read`,
      allRead: "All read",
      readOn: (s) => `Read on ${s}`,
      openYouTube: "Open on YouTube",
      next: "Next story",
      done: "Done",
      cardRead: "Read",
      cardWatch: "Watch",
      cardIsRead: "read",
      searched: "Searched",
      summaryOnly: (s) => `Only a summary came with this story. The full article is on ${s}.`,
      notTranslated: "This story isn’t available in English, so it’s shown as published.",
      bodyNotTranslated: "The full text couldn’t be translated, so it’s shown as published.",
      loading: "Getting the news…",
      failedTitle: "Couldn’t get the news",
      failedBody: "Check your connection and try again.",
      tryAgain: "Try again",
      emptyTitle: "The first edition is on its way",
      emptyBody: "Every morning Core collects the day’s news and a fun fact. They’ll appear here after the next daily news run.",
      goneTitle: "This edition isn’t available",
      goneBody: "It may have been cleared after a week.",
      ago: (n, unit) => new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-n, unit),
      sections: {
        trending: ["Trending now", "What people are searching for today"],
        uzbekistan: ["Uzbekistan", "What’s happening in Uzbekistan"],
        football: ["Football", "Matches, transfers and highlights"],
        light: ["The light side", "Funny, odd and furry"],
        serious: ["The serious side", "The world, politics and technology"]
      },
      topics: { trending: "Trending", uzbekistan: "Uzbekistan", football: "Football", world: "World & politics", politics: "Politics", tech: "Technology", funny: "Funny & odd", animals: "Animals", good: "Good news" }
    },
    uz: {
      desc: "Har kuni: trenddagi yangiliklar, Oʻzbekiston, futbol, quvnoq va jiddiy tomon hamda bitta qiziqarli fakt.",
      language: "Yangiliklar tili",
      edition: "Son",
      today: "Bugun",
      yesterday: "Kecha",
      fact: "Kunning qiziqarli fakti",
      source: "Manba",
      video: "Video",
      read: "Oʻqildi",
      progress: (n, m) => `${m} tadan ${n} tasi oʻqildi`,
      allRead: "Hammasi oʻqildi",
      readOn: (s) => `${s} saytida oʻqish`,
      openYouTube: "YouTube’da ochish",
      next: "Keyingi yangilik",
      done: "Tayyor",
      cardRead: "Oʻqish",
      cardWatch: "Koʻrish",
      cardIsRead: "oʻqilgan",
      searched: "Qidirilmoqda",
      summaryOnly: (s) => `Bu yangilik bilan faqat qisqacha mazmun keldi. Toʻliq maqola ${s} saytida.`,
      notTranslated: "Bu yangilik hali oʻzbekchaga tarjima qilinmagan, shuning uchun asl holida koʻrsatilgan.",
      bodyNotTranslated: "Toʻliq matnni tarjima qilib boʻlmadi, shuning uchun asl holida koʻrsatilgan.",
      loading: "Yangiliklar yuklanmoqda…",
      failedTitle: "Yangiliklarni olib boʻlmadi",
      failedBody: "Internetni tekshirib, qaytadan urinib koʻring.",
      tryAgain: "Qayta urinish",
      emptyTitle: "Birinchi son yoʻlda",
      emptyBody: "Har kuni ertalab Core kunning yangiliklari va qiziqarli faktni yigʻadi. Ular keyingi yangiliklar yigʻilishidan soʻng shu yerda paydo boʻladi.",
      goneTitle: "Bu son mavjud emas",
      goneBody: "U bir haftadan soʻng oʻchirilgan boʻlishi mumkin.",
      ago: (n, unit) => {
        const words = { minute: "daqiqa", hour: "soat", day: "kun" };
        return n < 1 && unit === "minute" ? "hozirgina" : `${n} ${words[unit]} oldin`;
      },
      sections: {
        trending: ["Hozir trendda", "Bugun odamlar nimani qidiryapti"],
        uzbekistan: ["Oʻzbekiston", "Oʻzbekistonda nimalar boʻlyapti"],
        football: ["Futbol", "Oʻyinlar, transferlar va eng yaxshi lavhalar"],
        light: ["Quvnoq tomon", "Kulgili, gʻalati va hayvonlar haqida"],
        serious: ["Jiddiy tomon", "Dunyo, siyosat va texnologiyalar"]
      },
      topics: { trending: "Trendda", uzbekistan: "Oʻzbekiston", football: "Futbol", world: "Dunyo va siyosat", politics: "Siyosat", tech: "Texnologiya", funny: "Kulgili va gʻalati", animals: "Hayvonlar", good: "Yaxshi yangilik" }
    },
    ru: {
      desc: "Каждый день: тренды, Узбекистан, футбол, лёгкая и серьёзная сторона и один интересный факт.",
      language: "Язык новостей",
      edition: "Выпуск",
      today: "Сегодня",
      yesterday: "Вчера",
      fact: "Интересный факт дня",
      source: "Источник",
      video: "Видео",
      read: "Прочитано",
      progress: (n, m) => `Прочитано ${n} из ${m}`,
      allRead: "Всё прочитано",
      readOn: (s) => `Читать на ${s}`,
      openYouTube: "Открыть на YouTube",
      next: "Следующая новость",
      done: "Готово",
      cardRead: "Читать",
      cardWatch: "Смотреть",
      cardIsRead: "прочитано",
      searched: "Ищут",
      summaryOnly: (s) => `К этой новости пришло только краткое содержание. Полная статья — на ${s}.`,
      notTranslated: "Эта новость ещё не переведена на русский, поэтому показана в оригинале.",
      bodyNotTranslated: "Полный текст не удалось перевести, поэтому он показан в оригинале.",
      loading: "Загружаем новости…",
      failedTitle: "Не удалось загрузить новости",
      failedBody: "Проверьте подключение и попробуйте снова.",
      tryAgain: "Повторить",
      emptyTitle: "Первый выпуск уже в пути",
      emptyBody: "Каждое утро Core собирает новости дня и интересный факт. Они появятся здесь после следующего сбора новостей.",
      goneTitle: "Этот выпуск недоступен",
      goneBody: "Возможно, он удалён через неделю.",
      ago: (n, unit) => new Intl.RelativeTimeFormat("ru", { numeric: "auto" }).format(-n, unit),
      sections: {
        trending: ["Сейчас в тренде", "Что люди ищут сегодня"],
        uzbekistan: ["Узбекистан", "Что происходит в Узбекистане"],
        football: ["Футбол", "Матчи, трансферы и обзоры"],
        light: ["Лёгкая сторона", "Смешное, странное и пушистое"],
        serious: ["Серьёзная сторона", "Мир, политика и технологии"]
      },
      topics: { trending: "В тренде", uzbekistan: "Узбекистан", football: "Футбол", world: "Мир и политика", politics: "Политика", tech: "Технологии", funny: "Смешное и странное", animals: "Животные", good: "Хорошие новости" }
    }
  };

  // The page's rows of sections: trending across the top, then pairs.
  const ROWS = [["trending"], ["uzbekistan", "football"], ["light", "serious"]];
  const SECTION_IDS = ROWS.flat();

  const LANG_KEY = "one.news.lang.v1";
  function initialLang() {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (LANGS.some((l) => l.value === saved)) return saved;
    } catch {}
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return LANGS.some((l) => l.value === nav) ? nav : "en";
  }

  // A story (or the fact) as it reads in `lang`: its translation when it has
  // one, otherwise as published, with a note saying so.
  function inLang(story, lang) {
    const own = story.lang === lang;
    const tr = !own && story.tr && story.tr[lang];
    if (own || !tr) {
      return { title: story.title, summary: story.summary, body: story.body, lang: own ? lang : story.lang && story.lang !== "auto" ? story.lang : void 0, note: own || !story.lang ? null : "notTranslated" };
    }
    const body = tr.body || (story.body && story.body.length ? story.body : null);
    return {
      title: tr.title || story.title,
      summary: tr.summary || story.summary,
      body,
      bodyLang: tr.body ? lang : story.lang !== "auto" ? story.lang : void 0,
      lang,
      note: !tr.body && story.body && story.body.length ? "bodyNotTranslated" : null
    };
  }
  function factIn(fact, lang) {
    if (fact.lang === lang || !fact.tr || !fact.tr[lang]) return { text: fact.text, lang: fact.lang || "en" };
    return { text: fact.tr[lang].text || fact.text, lang };
  }

  function timeAgo(iso, t) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (min < 60) return t.ago(min, "minute");
    const hrs = Math.round(min / 60);
    if (hrs < 24) return t.ago(hrs, "hour");
    return t.ago(Math.round(hrs / 24), "day");
  }
  function dayLabel(date, t, locale) {
    const today = todayISO();
    if (date === today) return t.today;
    if (date === addDays(today, -1)) return t.yesterday;
    return parseISODate(date).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
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
  const strings = (xs) => (Array.isArray(xs) ? xs.filter((p) => typeof p === "string") : null);
  function tidyTr(tr) {
    const out = {};
    if (!tr || typeof tr !== "object") return out;
    for (const { value } of LANGS) {
      const t = tr[value];
      if (!t || typeof t !== "object") continue;
      out[value] = {
        title: typeof t.title === "string" ? t.title : null,
        summary: typeof t.summary === "string" ? t.summary : null,
        body: strings(t.body),
        text: typeof t.text === "string" ? t.text : null
      };
    }
    return out;
  }
  function tidyEdition(raw, date) {
    const items = (raw && Array.isArray(raw.items) ? raw.items : [])
      .filter((s) => s && typeof s.id === "string" && typeof s.title === "string" && typeof s.url === "string")
      .map((s) => ({
        ...s,
        side: SECTION_IDS.includes(s.side) ? s.side : "serious",
        summary: typeof s.summary === "string" ? s.summary : "",
        body: strings(s.body),
        image: typeof s.image === "string" && /^https:\/\//.test(s.image) ? s.image : null,
        url: /^https?:\/\//.test(s.url) ? s.url : null,
        video: s.video && s.video.provider === "youtube" && /^[\w-]{6,20}$/.test(s.video.id || "") ? s.video : null,
        trend: s.trend && typeof s.trend.query === "string" ? { query: s.trend.query, traffic: typeof s.trend.traffic === "string" ? s.trend.traffic : "" } : null,
        // Editions from before translations were all in English.
        lang: typeof s.lang === "string" ? s.lang : "en",
        tr: tidyTr(s.tr)
      }));
    const f = raw && raw.fact;
    const fact = f && typeof f.text === "string" ? { text: f.text, url: typeof f.url === "string" ? f.url : null, lang: typeof f.lang === "string" ? f.lang : "en", tr: tidyTr(f.tr) } : null;
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
    const [lang, setLangState] = React2.useState(initialLang);
    const t = T[lang];
    const locale = LANGS.find((l) => l.value === lang).locale;
    const setLang = (value) => {
      setLangState(value);
      try {
        window.localStorage.setItem(LANG_KEY, value);
      } catch {}
    };

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
    const order = SECTION_IDS.flatMap((id) => items.filter((it) => it.side === id));
    const openIndex = order.findIndex((s) => s.id === openId);
    const open = openIndex >= 0 ? order[openIndex] : null;
    const markRead = (story) => {
      if (read[story.id]) return;
      setRead((r) => saveRead({ ...r, [story.id]: day }));
    };
    const openStory = (story) => {
      markRead(story);
      setOpenId(story.id);
    };
    const readCount = items.filter((s) => read[s.id]).length;

    const head = h(
      "div",
      { className: "page-head" },
      h("div", { className: "page-head__text" }, h("h1", { className: "page-title" }, "News"), h("p", { className: "page-desc", lang }, t.desc)),
      h(
        "div",
        { className: "news-lang" },
        h(Segmented, { label: t.language, value: lang, onChange: setLang, options: LANGS.map((l) => ({ value: l.value, label: h("span", { lang: l.value }, l.label) })) })
      )
    );

    if (days === null) {
      return h(React2.Fragment, null, head, h("section", { className: "panel news-loading", "aria-busy": "true" }, h("p", { className: "muted", lang }, t.loading)));
    }
    if (!days.length) {
      return h(
        React2.Fragment,
        null,
        head,
        h(
          "section",
          { className: "panel", lang },
          failed
            ? h(EmptyState, { art: "cloud", title: t.failedTitle, body: t.failedBody, action: h(Button, { variant: "primary", onClick: () => setAttempt((n) => n + 1) }, t.tryAgain) })
            : h(EmptyState, { art: "seed", title: t.emptyTitle, body: t.emptyBody })
        )
      );
    }

    const section = (id) => {
      const list = items.filter((s) => s.side === id);
      if (!list.length) return null;
      const [title, desc] = t.sections[id];
      return h(
        "section",
        { key: id, className: `news-side news-side--${id}`, "aria-labelledby": `news-side-${id}` },
        h("div", { className: "news-side__head", lang }, h("h2", { id: `news-side-${id}`, className: "news-side__title" }, id === "trending" && h(TrendingUp, { size: 18, "aria-hidden": true }), title), h("p", { className: "news-side__desc" }, desc)),
        h("ul", { className: "news-list" }, list.map((s) => h("li", { key: s.id }, h(StoryCard, { story: s, lang, t, read: !!read[s.id], onOpen: () => openStory(s) }))))
      );
    };

    return h(
      React2.Fragment,
      null,
      head,
      h(
        "div",
        { className: "news-bar" },
        h(
          "div",
          { className: "filter-chips news-days", role: "group", "aria-label": t.edition },
          days.map((d) => h("button", { key: d, type: "button", className: "chip", "aria-pressed": d === day, onClick: () => setDay(d), lang }, dayLabel(d, t, locale)))
        ),
        items.length > 0 && h("p", { className: "news-progress num", "aria-live": "polite", lang }, readCount === items.length ? t.allRead : t.progress(readCount, items.length))
      ),
      !edition
        ? h("section", { className: "panel news-loading", "aria-busy": "true" }, h("p", { className: "muted", lang }, t.loading))
        : edition.failed || edition.missing
          ? h("section", { className: "panel", lang }, h(EmptyState, { art: "cloud", title: t.goneTitle, body: edition.failed ? t.failedBody : t.goneBody, compact: true }))
          : h(
              React2.Fragment,
              null,
              edition.fact && h(FunFact, { fact: edition.fact, lang, t }),
              ROWS.map((row) => {
                const parts = row.map(section).filter(Boolean);
                if (!parts.length) return null;
                return h("div", { key: row.join("-"), className: `news-row news-row--${row.length === 1 ? "wide" : "pair"}` }, parts);
              })
            ),
      h(Reader, {
        story: open,
        lang,
        t,
        onClose: () => setOpenId(null),
        next: openIndex >= 0 && openIndex < order.length - 1 ? order[openIndex + 1] : null,
        onNext: (s) => openStory(s)
      })
    );
  }

  function FunFact({ fact, lang, t }) {
    const shown = factIn(fact, lang);
    return h(
      "section",
      { className: "panel news-fact", "aria-labelledby": "news-fact-title" },
      h("span", { className: "news-fact__icon", "aria-hidden": true }, h(Lightbulb, { size: 20 })),
      h(
        "div",
        { className: "news-fact__text" },
        h("h2", { id: "news-fact-title", className: "news-fact__title", lang }, t.fact),
        h("p", { lang: shown.lang }, shown.text),
        fact.url && /^https?:\/\//.test(fact.url) && h("a", { className: "news-fact__source", href: fact.url, target: "_blank", rel: "noopener noreferrer", lang }, t.source)
      )
    );
  }

  function Thumb({ story }) {
    const [broken, setBroken] = React2.useState(false);
    return h(
      "span",
      { className: "news-thumb", "data-topic": story.topic },
      story.image && !broken ? h("img", { src: story.image, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer", onError: () => setBroken(true) }) : h("span", { className: "news-thumb__blank", "aria-hidden": true }),
      story.video && h("span", { className: "news-thumb__play", "aria-hidden": true }, h(Play, { size: 16, fill: "currentColor" }))
    );
  }

  function StoryCard({ story, lang, t, read, onOpen }) {
    const shown = inLang(story, lang);
    return h(
      "button",
      { type: "button", className: "news-card", "data-read": read ? "true" : void 0, onClick: onOpen, "aria-label": `${story.video ? t.cardWatch : t.cardRead}: ${shown.title}${read ? ` (${t.cardIsRead})` : ""}` },
      h(Thumb, { story }),
      h(
        "span",
        { className: "news-card__text" },
        h(
          "span",
          { className: "news-card__tags", lang },
          h("span", { className: "badge news-topic", "data-topic": story.topic }, t.topics[story.topic] || story.topic),
          story.video && h("span", { className: "badge" }, t.video),
          story.trend && h("span", { className: "badge news-trend", title: t.searched }, h(TrendingUp, { size: 12, "aria-hidden": true }), story.trend.query, story.trend.traffic ? ` · ${story.trend.traffic}` : ""),
          read && h("span", { className: "news-card__read" }, h(Check, { size: 12, "aria-hidden": true }), t.read)
        ),
        h("span", { className: "news-card__title", lang: shown.lang }, shown.title),
        shown.summary && h("span", { className: "news-card__summary", lang: shown.lang }, shown.summary),
        h("span", { className: "news-card__meta", lang }, story.source, story.publishedAt ? ` · ${timeAgo(story.publishedAt, t)}` : "")
      )
    );
  }

  // YouTube's own player, made only when the story is opened.
  function Video({ id, title, lang }) {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&hl=${lang}`;
    return h(
      "div",
      { className: "news-video" },
      h("iframe", {
        src,
        title,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        allowFullScreen: true,
        referrerPolicy: "strict-origin-when-cross-origin"
      })
    );
  }

  function Reader({ story, lang, t, onClose, next, onNext }) {
    const bodyRef = React2.useRef(null);
    React2.useEffect(() => {
      const el = bodyRef.current && bodyRef.current.closest(".modal__body");
      if (el) el.scrollTop = 0;
    }, [story && story.id]);
    if (!story) return null;
    const shown = inLang(story, lang);
    const hasBody = shown.body && shown.body.length;
    const paragraphs = hasBody ? shown.body : shown.summary ? [shown.summary] : [];
    const paraLang = hasBody ? shown.bodyLang || shown.lang : shown.lang;
    const footer = h(
      React2.Fragment,
      null,
      story.url && h("a", { className: "btn btn--secondary news-reader__source", href: story.url, target: "_blank", rel: "noopener noreferrer", lang }, h(ExternalLink, { size: 15, "aria-hidden": true }), story.video ? t.openYouTube : t.readOn(story.source)),
      h("span", { className: "spacer" }),
      next ? h(Button, { variant: "primary", onClick: () => onNext(next), lang }, t.next, h(ArrowRight, { size: 15, "aria-hidden": true })) : h(Button, { variant: "primary", onClick: onClose, lang }, t.done)
    );
    return h(
      Modal,
      { open: true, onClose, title: shown.title, wide: true, footer },
      h(
        "article",
        { ref: bodyRef, className: "news-reader", key: story.id },
        story.video ? h(Video, { id: story.video.id, title: shown.title, lang }) : story.image && h("img", { className: "news-reader__image", src: story.image, alt: "", referrerPolicy: "no-referrer" }),
        h(
          "p",
          { className: "news-reader__meta", lang },
          h("span", { className: "badge news-topic", "data-topic": story.topic }, t.topics[story.topic] || story.topic),
          story.trend && h("span", { className: "badge news-trend" }, h(TrendingUp, { size: 12, "aria-hidden": true }), `${t.searched}: ${story.trend.query}`, story.trend.traffic ? ` · ${story.trend.traffic}` : ""),
          h("span", null, story.source, story.publishedAt ? ` · ${timeAgo(story.publishedAt, t)}` : "")
        ),
        shown.note && h("p", { className: "news-reader__note muted", lang }, t[shown.note]),
        paragraphs.map((p, i) => h("p", { key: i, className: "news-reader__p", lang: paraLang }, p)),
        !story.video && !hasBody && story.url && h("p", { className: "news-reader__note muted", lang }, t.summaryOnly(story.source))
      )
    );
  }

  window.__onePages = window.__onePages || {};
  window.__onePages.news = NewsPage;
})();
