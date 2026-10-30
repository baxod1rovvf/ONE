// ONE — Ideas page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    ArrowLeft, ArrowRight, Button, EmptyState, FolderPlus, IDEA_COLORS, IconButton, Lightbulb,
    Menu, Minus, Pencil, Plus, React2, SampleBadge, Trash2, createLucideIcon, isMac, timeAgo,
    useDeleteCategory, useDeleteIdea, useStore, useUI
  } = window.__oneApp;
  const Maximize = createLucideIcon("Maximize", [
    ["path", { d: "M8 3H5a2 2 0 0 0-2 2v3", key: "1dcmit" }],
    ["path", { d: "M21 8V5a2 2 0 0 0-2-2h-3", key: "1e4gt3" }],
    ["path", { d: "M3 16v3a2 2 0 0 0 2 2h3", key: "wsl5sc" }],
    ["path", { d: "M16 21h3a2 2 0 0 0 2-2v-3", key: "18trek" }]
  ]);
  /* ---------- Ideas: categories as hubs, ideas as connected bubbles ---------- */
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const HUB_R = 26;
  function ideaRadius(idea) {
    return 10 + Math.min(9, Math.sqrt((idea.body || "").length) * 0.8);
  }
  function layoutIdeas(cats, ideas, focusId) {
    const byCat = new Map(cats.map((c) => [c.id, []]));
    ideas.forEach((i) => {
      var _a;
      return (_a = byCat.get(i.categoryId)) == null ? void 0 : _a.push(i);
    });
    const nodes = [];
    const edges = [];
    const link = (hub, node) => edges.push({ id: `${hub.id}-${node.id}`, cat: hub.cat, from: hub, to: node });
    const focus = focusId && cats.find((c) => c.id === focusId);
    if (focus) {
      // Focused: hub on top, its ideas fanned out below it.
      const list = byCat.get(focus.id);
      const spacing = 60;
      const disc = spacing * Math.sqrt(list.length + 0.5);
      const cy = HUB_R + 50 + disc;
      const hub = { id: focus.id, kind: "hub", cat: focus, x: 0, y: 0, r: HUB_R + 4, count: list.length };
      nodes.push(hub);
      list.forEach((idea, i) => {
        const rr = spacing * Math.sqrt(i + 0.5);
        const a = i * GOLDEN_ANGLE;
        const node = { id: idea.id, kind: "idea", idea, cat: focus, x: rr * Math.cos(a), y: cy + rr * Math.sin(a), r: ideaRadius(idea), i };
        nodes.push(node);
        link(hub, node);
      });
      return { nodes, edges };
    }
    // Overview: one cluster per category, clusters placed on a ring.
    // Ideas sit evenly on rings around their hub, so neighbours never overlap.
    const RING_GAP = 50;
    const ringSlots = (list) => {
      const slots = [];
      let ring = 0;
      while (slots.length < list.length) {
        const r = HUB_R + 44 + ring * RING_GAP;
        const cap = Math.max(5, Math.floor(2 * Math.PI * r / 84));
        const take = Math.min(cap, list.length - slots.length);
        for (let k = 0; k < take; k++) slots.push({ r, a: k / take * Math.PI * 2 + ring * 0.6 });
        ring++;
      }
      return slots;
    };
    const clusters = cats.map((cat) => {
      const list = byCat.get(cat.id);
      const slots = ringSlots(list);
      const outer = slots.length ? slots[slots.length - 1].r : HUB_R;
      return { cat, list, slots, R: outer + 34 };
    });
    const maxR = Math.max(...clusters.map((c) => c.R), 60);
    const n2 = clusters.length;
    const ring = n2 === 1 ? 0 : maxR * 1.08 / Math.sin(Math.PI / n2);
    clusters.forEach((cl, ci) => {
      const a = -Math.PI / 2 + ci / n2 * Math.PI * 2;
      const cx = ring * Math.cos(a);
      const cy = ring * Math.sin(a);
      const hub = { id: cl.cat.id, kind: "hub", cat: cl.cat, x: cx, y: cy, r: HUB_R, count: cl.list.length };
      nodes.push(hub);
      cl.list.forEach((idea, i) => {
        const { r: rr, a: t0 } = cl.slots[i];
        const t = t0 + a + Math.PI / 2;
        const node = { id: idea.id, kind: "idea", idea, cat: cl.cat, x: cx + rr * Math.cos(t), y: cy + rr * Math.sin(t), r: ideaRadius(idea), i };
        nodes.push(node);
        link(hub, node);
      });
    });
    return { nodes, edges };
  }
  function graphBox(nodes) {
    if (!nodes.length) return { x: -200, y: -150, w: 400, h: 300 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach((n2) => {
      x0 = Math.min(x0, n2.x - n2.r);
      y0 = Math.min(y0, n2.y - n2.r);
      x1 = Math.max(x1, n2.x + n2.r);
      y1 = Math.max(y1, n2.y + n2.r + 18);
    });
    const pad2 = 56;
    let w = x1 - x0 + pad2 * 2, h = y1 - y0 + pad2 * 2;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    w = Math.max(w, 640);
    h = Math.max(h, 480);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  const shorten = (text, max) => text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
  const svgId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, "");
  function IdeaGraph({ cats, ideas, focusId, selectedId, onSelectIdea, onFocusCat, onClear }) {
    const svgRef = React2.useRef(null);
    const drag = React2.useRef(null);
    const suppressClick = React2.useRef(false);
    const [view, setView] = React2.useState({ x: 0, y: 0, k: 1 });
    const [hoverId, setHoverId] = React2.useState(null);
    const { nodes, edges } = React2.useMemo(() => layoutIdeas(cats, ideas, focusId), [cats, ideas, focusId]);
    const box = React2.useMemo(() => graphBox(nodes), [nodes]);
    React2.useEffect(() => setView({ x: 0, y: 0, k: 1 }), [focusId]);
    const selected = ideas.find((i) => i.id === selectedId) ?? null;
    const ideaCount = nodes.filter((n2) => n2.kind === "idea").length;
    const allLabels = ideaCount <= (focusId ? 30 : 14) || view.k >= 1.7;
    const zoom = (f) => setView((v) => ({ ...v, k: Math.max(0.4, Math.min(4, v.k * f)) }));
    // Pixel -> SVG unit ratio for panning (viewBox is fitted with "meet").
    const unitsPerPx = () => {
      const el = svgRef.current;
      if (!el) return 1;
      const r = el.getBoundingClientRect();
      return Math.max(box.w / Math.max(r.width, 1), box.h / Math.max(r.height, 1));
    };
    React2.useEffect(() => {
      const el = svgRef.current;
      if (!el) return;
      const onWheel = (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
      };
      el.addEventListener("wheel", onWheel, { passive: false });
      return () => el.removeEventListener("wheel", onWheel);
    }, []);
    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      const start = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, u: unitsPerPx(), moved: false };
      drag.current = start;
      const move = (ev) => {
        const dx = ev.clientX - start.sx, dy = ev.clientY - start.sy;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        setView((v) => ({ ...v, x: start.x + dx * start.u, y: start.y + dy * start.u }));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        suppressClick.current = start.moved;
        drag.current = null;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    const guard = (fn) => (e) => {
      e.stopPropagation();
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      fn();
    };
    const keyActivate = (fn) => (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fn();
      }
    };
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const transform = `translate(${cx + view.x} ${cy + view.y}) scale(${view.k}) translate(${-cx} ${-cy})`;
    const dimmed = (n2) => selected && n2.cat.id !== selected.categoryId;
    return React2.createElement(
      "div",
      { className: "igraph" },
      React2.createElement(
        "svg",
        {
          ref: svgRef,
          className: "igraph__svg",
          viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
          preserveAspectRatio: "xMidYMid meet",
          role: "group",
          "aria-label": focusId ? "Ideas in this category" : "All idea categories",
          onPointerDown,
          onClick: () => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            onClear();
          }
        },
        React2.createElement(
          "defs",
          null,
          React2.createElement("marker", { id: "ig-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 5, markerHeight: 5, orient: "auto-start-reverse" }, React2.createElement("path", { d: "M0 0L10 5L0 10z", className: "igraph__arrow" })),
          cats.map((c) => React2.createElement(
            "radialGradient",
            { key: c.id, id: `ig-g-${svgId(c.id)}`, cx: "42%", cy: "38%", r: "62%" },
            React2.createElement("stop", { offset: "0%", stopColor: "#ffffff", stopOpacity: 1 }),
            React2.createElement("stop", { offset: "55%", stopColor: "#ffffff", stopOpacity: 0.72 }),
            React2.createElement("stop", { offset: "100%", stopColor: c.color || IDEA_COLORS[0], stopOpacity: 0.85 })
          ))
        ),
        React2.createElement(
          "g",
          { transform, key: focusId || "all", className: "igraph__scene" },
          React2.createElement("g", { className: "igraph__edges" }, edges.map((e) => {
            const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
            const d = Math.hypot(dx, dy) || 1;
            const ux = dx / d, uy = dy / d;
            return React2.createElement("line", {
              key: e.id,
              className: `igraph__edge${dimmed(e.to) ? " is-dim" : ""}${selectedId === e.to.id ? " is-active" : ""}`,
              x1: e.from.x + ux * e.from.r,
              y1: e.from.y + uy * e.from.r,
              x2: e.to.x - ux * (e.to.r + 3),
              y2: e.to.y - uy * (e.to.r + 3),
              markerEnd: focusId ? "url(#ig-arrow)" : void 0
            });
          })),
          nodes.map((n2) => {
            const color = n2.cat.color || IDEA_COLORS[0];
            const hub = n2.kind === "hub";
            const isSel = !hub && n2.id === selectedId;
            const showLabel = hub || isSel || hoverId === n2.id || allLabels;
            const act = hub ? () => onFocusCat(n2.cat.id) : () => onSelectIdea(n2.idea.id);
            const label = hub ? `${n2.cat.name}, ${n2.count} ${n2.count === 1 ? "idea" : "ideas"}` : n2.idea.title;
            return React2.createElement(
              "g",
              { key: n2.id, transform: `translate(${n2.x} ${n2.y})`, className: `igraph__pos${dimmed(n2) ? " is-dim" : ""}` },
              React2.createElement(
                "g",
                {
                  className: `igraph__node${hub ? " igraph__node--hub" : ""}${isSel ? " is-selected" : ""}`,
                  style: { ["--c"]: color, animationDelay: `${hub ? 0 : Math.min(0.6, 0.05 + n2.i * 0.025)}s` },
                  tabIndex: 0,
                  role: "button",
                  "aria-label": hub ? `${label}. Open category` : `Idea: ${label}`,
                  "aria-pressed": hub ? void 0 : isSel,
                  onClick: guard(act),
                  onKeyDown: keyActivate(act),
                  onPointerEnter: () => setHoverId(n2.id),
                  onPointerLeave: () => setHoverId((h) => h === n2.id ? null : h)
                },
                React2.createElement("title", null, label),
                (isSel || hub && focusId) && React2.createElement("circle", { className: "igraph__halo", r: n2.r + 7 }),
                React2.createElement("circle", { className: "igraph__dot", r: n2.r, fill: `url(#ig-g-${svgId(n2.cat.id)})` }),
                hub && React2.createElement("text", { className: "igraph__hub-count num", y: 4.5, textAnchor: "middle" }, n2.count),
                showLabel && React2.createElement("text", { className: `igraph__label${hub ? " igraph__label--hub" : ""}`, y: hub && focusId ? -n2.r - 12 : n2.r + 14, textAnchor: "middle" }, shorten(hub ? n2.cat.name : n2.idea.title, hub ? 26 : 22))
              )
            );
          })
        )
      ),
      React2.createElement(
        "div",
        { className: "igraph__controls" },
        React2.createElement(IconButton, { label: "Zoom in", size: "sm", onClick: () => zoom(1.25) }, React2.createElement(Plus, { size: 15 })),
        React2.createElement(IconButton, { label: "Zoom out", size: "sm", onClick: () => zoom(0.8) }, React2.createElement(Minus, { size: 15 })),
        React2.createElement(IconButton, { label: "Fit to screen", size: "sm", onClick: () => setView({ x: 0, y: 0, k: 1 }) }, React2.createElement(Maximize, { size: 14 }))
      ),
      React2.createElement("p", { className: "igraph__hint", "aria-hidden": true }, "Drag to move · ", isMac ? "⌘" : "Ctrl", " + scroll to zoom")
    );
  }
  function IdeasPage() {
    const { data } = useStore();
    const ui = useUI();
    const [focusId, setFocusId] = React2.useState(null);
    const [selectedId, setSelectedId] = React2.useState(null);
    const cats = data.ideaCategories;
    React2.useEffect(() => {
      if (!ui.ideaToOpen) return;
      const idea = data.ideas.find((i) => i.id === ui.ideaToOpen);
      if (idea) {
        setFocusId(idea.categoryId);
        setSelectedId(idea.id);
      }
      ui.clearIdeaToOpen();
    }, [ui.ideaToOpen, ui]);
    const focus = cats.find((c) => c.id === focusId) ?? null;
    const selected = data.ideas.find((i) => i.id === selectedId) ?? null;
    const known = React2.useMemo(() => new Set(cats.map((c) => c.id)), [cats]);
    const ideas = React2.useMemo(() => data.ideas.filter((i) => known.has(i.categoryId)), [data.ideas, known]);
    const addIdea = () => {
      var _a;
      return ui.editIdea(null, (focus == null ? void 0 : focus.id) ?? ((_a = cats[0]) == null ? void 0 : _a.id));
    };
    return React2.createElement(
      React2.Fragment,
      null,
      React2.createElement(
        "div",
        { className: "page-head" },
        React2.createElement("div", { className: "page-head__text" }, React2.createElement("h1", { className: "page-title" }, "Ideas"), React2.createElement("p", { className: "page-desc" }, "Every category is a hub, every idea is a bubble around it. Click a hub to open it.")),
        React2.createElement(
          "div",
          { className: "page-head__actions" },
          React2.createElement(Button, { variant: "secondary", className: "keep-mobile", icon: React2.createElement(FolderPlus, { size: 15 }), onClick: () => ui.editCategory("ideas", null) }, "New category"),
          cats.length > 0 && React2.createElement(Button, { variant: "primary", className: "keep-mobile", icon: React2.createElement(Plus, { size: 16, strokeWidth: 2.4 }), onClick: addIdea }, "Add idea")
        )
      ),
      cats.length === 0 ? React2.createElement("section", { className: "panel" }, React2.createElement(EmptyState, {
        art: "bulb-flower",
        title: "No idea categories yet",
        body: "Start with a category, like Business or Content, then drop your ideas into it.",
        action: React2.createElement(Button, { variant: "primary", icon: React2.createElement(FolderPlus, { size: 16 }), onClick: () => ui.editCategory("ideas", null) }, "Create your first category")
      })) : React2.createElement(
        "div",
        { className: "ideas" },
        React2.createElement(IdeasSide, {
          cats,
          ideas,
          focus,
          selected,
          onFocus: (id) => {
            setFocusId(id);
            setSelectedId(null);
          },
          onSelect: setSelectedId,
          onAddIdea: addIdea
        }),
        React2.createElement(IdeaGraph, {
          cats,
          ideas,
          focusId: focus ? focus.id : null,
          selectedId,
          onSelectIdea: setSelectedId,
          onFocusCat: (id) => {
            setFocusId(id);
            setSelectedId(null);
          },
          onClear: () => setSelectedId(null)
        })
      )
    );
  }
  function CatDot({ color }) {
    return React2.createElement("span", { className: "cat-dot", style: { ["--c"]: color || IDEA_COLORS[0] }, "aria-hidden": true });
  }
  function IdeasSide({ cats, ideas, focus, selected, onFocus, onSelect, onAddIdea }) {
    const ui = useUI();
    const delCat = useDeleteCategory();
    const delIdea = useDeleteIdea();
    const back = (label, fn) => React2.createElement("button", { type: "button", className: "ideas-side__back", onClick: fn }, React2.createElement(ArrowLeft, { size: 15, "aria-hidden": true }), label);
    let body;
    if (selected) {
      const cat = cats.find((c) => c.id === selected.categoryId);
      body = React2.createElement(
        React2.Fragment,
        null,
        back(focus ? focus.name : "All ideas", () => onSelect(null)),
        React2.createElement(
          "div",
          { className: "ideas-side__card" },
          React2.createElement("div", { className: "ideas-side__title-row" }, React2.createElement(Lightbulb, { size: 17, className: "ideas-side__icon", "aria-hidden": true }), React2.createElement("h2", { className: "ideas-side__title" }, selected.title)),
          cat && React2.createElement("button", { type: "button", className: "ideas-side__cat", onClick: () => onFocus(cat.id) }, React2.createElement(CatDot, { color: cat.color }), cat.name),
          selected.body ? React2.createElement("p", { className: "ideas-side__body" }, selected.body) : React2.createElement("p", { className: "ideas-side__body muted" }, "No details yet."),
          React2.createElement("p", { className: "ideas-side__meta" }, selected.sample && React2.createElement(SampleBadge, null), " Added ", timeAgo(selected.createdAt)),
          React2.createElement(
            "div",
            { className: "ideas-side__actions" },
            React2.createElement(Button, { size: "sm", icon: React2.createElement(Pencil, { size: 14 }), onClick: () => ui.editIdea(selected) }, "Edit"),
            React2.createElement(Button, {
              size: "sm",
              variant: "danger-ghost",
              icon: React2.createElement(Trash2, { size: 14 }),
              onClick: async () => {
                if (await delIdea(selected)) onSelect(null);
              }
            }, "Delete")
          )
        )
      );
    } else if (focus) {
      const list = ideas.filter((i) => i.categoryId === focus.id);
      body = React2.createElement(
        React2.Fragment,
        null,
        back("All ideas", () => onFocus(null)),
        React2.createElement(
          "div",
          { className: "ideas-side__card" },
          React2.createElement(
            "div",
            { className: "ideas-side__title-row" },
            React2.createElement(CatDot, { color: focus.color }),
            React2.createElement("h2", { className: "ideas-side__title" }, focus.name),
            React2.createElement(Menu, {
              label: `Actions for ${focus.name}`,
              items: [
                { label: "Edit category", icon: React2.createElement(Pencil, { size: 15 }), onSelect: () => ui.editCategory("ideas", focus) },
                {
                  label: "Delete category",
                  icon: React2.createElement(Trash2, { size: 15 }),
                  danger: true,
                  separatorBefore: true,
                  onSelect: async () => {
                    if (await delCat("ideas", focus)) onFocus(null);
                  }
                }
              ]
            })
          ),
          React2.createElement("p", { className: "ideas-side__meta num" }, list.length, " ", list.length === 1 ? "idea" : "ideas"),
          React2.createElement(Button, { size: "sm", variant: "primary", icon: React2.createElement(Plus, { size: 14 }), onClick: onAddIdea }, "Add idea")
        ),
        list.length === 0 ? React2.createElement("p", { className: "ideas-side__empty" }, "No ideas here yet. Add the first one.") : React2.createElement("ul", { className: "ideas-side__list" }, list.map((i) => React2.createElement("li", { key: i.id }, React2.createElement("button", { type: "button", className: "ideas-side__item", onClick: () => onSelect(i.id) }, React2.createElement("span", { className: "ideas-side__item-title" }, i.title), i.body && React2.createElement("span", { className: "ideas-side__item-sub" }, i.body.split("\n")[0])))))
      );
    } else {
      body = React2.createElement(
        React2.Fragment,
        null,
        React2.createElement("div", { className: "ideas-side__head" }, React2.createElement("h2", { className: "ideas-side__heading" }, "All ideas"), React2.createElement("span", { className: "ideas-side__meta num" }, ideas.length, " in ", cats.length, " ", cats.length === 1 ? "category" : "categories")),
        React2.createElement("ul", { className: "ideas-side__list" }, cats.map((c) => {
          const count = ideas.filter((i) => i.categoryId === c.id).length;
          return React2.createElement("li", { key: c.id }, React2.createElement(
            "button",
            { type: "button", className: "ideas-side__item ideas-side__item--cat", onClick: () => onFocus(c.id) },
            React2.createElement(CatDot, { color: c.color }),
            React2.createElement("span", { className: "ideas-side__item-title" }, c.name),
            React2.createElement("span", { className: "ideas-side__count num" }, count),
            React2.createElement(ArrowRight, { size: 14, className: "muted", "aria-hidden": true })
          ));
        })),
        React2.createElement("button", { type: "button", className: "text-link ideas-side__new", onClick: () => ui.editCategory("ideas", null) }, React2.createElement(FolderPlus, { size: 14, "aria-hidden": true }), " New category")
      );
    }
    return React2.createElement("aside", { className: "ideas-side panel", "aria-label": "Idea details" }, body);
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.ideas = IdeasPage;
})();
