// ONE — Notes page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    ArrowLeft, BookOpen, Button, EmptyState, IconButton, Plus, React2, SampleBadge, Search,
    StickyNote, Trash2, X, newId, timeAgo, useConfirm, useMediaQuery, useStore, useToast, useUI
  } = window.__oneApp;
  const isBlank = (n2) => !n2.title.trim() && !n2.body.trim();
  function KnowledgePage() {
    const { data, add, remove, touch } = useStore();
    const ui = useUI();
    const isMobile = useMediaQuery("(max-width: 760px)");
    const [query, setQuery] = React2.useState("");
    const sorted = React2.useMemo(() => [...data.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.notes]);
    const [selectedId, setSelectedId] = React2.useState(() => {
      var _a;
      return ui.noteToOpen ?? (isMobile ? null : ((_a = sorted[0]) == null ? void 0 : _a.id) ?? null);
    });
    const prevSelected = React2.useRef(null);
    React2.useEffect(() => {
      if (ui.noteToOpen) {
        setSelectedId(ui.noteToOpen);
        setQuery("");
        ui.clearNoteToOpen();
      }
    }, [ui.noteToOpen, ui]);
    React2.useEffect(() => {
      const prev = prevSelected.current;
      if (prev && prev !== selectedId) {
        const n2 = data.notes.find((x) => x.id === prev);
        if (n2 && isBlank(n2)) remove("notes", prev);
      }
      if (selectedId) touch("note", selectedId);
      prevSelected.current = selectedId;
    }, [selectedId]);
    const notesRef = React2.useRef(data.notes);
    notesRef.current = data.notes;
    React2.useEffect(
      () => () => {
        const id = prevSelected.current;
        const n2 = id && notesRef.current.find((x) => x.id === id);
        if (n2 && isBlank(n2)) remove("notes", n2.id);
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );
    const q = query.trim().toLowerCase();
    const visible = q ? sorted.filter((n2) => n2.title.toLowerCase().includes(q) || n2.body.toLowerCase().includes(q)) : sorted;
    const selected = data.notes.find((n2) => n2.id === selectedId) ?? null;
    const createNote = () => {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const id = newId();
      add("notes", { id, title: "", body: "", createdAt: now, updatedAt: now }, true);
      setQuery("");
      setSelectedId(id);
    };
    const showList = !isMobile || !selected;
    const showEditor = !isMobile || !!selected;
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, showList && /* @__PURE__ */ React2.createElement("div", { className: "page-head" }, /* @__PURE__ */ React2.createElement("div", { className: "page-head__text" }, /* @__PURE__ */ React2.createElement("h1", { className: "page-title" }, "Knowledge"), /* @__PURE__ */ React2.createElement("p", { className: "page-desc" }, "Notes, ideas and things worth remembering. Everything saves as you type.")), /* @__PURE__ */ React2.createElement(Button, { variant: "primary", className: "keep-mobile", icon: /* @__PURE__ */ React2.createElement(Plus, { size: 16, strokeWidth: 2.4 }), onClick: createNote }, "New note")), data.notes.length === 0 ? /* @__PURE__ */ React2.createElement("section", { className: "panel" }, /* @__PURE__ */ React2.createElement(
      EmptyState,
      {
        icon: /* @__PURE__ */ React2.createElement(BookOpen, { size: 20 }),
        title: "Your knowledge base is empty",
        body: "Write down an idea, a meeting takeaway or something you learned today. You can search it later.",
        action: /* @__PURE__ */ React2.createElement(Button, { variant: "primary", icon: /* @__PURE__ */ React2.createElement(Plus, { size: 16 }), onClick: createNote }, "Write your first note")
      }
    )) : /* @__PURE__ */ React2.createElement("div", { className: "notes" }, showList && /* @__PURE__ */ React2.createElement("aside", { className: "notes__list panel panel--flush", "aria-label": "Notes" }, /* @__PURE__ */ React2.createElement("div", { className: "notes__search" }, /* @__PURE__ */ React2.createElement(Search, { size: 15, "aria-hidden": true, className: "muted" }), /* @__PURE__ */ React2.createElement("label", { htmlFor: "note-search", className: "sr-only" }, "Search notes"), /* @__PURE__ */ React2.createElement("input", { id: "note-search", className: "notes__search-input", placeholder: "Search notes", value: query, onChange: (e) => setQuery(e.target.value) }), query && /* @__PURE__ */ React2.createElement(IconButton, { label: "Clear search", size: "sm", onClick: () => setQuery("") }, /* @__PURE__ */ React2.createElement(X, { size: 14 }))), visible.length === 0 ? /* @__PURE__ */ React2.createElement("p", { className: "panel__empty notes__noresults" }, "No notes match “", query.trim(), "”.") : /* @__PURE__ */ React2.createElement("ul", { className: "notes__items" }, visible.map((n2) => /* @__PURE__ */ React2.createElement("li", { key: n2.id }, /* @__PURE__ */ React2.createElement("button", { type: "button", className: "note-item", "aria-current": n2.id === selectedId ? "true" : void 0, onClick: () => setSelectedId(n2.id) }, /* @__PURE__ */ React2.createElement("span", { className: "note-item__title" }, n2.title.trim() || /* @__PURE__ */ React2.createElement("span", { className: "muted" }, "Untitled note")), /* @__PURE__ */ React2.createElement("span", { className: "note-item__preview" }, n2.body.trim().split("\n")[0] || "No additional text"), /* @__PURE__ */ React2.createElement("span", { className: "note-item__time" }, timeAgo(n2.updatedAt), n2.sample && /* @__PURE__ */ React2.createElement(SampleBadge, null))))))), showEditor && /* @__PURE__ */ React2.createElement("section", { className: "notes__editor panel", "aria-label": "Note editor" }, selected ? /* @__PURE__ */ React2.createElement(
      NoteEditor,
      {
        key: selected.id,
        note: selected,
        onBack: isMobile ? () => setSelectedId(null) : void 0,
        onDeleted: () => {
          const next = sorted.find((n2) => n2.id !== selected.id);
          prevSelected.current = null;
          setSelectedId(isMobile ? null : (next == null ? void 0 : next.id) ?? null);
        }
      }
    ) : /* @__PURE__ */ React2.createElement(EmptyState, { icon: /* @__PURE__ */ React2.createElement(StickyNote, { size: 20 }), title: "Pick a note", body: "Choose a note on the left, or start a new one." }))));
  }
  function NoteEditor({ note, onBack, onDeleted }) {
    const { update, remove } = useStore();
    const confirm = useConfirm();
    const toast = useToast();
    const bodyRef = React2.useRef(null);
    const titleRef = React2.useRef(null);
    React2.useLayoutEffect(() => {
      const el = bodyRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.max(el.scrollHeight, 240) + "px";
    }, [note.body]);
    React2.useEffect(() => {
      var _a;
      if (!note.title && !note.body) (_a = titleRef.current) == null ? void 0 : _a.focus();
    }, []);
    const change = (patch) => update("notes", note.id, { ...patch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
    const words = (note.title + " " + note.body).trim().split(/\s+/).filter(Boolean).length;
    const del = async () => {
      if (!isBlank(note)) {
        const ok = await confirm({ title: "Delete this note?", body: `"${note.title || "Untitled note"}" will be removed.`, confirmLabel: "Delete note" });
        if (!ok) return;
      }
      const undo = remove("notes", note.id);
      onDeleted();
      toast({ message: "Note deleted", tone: "neutral", action: { label: "Undo", onClick: undo } });
    };
    return /* @__PURE__ */ React2.createElement("div", { className: "note-editor" }, /* @__PURE__ */ React2.createElement("div", { className: "note-editor__bar" }, onBack && /* @__PURE__ */ React2.createElement(Button, { size: "sm", variant: "ghost", icon: /* @__PURE__ */ React2.createElement(ArrowLeft, { size: 15 }), onClick: onBack }, "Notes"), /* @__PURE__ */ React2.createElement("span", { className: "note-editor__status num" }, note.sample && /* @__PURE__ */ React2.createElement(SampleBadge, null), " ", words, " ", words === 1 ? "word" : "words", " · Saved ", timeAgo(note.updatedAt)), /* @__PURE__ */ React2.createElement(IconButton, { label: "Delete note", size: "sm", onClick: del }, /* @__PURE__ */ React2.createElement(Trash2, { size: 15 }))), /* @__PURE__ */ React2.createElement("label", { htmlFor: "note-title", className: "sr-only" }, "Title"), /* @__PURE__ */ React2.createElement(
      "input",
      {
        id: "note-title",
        ref: titleRef,
        className: "note-editor__title",
        placeholder: "Untitled note",
        value: note.title,
        maxLength: 160,
        onChange: (e) => change({ title: e.target.value }),
        onKeyDown: (e) => {
          var _a;
          if (e.key === "Enter") {
            e.preventDefault();
            (_a = bodyRef.current) == null ? void 0 : _a.focus();
          }
        }
      }
    ), /* @__PURE__ */ React2.createElement("label", { htmlFor: "note-body", className: "sr-only" }, "Note"), /* @__PURE__ */ React2.createElement("textarea", { id: "note-body", ref: bodyRef, className: "note-editor__body", placeholder: "Start writing…", value: note.body, onChange: (e) => change({ body: e.target.value }) }));
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.knowledge = KnowledgePage;
})();
