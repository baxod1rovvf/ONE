// ONE — Saved page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    Button, EmptyState, IconButton, Menu, Monogram, Pencil, Plus, React2, SampleBadge, Search,
    Trash2, X, createLucideIcon, hostOf, timeAgo, useDeleteSaved, useStore, useUI
  } = window.__oneApp;
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const ArrowUpRight = createLucideIcon("ArrowUpRight", [
    ["path", { d: "M7 7h10v10", key: "1tivn9" }],
    ["path", { d: "M7 17 17 7", key: "1vkiza" }]
  ]);
  function SavedPage() {
    const { data, touch } = useStore();
    const ui = useUI();
    const del = useDeleteSaved();
    const [query, setQuery] = React2.useState("");
    const [category, setCategory] = React2.useState("All");
    const categories = React2.useMemo(() => {
      const counts = /* @__PURE__ */ new Map();
      data.saved.forEach((s) => counts.set(s.category || "Uncategorized", (counts.get(s.category || "Uncategorized") ?? 0) + 1));
      return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [data.saved]);
    const activeCategory = category === "All" || categories.some(([c]) => c === category) ? category : "All";
    const q = query.trim().toLowerCase();
    const visible = data.saved.filter(
      (s) => (activeCategory === "All" || (s.category || "Uncategorized") === activeCategory) && (!q || s.title.toLowerCase().includes(q) || s.url.toLowerCase().includes(q))
    );
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "page-head" }, /* @__PURE__ */ React2.createElement("div", { className: "page-head__text" }, /* @__PURE__ */ React2.createElement("h1", { className: "page-title" }, "Saved"), /* @__PURE__ */ React2.createElement("p", { className: "page-desc" }, "Articles, videos and pages you want to come back to.")), /* @__PURE__ */ React2.createElement(Button, { variant: "primary", className: "keep-mobile", icon: /* @__PURE__ */ React2.createElement(Plus, { size: 16, strokeWidth: 2.4 }), onClick: () => ui.editSaved(null) }, "Save a link")), data.saved.length === 0 ? /* @__PURE__ */ React2.createElement("section", { className: "panel" }, /* @__PURE__ */ React2.createElement(
      EmptyState,
      {
        art: "seed",
        title: "Nothing saved yet",
        body: "Found something worth reading later? Save the link here so it doesn’t get lost in a pile of tabs.",
        action: /* @__PURE__ */ React2.createElement(Button, { variant: "primary", icon: /* @__PURE__ */ React2.createElement(Plus, { size: 16 }), onClick: () => ui.editSaved(null) }, "Save your first link")
      }
    )) : /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "toolbar toolbar--wrap" }, /* @__PURE__ */ React2.createElement("div", { className: "search-field" }, /* @__PURE__ */ React2.createElement(Search, { size: 15, "aria-hidden": true, className: "muted" }), /* @__PURE__ */ React2.createElement("label", { htmlFor: "saved-search", className: "sr-only" }, "Search saved links"), /* @__PURE__ */ React2.createElement("input", { id: "saved-search", placeholder: "Search saved", value: query, onChange: (e) => setQuery(e.target.value) }), query && /* @__PURE__ */ React2.createElement(IconButton, { label: "Clear search", size: "sm", onClick: () => setQuery("") }, /* @__PURE__ */ React2.createElement(X, { size: 14 }))), /* @__PURE__ */ React2.createElement("div", { className: "filter-chips", role: "group", "aria-label": "Filter by category" }, /* @__PURE__ */ React2.createElement("button", { type: "button", className: "chip", "aria-pressed": activeCategory === "All", onClick: () => setCategory("All") }, "All ", /* @__PURE__ */ React2.createElement("span", { className: "chip__count" }, data.saved.length)), categories.map(([c, n2]) => /* @__PURE__ */ React2.createElement("button", { key: c, type: "button", className: "chip", "aria-pressed": activeCategory === c, onClick: () => setCategory(c) }, c, " ", /* @__PURE__ */ React2.createElement("span", { className: "chip__count" }, n2))))), /* @__PURE__ */ React2.createElement("section", { className: "panel panel--flush", "aria-label": "Saved links" }, visible.length === 0 ? /* @__PURE__ */ React2.createElement("p", { className: "panel__empty panel__empty--pad" }, "No saved links match", q ? ` “${query.trim()}”` : "", activeCategory !== "All" ? ` in ${activeCategory}` : "", ".") : /* @__PURE__ */ React2.createElement("ul", { className: "rows" }, visible.map((s) => /* @__PURE__ */ React2.createElement("li", { key: s.id, className: "row" }, /* @__PURE__ */ React2.createElement(Monogram, { name: hostOf(s.url) }), /* @__PURE__ */ React2.createElement("a", { className: "row__main", href: s.url, target: "_blank", rel: "noopener noreferrer", onClick: () => touch("saved", s.id) }, /* @__PURE__ */ React2.createElement("span", { className: "row__title" }, s.title, /* @__PURE__ */ React2.createElement(ArrowUpRight, { size: 13, className: "row__ext", "aria-hidden": true })), /* @__PURE__ */ React2.createElement("span", { className: "row__meta" }, /* @__PURE__ */ React2.createElement("span", { className: "row__host" }, hostOf(s.url)), /* @__PURE__ */ React2.createElement("span", { "aria-hidden": true }, "·"), /* @__PURE__ */ React2.createElement("span", null, "Saved ", timeAgo(s.createdAt)))), /* @__PURE__ */ React2.createElement("span", { className: "row__tags" }, s.sample && /* @__PURE__ */ React2.createElement(SampleBadge, null), s.category && /* @__PURE__ */ React2.createElement("span", { className: "badge" }, s.category)), /* @__PURE__ */ React2.createElement(
      Menu,
      {
        label: `Actions for "${s.title}"`,
        items: [
          { label: "Edit", icon: /* @__PURE__ */ React2.createElement(Pencil, { size: 15 }), onSelect: () => ui.editSaved(s) },
          { label: "Remove", icon: /* @__PURE__ */ React2.createElement(Trash2, { size: 15 }), danger: true, separatorBefore: true, onSelect: () => void del(s) }
        ]
      }
    )))))));
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.saved = SavedPage;
})();
