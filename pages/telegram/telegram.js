// ONE — Telegram page. It loads into the same page as index.html (see
// loadPage there). The live connection and the chats come from
// pages/telegram/service.js, through useTelegram; this file only draws them.
(function () {
  "use strict";
  const { React2, Button, Field, Segmented, MessageCircle, RefreshCw, ArrowLeft, Search, ensureTelegram, loadScript, useStore, useTelegram, useToast, useUI } = window.__oneApp;
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
      case "KEY_INVALID":
        return "Telegram didn't accept this api_id and api_hash. Check them on my.telegram.org.";
      default:
        // What went wrong, in brackets, so it can be reported.
        return `Something went wrong with Telegram. Try again.${err && err.detail ? ` (${err.detail})` : ""}`;
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
          h("li", null, "Choose ", h("b", null, "API development tools"), " and create an app (any name of 5 or more letters, for example “My ONE app”)."),
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
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  function dayLabel(t) {
    const now = Date.now();
    if (sameDay(t, now)) return "Today";
    if (sameDay(t, now - 864e5)) return "Yesterday";
    return new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
  const timeOf = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  function sizeText(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  // Text with its web links clickable.
  function linked(text) {
    const parts = text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g);
    return parts.map((p, i) => (i % 2 ? h("a", { key: i, href: p, target: "_blank", rel: "noreferrer" }, p) : p));
  }
  const telegramLink = (chat) => (chat.username ? `https://t.me/${chat.username}` : `tg://user?id=${chat.id}`);

  function Photo({ svc, chatId, id }) {
    const [src, setSrc] = React2.useState(null);
    React2.useEffect(() => {
      let live = true;
      let url = null;
      svc.media(chatId, id).then((u) => {
        url = u;
        if (live) setSrc(u);
        else if (u) URL.revokeObjectURL(u);
      });
      return () => {
        live = false;
        if (url) URL.revokeObjectURL(url);
      };
    }, [chatId, id]);
    if (!src) return h("span", { className: "tg-msg__photo tg-msg__photo--loading", "aria-label": "Photo" });
    return h("a", { href: src, target: "_blank", rel: "noreferrer", "aria-label": "Open photo" }, h("img", { className: "tg-msg__photo", src, alt: "Photo" }));
  }
  function Media({ m, chat, svc }) {
    const media = m.media;
    if (media.kind === "photo") return h(Photo, { svc, chatId: chat.id, id: m.id });
    if (media.kind === "file") {
      const download = async () => {
        const url = await svc.media(chat.id, m.id);
        if (!url) return;
        const a = document.createElement("a");
        a.href = url;
        a.download = media.name || "file";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      return h("span", { className: "tg-msg__file" }, h("span", { className: "tg-msg__file-name" }, media.name), h("span", { className: "tg-msg__file-size muted num" }, sizeText(media.size || 0)), h(Button, { size: "sm", onClick: download }, "Download"));
    }
    return h("span", { className: "tg-msg__other" }, h("span", { className: "tg-msg__label" }, MEDIA_LABEL[media.kind] || "Message"), " · ", h("a", { href: telegramLink(chat), target: "_blank", rel: "noreferrer" }, "Open in Telegram"));
  }
  function Bubble({ m, chat, svc, quoted, read, onReply, pending }) {
    const cls = ["tg-msg", m.out ? "tg-msg--out" : "tg-msg--in", pending && pending.failed ? "tg-msg--failed" : ""].filter(Boolean).join(" ");
    return h(
      "li",
      { className: cls, "data-id": pending ? void 0 : m.id },
      quoted !== void 0 && h("span", { className: "tg-msg__quote" }, quoted || "Earlier message"),
      m.media && h(Media, { m, chat, svc }),
      m.text && h("span", { className: "tg-msg__text" }, linked(m.text)),
      h(
        "span",
        { className: "tg-msg__meta" },
        pending ? (pending.failed ? "Not sent" : "Sending…") : timeOf(m.date),
        m.out && !pending && h("span", { className: `tg-msg__tick${read ? " tg-msg__tick--read" : ""}`, "aria-label": read ? "Read" : "Sent" }, read ? "✓✓" : "✓")
      ),
      pending && pending.failed && h(Button, { size: "sm", onClick: pending.retry }, "Try again"),
      !pending && h("button", { type: "button", className: "tg-msg__reply", "aria-label": "Reply", title: "Reply", onClick: () => onReply(m) }, "↩")
    );
  }

  function ChatView({ chatId, tg, svc, onBack, onSelect }) {
    const R = rules();
    const chat = tg.chats.find((c) => c.id === chatId) || { id: chatId, name: (tg.prefs.chats[chatId] && tg.prefs.chats[chatId].name) || "Chat", username: null, readOutboxMaxId: 0 };
    const messages = tg.messages[chatId] || [];
    const pending = tg.pending[chatId] || [];
    const pref = tg.prefs.chats[chatId];
    const waitingHere = tg.waiting.some((w) => w.id === chatId);
    const [text, setText] = React2.useState("");
    const [replyTo, setReplyTo] = React2.useState(null);
    const [answered, setAnswered] = React2.useState(false);
    const listRef = React2.useRef(null);
    const loadingOlder = React2.useRef(false);
    const keep = React2.useRef(null);
    const stick = React2.useRef(true);
    const lastIn = [...messages].reverse().find((m) => !m.out);

    React2.useEffect(() => {
      svc.openChat(chatId);
    }, [chatId, lastIn && lastIn.id]);
    // Stay at the bottom as messages arrive; keep the place when older ones
    // are added above.
    React2.useLayoutEffect(() => {
      const el = listRef.current;
      if (!el) return;
      if (keep.current !== null) {
        el.scrollTop = el.scrollHeight - keep.current;
        keep.current = null;
      } else if (stick.current) el.scrollTop = el.scrollHeight;
    }, [messages.length, pending.length, messages[0] && messages[0].id]);
    const onScroll = (e) => {
      const el = e.currentTarget;
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (el.scrollTop < 40 && !loadingOlder.current && messages.length >= 50) {
        loadingOlder.current = true;
        keep.current = el.scrollHeight - el.scrollTop;
        svc.loadOlder(chatId).then((n) => {
          if (!n) keep.current = null;
          // Nothing more to load once a page comes back short.
          loadingOlder.current = n < 50;
        });
      }
    };
    const send = () => {
      const body = text.trim();
      if (!body) return;
      const replyToId = replyTo ? replyTo.id : null;
      setText("");
      setReplyTo(null);
      stick.current = true;
      svc.send(chatId, text.replace(/\s+$/, ""), replyToId).then((m) => m && setAnswered(true));
    };
    const byId = new Map(messages.map((m) => [m.id, m]));
    const quoteOf = (m) => {
      if (!m.replyToId) return void 0;
      const q = byId.get(m.replyToId);
      return q ? q.text || MEDIA_LABEL[q.media && q.media.kind] || "" : null;
    };
    const items = [];
    let prevDay = null;
    messages.forEach((m) => {
      if (!prevDay || !sameDay(prevDay, m.date)) items.push(h("li", { key: `d${m.date}`, className: "tg-day" }, h("span", null, dayLabel(m.date))));
      prevDay = m.date;
      items.push(h(Bubble, { key: m.id, m, chat, svc, quoted: quoteOf(m), read: m.out && m.id <= (chat.readOutboxMaxId || 0), onReply: setReplyTo }));
    });
    pending.forEach((p) => items.push(h(Bubble, { key: p.localId, m: { id: p.localId, out: true, text: p.text, date: Date.now(), replyToId: p.replyToId, media: null }, chat, svc, quoted: p.replyToId ? quoteOf(p) : void 0, pending: { ...p, retry: () => svc.retry(chatId, p.localId) } })));
    const presence = tg.presence[chatId];
    const typing = tg.typing[chatId];
    const statusText = typing ? "typing…" : presence && presence.online ? "online" : presence && presence.lastSeen ? `last seen ${R.formatWait(Date.now() - presence.lastSeen)} ago` : "";
    const next = answered && !waitingHere ? tg.waiting.find((w) => w.id !== chatId) : null;
    return h(
      "div",
      { className: "tg-chat" },
      h(
        "header",
        { className: "tg-chat__head" },
        h(Button, { variant: "ghost", size: "sm", className: "tg-chat__back", icon: h(ArrowLeft, { size: 16, "aria-hidden": true }), onClick: onBack }, "Back"),
        h(Avatar, { chat, svc }),
        h("div", { className: "tg-chat__who" }, h("h2", { className: "tg-chat__name" }, chat.name), h("span", { className: "tg-chat__status muted", "aria-live": "polite" }, statusText)),
        h(
          "div",
          { className: "tg-chat__tools" },
          waitingHere && h(Button, { size: "sm", variant: "ghost", onClick: () => svc.markHandled(chatId) }, "No reply needed"),
          h(
            "label",
            { className: "tg-chat__level" },
            h("span", { className: "sr-only" }, "Level"),
            h(
              "select",
              { className: "input input--sm", "aria-label": "Level", value: pref ? pref.level : "none", onChange: (e) => svc.setLevel(chatId, e.target.value === "none" ? null : e.target.value, chat.name) },
              LEVEL_OPTIONS.map((o) => h("option", { key: o.value, value: o.value }, o.label))
            )
          ),
          h("a", { className: "btn btn--ghost btn--sm", href: telegramLink(chat), target: "_blank", rel: "noreferrer" }, "Open in Telegram")
        )
      ),
      h("ol", { className: "tg-msgs", ref: listRef, onScroll, "aria-label": `Messages with ${chat.name}` }, items),
      h(
        "form",
        {
          className: "tg-compose",
          onSubmit: (e) => {
            e.preventDefault();
            send();
          }
        },
        tg.flood ? h("p", { className: "tg-compose__note", role: "alert" }, `Telegram asks you to wait ${waitText(tg.flood)}.`) : null,
        next ? h("button", { type: "button", className: "tg-next", onClick: () => onSelect(next.id) }, `Next: ${next.name}`) : null,
        replyTo &&
          h(
            "div",
            { className: "tg-compose__quote" },
            h("span", null, replyTo.text || MEDIA_LABEL[replyTo.media && replyTo.media.kind] || "Message"),
            h("button", { type: "button", className: "tg-compose__unquote", "aria-label": "Don't reply to this", onClick: () => setReplyTo(null) }, "×")
          ),
        h(
          "div",
          { className: "tg-compose__row" },
          h("textarea", {
            className: "textarea tg-compose__box",
            "aria-label": "Message",
            placeholder: "Write a message",
            rows: 1,
            value: text,
            onChange: (e) => setText(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                send();
              }
            }
          }),
          h(Button, { type: "submit", variant: "primary", disabled: !text.trim() }, "Send")
        )
      )
    );
  }

  function selectedFromHash() {
    const m = /^#telegram\/(.+)$/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function TelegramMain({ tg, svc }) {
    const ui = useUI();
    const [selected, setSelected] = React2.useState(selectedFromHash);
    const { data } = useStore();
    // From the synced settings: the service may not have started yet.
    const [manage, setManage] = React2.useState(() => Object.keys((data.settings.telegram && data.settings.telegram.chats) || {}).length === 0);
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
      h("section", { className: "panel tg-pane", "aria-label": "Chat" }, selected ? h(ChatView, { key: selected, chatId: selected, tg, svc, onBack: back, onSelect: select }) : h("p", { className: "tg-pane__empty muted" }, "Choose a chat to read and reply."))
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
