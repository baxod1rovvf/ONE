// Core — Quran learning page. It loads into the same page as index.html (see
// loadPage there); the path rules come from pages/quran/rules.js, which
// loadPage loads first (window.__oneQuranRules). The text is in
// pages/quran/data (made by tools/quran/build-data.mjs). Views by hash:
// #quran (the path), #quran/<n> (a surah), #quran/review (the block review).
(function () {
  "use strict";
  const { Button, React2, newId, useStore, useToday } = window.__oneApp;
  const R = window.__oneQuranRules;
  const h = React2.createElement;

  // ---------- Data ----------
  let indexPromise = null;
  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch("pages/quran/data/index.json").then((res) => {
        if (!res.ok) throw new Error("index");
        return res.json();
      });
      indexPromise.catch(() => (indexPromise = null));
    }
    return indexPromise;
  }
  const surahPromises = new Map();
  function loadSurah(n) {
    if (!surahPromises.has(n)) {
      const p = fetch(`pages/quran/data/${n}.json`).then((res) => {
        if (!res.ok) throw new Error("surah");
        return res.json();
      });
      p.catch(() => surahPromises.delete(n));
      surahPromises.set(n, p);
    }
    return surahPromises.get(n);
  }
  function useIndex() {
    const [state, setState] = React2.useState({ index: null, error: false });
    const load = React2.useCallback(() => {
      setState({ index: null, error: false });
      loadIndex().then((index) => setState({ index, error: false }), () => setState({ index: null, error: true }));
    }, []);
    React2.useEffect(load, [load]);
    return { ...state, retry: load };
  }

  // ---------- Progress (the synced "hifz" list) ----------
  function useHifz() {
    const { data, add, update } = useStore();
    const progress = React2.useMemo(() => R.progressMap(data.hifz || []), [data.hifz]);
    const set = React2.useCallback(
      (surah, patch) => {
        const updatedAt = new Date().toISOString();
        const have = progress.get(surah);
        if (have) update("hifz", have.id, { ...patch, updatedAt });
        else add("hifz", { id: newId(), surah, state: null, readingChecked: false, startedAt: null, ...patch, updatedAt });
      },
      [progress, add, update]
    );
    return { progress, set };
  }

  // ---------- Which view ----------
  function readHash() {
    const m = /^#quran\/(.+)$/.exec(window.location.hash);
    if (!m) return { kind: "path" };
    if (m[1] === "review") return { kind: "review" };
    const n = Number(m[1]);
    return n >= 1 && n <= 114 ? { kind: "surah", n } : { kind: "path" };
  }
  function useHashView() {
    const [view, setView] = React2.useState(readHash);
    React2.useEffect(() => {
      const on = () => setView(readHash());
      window.addEventListener("hashchange", on);
      return () => window.removeEventListener("hashchange", on);
    }, []);
    return view;
  }
  const go = (hash) => {
    window.location.hash = hash;
  };

  // ---------- The path ----------
  const label = (s) => `${s.nameUz} · ${s.nameAr}`;
  const STEP_WORD = { done: "Done", current: "Now", locked: "Later", "needs-work": "Needs work" };

  function SurahName({ s }) {
    return h(React2.Fragment, null, h("span", { className: "q-name" }, s.nameUz), " · ", h("span", { className: "q-name-ar", lang: "ar", dir: "rtl" }, s.nameAr));
  }

  function CurrentBlock({ k, block, byN, progress, set, today }) {
    const bs = R.blockState(block, progress);
    const day = R.dayCount(block, progress, today);
    const reviewState = bs.status === "review" ? "current" : bs.status === "done" ? "done" : "locked";
    const target = bs.status === "review" ? "#quran/review" : `#quran/${bs.current}`;
    return h(
      "section",
      { className: "panel q-block q-block--current", "aria-label": `Block ${k}` },
      h(
        "div",
        { className: "q-block__head" },
        h("h2", { className: "q-block__title" }, `Block ${k}`),
        day && h("span", { className: "q-block__day" }, day.day <= day.of ? `Day ${day.day} of ${day.of}` : `Day ${day.day} · take your time`)
      ),
      h(
        "ol",
        { className: "q-steps" },
        block.map((n, i) => {
          const st = R.stepState(n, block, progress);
          const s = byN.get(n);
          return h(
            "li",
            { key: n, className: `q-step is-${st}`, "data-state": st },
            h("span", { className: "q-step__num" }, i + 1),
            h(
              "a",
              { className: "q-step__name", href: st === "locked" ? void 0 : `#quran/${n}`, "aria-disabled": st === "locked" ? "true" : void 0 },
              h(SurahName, { s }),
              h("span", { className: "q-step__meta" }, `${s.verses} verses · ${STEP_WORD[st]}`)
            ),
            st !== "done" && h("button", { type: "button", className: "q-link", "aria-label": `I know this: ${s.nameUz}`, onClick: () => set(n, { state: "known" }) }, "I know this")
          );
        }),
        h(
          "li",
          { className: `q-step is-${reviewState}`, "data-state": reviewState },
          h("span", { className: "q-step__num" }, block.length + 1),
          h("a", { className: "q-step__name", href: reviewState === "current" ? "#quran/review" : void 0 }, "Review", h("span", { className: "q-step__meta" }, "All four, from memory"))
        )
      ),
      h(Button, { variant: "primary", onClick: () => go(target) }, "Continue")
    );
  }

  function LaterBlock({ k, block, byN, set }) {
    return h(
      "section",
      { className: "q-block", "aria-label": `Block ${k}` },
      h("h3", { className: "q-block__title q-block__title--small" }, `Block ${k}`),
      h(
        "ul",
        { className: "q-later" },
        block.map((n) =>
          h(
            "li",
            { key: n, className: "q-later__item" },
            h("span", null, h(SurahName, { s: byN.get(n) })),
            h("button", { type: "button", className: "q-link", "aria-label": `I know this: ${byN.get(n).nameUz}`, onClick: () => set(n, { state: "known" }) }, "I know this")
          )
        )
      )
    );
  }

  function PathView({ index }) {
    const { progress, set } = useHifz();
    const today = useToday();
    const [showAll, setShowAll] = React2.useState(false);
    const byN = React2.useMemo(() => new Map(index.map((s) => [s.n, s])), [index]);
    const path = React2.useMemo(() => R.buildPath(index, progress), [index, progress]);
    const ci = R.currentBlock(path, progress);
    const block = path[ci];
    const bs = block ? R.blockState(block, progress) : null;
    // The surah you're on starts its clock the first time it's current.
    React2.useEffect(() => {
      if (bs && bs.status === "studying" && !progress.get(bs.current)) set(bs.current, { state: "learning", startedAt: today });
    }, [bs && bs.current, bs && bs.status]);
    // The current block's surahs are fetched once, so they open offline later.
    React2.useEffect(() => {
      if (block) block.forEach((n) => loadSurah(n).catch(() => {}));
    }, [block && block.join(",")]);
    const later = path.slice(ci + 1);
    const shownLater = showAll ? later : later.slice(0, 2);
    const known = index.filter((s) => (progress.get(s.n) || {}).state === "known");
    return h(
      React2.Fragment,
      null,
      block ? h(CurrentBlock, { k: ci + 1, block, byN, progress, set, today }) : h("section", { className: "panel q-block" }, h("h2", { className: "q-block__title" }, "Every surah done"), h("p", null, "Masha'Allah. Every surah on the path is solid.")),
      later.length > 0 &&
        h(
          "section",
          { className: "q-section", "aria-label": "Next blocks" },
          h("h2", { className: "section-label" }, "Next blocks"),
          shownLater.map((b, i) => h(LaterBlock, { key: b.join(","), k: ci + 2 + i, block: b, byN, set })),
          later.length > shownLater.length && h("button", { type: "button", className: "q-link", onClick: () => setShowAll(true) }, `Show all ${later.length} blocks`)
        ),
      ci > 0 &&
        h(
          "details",
          { className: "q-section q-done" },
          h("summary", { className: "section-label" }, `Finished blocks · ${ci}`),
          path.slice(0, ci).map((b, i) => h("p", { key: b.join(","), className: "q-done__row" }, h("b", null, `Block ${i + 1}: `), b.map((n) => byN.get(n).nameUz).join(", ")))
        ),
      known.length > 0 &&
        h(
          "section",
          { className: "q-section", "aria-label": "Known surahs" },
          h("h2", { className: "section-label" }, "Surahs you already know"),
          h(
            "ul",
            { className: "q-later" },
            known.map((s) =>
              h("li", { key: s.n, className: "q-later__item" }, h("span", null, h(SurahName, { s })), h("button", { type: "button", className: "q-link", "aria-label": `Learn it after all: ${s.nameUz}`, onClick: () => set(s.n, { state: null }) }, "Learn it after all"))
            )
          )
        )
    );
  }

  // ---------- The page ----------
  function QuranPage() {
    const view = useHashView();
    const { index, error, retry } = useIndex();
    let body;
    if (error) body = h("div", { className: "panel q-msg" }, h("p", null, "Couldn't open the surah list. Check your connection and try again."), h(Button, { onClick: retry }, "Try again"));
    else if (!index) body = h("p", { className: "q-msg muted" }, "Loading surahs…");
    else body = h(PathView, { index });
    return h(
      React2.Fragment,
      null,
      view.kind === "path" &&
        h(
          "div",
          { className: "page-head" },
          h("div", { className: "page-head__text" }, h("h1", { className: "page-title" }, "Quran"), h("p", { className: "page-desc" }, "Learn surahs by heart, four at a time, shortest first."))
        ),
      body
    );
  }

  window.__onePages = window.__onePages || {};
  window.__onePages.quran = QuranPage;
})();
