// ONE — Websites page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    Button, EmptyState, FolderPlus, Menu, Monogram, Pencil, Plus, React2, SampleBadge, Trash2,
    hostOf, useDeleteCategory, useDeleteShortcut, useStore, useUI
  } = window.__oneApp;
  function WebsitesPage() {
    const { data } = useStore();
    const ui = useUI();
    const cats = data.websiteCategories;
    const known = new Set(cats.map((c) => c.id));
    const loose = data.shortcuts.filter((s) => !s.categoryId || !known.has(s.categoryId));
    const empty = cats.length === 0 && data.shortcuts.length === 0;
    return React2.createElement(
      React2.Fragment,
      null,
      React2.createElement(
        "div",
        { className: "page-head" },
        React2.createElement("div", { className: "page-head__text" }, React2.createElement("h1", { className: "page-title" }, "Websites"), React2.createElement("p", { className: "page-desc" }, "Your favourite websites, sorted into your own categories. One click to open.")),
        React2.createElement(
          "div",
          { className: "page-head__actions" },
          React2.createElement(Button, { variant: "secondary", className: "keep-mobile", icon: React2.createElement(FolderPlus, { size: 15 }), onClick: () => ui.editCategory("websites", null) }, "New category"),
          React2.createElement(Button, { variant: "primary", className: "keep-mobile", icon: React2.createElement(Plus, { size: 16, strokeWidth: 2.4 }), onClick: () => ui.editShortcut(null, null) }, "Add website")
        )
      ),
      empty ? React2.createElement("section", { className: "panel" }, React2.createElement(EmptyState, {
        art: "cloud",
        title: "No websites yet",
        body: "Make a category, like Study or Work, then add the websites you open most.",
        action: React2.createElement(Button, { variant: "primary", icon: React2.createElement(FolderPlus, { size: 16 }), onClick: () => ui.editCategory("websites", null) }, "Create your first category")
      })) : React2.createElement(
        "div",
        { className: "site-cats" },
        cats.map((c) => React2.createElement(WebsiteCategory, { key: c.id, cat: c, items: data.shortcuts.filter((s) => s.categoryId === c.id) })),
        loose.length > 0 && React2.createElement(WebsiteCategory, { cat: null, items: loose })
      )
    );
  }
  function WebsiteCategory({ cat, items }) {
    const ui = useUI();
    const del = useDeleteCategory();
    const title = cat ? cat.name : "No category";
    return React2.createElement(
      "section",
      { className: "site-cat", "aria-label": title },
      React2.createElement(
        "div",
        { className: "site-cat__head" },
        React2.createElement("h2", { className: "site-cat__title" }, title, React2.createElement("span", { className: "site-cat__count num" }, items.length)),
        cat && cat.sample && React2.createElement(SampleBadge, null),
        cat && React2.createElement(Menu, {
          label: `Actions for ${title}`,
          items: [
            { label: "Add website here", icon: React2.createElement(Plus, { size: 15 }), onSelect: () => ui.editShortcut(null, cat.id) },
            { label: "Rename", icon: React2.createElement(Pencil, { size: 15 }), onSelect: () => ui.editCategory("websites", cat) },
            { label: "Delete category", icon: React2.createElement(Trash2, { size: 15 }), danger: true, separatorBefore: true, onSelect: () => void del("websites", cat) }
          ]
        })
      ),
      React2.createElement(
        "ul",
        { className: "launch-grid", "aria-label": `${title} websites` },
        items.map((s) => React2.createElement("li", { key: s.id, className: "launch-tile" }, React2.createElement(Tile, { s }))),
        React2.createElement("li", { className: "launch-tile" }, React2.createElement(
          "button",
          { type: "button", className: "launch-tile__inner launch-tile__inner--add", onClick: () => ui.editShortcut(null, cat ? cat.id : null) },
          React2.createElement("span", { className: "mono mono--lg mono--add", "aria-hidden": true }, React2.createElement(Plus, { size: 20 })),
          React2.createElement("span", { className: "launch-tile__name" }, "Add website")
        ))
      )
    );
  }
  function Tile({ s }) {
    const { touch } = useStore();
    const ui = useUI();
    const del = useDeleteShortcut();
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("a", { className: "launch-tile__inner", href: s.url, target: "_blank", rel: "noopener noreferrer", onClick: () => touch("shortcut", s.id) }, /* @__PURE__ */ React2.createElement(Monogram, { name: s.name, size: "lg" }), /* @__PURE__ */ React2.createElement("span", { className: "launch-tile__name" }, s.name), /* @__PURE__ */ React2.createElement("span", { className: "launch-tile__host" }, hostOf(s.url)), s.sample && /* @__PURE__ */ React2.createElement("span", { className: "launch-tile__tags" }, /* @__PURE__ */ React2.createElement(SampleBadge, null))), /* @__PURE__ */ React2.createElement("span", { className: "launch-tile__menu" }, /* @__PURE__ */ React2.createElement(
      Menu,
      {
        label: `Actions for ${s.name}`,
        items: [
          { label: "Edit", icon: /* @__PURE__ */ React2.createElement(Pencil, { size: 15 }), onSelect: () => ui.editShortcut(s) },
          { label: "Remove", icon: /* @__PURE__ */ React2.createElement(Trash2, { size: 15 }), danger: true, separatorBefore: true, onSelect: () => void del(s) }
        ]
      }
    )));
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.websites = WebsitesPage;
})();
