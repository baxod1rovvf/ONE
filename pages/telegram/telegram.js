// ONE — Telegram page. It loads into the same page as index.html (see
// loadPage there). The live connection and the chats come from
// pages/telegram/service.js, through useTelegram; this file only draws them.
(function () {
  "use strict";
  const { React2, Button, Field, Segmented, MessageCircle, RefreshCw, ArrowLeft, Search, ensureTelegram, loadScript, useTelegram, useToast, useUI } = window.__oneApp;
  const h = React2.createElement;

  // Telegram's errors, in ONE's words.
  function waitText(seconds) {
    if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
    const m = Math.ceil(seconds / 60);
    return `${m} minute${m === 1 ? "" : "s"}`;
  }
  function errorText(err) {
    switch (err && err.code) {
      case "CODE_INVALID":
      case "CODE_EXPIRED":
        return "That code didn't work. Send a new one?";
      case "PASSWORD_INVALID":
        return "That password didn't work. Try again.";
      case "FLOOD_WAIT":
        return `Telegram asks you to wait ${waitText(err.seconds)} before trying again.`;
      case "NETWORK":
        return "Couldn't reach Telegram. Check your connection and try again.";
      default:
        return "Something went wrong with Telegram. Try again.";
    }
  }
  const asError = (e) => window.__oneTelegramClient.normalizeError(e);
  const whoText = (me) => `Connected as ${me.name}${me.username ? ` (@${me.username})` : ""}`;

  // ---------- QR code ----------
  function QrCode({ text }) {
    const [ready, setReady] = React2.useState(!!window.__oneQR);
    React2.useEffect(() => {
      if (!ready) loadScript("pages/telegram/qr.js").then(() => setReady(true));
    }, [ready]);
    if (!ready || !text) return h("div", { className: "tg-qr tg-qr--empty", "aria-hidden": true });
    const m = window.__oneQR.encodeQR(text);
    const n = m.length;
    let d = "";
    m.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + 4} ${y + 4}h1v1h-1z`)));
    return h("svg", { className: "tg-qr", viewBox: `0 0 ${n + 8} ${n + 8}`, role: "img", "aria-label": "QR code to scan with Telegram", shapeRendering: "crispEdges" }, h("rect", { width: n + 8, height: n + 8, fill: "#fff" }), h("path", { d, fill: "#000" }));
  }

  // ---------- Connecting ----------
  function ConnectFlow({ onDone }) {
    const toast = useToast();
    const svc = window.__oneTelegram;
    const saved = svc.savedKey() || {};
    const [step, setStep] = React2.useState("key");
    const [apiId, setApiId] = React2.useState(saved.apiId ? String(saved.apiId) : "");
    const [apiHash, setApiHash] = React2.useState(saved.apiHash || "");
    const [method, setMethod] = React2.useState("qr");
    const [client, setClient] = React2.useState(null);
    const [qr, setQr] = React2.useState(null);
    const [stage, setStage] = React2.useState("phone"); // phone, code, password
    const [phone, setPhone] = React2.useState("");
    const [hash, setHash] = React2.useState(null);
    const [code, setCode] = React2.useState("");
    const [password, setPassword] = React2.useState("");
    const [error, setError] = React2.useState(null);
    const [busy, setBusy] = React2.useState(false);
    const passwordWanted = React2.useRef(null);
    const asked = React2.useRef(0);
    const keyOk = /^\d{1,12}$/.test(apiId.trim()) && /^[0-9a-f]{32}$/i.test(apiHash.trim());

    const done = async (c, me) => {
      await svc.finishLogin(c, me);
      toast({ tone: "success", message: whoText(me) });
      onDone();
    };
    const attempt = async (fn) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(errorText(asError(e)));
      } finally {
        setBusy(false);
      }
    };
    const begin = () =>
      attempt(async () => {
        const c = await svc.beginLogin(apiId.trim(), apiHash.trim().toLowerCase());
        setClient(c);
        setStep("login");
      });

    // QR: shown as soon as the login step opens; a new code replaces it when
    // the old one expires. A cloud password, if any, is asked for here.
    React2.useEffect(() => {
      if (step !== "login" || method !== "qr" || !client) return;
      let live = true;
      setQr(null);
      client
        .startQrLogin(
          (url) => live && setQr(url),
          () =>
            new Promise((resolve) => {
              if (!live) return;
              asked.current++;
              if (asked.current > 1) setError(errorText({ code: "PASSWORD_INVALID" }));
              passwordWanted.current = resolve;
              setStage("password");
            })
        )
        .then((me) => live && done(client, me))
        .catch((e) => live && setError(errorText(asError(e))));
      return () => {
        live = false;
      };
    }, [step, method, client]);

    const sendCode = () =>
      attempt(async () => {
        const r = await client.sendCode(phone.trim());
        setHash(r.phoneCodeHash);
        setCode("");
        setStage("code");
      });
    const signIn = () =>
      attempt(async () => {
        const r = await client.signIn({ phone: phone.trim(), phoneCodeHash: hash, code: code.trim() });
        if (r && r.needsPassword) setStage("password");
        else await done(client, r);
      });
    const checkPassword = () => {
      if (method === "qr" && passwordWanted.current) {
        setError(null);
        const resolve = passwordWanted.current;
        passwordWanted.current = null;
        resolve(password);
        return;
      }
      attempt(async () => done(client, await client.checkPassword(password)));
    };
    const submit = (fn) => (e) => {
      e.preventDefault();
      if (!busy) fn();
    };
    const errorLine = error && h("p", { className: "tg-connect__error", role: "alert" }, error);

    if (step === "key") {
      return h(
        "form",
        { className: "panel tg-connect", onSubmit: submit(() => keyOk && begin()) },
        h("h2", { className: "tg-connect__title" }, "Connect Telegram"),
        h("p", { className: "muted" }, "Telegram asks every app that isn't its own to use its own key. It takes about two minutes, once per device:"),
        h(
          "ol",
          { className: "tg-connect__steps" },
          h("li", null, "Open ", h("a", { href: "https://my.telegram.org", target: "_blank", rel: "noreferrer" }, "my.telegram.org"), " and log in with your phone number."),
          h("li", null, "Choose ", h("b", null, "API development tools"), " and create an app (any name, for example “ONE”)."),
          h("li", null, "Copy ", h("b", null, "App api_id"), " and ", h("b", null, "App api_hash"), " here.")
        ),
        h(Field, { label: "api_id" }, (p) => h("input", { ...p, className: "input", inputMode: "numeric", autoComplete: "off", value: apiId, onChange: (e) => setApiId(e.target.value) })),
        h(Field, { label: "api_hash" }, (p) => h("input", { ...p, className: "input", autoComplete: "off", spellCheck: false, value: apiHash, onChange: (e) => setApiHash(e.target.value) })),
        h("p", { className: "settings__note muted" }, "The key and your login stay on this device. They are never synced."),
        errorLine,
        h(Button, { type: "submit", variant: "primary", disabled: !keyOk || busy }, "Continue")
      );
    }
    const passwordForm = h(
      "form",
      { className: "tg-connect__form", onSubmit: submit(checkPassword) },
      h("p", null, "Your account has a cloud password. Enter it to finish."),
      h(Field, { label: "Cloud password" }, (p) => h("input", { ...p, className: "input", type: "password", autoComplete: "current-password", value: password, onChange: (e) => setPassword(e.target.value) })),
      h(Button, { type: "submit", variant: "primary", disabled: !password || busy }, "Log in")
    );
    return h(
      "div",
      { className: "panel tg-connect" },
      h("h2", { className: "tg-connect__title" }, "Connect Telegram"),
      h(Segmented, {
        label: "How to log in",
        value: method,
        onChange: (m) => {
          setMethod(m);
          setError(null);
          setStage("phone");
        },
        options: [
          { value: "qr", label: "QR code" },
          { value: "phone", label: "Phone number" }
        ]
      }),
      method === "qr" &&
        (stage === "password"
          ? passwordForm
          : h("div", { className: "tg-connect__qr" }, h(QrCode, { text: qr }), h("p", null, "On your phone, open Telegram → Settings → Devices → ", h("b", null, "Link Desktop Device"), ", and scan this."))),
      method === "phone" &&
        stage === "phone" &&
        h(
          "form",
          { className: "tg-connect__form", onSubmit: submit(sendCode) },
          h(Field, { label: "Phone number", hint: "With the country code, for example +998 90 123 45 67." }, (p) => h("input", { ...p, className: "input", type: "tel", autoComplete: "tel", value: phone, onChange: (e) => setPhone(e.target.value) })),
          h(Button, { type: "submit", variant: "primary", disabled: phone.replace(/\D/g, "").length < 7 || busy }, "Send code")
        ),
      method === "phone" &&
        stage === "code" &&
        h(
          "form",
          { className: "tg-connect__form", onSubmit: submit(signIn) },
          h(Field, { label: "Code", hint: "Telegram sent it to your Telegram app." }, (p) => h("input", { ...p, className: "input", inputMode: "numeric", autoComplete: "one-time-code", value: code, onChange: (e) => setCode(e.target.value) })),
          h("div", { className: "tg-connect__buttons" }, h(Button, { type: "submit", variant: "primary", disabled: !code.trim() || busy }, "Log in"), h(Button, { variant: "ghost", onClick: () => (setStage("phone"), setError(null)) }, "Send a new code"))
        ),
      method === "phone" && stage === "password" && passwordForm,
      errorLine
    );
  }

  function LoggedOut({ onConnect }) {
    return h(
      "div",
      { className: "panel tg-connect" },
      h("h2", { className: "tg-connect__title" }, "You were logged out of Telegram."),
      h("p", { className: "muted" }, "Your chats and their levels are kept. Connect again to see them here."),
      h(Button, { variant: "primary", icon: h(RefreshCw, { size: 15, "aria-hidden": true }), onClick: onConnect }, "Connect")
    );
  }

  // ---------- Choosing chats ----------
  const rules = () => window.__oneTelegramRules;
  const LEVEL_OPTIONS = [
    { value: "high", label: "High" },
    { value: "normal", label: "Normal" },
    { value: "low", label: "Low" },
    { value: "none", label: "Not in ONE" }
  ];
  const newest = (a, b) => ((b.lastMessage && b.lastMessage.date) || 0) - ((a.lastMessage && a.lastMessage.date) || 0);
  function ManageChats({ tg, svc, onDone }) {
    const [query, setQuery] = React2.useState("");
    const q = query.trim().toLowerCase();
    const list = [...tg.chats].sort(newest).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.username || "").toLowerCase().includes(q));
    return h(
      "section",
      { className: "panel tg-manage", "aria-labelledby": "tg-manage-title" },
      h("div", { className: "tg-manage__head" }, h("h2", { id: "tg-manage-title", className: "tg-connect__title" }, "Choose your chats"), h(Button, { variant: "primary", onClick: onDone }, "Done")),
      h("p", { className: "muted" }, "Give the people who matter a level. ONE shows only those chats, and tells you whom to answer first."),
      h("div", { className: "search-field tg-manage__search" }, h(Search, { size: 15, "aria-hidden": true, className: "muted" }), h("input", { className: "notes__search-input", "aria-label": "Search chats", placeholder: "Search chats", value: query, onChange: (e) => setQuery(e.target.value) })),
      list.length === 0 ? h("p", { className: "muted" }, q ? "No chats match." : "No private chats yet.") : null,
      h(
        "ul",
        { className: "tg-manage__list" },
        list.map((c) => {
          const pref = tg.prefs.chats[c.id];
          return h(
            "li",
            { key: c.id, className: "tg-manage__row" },
            h(Avatar, { chat: c, svc }),
            h("span", { className: "tg-manage__name" }, c.name),
            h(Segmented, { label: `Level for ${c.name}`, value: pref ? pref.level : "none", options: LEVEL_OPTIONS, onChange: (v) => svc.setLevel(c.id, v === "none" ? null : v, c.name) })
          );
        })
      )
    );
  }

  // ---------- The list ----------
  function Avatar({ chat, svc }) {
    const [src, setSrc] = React2.useState(null);
    React2.useEffect(() => {
      let live = true;
      svc.photo(chat.id).then((u) => live && setSrc(u));
      return () => {
        live = false;
      };
    }, [chat.id]);
    const initial = (chat.name || "?").trim().charAt(0).toUpperCase();
    return src ? h("img", { className: "tg-avatar", src, alt: "" }) : h("span", { className: "tg-avatar", "aria-hidden": true }, initial);
  }
  function waitLine(w) {
    const R = rules();
    return `waiting ${R.formatWait(w.waitedMs)}${w.movedFrom ? `, moved up from ${R.LEVEL_LABEL[w.movedFrom]}` : ""}`;
  }
  function preview(m) {
    if (!m) return "";
    const what = m.text || (m.media ? MEDIA_LABEL[m.media.kind] || "Attachment" : "");
    return m.out ? `You: ${what}` : what;
  }
  function Row({ chat, level, line, selected, onSelect, svc }) {
    return h(
      "li",
      null,
      h(
        "button",
        { type: "button", className: "tg-row", "aria-current": selected ? "true" : void 0, onClick: () => onSelect(chat.id) },
        h(Avatar, { chat, svc }),
        h("span", { className: "tg-row__text" }, h("span", { className: "tg-row__name" }, chat.name), h("span", { className: "tg-row__line" }, line)),
        h("span", { className: `tg-dot tg-dot--${level}`, title: rules().LEVEL_LABEL[level], "aria-label": `${rules().LEVEL_LABEL[level]} priority` })
      )
    );
  }
  function ChatList({ tg, svc, selectedId, onSelect, onManage }) {
    const R = rules();
    const byId = new Map(tg.chats.map((c) => [c.id, c]));
    const chatOf = (id) => byId.get(id) || { id, name: (tg.prefs.chats[id] && tg.prefs.chats[id].name) || "Someone", lastMessage: null };
    const waitingIds = new Set(tg.waiting.map((w) => w.id));
    const others = Object.keys(tg.prefs.chats)
      .filter((id) => !waitingIds.has(id))
      .map(chatOf)
      .sort((a, b) => R.LEVELS.indexOf(tg.prefs.chats[a.id].level) - R.LEVELS.indexOf(tg.prefs.chats[b.id].level) || newest(a, b));
    const n = tg.newChats;
    return h(
      "div",
      { className: "panel panel--flush tg-list" },
      tg.status === "connecting" && tg.everConnected ? h("p", { className: "tg-list__note", role: "status" }, "Reconnecting…") : null,
      tg.status === "offline" ? h("p", { className: "tg-list__note", role: "status" }, "Telegram isn't reachable right now.") : null,
      n > 0 ? h("button", { type: "button", className: "tg-list__new", onClick: onManage }, `${n} new chat${n === 1 ? "" : "s"} in Telegram`) : null,
      tg.waiting.length > 0 &&
        h(
          "section",
          { className: "tg-list__group" },
          h("h2", { className: "tg-list__title" }, "Waiting"),
          h("ul", null, tg.waiting.map((w) => h(Row, { key: w.id, chat: chatOf(w.id), level: w.current, line: waitLine(w), selected: selectedId === w.id, onSelect, svc })))
        ),
      others.length > 0 &&
        h(
          "section",
          { className: "tg-list__group" },
          h("h2", { className: "tg-list__title" }, tg.waiting.length ? "Other chats" : "Your chats"),
          h("ul", null, others.map((c) => h(Row, { key: c.id, chat: c, level: tg.prefs.chats[c.id].level, line: preview(c.lastMessage), selected: selectedId === c.id, onSelect, svc })))
        ),
      h("div", { className: "tg-list__foot" }, h(Button, { variant: "ghost", size: "sm", onClick: onManage }, "Manage chats"))
    );
  }

  // ---------- A chat ----------
  const MEDIA_LABEL = { photo: "Photo", file: "File", sticker: "Sticker", voice: "Voice message", video: "Video", other: "Message" };
  function ChatView({ chatId, tg, svc, onBack }) {
    const chat = tg.chats.find((c) => c.id === chatId) || { id: chatId, name: (tg.prefs.chats[chatId] && tg.prefs.chats[chatId].name) || "Chat" };
    return h(
      "div",
      { className: "tg-chat" },
      h("header", { className: "tg-chat__head" }, h(Button, { variant: "ghost", size: "sm", className: "tg-chat__back", icon: h(ArrowLeft, { size: 16, "aria-hidden": true }), onClick: onBack }, "Back"), h(Avatar, { chat, svc }), h("h2", { className: "tg-chat__name" }, chat.name))
    );
  }

  function selectedFromHash() {
    const m = /^#telegram\/(.+)$/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function TelegramMain({ tg, svc }) {
    const ui = useUI();
    const [selected, setSelected] = React2.useState(selectedFromHash);
    const [manage, setManage] = React2.useState(() => Object.keys(tg.prefs.chats).length === 0);
    React2.useEffect(() => {
      const on = () => setSelected(selectedFromHash());
      window.addEventListener("hashchange", on);
      return () => window.removeEventListener("hashchange", on);
    }, []);
    const select = (id) => {
      ui.navigate(`telegram/${id}`);
      setSelected(id);
    };
    const back = () => {
      ui.navigate("telegram");
      setSelected(null);
    };
    if (manage) return h(ManageChats, { tg, svc, onDone: () => setManage(false) });
    return h(
      "div",
      { className: "tg", "data-open": selected ? "chat" : "list" },
      h(ChatList, { tg, svc, selectedId: selected, onSelect: select, onManage: () => setManage(true) }),
      h("section", { className: "panel tg-pane", "aria-label": "Chat" }, selected ? h(ChatView, { key: selected, chatId: selected, tg, svc, onBack: back }) : h("p", { className: "tg-pane__empty muted" }, "Choose a chat to read and reply."))
    );
  }

  // ---------- The page ----------
  function TelegramPage() {
    const tg = useTelegram();
    const [svc, setSvc] = React2.useState(window.__oneTelegram || null);
    const [connecting, setConnecting] = React2.useState(false);
    React2.useEffect(() => {
      if (!svc) ensureTelegram().then(setSvc);
    }, [svc]);
    const head = h("div", { className: "page-head" }, h("div", { className: "page-head__text" }, h("h1", { className: "page-title" }, "Telegram"), h("p", { className: "page-desc" }, "Your chosen chats, and whom to answer first.")));
    if (!svc || !tg) return head;
    let body;
    if (tg.status === "loggedOut" && !connecting) body = h(LoggedOut, { onConnect: () => setConnecting(true) });
    else if (connecting || !svc.hasLogin()) body = h(ConnectFlow, { onDone: () => setConnecting(false) });
    else body = h(TelegramMain, { tg, svc });
    return h(React2.Fragment, null, head, body);
  }

  window.__oneTelegramUI = { errorText, whoText };
  window.__onePages = window.__onePages || {};
  window.__onePages.telegram = TelegramPage;
})();
