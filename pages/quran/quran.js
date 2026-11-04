// Core — Quran learning page. It loads into the same page as index.html (see
// loadPage there); the path rules come from pages/quran/rules.js, which
// loadPage loads first (window.__oneQuranRules). The text is in
// pages/quran/data (made by tools/quran/build-data.mjs). Views by hash:
// #quran (the path), #quran/<n> (a surah), #quran/review (the block review).
(function () {
  "use strict";
  const { Button, QuranClip, QuranSource, React2, newId, quranReciterId, useStore, useToday } = window.__oneApp;
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
      // Asked for by its version (the date it was downloaded), so a corrected
      // file reaches devices that kept the old one.
      const p = loadIndex()
        .then((index) => {
          const entry = index.find((s) => s.n === n);
          return fetch(`pages/quran/data/${n}.json${entry && entry.fetchedAt ? `?v=${entry.fetchedAt}` : ""}`);
        })
        .then((res) => {
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
    return h("span", { className: "q-sname" }, h("span", { className: "q-name" }, s.nameUz), h("span", { className: "q-name-ar", lang: "ar", dir: "rtl" }, s.nameAr));
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
      const e = bs && bs.status === "studying" ? progress.get(bs.current) || {} : null;
      if (e && !e.startedAt) set(bs.current, { state: e.state || "learning", startedAt: today });
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

  // ---------- A surah ----------
  const CREDITS = "Arabic: Quran.com (Tanzil). Translation: Shaykh Muhammad Sodiq Muhammad Yusuf, via QuranEnc, converted to Latin script. Uzbek reading: uzbek-quran-transliteration (github.com/AbdurazzoqAbdugafforov).";
  function useSurah(n) {
    const [state, setState] = React2.useState({ file: null, error: false });
    const load = React2.useCallback(() => {
      setState({ file: null, error: false });
      loadSurah(n).then((file) => setState({ file, error: false }), () => setState({ file: null, error: true }));
    }, [n]);
    React2.useEffect(load, [load]);
    return { ...state, retry: load };
  }
  // The cue in Test me: the verse up to its first real word, so a verse that
  // opens with a mark (such as ۞) still shows a word to start from.
  const firstWord = (ar) => {
    const tokens = ar.split(/\s+/);
    const i = tokens.findIndex((t) => /[\u0621-\u064A\u0671]/.test(t));
    return tokens.slice(0, i === -1 ? 1 : i + 1).join(" ");
  };

  // One verse. In test mode it shows only its first word until it's tapped.
  function Ayah({ v, test, showUz, revealed, onReveal, children }) {
    const hide = test && !revealed;
    return h(
      "article",
      { className: `ayah${test ? " is-test" : ""}${revealed ? " is-revealed" : ""}`, "aria-label": `Verse ${v.n}`, onClick: hide ? onReveal : void 0 },
      h("div", { className: "ayah__top" }, h("span", { className: "ayah__num" }, v.n), children),
      h("p", { className: `ayah__ar${hide ? " is-cut" : ""}`, lang: "ar", dir: "rtl" }, hide ? firstWord(v.ar) : v.ar),
      h("p", { className: "ayah__reading", hidden: hide }, v.reading),
      h("p", { className: "ayah__uz", hidden: hide && !showUz }, v.uz),
      v.notes && !hide && h("details", { className: "ayah__notes" }, h("summary", null, "Notes"), h("p", null, v.notes)),
      hide && h("button", { type: "button", className: "ayah__show", "aria-label": `Show verse ${v.n}`, onClick: (e) => (e.stopPropagation(), onReveal()) }, "Tap to show")
    );
  }

  // The verses of a surah, with the Test me switches. Used by the surah page
  // and the review.
  function Verses({ file, test, setTest, renderTools }) {
    const { data, setSettings } = useStore();
    const showUz = (data.settings || {}).quranTestTranslation !== false;
    const [revealed, setRevealed] = React2.useState(() => new Set());
    React2.useEffect(() => setRevealed(new Set()), [file.n, test]);
    return h(
      React2.Fragment,
      null,
      h(
        "div",
        { className: "q-test" },
        setTest && h("button", { type: "button", role: "switch", "aria-checked": test, className: "q-switch", onClick: () => setTest(!test) }, h("span", { className: "q-switch__dot", "aria-hidden": true }), "Test me"),
        test && h("button", { type: "button", role: "switch", "aria-checked": showUz, className: "q-switch", onClick: () => setSettings({ quranTestTranslation: !showUz }) }, h("span", { className: "q-switch__dot", "aria-hidden": true }), "Show translation"),
        test && revealed.size > 0 && h("button", { type: "button", className: "q-link", onClick: () => setRevealed(new Set()) }, "Hide all again")
      ),
      h(
        "div",
        { className: "ayahs" },
        file.verses.map((v) =>
          h(Ayah, { key: v.n, v, test, showUz, revealed: revealed.has(v.n), onReveal: () => setRevealed((s) => new Set(s).add(v.n)) }, renderTools ? renderTools(v) : null)
        )
      )
    );
  }

  // ---------- Audio ----------
  // The surah's recording and, when the reciter has them, its verse timings.
  function useRecitation(n) {
    const [rec, setRec] = React2.useState({ url: null, verses: null, error: false });
    React2.useEffect(() => {
      let live = true;
      (async () => {
        try {
          const id = await quranReciterId();
          const t = id ? await QuranSource.verseTimings(id, n) : null;
          const url = t ? t.url : id ? await QuranSource.surahUrl(id, n) : null;
          if (live) setRec({ url, verses: t ? new Map(t.verses.map((v) => [v.verse, v])) : null, error: !url });
        } catch {
          if (live) setRec({ url: null, verses: null, error: true });
        }
      })();
      return () => {
        live = false;
        QuranClip.stop();
      };
    }, [n]);
    return rec;
  }
  // Which clip is playing, kept in step with the shared player.
  function useClip() {
    const [, setTick] = React2.useState(0);
    React2.useEffect(() => QuranClip.subscribe(() => setTick((t) => t + 1)), []);
    const a = QuranClip.audio;
    return { key: QuranClip.loading || (a && !a.paused) ? QuranClip.key : null, loop: QuranClip.loop };
  }
  const playKey = (rec, key, opts) => QuranClip.play(rec.url, { key, ...opts }).catch(() => {});

  function SurahView({ n, index }) {
    const { file, error, retry } = useSurah(n);
    const { progress, set } = useHifz();
    const today = useToday();
    const [test, setTest] = React2.useState(false);
    const path = React2.useMemo(() => R.buildPath(index, progress), [index, progress]);
    const block = path[R.currentBlock(path, progress)] || [];
    const inBlock = block.includes(n);
    const st = inBlock ? R.stepState(n, block, progress) : null;
    const entry = progress.get(n) || {};
    // Opening the surah you're on starts its clock, as the path does.
    React2.useEffect(() => {
      const e = progress.get(n) || {};
      if (st === "current" && !e.startedAt) set(n, { state: e.state || "learning", startedAt: today });
    }, [st, n]);
    React2.useEffect(() => window.scrollTo(0, 0), [n]);
    const learned = () => {
      set(n, { state: "learned", startedAt: entry.startedAt || today });
      const after = new Map(progress);
      after.set(n, { ...entry, surah: n, state: "learned" });
      const bs = R.blockState(block, after);
      go(bs.status === "studying" ? `#quran/${bs.current}` : bs.status === "review" ? "#quran/review" : "#quran");
    };
    const meta = index.find((s) => s.n === n);
    const rec = useRecitation(n);
    const clip = useClip();
    const toggle = (key, opts) => (clip.key === key ? QuranClip.stop() : playKey(rec, key, opts));
    const verseTools = (v) => {
      const t = rec.verses && rec.verses.get(v.n);
      if (!t) return null;
      const playing = clip.key === `v${v.n}`;
      const looping = clip.key === `r${v.n}`;
      return h(
        React2.Fragment,
        null,
        h("button", { type: "button", className: `q-icon${playing ? " is-on" : ""}`, "aria-label": `Play verse ${v.n}`, "aria-pressed": playing, onClick: (e) => (e.stopPropagation(), toggle(`v${v.n}`, { from: t.from, to: t.to })) }, playing ? "❚❚" : "▶"),
        h("button", { type: "button", className: `q-icon${looping ? " is-on" : ""}`, "aria-label": `Repeat verse ${v.n}`, "aria-pressed": looping, onClick: (e) => (e.stopPropagation(), toggle(`r${v.n}`, { from: t.from, to: t.to, loop: true })) }, "🔁")
      );
    };
    return h(
      React2.Fragment,
      null,
      h(
        "div",
        { className: "page-head q-surah-head" },
        h(
          "div",
          { className: "page-head__text" },
          h("a", { className: "q-back", href: "#quran" }, "‹ All surahs"),
          h("h1", { className: "page-title" }, meta.nameUz),
          h("p", { className: "q-surah-head__ar", lang: "ar", dir: "rtl" }, meta.nameAr),
          h("p", { className: "page-desc" }, `Surah ${n} · ${meta.verses} verses`),
          rec.url && h(Button, { variant: clip.key === "all" ? "primary" : "secondary", onClick: () => toggle("all", {}) }, clip.key === "all" ? "Pause" : "Play whole surah"),
          rec.error && h("p", { className: "q-msg muted" }, "Couldn't reach the recitation. Check your connection or try another reciter.")
        )
      ),
      entry.readingChecked
        ? h("p", { className: "q-checked" }, "✓ Reading checked")
        : h(
            "div",
            { className: "q-check panel", role: "note" },
            h("p", null, "Uzbek reading not checked yet. Compare it with your mushaf or app, then mark it checked."),
            h(Button, { size: "sm", onClick: () => set(n, { readingChecked: true }) }, "Mark reading as checked")
          ),
      error
        ? h("div", { className: "panel q-msg" }, h("p", null, "Couldn't open this surah. Check your connection and try again."), h(Button, { onClick: retry }, "Try again"))
        : !file
          ? h("p", { className: "q-msg muted" }, "Loading surah…")
          : h(Verses, { file, test, setTest, renderTools: verseTools }),
      file && (st === "current" || st === "needs-work") && h("div", { className: "q-done-bar" }, h(Button, { variant: "primary", onClick: learned }, "I've learned it")),
      h("p", { className: "q-credits" }, CREDITS)
    );
  }

  // ---------- The review ----------
  function ReviewPart({ n, meta, state, set }) {
    const { file, error, retry } = useSurah(n);
    return h(
      "section",
      { className: "panel q-review__part", "aria-label": meta.nameUz },
      h("h2", { className: "q-review__title" }, h(SurahName, { s: meta })),
      error
        ? h("div", { className: "q-msg" }, h("p", null, "Couldn't open this surah. Check your connection and try again."), h(Button, { onClick: retry }, "Try again"))
        : !file
          ? h("p", { className: "q-msg muted" }, "Loading surah…")
          : h(Verses, { file, test: true }),
      h(
        "div",
        { className: "q-review__marks" },
        h("button", { type: "button", className: "q-mark q-mark--solid", "aria-pressed": state === "solid", onClick: () => set(n, { state: "solid" }) }, "Solid"),
        h("button", { type: "button", className: "q-mark q-mark--work", "aria-pressed": state === "needs-work", onClick: () => set(n, { state: "needs-work" }) }, "Needs work"),
        state === "needs-work" && h("a", { className: "q-link", href: `#quran/${n}` }, "Study again")
      )
    );
  }

  function ReviewView({ index }) {
    const { progress, set } = useHifz();
    const byN = React2.useMemo(() => new Map(index.map((s) => [s.n, s])), [index]);
    // The block under review, fixed when the review opens, so finishing it
    // doesn't swap the view to the next block.
    const [block] = React2.useState(() => {
      const path = R.buildPath(index, progress);
      return path[R.currentBlock(path, progress)] || null;
    });
    const stateOf = (n) => (progress.get(n) || {}).state;
    const ready = block && block.every((n) => ["learned", "solid", "needs-work"].includes(stateOf(n)));
    if (!ready) {
      return h("div", { className: "panel q-msg" }, h("p", null, "Finish the four surahs first."), h(Button, { onClick: () => go("#quran") }, "Continue"));
    }
    const done = block.every((n) => stateOf(n) === "solid");
    const next = () => {
      const path = R.buildPath(index, progress);
      const b = path[R.currentBlock(path, progress)];
      const bs = b ? R.blockState(b, progress) : null;
      go(bs && bs.current ? `#quran/${bs.current}` : "#quran");
    };
    return h(
      React2.Fragment,
      null,
      h(
        "div",
        { className: "page-head" },
        h(
          "div",
          { className: "page-head__text" },
          h("a", { className: "q-back", href: "#quran" }, "‹ All surahs"),
          h("h1", { className: "page-title" }, "Review"),
          h("p", { className: "page-desc" }, "Recite each surah from memory. Tap a verse to check it, then mark the surah.")
        )
      ),
      block.map((n) => h(ReviewPart, { key: n, n, meta: byN.get(n), state: stateOf(n), set })),
      done
        ? h("div", { className: "panel q-review__done", role: "status" }, h("h2", { className: "q-block__title" }, "Block done"), h("p", null, "All four are solid. On to the next block."), h(Button, { variant: "primary", onClick: next }, "Continue"))
        : h("p", { className: "q-review__left muted" }, `${block.filter((n) => stateOf(n) === "solid").length} of ${block.length} solid`)
    );
  }

  // ---------- The page ----------
  function QuranPage() {
    const view = useHashView();
    const { index, error, retry } = useIndex();
    let body;
    if (error) body = h("div", { className: "panel q-msg" }, h("p", null, "Couldn't open the surah list. Check your connection and try again."), h(Button, { onClick: retry }, "Try again"));
    else if (!index) body = h("p", { className: "q-msg muted" }, "Loading surahs…");
    else if (view.kind === "surah") body = h(SurahView, { key: view.n, n: view.n, index });
    else if (view.kind === "review") body = h(ReviewView, { index });
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
