// ONE — Tasks page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    ArrowRight, Button, Check, CircleCheck, EmptyState, Menu, Pencil, Plus, React2, SampleBadge,
    Segmented, Sun, Trash2, addDays, createLucideIcon, newId, relativeDay, toISODate, todayISO,
    useConfirm, useDeleteTask, useStore, useToast, useUI
  } = window.__oneApp;
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const CalendarClock = createLucideIcon("CalendarClock", [
    ["path", { d: "M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5", key: "1osxxc" }],
    ["path", { d: "M16 2v4", key: "4m81vk" }],
    ["path", { d: "M8 2v4", key: "1cmpym" }],
    ["path", { d: "M3 10h5", key: "r794hk" }],
    ["path", { d: "M17.5 17.5 16 16.3V14", key: "akvzfd" }],
    ["circle", { cx: "16", cy: "16", r: "6", key: "qoo3c4" }]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Calendar = createLucideIcon("Calendar", [
    ["path", { d: "M8 2v4", key: "1cmpym" }],
    ["path", { d: "M16 2v4", key: "4m81vk" }],
    ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2", key: "1hopcy" }],
    ["path", { d: "M3 10h18", key: "8toen8" }]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Clock = createLucideIcon("Clock", [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["polyline", { points: "12 6 12 12 16 14", key: "68esgv" }]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Flag = createLucideIcon("Flag", [
    ["path", { d: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z", key: "i9b6wo" }],
    ["line", { x1: "4", x2: "4", y1: "22", y2: "15", key: "1cm3nv" }]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Inbox = createLucideIcon("Inbox", [
    ["polyline", { points: "22 12 16 12 14 15 10 15 8 12 2 12", key: "o97t9d" }],
    [
      "path",
      {
        d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
        key: "oot6mr"
      }
    ]
  ]);
  function isSameDay(isoTimestamp, date = /* @__PURE__ */ new Date()) {
    if (!isoTimestamp) return false;
    return toISODate(new Date(isoTimestamp)) === toISODate(date);
  }
  function formatTime(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const d = /* @__PURE__ */ new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
  }
  // A tiny sprout that pops up beside a task when it's done.
  function Sprout({ show }) {
    if (!show) return null;
    return React2.createElement(
      "span",
      { className: "sprout", "aria-hidden": true },
      React2.createElement(
        "svg",
        { viewBox: "0 0 16 16", width: 14, height: 14 },
        React2.createElement("path", { d: "M8 15V8", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", fill: "none" }),
        React2.createElement("path", { d: "M8 9C8 5.5 5.5 3.5 2 3.6 2 7 4.5 9 8 9z", fill: "currentColor" }),
        React2.createElement("path", { d: "M8 7.5c0-3 2.2-4.8 5.6-4.7.1 3-2.1 4.8-5.6 4.7z", fill: "currentColor", opacity: 0.75 })
      )
    );
  }
  function TaskCheck({ checked, onToggle, label, priority }) {
    const [pop, setPop] = React2.useState(false);
    const prev = React2.useRef(checked);
    React2.useEffect(() => {
      if (checked && !prev.current) {
        setPop(true);
        const t = window.setTimeout(() => setPop(false), 450);
        prev.current = checked;
        return () => window.clearTimeout(t);
      }
      prev.current = checked;
    }, [checked]);
    return /* @__PURE__ */ React2.createElement(
      "button",
      {
        type: "button",
        role: "checkbox",
        "aria-checked": checked,
        "aria-label": checked ? `Mark "${label}" as not done` : `Complete "${label}"`,
        className: `tcheck${pop ? " is-popping" : ""}${priority === "high" && !checked ? " tcheck--prio-high" : ""}`,
        onClick: (e) => {
          e.stopPropagation();
          onToggle();
        }
      },
      /* @__PURE__ */ React2.createElement(Check, { size: 13, strokeWidth: 3, "aria-hidden": true })
    );
  }
  const PRIO_RANK = { high: 0, medium: 1, low: 2, none: 3 };
  function compareTasks(a, b) {
    const ad = a.dueDate ?? "9999-99-99";
    const bd = b.dueDate ?? "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    const at = a.dueTime ?? "99:99";
    const bt = b.dueTime ?? "99:99";
    if (at !== bt) return at < bt ? -1 : 1;
    if (a.priority !== b.priority) return PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
    return b.createdAt.localeCompare(a.createdAt);
  }
  function useSettling(ms = 900) {
    const [ids, setIds] = React2.useState(() => /* @__PURE__ */ new Set());
    const timers = React2.useRef(/* @__PURE__ */ new Map());
    React2.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
    const mark = React2.useCallback(
      (id) => {
        setIds((s) => new Set(s).add(id));
        const prev = timers.current.get(id);
        if (prev) window.clearTimeout(prev);
        timers.current.set(
          id,
          window.setTimeout(() => {
            setIds((s) => {
              const n2 = new Set(s);
              n2.delete(id);
              return n2;
            });
            timers.current.delete(id);
          }, ms)
        );
      },
      [ms]
    );
    return { settling: ids, mark };
  }
  function useToggleTask(onToggled) {
    const { update } = useStore();
    return (t) => {
      onToggled == null ? void 0 : onToggled(t.id);
      update("tasks", t.id, t.done ? { done: false, completedAt: null } : { done: true, completedAt: (/* @__PURE__ */ new Date()).toISOString() });
    };
  }
  function TaskProgress({ task }) {
    const { update } = useStore();
    const [open, setOpen] = React2.useState(false);
    const ref = React2.useRef(null);
    const value = task.percent ?? 0;
    React2.useEffect(() => {
      if (!open) return;
      const onDown = (e) => {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      };
      const onKey = (e) => {
        if (e.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onDown);
      document.addEventListener("keydown", onKey);
      return () => {
        document.removeEventListener("pointerdown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [open]);
    const set = (v) => update("tasks", task.id, { percent: Math.max(0, Math.min(100, Math.round(Number(v) || 0))) });
    return React2.createElement(
      "div",
      { className: `tprog${open ? " is-open" : ""}`, ref },
      React2.createElement(
        "button",
        {
          type: "button",
          className: `tprog__btn${value >= 100 ? " is-full" : ""}`,
          "aria-expanded": open,
          "aria-label": `My progress on "${task.title}": ${value}%. Change`,
          title: "Change my progress",
          onClick: () => setOpen((v) => !v)
        },
        React2.createElement("span", { className: "tprog__bar", "aria-hidden": true }, React2.createElement("span", { className: "tprog__fill", style: { width: `${value}%` } })),
        React2.createElement("span", { className: "tprog__pct num" }, value, "%")
      ),
      open && React2.createElement(
        "div",
        { className: "tprog__pop", role: "group", "aria-label": `My progress on "${task.title}"` },
        React2.createElement(
          "div",
          { className: "tprog__pop-head" },
          React2.createElement("span", null, "My progress"),
          React2.createElement("span", { className: "tprog__num-wrap" }, React2.createElement("input", { type: "number", className: "input tprog__num num", min: 0, max: 100, value, "aria-label": "Percent done", onChange: (e) => set(e.target.value), autoFocus: true }), "%")
        ),
        React2.createElement("input", { type: "range", className: "range", min: 0, max: 100, step: 5, value, style: { ["--val"]: `${value}%` }, "aria-label": "Percent done", onChange: (e) => set(e.target.value) }),
        React2.createElement("div", { className: "tprog__quick" }, [0, 25, 50, 75, 100].map((v) => React2.createElement("button", { key: v, type: "button", className: "chip", "aria-pressed": value === v, onClick: () => set(v) }, v, "%")))
      )
    );
  }
  function TaskRow({ task, onToggle, hideToday, settling, showProgress }) {
    const ui = useUI();
    const { update } = useStore();
    const del = useDeleteTask();
    const today = todayISO();
    const overdue = !task.done && task.dueDate && task.dueDate < today;
    const showDate = task.dueDate && !(hideToday && task.dueDate === today);
    const visuallyDone = task.done;
    return /* @__PURE__ */ React2.createElement("li", { className: `task${visuallyDone ? " task--done" : ""}${settling ? " task--settling" : ""}` }, /* @__PURE__ */ React2.createElement(TaskCheck, { checked: task.done, onToggle: () => onToggle(task), label: task.title, priority: task.priority }), React2.createElement(Sprout, { show: task.done }), /* @__PURE__ */ React2.createElement("button", { type: "button", className: "task__main", onClick: () => ui.editTask(task), "aria-label": `Edit "${task.title}"` }, /* @__PURE__ */ React2.createElement("span", { className: "task__title" }, task.title), /* @__PURE__ */ React2.createElement("span", { className: "task__meta" }, task.dueTime && /* @__PURE__ */ React2.createElement("span", { className: "task__meta-item" }, /* @__PURE__ */ React2.createElement(Clock, { size: 12, "aria-hidden": true }), " ", formatTime(task.dueTime)), showDate && /* @__PURE__ */ React2.createElement("span", { className: `task__meta-item${overdue ? " is-overdue" : ""}` }, /* @__PURE__ */ React2.createElement(Calendar, { size: 12, "aria-hidden": true }), " ", overdue ? `Overdue · ${relativeDay(task.dueDate)}` : relativeDay(task.dueDate)), task.priority !== "none" && !task.done && /* @__PURE__ */ React2.createElement("span", { className: `task__meta-item prio prio--${task.priority}` }, /* @__PURE__ */ React2.createElement(Flag, { size: 12, "aria-hidden": true }), " ", task.priority[0].toUpperCase() + task.priority.slice(1)), task.label && /* @__PURE__ */ React2.createElement("span", { className: "task__label" }, task.label), task.sample && /* @__PURE__ */ React2.createElement(SampleBadge, null))), showProgress && React2.createElement(TaskProgress, { task }), /* @__PURE__ */ React2.createElement(
      Menu,
      {
        label: `Actions for "${task.title}"`,
        className: "task__menu",
        items: [
          { label: "Edit", icon: /* @__PURE__ */ React2.createElement(Pencil, { size: 15 }), onSelect: () => ui.editTask(task) },
          ...task.done ? [] : task.dueDate === today ? [{ label: "Move to tomorrow", icon: /* @__PURE__ */ React2.createElement(ArrowRight, { size: 15 }), onSelect: () => update("tasks", task.id, { dueDate: addDays(today, 1) }) }] : [{ label: "Do today", icon: /* @__PURE__ */ React2.createElement(Sun, { size: 15 }), onSelect: () => update("tasks", task.id, { dueDate: today }) }],
          { label: "Delete", icon: /* @__PURE__ */ React2.createElement(Trash2, { size: 15 }), danger: true, separatorBefore: true, onSelect: () => void del(task) }
        ]
      }
    ));
  }
  function InlineAddTask({ dueDate, placeholder = "Add a task", autoFocus }) {
    const { add } = useStore();
    const [value, setValue] = React2.useState("");
    const [announce, setAnnounce] = React2.useState("");
    const ref = React2.useRef(null);
    return /* @__PURE__ */ React2.createElement(
      "form",
      {
        className: "add-row",
        onSubmit: (e) => {
          var _a;
          e.preventDefault();
          const title = value.trim();
          if (!title) return;
          add("tasks", { id: newId(), title, done: false, completedAt: null, dueDate, dueTime: null, priority: "none", label: "", createdAt: (/* @__PURE__ */ new Date()).toISOString() }, true);
          setValue("");
          setAnnounce(`Added "${title}"`);
          (_a = ref.current) == null ? void 0 : _a.focus();
        }
      },
      /* @__PURE__ */ React2.createElement(Plus, { size: 16, className: "add-row__icon", "aria-hidden": true }),
      /* @__PURE__ */ React2.createElement("label", { htmlFor: `add-${dueDate ?? "none"}`, className: "sr-only" }, placeholder),
      /* @__PURE__ */ React2.createElement(
        "input",
        {
          ref,
          id: `add-${dueDate ?? "none"}`,
          className: "add-row__input",
          placeholder: `${placeholder}…`,
          value,
          maxLength: 200,
          autoFocus,
          onChange: (e) => setValue(e.target.value)
        }
      ),
      value.trim() && /* @__PURE__ */ React2.createElement("button", { type: "submit", className: "btn btn--primary btn--sm" }, "Add"),
      /* @__PURE__ */ React2.createElement("span", { className: "sr-only", "aria-live": "polite" }, announce)
    );
  }
  function TasksPage() {
    const { data, remove } = useStore();
    const ui = useUI();
    const confirm = useConfirm();
    const toast = useToast();
    const [view, setView] = React2.useState("today");
    const { settling, mark } = useSettling();
    const toggle = useToggleTask(mark);
    const today = todayISO();
    const doneNow = (t) => t.done && !settling.has(t.id);
    const groups = React2.useMemo(() => {
      const tasks = data.tasks;
      const todayList = tasks.filter((t) => t.dueDate && t.dueDate <= today && (!t.done || isSameDay(t.completedAt)));
      const upcoming = tasks.filter((t) => t.dueDate && t.dueDate > today && !doneNow(t));
      const anytime = tasks.filter((t) => !t.dueDate && !doneNow(t));
      const done = tasks.filter((t) => t.done).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
      return { todayList, upcoming, anytime, done };
    }, [data.tasks, today, settling]);
    const counts = {
      today: groups.todayList.filter((t) => !t.done).length,
      upcoming: groups.upcoming.filter((t) => !t.done).length,
      anytime: groups.anytime.filter((t) => !t.done).length,
      done: groups.done.length
    };
    const newTaskDefaults = view === "today" ? { dueDate: today } : view === "upcoming" ? { dueDate: addDays(today, 1) } : {};
    const clearDone = async () => {
      const n2 = groups.done.length;
      const ok = await confirm({ title: `Delete ${n2} completed ${n2 === 1 ? "task" : "tasks"}?`, body: "Completed tasks will be removed. You can undo this right after.", confirmLabel: "Delete completed" });
      if (!ok) return;
      const undos = groups.done.map((t) => remove("tasks", t.id));
      toast({ message: `Deleted ${n2} completed ${n2 === 1 ? "task" : "tasks"}`, tone: "neutral", action: { label: "Undo", onClick: () => undos.reverse().forEach((u) => u()) } });
    };
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "page-head" }, /* @__PURE__ */ React2.createElement("div", { className: "page-head__text" }, /* @__PURE__ */ React2.createElement("h1", { className: "page-title" }, "Tasks"), /* @__PURE__ */ React2.createElement("p", { className: "page-desc" }, "Plan the day, and track how far along you are on each task.")), /* @__PURE__ */ React2.createElement(Button, { variant: "primary", icon: /* @__PURE__ */ React2.createElement(Plus, { size: 16, strokeWidth: 2.4 }), onClick: () => ui.editTask(null, newTaskDefaults) }, "New task")), /* @__PURE__ */ React2.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React2.createElement(
      Segmented,
      {
        label: "Task view",
        value: view,
        onChange: setView,
        options: [
          { value: "today", label: "Today", icon: /* @__PURE__ */ React2.createElement(Sun, { size: 14, "aria-hidden": true }), count: counts.today },
          { value: "upcoming", label: "Upcoming", icon: /* @__PURE__ */ React2.createElement(CalendarClock, { size: 14, "aria-hidden": true }), count: counts.upcoming },
          { value: "anytime", label: "Anytime", icon: /* @__PURE__ */ React2.createElement(Inbox, { size: 14, "aria-hidden": true }), count: counts.anytime },
          { value: "done", label: "Done", icon: /* @__PURE__ */ React2.createElement(CircleCheck, { size: 14, "aria-hidden": true }), count: counts.done }
        ]
      }
    ), view === "done" && groups.done.length > 0 && /* @__PURE__ */ React2.createElement(Button, { size: "sm", variant: "ghost", icon: /* @__PURE__ */ React2.createElement(Trash2, { size: 14 }), onClick: clearDone }, "Clear completed")), /* @__PURE__ */ React2.createElement("section", { className: "panel panel--flush", "aria-label": `${view} tasks` }, view === "today" && /* @__PURE__ */ React2.createElement(TodayView, { list: groups.todayList, today, toggle, settling }), view === "upcoming" && /* @__PURE__ */ React2.createElement(UpcomingView, { list: groups.upcoming, today, toggle, settling }), view === "anytime" && /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(InlineAddTask, { dueDate: null, placeholder: "Add a task with no date" }), groups.anytime.length === 0 ? /* @__PURE__ */ React2.createElement(EmptyState, { icon: /* @__PURE__ */ React2.createElement(Inbox, { size: 20 }), title: "No undated tasks", body: "Things you want to do someday, without a deadline, live here." }) : /* @__PURE__ */ React2.createElement("ul", { className: "task-list" }, [...groups.anytime].sort(compareTasks).map((t) => /* @__PURE__ */ React2.createElement(TaskRow, { key: t.id, task: t, showProgress: true, onToggle: toggle, settling: settling.has(t.id) })))), view === "done" && (groups.done.length === 0 ? /* @__PURE__ */ React2.createElement(EmptyState, { icon: /* @__PURE__ */ React2.createElement(CircleCheck, { size: 20 }), title: "Nothing completed yet", body: "Tasks you check off will collect here, so you can see what you’ve finished." }) : /* @__PURE__ */ React2.createElement("ul", { className: "task-list" }, groups.done.map((t) => /* @__PURE__ */ React2.createElement(TaskRow, { key: t.id, task: t, showProgress: true, onToggle: toggle, settling: settling.has(t.id) }))))));
  }
  function NewTaskButton({ dueDate }) {
    const ui = useUI();
    return React2.createElement(Button, { variant: "primary", icon: React2.createElement(Plus, { size: 16, strokeWidth: 2.4 }), onClick: () => ui.editTask(null, { dueDate }) }, "New task");
  }
  function TodayView({ list, today, toggle, settling }) {
    const isDone = (t) => t.done && !settling.has(t.id);
    const overdue = list.filter((t) => !isDone(t) && t.dueDate < today).sort(compareTasks);
    const todays = list.filter((t) => !isDone(t) && t.dueDate === today).sort(compareTasks);
    const done = list.filter(isDone);
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(InlineAddTask, { dueDate: today, placeholder: "Add a task for today" }), list.length === 0 && /* @__PURE__ */ React2.createElement(EmptyState, { art: "seed", title: "Today is open", body: "Add the few things that matter most today. Everything else can wait in Upcoming or Anytime.", action: React2.createElement(NewTaskButton, { dueDate: today }) }), overdue.length > 0 && /* @__PURE__ */ React2.createElement(TaskGroup, { title: "Overdue", tone: "danger" }, overdue.map((t) => /* @__PURE__ */ React2.createElement(TaskRow, { key: t.id, task: t, showProgress: true, onToggle: toggle, settling: settling.has(t.id) }))), todays.length > 0 && /* @__PURE__ */ React2.createElement(TaskGroup, { title: overdue.length ? "Today" : null }, todays.map((t) => /* @__PURE__ */ React2.createElement(TaskRow, { key: t.id, task: t, showProgress: true, onToggle: toggle, hideToday: true, settling: settling.has(t.id) }))), done.length > 0 && /* @__PURE__ */ React2.createElement(TaskGroup, { title: `Done today · ${done.length}` }, done.map((t) => /* @__PURE__ */ React2.createElement(TaskRow, { key: t.id, task: t, showProgress: true, onToggle: toggle, hideToday: true, settling: settling.has(t.id) }))));
  }
  function UpcomingView({ list, today, toggle, settling }) {
    const byDay = /* @__PURE__ */ new Map();
    [...list].sort(compareTasks).forEach((t) => {
      const k = t.dueDate;
      byDay.set(k, [...byDay.get(k) ?? [], t]);
    });
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(InlineAddTask, { dueDate: addDays(today, 1), placeholder: "Add a task for tomorrow" }), list.length === 0 ? /* @__PURE__ */ React2.createElement(EmptyState, { art: "seed", title: "Nothing scheduled ahead", body: "Give a task a future date and it will wait here until the day comes.", action: React2.createElement(NewTaskButton, { dueDate: addDays(today, 1) }) }) : Array.from(byDay.entries()).map(([day, tasks]) => /* @__PURE__ */ React2.createElement(TaskGroup, { key: day, title: relativeDay(day) }, tasks.map((t) => /* @__PURE__ */ React2.createElement(TaskRow, { key: t.id, task: t, showProgress: true, onToggle: toggle, settling: settling.has(t.id) })))));
  }
  function TaskGroup({ title, tone, children }) {
    return /* @__PURE__ */ React2.createElement("div", { className: "task-group" }, title && /* @__PURE__ */ React2.createElement("h3", { className: `task-group__title${tone ? ` is-${tone}` : ""}` }, title), /* @__PURE__ */ React2.createElement("ul", { className: "task-list" }, children));
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.tasks = TasksPage;
})();
