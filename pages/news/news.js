// Core — News page. Every morning a GitHub Action (tools/news, see
// .github/workflows/news.yml) writes the day's edition to news/<date>.json:
// nine stories, split into a light side and a serious side, and one fun fact.
// The past seven days are kept (news/index.json lists them). Pictures and
// videos stay where they are published: videos play here in YouTube's own
// player, loaded only when one is opened.
//
// It loads into the same page as index.html (see loadPage there); index.html
// shares what the page needs through window.__oneApp and the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const { ArrowRight, Button, Check, EmptyState, Lightbulb, Modal, React2, createLucideIcon, relativeDay, timeAgo, todayISO, addDays } = window.__oneApp;
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
  const TOPICS = { world: "World & politics", politics: "Politics", tech: "Technology", funny: "Funny & odd", animals: "Animals", good: "Good news" };
  const SIDES = [
    { id: "light", title: "The light side", desc: "Funny, odd and furry" },
    { id: "serious", title: "The serious side", desc: "The world, politics and technology" }
  ];

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
  function tidyEdition(raw, date) {
    const items = (raw && Array.isArray(raw.items) ? raw.items : [])
      .filter((s) => s && typeof s.id === "string" && typeof s.title === "string" && typeof s.url === "string")
      .map((s) => ({
        ...s,
        side: s.side === "light" ? "light" : "serious",
        body: Array.isArray(s.body) ? s.body.filter((p) => typeof p === "string") : null,
        image: typeof s.image === "string" && /^https:\/\//.test(s.image) ? s.image : null,
        url: /^https?:\/\//.test(s.url) ? s.url : null,
        video: s.video && s.video.provider === "youtube" && /^[\w-]{6,20}$/.test(s.video.id || "") ? s.video : null
      }));
    const fact = raw && raw.fact && typeof raw.fact.text === "string" ? raw.fact : null;
    return { date: (raw && raw.date) || date, fact, items };
  }

  function dayLabel(date) {
    return relativeDay(date);
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
    const order = SIDES.flatMap((s) => items.filter((it) => it.side === s.id));
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
      h(
        "div",
        { className: "page-head__text" },
        h("h1", { className: "page-title" }, "News"),
        h("p", { className: "page-desc" }, "Ten a day: the light side, the serious side, and one fun fact.")
      )
    );

    if (days === null) {
      return h(React2.Fragment, null, head, h("section", { className: "panel news-loading", "aria-busy": "true" }, h("p", { className: "muted" }, "Getting today’s news…")));
    }
    if (!days.length) {
      return h(
        React2.Fragment,
        null,
        head,
        h(
          "section",
          { className: "panel" },
          failed
            ? h(EmptyState, { art: "cloud", title: "Couldn’t get the news", body: "Check your connection and try again.", action: h(Button, { variant: "primary", onClick: () => setAttempt((n) => n + 1) }, "Try again") })
            : h(EmptyState, { art: "seed", title: "The first edition is on its way", body: "Every morning Core collects nine stories and a fun fact. They’ll appear here after the next daily news run." })
        )
      );
    }

    return h(
      React2.Fragment,
      null,
      head,
      h(
        "div",
        { className: "news-bar" },
        h(
          "div",
          { className: "filter-chips news-days", role: "group", "aria-label": "Edition" },
          days.map((d) => h("button", { key: d, type: "button", className: "chip", "aria-pressed": d === day, onClick: () => setDay(d) }, dayLabel(d)))
        ),
        items.length > 0 && h("p", { className: "news-progress num", "aria-live": "polite" }, readCount === items.length ? "All read" : `${readCount} of ${items.length} read`)
      ),
      !edition
        ? h("section", { className: "panel news-loading", "aria-busy": "true" }, h("p", { className: "muted" }, "Getting the news…"))
        : edition.failed || edition.missing
          ? h("section", { className: "panel" }, h(EmptyState, { art: "cloud", title: "This edition isn’t available", body: edition.failed ? "Check your connection and try again." : "It may have been cleared after a week.", compact: true }))
          : h(
              React2.Fragment,
              null,
              edition.fact && h(FunFact, { fact: edition.fact }),
              h(
                "div",
                { className: "news-sides" },
                SIDES.map((side) => {
                  const list = items.filter((s) => s.side === side.id);
                  if (!list.length) return null;
                  return h(
                    "section",
                    { key: side.id, className: `news-side news-side--${side.id}`, "aria-labelledby": `news-side-${side.id}` },
                    h("div", { className: "news-side__head" }, h("h2", { id: `news-side-${side.id}`, className: "news-side__title" }, side.title), h("p", { className: "news-side__desc" }, side.desc)),
                    h("ul", { className: "news-list" }, list.map((s) => h("li", { key: s.id }, h(StoryCard, { story: s, read: !!read[s.id], onOpen: () => openStory(s) }))))
                  );
                })
              )
            ),
      h(Reader, {
        story: open,
        onClose: () => setOpenId(null),
        next: openIndex >= 0 && openIndex < order.length - 1 ? order[openIndex + 1] : null,
        onNext: (s) => openStory(s)
      })
    );
  }

  function FunFact({ fact }) {
    return h(
      "section",
      { className: "panel news-fact", "aria-labelledby": "news-fact-title" },
      h("span", { className: "news-fact__icon", "aria-hidden": true }, h(Lightbulb, { size: 20 })),
      h(
        "div",
        { className: "news-fact__text" },
        h("h2", { id: "news-fact-title", className: "news-fact__title" }, "Fun fact of the day"),
        h("p", null, fact.text),
        fact.url && /^https?:\/\//.test(fact.url) && h("a", { className: "news-fact__source", href: fact.url, target: "_blank", rel: "noopener noreferrer" }, "Source")
      )
    );
  }

  function Thumb({ story, className }) {
    const [broken, setBroken] = React2.useState(false);
    return h(
      "span",
      { className: `news-thumb ${className || ""}`, "data-topic": story.topic },
      story.image && !broken ? h("img", { src: story.image, alt: "", loading: "lazy", decoding: "async", referrerPolicy: "no-referrer", onError: () => setBroken(true) }) : h("span", { className: "news-thumb__blank", "aria-hidden": true }),
      story.video && h("span", { className: "news-thumb__play", "aria-hidden": true }, h(Play, { size: 16, fill: "currentColor" }))
    );
  }

  function StoryCard({ story, read, onOpen }) {
    return h(
      "button",
      { type: "button", className: "news-card", "data-read": read ? "true" : void 0, onClick: onOpen, "aria-label": `${story.video ? "Watch" : "Read"}: ${story.title}${read ? " (read)" : ""}` },
      h(Thumb, { story }),
      h(
        "span",
        { className: "news-card__text" },
        h(
          "span",
          { className: "news-card__tags" },
          h("span", { className: "badge news-topic", "data-topic": story.topic }, TOPICS[story.topic] || story.topic),
          story.video && h("span", { className: "badge" }, "Video"),
          read && h("span", { className: "news-card__read" }, h(Check, { size: 12, "aria-hidden": true }), "Read")
        ),
        h("span", { className: "news-card__title" }, story.title),
        story.summary && h("span", { className: "news-card__summary" }, story.summary),
        h("span", { className: "news-card__meta" }, story.source, story.publishedAt ? ` · ${timeAgo(story.publishedAt)}` : "")
      )
    );
  }

  // YouTube's own player, made only when the story is opened.
  function Video({ id, title }) {
    const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
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

  function Reader({ story, onClose, next, onNext }) {
    const bodyRef = React2.useRef(null);
    React2.useEffect(() => {
      const el = bodyRef.current && bodyRef.current.closest(".modal__body");
      if (el) el.scrollTop = 0;
    }, [story && story.id]);
    if (!story) return null;
    const paragraphs = story.body && story.body.length ? story.body : story.summary ? [story.summary] : [];
    const footer = h(
      React2.Fragment,
      null,
      story.url && h("a", { className: "btn btn--secondary news-reader__source", href: story.url, target: "_blank", rel: "noopener noreferrer" }, h(ExternalLink, { size: 15, "aria-hidden": true }), story.video ? "Open on YouTube" : `Read on ${story.source}`),
      h("span", { className: "spacer" }),
      next ? h(Button, { variant: "primary", onClick: () => onNext(next) }, "Next story", h(ArrowRight, { size: 15, "aria-hidden": true })) : h(Button, { variant: "primary", onClick: onClose }, "Done")
    );
    return h(
      Modal,
      { open: true, onClose, title: story.title, wide: true, footer },
      h(
        "article",
        { ref: bodyRef, className: "news-reader", key: story.id },
        story.video ? h(Video, { id: story.video.id, title: story.title }) : story.image && h("img", { className: "news-reader__image", src: story.image, alt: "", referrerPolicy: "no-referrer" }),
        h(
          "p",
          { className: "news-reader__meta" },
          h("span", { className: "badge news-topic", "data-topic": story.topic }, TOPICS[story.topic] || story.topic),
          h("span", null, story.source, story.publishedAt ? ` · ${timeAgo(story.publishedAt)}` : "")
        ),
        paragraphs.map((p, i) => h("p", { key: i, className: "news-reader__p" }, p)),
        !story.video && !(story.body && story.body.length) && story.url && h("p", { className: "news-reader__note muted" }, "Only a summary came with this story. The full article is on ", story.source, ".")
      )
    );
  }

  window.__onePages = window.__onePages || {};
  window.__onePages.news = NewsPage;
})();
