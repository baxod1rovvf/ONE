// ONE — Goals page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    Button, CircleCheck, EmptyState, IconButton, Menu, Minus, Pencil, Plus, React2, SampleBadge,
    Target, Trash2, Trophy, createLucideIcon, parseISODate, relativeDay, todayISO, useDeleteGoal,
    useStore, useToast, useUI
  } = window.__oneApp;
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const CalendarDays = createLucideIcon("CalendarDays", [
    ["path", { d: "M8 2v4", key: "1cmpym" }],
    ["path", { d: "M16 2v4", key: "4m81vk" }],
    ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2", key: "1hopcy" }],
    ["path", { d: "M3 10h18", key: "8toen8" }],
    ["path", { d: "M8 14h.01", key: "6423bh" }],
    ["path", { d: "M12 14h.01", key: "1etili" }],
    ["path", { d: "M16 14h.01", key: "1gbofw" }],
    ["path", { d: "M8 18h.01", key: "lrp35t" }],
    ["path", { d: "M12 18h.01", key: "mhygvu" }],
    ["path", { d: "M16 18h.01", key: "kzsmim" }]
  ]);
  function daysUntil(iso) {
    const a = parseISODate(todayISO()).getTime();
    const b = parseISODate(iso).getTime();
    return Math.round((b - a) / 864e5);
  }
  function ProgressBar({ value, label }) {
    const v = Math.max(0, Math.min(100, value));
    return /* @__PURE__ */ React2.createElement("div", { className: `bar${v >= 100 ? " bar--complete" : ""}`, role: "progressbar", "aria-label": label, "aria-valuenow": v, "aria-valuemin": 0, "aria-valuemax": 100 }, /* @__PURE__ */ React2.createElement("div", { className: "bar__fill", style: { width: `${v}%` } }));
  }
  function GoalsPage() {
    const { data } = useStore();
    const ui = useUI();
    const byDate = (a, b) => (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999");
    const active = data.goals.filter((g) => g.progress < 100).sort(byDate);
    const reached = data.goals.filter((g) => g.progress >= 100);
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "page-head" }, /* @__PURE__ */ React2.createElement("div", { className: "page-head__text" }, /* @__PURE__ */ React2.createElement("h1", { className: "page-title" }, "Goals"), /* @__PURE__ */ React2.createElement("p", { className: "page-desc" }, "The bigger things you’re working toward. Update progress as you go.")), /* @__PURE__ */ React2.createElement(Button, { variant: "primary", className: "keep-mobile", icon: /* @__PURE__ */ React2.createElement(Plus, { size: 16, strokeWidth: 2.4 }), onClick: () => ui.editGoal(null) }, "New goal")), data.goals.length === 0 ? /* @__PURE__ */ React2.createElement("section", { className: "panel" }, /* @__PURE__ */ React2.createElement(
      EmptyState,
      {
        icon: /* @__PURE__ */ React2.createElement(Target, { size: 20 }),
        title: "No goals yet",
        body: "Pick one thing you’d like to have done in the next few months. You can update progress whenever you make a step.",
        action: /* @__PURE__ */ React2.createElement(Button, { variant: "primary", icon: /* @__PURE__ */ React2.createElement(Plus, { size: 16 }), onClick: () => ui.editGoal(null) }, "Add your first goal")
      }
    )) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, active.length > 0 && /* @__PURE__ */ React2.createElement("div", { className: "goal-grid" }, active.map((g) => /* @__PURE__ */ React2.createElement(GoalCard, { key: g.id, goal: g }))), active.length === 0 && /* @__PURE__ */ React2.createElement("p", { className: "inline-note" }, /* @__PURE__ */ React2.createElement(CircleCheck, { size: 16, "aria-hidden": true }), " Every goal is reached. Time to set a new one?"), reached.length > 0 && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("h2", { className: "section-label" }, "Reached · ", reached.length), /* @__PURE__ */ React2.createElement("div", { className: "goal-grid" }, reached.map((g) => /* @__PURE__ */ React2.createElement(GoalCard, { key: g.id, goal: g }))))));
  }
  function GoalCard({ goal }) {
    const { update, touch } = useStore();
    const ui = useUI();
    const toast = useToast();
    const del = useDeleteGoal();
    const reached = goal.progress >= 100;
    const setProgress = (v) => {
      const next = Math.max(0, Math.min(100, v));
      if (next === goal.progress) return;
      update("goals", goal.id, { progress: next });
      touch("goal", goal.id);
      if (next === 100) toast({ message: `Goal reached: ${goal.title}`, tone: "success" });
    };
    let due = null;
    if (goal.targetDate && !reached) {
      const d = daysUntil(goal.targetDate);
      if (d < 0) due = { text: `${-d} ${d === -1 ? "day" : "days"} past target`, tone: "danger" };
      else if (d === 0) due = { text: "Target is today", tone: "warn" };
      else due = { text: `${d} ${d === 1 ? "day" : "days"} left`, tone: d <= 7 ? "warn" : void 0 };
    }
    return /* @__PURE__ */ React2.createElement("article", { className: `panel goal${reached ? " goal--reached" : ""}`, "aria-label": goal.title }, /* @__PURE__ */ React2.createElement("div", { className: "goal__top" }, /* @__PURE__ */ React2.createElement("div", { className: "goal__titles" }, /* @__PURE__ */ React2.createElement("h3", { className: "goal__title" }, goal.title), goal.sample && /* @__PURE__ */ React2.createElement(SampleBadge, null)), /* @__PURE__ */ React2.createElement(
      Menu,
      {
        label: `Actions for "${goal.title}"`,
        items: [
          { label: "Edit", icon: /* @__PURE__ */ React2.createElement(Pencil, { size: 15 }), onSelect: () => ui.editGoal(goal) },
          reached ? { label: "Reopen goal", icon: /* @__PURE__ */ React2.createElement(Target, { size: 15 }), onSelect: () => setProgress(90) } : { label: "Mark as reached", icon: /* @__PURE__ */ React2.createElement(Trophy, { size: 15 }), onSelect: () => setProgress(100) },
          { label: "Delete", icon: /* @__PURE__ */ React2.createElement(Trash2, { size: 15 }), danger: true, separatorBefore: true, onSelect: () => void del(goal) }
        ]
      }
    )), goal.description && /* @__PURE__ */ React2.createElement("p", { className: "goal__desc" }, goal.description), /* @__PURE__ */ React2.createElement("div", { className: "goal__progress" }, /* @__PURE__ */ React2.createElement("div", { className: "goal__progress-row" }, /* @__PURE__ */ React2.createElement("span", { className: "goal__pct num" }, goal.progress, "%"), /* @__PURE__ */ React2.createElement("span", { className: "goal__meta" }, reached ? /* @__PURE__ */ React2.createElement("span", { className: "badge badge--success" }, /* @__PURE__ */ React2.createElement(CircleCheck, { size: 12, "aria-hidden": true }), " Reached") : goal.targetDate ? /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(CalendarDays, { size: 13, "aria-hidden": true }), " ", relativeDay(goal.targetDate), due && /* @__PURE__ */ React2.createElement("span", { className: `goal__due${due.tone ? ` is-${due.tone}` : ""}` }, " · ", due.text)) : "No target date")), reached && /* @__PURE__ */ React2.createElement(ProgressBar, { value: goal.progress, label: `${goal.title} progress` })), !reached && /* @__PURE__ */ React2.createElement("div", { className: "goal__controls" }, /* @__PURE__ */ React2.createElement(IconButton, { label: "Decrease progress by 10%", size: "sm", onClick: () => setProgress(goal.progress - 10), disabled: goal.progress <= 0 }, /* @__PURE__ */ React2.createElement(Minus, { size: 15 })), /* @__PURE__ */ React2.createElement("label", { className: "sr-only", htmlFor: `range-${goal.id}` }, "Progress for ", goal.title), /* @__PURE__ */ React2.createElement(
      "input",
      {
        id: `range-${goal.id}`,
        type: "range",
        className: "range",
        min: 0,
        max: 100,
        step: 5,
        value: goal.progress,
        style: { ["--val"]: `${goal.progress}%` },
        "aria-valuetext": `${goal.progress}%`,
        onChange: (e) => setProgress(Number(e.target.value))
      }
    ), /* @__PURE__ */ React2.createElement(IconButton, { label: "Increase progress by 10%", size: "sm", onClick: () => setProgress(goal.progress + 10) }, /* @__PURE__ */ React2.createElement(Plus, { size: 15 }))));
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.goals = GoalsPage;
})();
