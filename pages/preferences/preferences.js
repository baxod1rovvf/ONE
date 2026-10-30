// ONE — Settings page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    Button, Field, Kbd, Lock, Modal, Moon, React2, RefreshCw, Segmented, Sun, Trash2,
    createLucideIcon, createSampleData, isAppData, modKey, takeInstallPrompt, timeAgo, useConfirm,
    useLock, useMediaQuery, useStore, useSync, useToast, useUI, useTelegram, ensureTelegram, telegramDevice
  } = window.__oneApp;
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Copy = createLucideIcon("Copy", [
    ["rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2", key: "17jyea" }],
    ["path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2", key: "zix9uf" }]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Laptop = createLucideIcon("Laptop", [
    [
      "path",
      {
        d: "M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16",
        key: "tarvll"
      }
    ]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const RotateCcw = createLucideIcon("RotateCcw", [
    ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", key: "1357e3" }],
    ["path", { d: "M3 3v5h5", key: "1xhq8a" }]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Sparkles = createLucideIcon("Sparkles", [
    [
      "path",
      {
        d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z",
        key: "4pj2yx"
      }
    ],
    ["path", { d: "M20 3v4", key: "1olli1" }],
    ["path", { d: "M22 5h-4", key: "1gvqau" }],
    ["path", { d: "M4 17v2", key: "vumght" }],
    ["path", { d: "M5 18H3", key: "zchphs" }]
  ]);
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Upload = createLucideIcon("Upload", [
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
    ["polyline", { points: "17 8 12 3 7 8", key: "t8dd8p" }],
    ["line", { x1: "12", x2: "12", y1: "3", y2: "15", key: "widbto" }]
  ]);
  const Smartphone = createLucideIcon("Smartphone", [
    ["rect", { width: "14", height: "20", x: "5", y: "2", rx: "2", ry: "2", key: "1yt0o3" }],
    ["path", { d: "M12 18h.01", key: "mhygvu" }]
  ]);
  const KeyRound = createLucideIcon("KeyRound", [
    ["path", { d: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z", key: "1s6t7t" }],
    ["circle", { cx: "16.5", cy: "7.5", r: ".5", fill: "currentColor", key: "w0ekpg" }]
  ]);
  const Download = createLucideIcon("Download", [
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }],
    ["polyline", { points: "7 10 12 15 17 10", key: "2ggqvy" }],
    ["line", { x1: "12", x2: "12", y1: "15", y2: "3", key: "1vk2je" }]
  ]);
  function PreferencesPage() {
    const store = useStore();
    const { data, setSettings, hasSamples, removeSamples, replaceAll, resetToEmpty, persistence } = store;
    const confirm = useConfirm();
    const toast = useToast();
    const [backupText, setBackupText] = React2.useState(null);
    const [restoreOpen, setRestoreOpen] = React2.useState(false);
    const backupRef = React2.useRef(null);
    const sync = useSync();
    const counts = `${data.tasks.length} tasks, ${data.ideas.length} ideas, ${data.shortcuts.length} websites, ${data.saved.length} saved links, ${data.notes.length} notes and ${data.goals.length} goals`;
    const copyBackup = async () => {
      const json = JSON.stringify(data, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        setBackupText(null);
        toast({ message: "Backup copied. Paste it somewhere safe, like a note on another device.", tone: "success", duration: 5e3 });
      } catch {
        setBackupText(json);
        window.setTimeout(() => {
          var _a;
          return (_a = backupRef.current) == null ? void 0 : _a.select();
        }, 30);
      }
    };
    const addSamples = () => {
      const s = createSampleData();
      replaceAll({
        ...data,
        tasks: [...data.tasks, ...s.tasks],
        goals: [...data.goals, ...s.goals],
        notes: [...data.notes, ...s.notes],
        saved: [...data.saved, ...s.saved],
        shortcuts: [...data.shortcuts, ...s.shortcuts],
        websiteCategories: [...data.websiteCategories, ...s.websiteCategories],
        ideaCategories: [...data.ideaCategories, ...s.ideaCategories],
        ideas: [...data.ideas, ...s.ideas]
      });
      toast({ message: "Sample content added", tone: "success" });
    };
    return /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement("div", { className: "page-head" }, /* @__PURE__ */ React2.createElement("div", { className: "page-head__text" }, /* @__PURE__ */ React2.createElement("h1", { className: "page-title" }, "Settings"), /* @__PURE__ */ React2.createElement("p", { className: "page-desc" }, "Your profile, how ONE looks, and your data."))), /* @__PURE__ */ React2.createElement("div", { className: "settings" }, React2.createElement(InstallSettings, null), /* @__PURE__ */ React2.createElement("section", { className: "panel settings__section", "aria-labelledby": "set-profile" }, /* @__PURE__ */ React2.createElement("h2", { id: "set-profile", className: "settings__title" }, "Profile"), /* @__PURE__ */ React2.createElement("div", { className: "settings__row" }, /* @__PURE__ */ React2.createElement("div", { className: "settings__label" }, /* @__PURE__ */ React2.createElement("p", null, "Your name"), /* @__PURE__ */ React2.createElement("span", null, "Kept with your data and synced devices.")), /* @__PURE__ */ React2.createElement("div", { className: "settings__control" }, /* @__PURE__ */ React2.createElement(Field, { label: "Your name", hideLabel: true }, (p) => /* @__PURE__ */ React2.createElement("input", { ...p, className: "input", placeholder: "e.g. Alex", value: data.settings.name, maxLength: 40, onChange: (e) => setSettings({ name: e.target.value }) }))))), /* @__PURE__ */ React2.createElement(SyncSettings, null), React2.createElement(TelegramSettings, null), React2.createElement(LockSettings, null), /* @__PURE__ */ React2.createElement("section", { className: "panel settings__section", "aria-labelledby": "set-look" }, /* @__PURE__ */ React2.createElement("h2", { id: "set-look", className: "settings__title" }, "Appearance"), /* @__PURE__ */ React2.createElement("div", { className: "settings__row" }, /* @__PURE__ */ React2.createElement("div", { className: "settings__label" }, /* @__PURE__ */ React2.createElement("p", null, "Theme"), /* @__PURE__ */ React2.createElement("span", null, "System follows your device setting.")), /* @__PURE__ */ React2.createElement("div", { className: "settings__control" }, /* @__PURE__ */ React2.createElement(
      Segmented,
      {
        label: "Theme",
        value: data.settings.theme,
        onChange: (theme) => setSettings({ theme }),
        options: [
          { value: "system", label: "Follow device", icon: /* @__PURE__ */ React2.createElement(Laptop, { size: 14, "aria-hidden": true }) },
          { value: "light", label: "Morning", icon: /* @__PURE__ */ React2.createElement(Sun, { size: 14, "aria-hidden": true }) },
          { value: "dark", label: "Night", icon: /* @__PURE__ */ React2.createElement(Moon, { size: 14, "aria-hidden": true }) }
        ]
      }
    )))), /* @__PURE__ */ React2.createElement("section", { className: "panel settings__section", "aria-labelledby": "set-data" }, /* @__PURE__ */ React2.createElement("h2", { id: "set-data", className: "settings__title" }, "Your data"), /* @__PURE__ */ React2.createElement("p", { className: "settings__note" }, persistence === "browser" ? sync.connected ? "Everything is saved in this browser and synced, encrypted, to your connected devices." : "Everything you add is saved in this browser on this device. Connect a device above to sync it, or copy a backup now and then." : "This browser is blocking storage, so nothing will be kept after you close the page. Copy a backup before you leave."), /* @__PURE__ */ React2.createElement("p", { className: "settings__note muted num" }, "Right now: ", counts, "."), /* @__PURE__ */ React2.createElement("div", { className: "settings__row" }, /* @__PURE__ */ React2.createElement("div", { className: "settings__label" }, /* @__PURE__ */ React2.createElement("p", null, "Sample content"), /* @__PURE__ */ React2.createElement("span", null, hasSamples ? "Examples are mixed in with your own items. They’re marked “Sample”." : "No sample content is showing.")), /* @__PURE__ */ React2.createElement("div", { className: "settings__control" }, hasSamples ? /* @__PURE__ */ React2.createElement(
      Button,
      {
        icon: /* @__PURE__ */ React2.createElement(Trash2, { size: 15 }),
        onClick: async () => {
          const ok = await confirm({ title: "Remove sample content?", body: "Only items marked “Sample” are removed. Everything you created stays.", confirmLabel: "Remove samples" });
          if (ok) {
            removeSamples();
            toast({ message: "Sample content removed", tone: "success" });
          }
        }
      },
      "Remove samples"
    ) : /* @__PURE__ */ React2.createElement(Button, { icon: /* @__PURE__ */ React2.createElement(Sparkles, { size: 15 }), onClick: addSamples }, "Add sample content"))), /* @__PURE__ */ React2.createElement("div", { className: "settings__row" }, /* @__PURE__ */ React2.createElement("div", { className: "settings__label" }, /* @__PURE__ */ React2.createElement("p", null, "Backup"), /* @__PURE__ */ React2.createElement("span", null, "Copies all your data as text you can keep somewhere safe and restore later.")), /* @__PURE__ */ React2.createElement("div", { className: "settings__control settings__control--buttons" }, /* @__PURE__ */ React2.createElement(Button, { icon: /* @__PURE__ */ React2.createElement(Copy, { size: 15 }), onClick: copyBackup }, "Copy backup"), /* @__PURE__ */ React2.createElement(Button, { icon: /* @__PURE__ */ React2.createElement(Upload, { size: 15 }), onClick: () => setRestoreOpen(true) }, "Restore"))), backupText && /* @__PURE__ */ React2.createElement("div", { className: "settings__backup" }, /* @__PURE__ */ React2.createElement(Field, { label: "Your backup", hint: "Copying was blocked here, so the text is selected below. Copy it with your keyboard or the context menu." }, (p) => /* @__PURE__ */ React2.createElement("textarea", { ...p, ref: backupRef, className: "textarea mono-text", rows: 6, readOnly: true, value: backupText, onFocus: (e) => e.currentTarget.select() }))), /* @__PURE__ */ React2.createElement("div", { className: "settings__row settings__row--danger" }, /* @__PURE__ */ React2.createElement("div", { className: "settings__label" }, /* @__PURE__ */ React2.createElement("p", null, "Delete everything"), /* @__PURE__ */ React2.createElement("span", null, "Removes all tasks, ideas, websites, links, notes and goals from this browser.")), /* @__PURE__ */ React2.createElement("div", { className: "settings__control" }, /* @__PURE__ */ React2.createElement(
      Button,
      {
        variant: "danger-ghost",
        icon: /* @__PURE__ */ React2.createElement(RotateCcw, { size: 15 }),
        onClick: async () => {
          const ok = await confirm({
            title: "Delete everything?",
            body: `All of your tasks, ideas, websites, saved links, notes and goals will be removed from this browser${sync.connected ? " and from your connected devices" : ""}. This can’t be undone. Copy a backup first if you might want them back.`,
            confirmLabel: "Delete everything"
          });
          if (ok) {
            resetToEmpty();
            toast({ message: "Everything was deleted. You’re starting fresh.", tone: "neutral" });
          }
        }
      },
      "Delete everything"
    )))), /* @__PURE__ */ React2.createElement("section", { className: "panel settings__section", "aria-labelledby": "set-keys" }, /* @__PURE__ */ React2.createElement("h2", { id: "set-keys", className: "settings__title" }, "Keyboard shortcuts"), /* @__PURE__ */ React2.createElement("ul", { className: "keys" }, /* @__PURE__ */ React2.createElement("li", null, /* @__PURE__ */ React2.createElement("span", null, "Search"), /* @__PURE__ */ React2.createElement("span", null, /* @__PURE__ */ React2.createElement(Kbd, null, modKey), " ", /* @__PURE__ */ React2.createElement(Kbd, null, "K"), " or ", /* @__PURE__ */ React2.createElement(Kbd, null, "/"))), /* @__PURE__ */ React2.createElement("li", null, /* @__PURE__ */ React2.createElement("span", null, "Quick capture"), /* @__PURE__ */ React2.createElement(Kbd, null, "C")), /* @__PURE__ */ React2.createElement("li", null, /* @__PURE__ */ React2.createElement("span", null, "Save in quick capture"), /* @__PURE__ */ React2.createElement("span", null, /* @__PURE__ */ React2.createElement(Kbd, null, "Enter"), " (notes: ", /* @__PURE__ */ React2.createElement(Kbd, null, modKey), " ", /* @__PURE__ */ React2.createElement(Kbd, null, "Enter"), ")")), /* @__PURE__ */ React2.createElement("li", null, /* @__PURE__ */ React2.createElement("span", null, "Close a dialog"), /* @__PURE__ */ React2.createElement(Kbd, null, "Esc"))), /* @__PURE__ */ React2.createElement("p", { className: "settings__note muted" }, "Single-key shortcuts only work when you’re not typing in a field."))), /* @__PURE__ */ React2.createElement(
      RestoreDialog,
      {
        open: restoreOpen,
        onClose: () => setRestoreOpen(false),
        onRestore: async (d) => {
          const ok = await confirm({ title: "Replace your data with this backup?", body: "Everything currently in ONE on this browser will be replaced by the backup.", confirmLabel: "Replace data", tone: "default" });
          if (!ok) return;
          replaceAll(d);
          setRestoreOpen(false);
          toast({ message: "Backup restored", tone: "success" });
        }
      }
    ));
  }
  function RestoreDialog({ open, onClose, onRestore }) {
    const [text, setText] = React2.useState("");
    const [error, setError] = React2.useState(null);
    const submit = () => {
      try {
        const parsed = JSON.parse(text);
        if (!isAppData(parsed)) throw new Error("shape");
        setError(null);
        onRestore(parsed);
      } catch {
        setError("This isn’t a ONE backup. Paste the full text you copied with “Copy backup”, starting with { and ending with }.");
      }
    };
    return /* @__PURE__ */ React2.createElement(
      Modal,
      {
        open,
        onClose,
        title: "Restore from backup",
        footer: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Button, { variant: "secondary", onClick: onClose }, "Cancel"), /* @__PURE__ */ React2.createElement(Button, { variant: "primary", onClick: submit, disabled: !text.trim() }, "Restore"))
      },
      /* @__PURE__ */ React2.createElement(Field, { label: "Backup text", error, hint: "Paste the text you copied with “Copy backup”." }, (p) => /* @__PURE__ */ React2.createElement(
        "textarea",
        {
          ...p,
          "data-autofocus": true,
          className: "textarea mono-text",
          rows: 8,
          value: text,
          spellCheck: false,
          onChange: (e) => {
            setText(e.target.value);
            setError(null);
          }
        }
      ))
    );
  }
  const formatCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;
  function ConnectDeviceDialog({ open, onClose }) {
    const sync = useSync();
    const [state, setState] = React2.useState({ phase: "idle" });
    const [now, setNow] = React2.useState(Date.now());
    const make = React2.useCallback(async () => {
      setState({ phase: "loading" });
      try {
        const made = await sync.createCode();
        setNow(Date.now());
        setState({ phase: "ready", ...made });
      } catch (e) {
        setState({ phase: "error", error: e.message });
      }
    }, [sync.createCode]);
    React2.useEffect(() => {
      if (open) make();
      else setState({ phase: "idle" });
    }, [open]);
    React2.useEffect(() => {
      if (state.phase !== "ready") return;
      const id = window.setInterval(() => setNow(Date.now()), 1e3);
      return () => window.clearInterval(id);
    }, [state.phase]);
    const left = state.phase === "ready" ? Math.max(0, Math.round((state.expiresAt - now) / 1e3)) : 0;
    const expired = state.phase === "ready" && left === 0;
    return React2.createElement(
      Modal,
      {
        open,
        onClose,
        title: "Connect a device",
        description: "Enter this code in ONE on your other device: Settings → I have a code.",
        footer: React2.createElement(React2.Fragment, null, React2.createElement("span", { className: "spacer" }), (expired || state.phase === "error") && React2.createElement(Button, { onClick: make, icon: React2.createElement(RefreshCw, { size: 15 }) }, "New code"), React2.createElement(Button, { variant: "primary", onClick: onClose }, "Done"))
      },
      React2.createElement(
        "div",
        { className: "pair-code", "aria-live": "polite" },
        state.phase === "loading" && React2.createElement("p", { className: "pair-code__wait" }, "Making a code…"),
        state.phase === "error" && React2.createElement("p", { className: "pair-code__error", role: "alert" }, state.error),
        state.phase === "ready" && React2.createElement(
          React2.Fragment,
          null,
          React2.createElement("p", { className: `pair-code__digits num${expired ? " is-expired" : ""}`, "aria-label": `Code ${state.code.split("").join(" ")}` }, formatCode(state.code)),
          React2.createElement("p", { className: "pair-code__timer num" }, expired ? "This code expired. Make a new one." : `Works once · expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`)
        )
      )
    );
  }
  function JoinDialog({ open, onClose }) {
    const sync = useSync();
    const toast = useToast();
    const [code, setCode] = React2.useState("");
    const [error, setError] = React2.useState(null);
    const [busy, setBusy] = React2.useState(false);
    React2.useEffect(() => {
      if (open) {
        setCode("");
        setError(null);
        setBusy(false);
      }
    }, [open]);
    const submit = async (e) => {
      e.preventDefault();
      if (!/^\d{6}$/.test(code)) {
        setError("Enter all 6 digits.");
        return;
      }
      setBusy(true);
      try {
        const { merged } = await sync.joinWithCode(code);
        toast({ message: merged ? "Connected. Your data is merged and synced." : "Connected. Your data is now on this device.", tone: "success", duration: 5e3 });
        onClose();
      } catch (err) {
        setError(err.message || "Couldn’t connect. Try again.");
      } finally {
        setBusy(false);
      }
    };
    return React2.createElement(
      Modal,
      {
        open,
        onClose,
        title: "I have a code",
        description: sync.connected ? "This device will switch to the other device’s data. Anything here is merged in." : "On your other device open Settings → Connect a device, then enter the 6-digit code here.",
        footer: React2.createElement(React2.Fragment, null, React2.createElement("span", { className: "spacer" }), React2.createElement(Button, { variant: "secondary", onClick: onClose }, "Cancel"), React2.createElement(Button, { variant: "primary", type: "submit", form: "join-form", disabled: busy }, busy ? "Connecting…" : "Connect"))
      },
      React2.createElement(
        "form",
        { id: "join-form", className: "form", onSubmit: submit, noValidate: true },
        React2.createElement(Field, { label: "6-digit code", error, hideLabel: true }, (p) => React2.createElement("input", {
          ...p,
          "data-autofocus": true,
          className: "input code-input num",
          inputMode: "numeric",
          autoComplete: "one-time-code",
          placeholder: "000000",
          maxLength: 7,
          value: code,
          onChange: (e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }
        }))
      )
    );
  }
  function SyncSettings() {
    const sync = useSync();
    const confirm = useConfirm();
    const toast = useToast();
    const [dialog, setDialog] = React2.useState(null);
    const { status } = sync;
    let line;
    if (!sync.configured) line = "Sync needs a one-time setup: add your Supabase address and key to ONE (see SUPABASE_SETUP.md).";
    else if (!sync.connected) line = "Use ONE on your phone and computer with the same data. Everything is encrypted on your device before it’s uploaded.";
    else if (status.state === "error") line = status.error;
    else if (status.state === "syncing") line = "Syncing…";
    else line = status.at ? `Synced ${timeAgo(status.at)}. Changes sync automatically.` : "Sync is on.";
    return React2.createElement(
      "section",
      { className: "panel settings__section", "aria-labelledby": "set-sync" },
      React2.createElement("h2", { id: "set-sync", className: "settings__title" }, "Sync across devices"),
      React2.createElement(
        "p",
        { className: `settings__note sync-line${status.state === "error" ? " is-error" : ""}`, "aria-live": "polite" },
        sync.connected && React2.createElement("span", { className: `sync-dot sync-dot--${status.state}`, "aria-hidden": true }),
        line
      ),
      sync.configured && React2.createElement(
        "div",
        { className: "settings__control settings__control--buttons sync-actions" },
        React2.createElement(Button, { variant: "primary", icon: React2.createElement(Smartphone, { size: 15 }), onClick: () => setDialog("connect") }, sync.connected ? "Connect another device" : "Connect a device"),
        React2.createElement(Button, { icon: React2.createElement(KeyRound, { size: 15 }), onClick: () => setDialog("join") }, "I have a code"),
        sync.connected && React2.createElement(Button, { variant: "ghost", icon: React2.createElement(RefreshCw, { size: 15 }), onClick: sync.syncNow, disabled: status.state === "syncing" }, "Sync now"),
        sync.connected && React2.createElement(Button, {
          variant: "danger-ghost",
          onClick: async () => {
            const ok = await confirm({ title: "Disconnect this device?", body: "This device stops syncing. Your data stays here and on your other devices.", confirmLabel: "Disconnect", tone: "default" });
            if (ok) {
              sync.disconnect();
              toast({ message: "This device is no longer syncing", tone: "neutral" });
            }
          }
        }, "Disconnect")
      ),
      React2.createElement(ConnectDeviceDialog, { open: dialog === "connect", onClose: () => setDialog(null) }),
      React2.createElement(JoinDialog, { open: dialog === "join", onClose: () => setDialog(null) })
    );
  }
  const AUTO_LOCK_OPTIONS = [
    { value: 0, label: "Right away" },
    { value: 1, label: "After 1 minute" },
    { value: 5, label: "After 5 minutes" },
    { value: 15, label: "After 15 minutes" }
  ];
  function PinDialog({ mode, onClose }) {
    const lock = useLock();
    const toast = useToast();
    const steps = mode === "set" ? ["new", "confirm"] : mode === "change" ? ["current", "new", "confirm"] : ["current"];
    const [step, setStep] = React2.useState(0);
    const [first, setFirst] = React2.useState("");
    const [value, setValue] = React2.useState("");
    const [error, setError] = React2.useState(null);
    const [busy, setBusy] = React2.useState(false);
    React2.useEffect(() => {
      setStep(0);
      setFirst("");
      setValue("");
      setError(null);
    }, [mode]);
    const kind = mode ? steps[step] : null;
    const last = step === steps.length - 1;
    const submit = async (e) => {
      e.preventDefault();
      if (busy) return;
      if (kind === "current") {
        setBusy(true);
        const ok = await lock.verify(value);
        setBusy(false);
        if (!ok) {
          setError("That’s not your current PIN.");
          setValue("");
          return;
        }
        if (mode === "off") {
          lock.disable();
          toast({ message: "App lock is off", tone: "neutral" });
          onClose();
          return;
        }
      } else if (kind === "new") {
        if (!/^\d{4,6}$/.test(value)) {
          setError("Use 4 to 6 digits.");
          return;
        }
        setFirst(value);
      } else if (kind === "confirm") {
        if (value !== first) {
          setError("The PINs didn’t match. Enter a new PIN again.");
          setValue("");
          setStep(steps.indexOf("new"));
          return;
        }
        setBusy(true);
        await lock.setPin(value);
        setBusy(false);
        toast({ message: mode === "set" ? "App lock is on" : "PIN changed", tone: "success" });
        onClose();
        return;
      }
      setValue("");
      setError(null);
      setStep((s) => s + 1);
    };
    const label = kind === "current" ? "Current PIN" : kind === "new" ? "New PIN" : "Enter the new PIN again";
    return React2.createElement(
      Modal,
      {
        open: !!mode,
        onClose,
        title: mode === "set" ? "Set a PIN" : mode === "change" ? "Change PIN" : "Turn off app lock",
        description: kind === "new" ? "4 to 6 digits. ONE asks for it when it opens." : void 0,
        footer: React2.createElement(React2.Fragment, null, React2.createElement("span", { className: "spacer" }), React2.createElement(Button, { variant: "secondary", onClick: onClose }, "Cancel"), React2.createElement(Button, { variant: mode === "off" ? "danger" : "primary", type: "submit", form: "pin-form", disabled: busy }, mode === "off" ? "Turn off" : last ? "Save PIN" : "Continue"))
      },
      kind && React2.createElement(
        "form",
        { id: "pin-form", className: "form", onSubmit: submit, noValidate: true },
        React2.createElement(Field, { label, error }, (p) => React2.createElement("input", {
          ...p,
          key: kind,
          "data-autofocus": true,
          autoFocus: true,
          type: "password",
          className: "input code-input num",
          inputMode: "numeric",
          autoComplete: kind === "current" ? "current-password" : "new-password",
          maxLength: 6,
          value,
          onChange: (e) => {
            setValue(e.target.value.replace(/\D/g, "").slice(0, 6));
            setError(null);
          }
        }))
      )
    );
  }
  // Telegram: who is connected on this device, and how long chats may wait
  // before they move up (synced with the other settings).
  function TelegramSettings() {
    const tg = useTelegram();
    const ui = useUI();
    const { data, setSettings } = useStore();
    const prefs = data.settings.telegram || {};
    const limits = { normal: 180, low: 720, ...prefs.limits };
    const device = telegramDevice();
    const me = device && device.session && tg && tg.status !== "loggedOut" ? tg.me || device.me : device && device.session ? device.me : null;
    const setLimit = (key, hours) => {
      const n = Math.round(Number(hours));
      if (!(n >= 1 && n <= 72)) return;
      setSettings({ telegram: { chats: prefs.chats || {}, limits: { ...limits, [key]: n * 60 } } });
    };
    const [drafts, setDrafts] = React2.useState({});
    const hoursField = (key, label) =>
      React2.createElement(Field, { label, hideLabel: true }, (p) =>
        React2.createElement("input", {
          ...p,
          className: "input input--hours num",
          type: "number",
          min: 1,
          max: 72,
          value: drafts[key] ?? String(limits[key] / 60),
          onChange: (e) => {
            setDrafts({ ...drafts, [key]: e.target.value });
            setLimit(key, e.target.value);
          },
          onBlur: () => setDrafts({ ...drafts, [key]: void 0 })
        })
      );
    const row = (title, note, control) => React2.createElement("div", { className: "settings__row" }, React2.createElement("div", { className: "settings__label" }, React2.createElement("p", null, title), note && React2.createElement("span", null, note)), React2.createElement("div", { className: "settings__control" }, control));
    return React2.createElement(
      "section",
      { className: "panel settings__section", "aria-labelledby": "set-telegram" },
      React2.createElement("h2", { id: "set-telegram", className: "settings__title" }, "Telegram"),
      me
        ? row(`Connected as ${me.name}${me.username ? ` (@${me.username})` : ""}`, "Your Telegram login stays on this device only.", React2.createElement(Button, { onClick: () => ensureTelegram().then((s) => s.logout()) }, "Log out"))
        : row("Not connected", "Connect your Telegram account to see who's waiting.", React2.createElement(Button, { onClick: () => ui.navigate("telegram") }, "Connect")),
      row("Normal moves up after (hours)", "A Normal chat waiting this long counts as High.", hoursField("normal", "Normal moves up after (hours)")),
      row("Low moves up after (hours)", "A Low chat waiting this long counts as Normal.", hoursField("low", "Low moves up after (hours)"))
    );
  }
  function LockSettings() {
    const lock = useLock();
    const [mode, setMode] = React2.useState(null);
    return React2.createElement(
      "section",
      { className: "panel settings__section", "aria-labelledby": "set-lock" },
      React2.createElement("h2", { id: "set-lock", className: "settings__title" }, "App lock"),
      React2.createElement(
        "div",
        { className: "settings__row" },
        React2.createElement("div", { className: "settings__label" }, React2.createElement("p", null, "PIN lock"), React2.createElement("span", null, lock.enabled ? "ONE asks for your PIN on this device." : "Ask for a PIN when ONE opens on this device.")),
        React2.createElement(
          "div",
          { className: "settings__control settings__control--buttons" },
          lock.enabled ? React2.createElement(React2.Fragment, null, React2.createElement(Button, { icon: React2.createElement(Lock, { size: 15 }), onClick: lock.lock }, "Lock now"), React2.createElement(Button, { onClick: () => setMode("change") }, "Change PIN"), React2.createElement(Button, { variant: "danger-ghost", onClick: () => setMode("off") }, "Turn off")) : React2.createElement(Button, { variant: "primary", icon: React2.createElement(Lock, { size: 15 }), onClick: () => setMode("set") }, "Set a PIN")
        )
      ),
      lock.enabled && React2.createElement(
        "div",
        { className: "settings__row" },
        React2.createElement("div", { className: "settings__label" }, React2.createElement("p", null, "Lock again"), React2.createElement("span", null, "When ONE has been in the background this long.")),
        React2.createElement("div", { className: "settings__control" }, React2.createElement(Field, { label: "Lock again", hideLabel: true }, (p) => React2.createElement("select", { ...p, className: "select", value: lock.rec.autoLock, onChange: (e) => lock.setAutoLock(Number(e.target.value)) }, AUTO_LOCK_OPTIONS.map((o) => React2.createElement("option", { key: o.value, value: o.value }, o.label)))))
      ),
      React2.createElement(PinDialog, { mode, onClose: () => setMode(null) })
    );
  }
  function InstallSettings() {
    const toast = useToast();
    const standalone = useMediaQuery("(display-mode: standalone)") || navigator.standalone === true;
    const [canPrompt, setCanPrompt] = React2.useState(() => !!takeInstallPrompt());
    React2.useEffect(() => {
      const on = () => setCanPrompt(!!takeInstallPrompt());
      window.addEventListener("one-install-ready", on);
      window.addEventListener("appinstalled", on);
      return () => {
        window.removeEventListener("one-install-ready", on);
        window.removeEventListener("appinstalled", on);
      };
    }, []);
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const install = async () => {
      const e = takeInstallPrompt();
      if (!e) {
        toast({ message: howTo, tone: "neutral" });
        return;
      }
      takeInstallPrompt(true);
      setCanPrompt(false);
      e.prompt();
      await e.userChoice;
    };
    const howTo = isIOS ? "In Safari, tap the Share button, then “Add to Home Screen”." : "Open your browser’s menu and choose “Install app” or “Add to Home screen”.";
    let text;
    if (standalone) text = "ONE is installed. You’re using it as an app right now.";
    else if (canPrompt) text = "Add ONE to your home screen or dock. It opens in its own window and works offline.";
    else text = howTo;
    return React2.createElement(
      "section",
      { className: "panel settings__section", "aria-labelledby": "set-install" },
      React2.createElement("h2", { id: "set-install", className: "settings__title" }, "Install app"),
      React2.createElement(
        "div",
        { className: "settings__row" },
        React2.createElement("div", { className: "settings__label" }, React2.createElement("p", null, standalone ? "Installed" : "Use ONE like an app"), React2.createElement("span", null, text)),
        !standalone && React2.createElement("div", { className: "settings__control" }, React2.createElement(Button, { variant: "primary", icon: React2.createElement(Download, { size: 15 }), onClick: install }, "Install"))
      )
    );
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.preferences = PreferencesPage;
})();
