// ONE — Telegram page. It loads into the same page as index.html (see
// loadPage there). The live connection and the chats come from
// pages/telegram/service.js, through useTelegram; this file only draws them.
(function () {
  "use strict";
  const { React2, Button, Field, Segmented, MessageCircle, RefreshCw, ensureTelegram, loadScript, useTelegram, useToast } = window.__oneApp;
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
    else body = h("div", { className: "tg" }, h(MessageCircle, { size: 18, "aria-hidden": true }));
    return h(React2.Fragment, null, head, body);
  }

  window.__oneTelegramUI = { errorText, whoText };
  window.__onePages = window.__onePages || {};
  window.__onePages.telegram = TelegramPage;
})();
