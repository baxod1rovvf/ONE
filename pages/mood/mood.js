// Core — Mood page. It loads into the same page as index.html (see loadPage
// there); its week maths comes from pages/mood/rules.js, which loadPage
// loads first (window.__oneMoodRules). index.html shares what the page needs
// through window.__oneApp; the page is handed back in window.__onePages.
(function () {
  "use strict";
  const {
    ArrowLeft, ArrowRight, IconButton, MOODS, MOOD_NOTE_MAX, MoodFace, React2, SampleBadge, parseISODate, relativeDay,
    todayISO, useMoodDay, useStore
  } = window.__oneApp;
  const R = window.__oneMoodRules;
  const h = React2.createElement;

  const word = (mood) => (MOODS.find((m) => m.value === mood) || {}).word || "";
  const fmt = (iso, opts) => parseISODate(iso).toLocaleDateString(void 0, opts);
  const dayName = (iso) => fmt(iso, { weekday: "short", month: "short", day: "numeric" });
  const weekday = (iso) => fmt(iso, { weekday: "short" });
  // "Nov 2 – 8", or "Oct 26 – Nov 1" when the week crosses a month.
  function weekLabel(days) {
    const a = days[0];
    const b = days[6];
    const month = (iso) => fmt(iso, { month: "short" });
    const date = (iso) => parseISODate(iso).getDate();
    return month(a) === month(b) ? `${month(a)} ${date(a)} – ${date(b)}` : `${month(a)} ${date(a)} – ${month(b)} ${date(b)}`;
  }
  const firstLine = (note) => (note || "").trim().split("\n")[0];

  // The five faces for one day; the chosen one is pressed.
  function FacePicker({ mood, onPick, label = "Mood for the day", size = 34 }) {
    return h(
      "div",
      { className: "mood-faces", role: "group", "aria-label": label },
      MOODS.map((m) =>
        h(
          "button",
          { key: m.value, type: "button", className: "mood-faces__btn", "aria-pressed": mood === m.value, onClick: () => onPick(m.value) },
          h(MoodFace, { mood: m.value, size }),
          h("span", { className: "mood-faces__word" }, m.word)
        )
      )
    );
  }

  function DayEditor({ date }) {
    const { entry, setMood, setNote } = useMoodDay(date);
    return h(
      "section",
      { className: "panel mood-day", "aria-label": `Your mood on ${dayName(date)}` },
      h("h2", { className: "mood-day__title" }, relativeDay(date), entry && entry.sample && h(SampleBadge, null)),
      h(FacePicker, { mood: entry ? entry.mood : null, onPick: setMood }),
      h(
        "label",
        { className: "mood-day__note" },
        h("span", { className: "field__label" }, "Why was it like that?"),
        h("textarea", {
          className: "input",
          rows: 3,
          maxLength: MOOD_NOTE_MAX,
          placeholder: "A few words on what made the day",
          value: entry ? entry.note || "" : "",
          onChange: (e) => setNote(e.target.value)
        })
      )
    );
  }

  function DayLine({ label, entry, onOpen }) {
    return h(
      "button",
      { type: "button", className: "mood-line mood-line--btn", onClick: () => onOpen(entry.date) },
      h("span", { className: "mood-line__label" }, label),
      h(MoodFace, { mood: entry.mood, size: 22 }),
      h("span", { className: "mood-line__text" }, h("b", null, weekday(entry.date)), ` · ${word(entry.mood)}`, R.hasNote(entry) ? ` · “${firstLine(entry.note)}”` : "")
    );
  }

  function MoodPage() {
    const { data } = useStore();
    const today = todayISO();
    const thisWeek = R.weekStart(today);
    const [start, setStart] = React2.useState(thisWeek);
    const days = R.weekDays(start);
    const [selected, setSelected] = React2.useState(today);
    // Moving to another week opens its latest day you can mark.
    const go = (n) => {
      const next = R.shiftWeek(start, n);
      if (next > thisWeek) return;
      setStart(next);
      setSelected(R.weekDays(next).filter((d) => R.canMark(d, today)).pop());
    };
    const moods = data.moods || [];
    const byDate = React2.useMemo(() => R.latestByDate(moods), [moods]);
    const s = React2.useMemo(() => R.summarize(moods, start), [moods, start]);
    const open = (date) => setSelected(date);
    const empty = days.every((d) => !byDate.get(d));
    const todayDay = useMoodDay(today);

    return h(
      React2.Fragment,
      null,
      h(
        "div",
        { className: "page-head" },
        h("div", { className: "page-head__text" }, h("h1", { className: "page-title" }, "Mood"), h("p", { className: "page-desc" }, "Mark your days and see how your week went.")),
        h(
          "div",
          { className: "mood-week-nav" },
          h(IconButton, { label: "Previous week", onClick: () => go(-1) }, h(ArrowLeft, { size: 16 })),
          h("span", { className: "mood-week-nav__label", "aria-live": "polite" }, weekLabel(days)),
          h(IconButton, { label: "Next week", onClick: () => go(1), disabled: start >= thisWeek }, h(ArrowRight, { size: 16 }))
        )
      ),
      h(
        "div",
        { className: "mood-strip panel", role: "group", "aria-label": "Days of the week" },
        days.map((d) => {
          const e = byDate.get(d);
          const mood = e ? e.mood : null;
          return h(
            "button",
            {
              key: d,
              type: "button",
              className: `mood-strip__day${d === today ? " is-today" : ""}`,
              "aria-label": `${dayName(d)}: ${mood ? word(mood) : "not marked"}`,
              "aria-pressed": d === selected,
              disabled: !R.canMark(d, today),
              onClick: () => open(d)
            },
            h(MoodFace, { mood, size: 30 }),
            h("span", { className: "mood-strip__wd" }, weekday(d)),
            h("span", { className: "mood-strip__date num" }, parseISODate(d).getDate())
          );
        })
      ),
      empty && start === thisWeek
        ? h(
            "section",
            { className: "panel mood-empty" },
            h("h2", { className: "mood-empty__title" }, "How was today?"),
            h("p", { className: "page-desc" }, "One tap marks the day. Add a few words on why, and by the end of the week you'll see what made it good or hard."),
            h(FacePicker, { mood: todayDay.entry ? todayDay.entry.mood : null, onPick: todayDay.setMood, label: "Mood for today" })
          )
        : h(
            React2.Fragment,
            null,
            selected && h(DayEditor, { key: selected, date: selected }),
            h(
              "section",
              { className: "panel mood-summary", "aria-label": "This week" },
              h(
                "div",
                { className: "mood-line" },
                h("span", { className: "mood-line__label" }, "This week"),
                s.average ? h(MoodFace, { mood: s.average, size: 22 }) : null,
                h("span", { className: "mood-line__text" }, s.average ? `${word(s.average)} · ${s.marked} of 7 days` : "No days marked yet")
              ),
              s.best
                ? h(React2.Fragment, null, h(DayLine, { label: "Best day", entry: s.best, onOpen: open }), h(DayLine, { label: "Worst day", entry: s.worst, onOpen: open }))
                : h("p", { className: "mood-summary__hint" }, "Mark a few more days to see your best and worst.")
            ),
            s.notes.length > 0 &&
              h(
                "section",
                { className: "mood-notes" },
                h("h2", { className: "section-label", id: "mood-notes-title" }, "This week's notes"),
                h(
                  "ul",
                  { className: "mood-notes__list", "aria-labelledby": "mood-notes-title" },
                  s.notes.map((e) =>
                    h(
                      "li",
                      { key: e.id, className: "panel mood-note" },
                      h("div", { className: "mood-note__head" }, h(MoodFace, { mood: e.mood, size: 20 }), h("b", null, dayName(e.date)), e.mood ? ` · ${word(e.mood)}` : ""),
                      h("p", { className: "mood-note__text" }, e.note.trim())
                    )
                  )
                )
              )
          )
    );
  }

  window.__onePages = window.__onePages || {};
  window.__onePages.mood = MoodPage;
})();
