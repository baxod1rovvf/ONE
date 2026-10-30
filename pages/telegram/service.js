// ONE — Telegram: the live state. It keeps the connection, the chosen chats
// and their messages, works out who is waiting (rules.js), and tells
// subscribers when anything changes. index.html loads it in the background
// when this device has a Telegram login (TelegramBridge), and the Telegram
// page loads it to connect one. Messages stay in memory; only the last
// waiting list is kept on the device, for Home while Telegram is unreachable.
(function () {
  "use strict";
  const R = window.__oneTelegramRules;
  const C = window.__oneTelegramClient;
  const DEVICE = "one.telegram.device.v1";
  const CACHE = "one.telegram.cache.v1";
  const TYPING_MS = 6000;

  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null");
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage blocked: it lasts until the page closes.
    }
  };
  const deviceChanged = () => window.dispatchEvent(new Event("one-telegram-device"));
  const normalizePrefs = (p) => ({ chats: (p && p.chats) || {}, limits: { ...R.DEFAULT_LIMITS, ...((p && p.limits) || {}) } });

  function blank() {
    return { status: "none", everConnected: false, me: null, chats: [], prefs: normalizePrefs(null), waiting: [], cached: null, messages: {}, pending: {}, typing: {}, presence: {}, newChats: 0, flood: null };
  }
  let state = blank();
  let client = null;
  let onPrefs = () => {};
  let unsubscribe = null;
  let tick = null;
  let retryTimer = null;
  let connectedAt = 0;
  let run = 0; // bumps on every start/stop, so late answers from an old run are dropped
  let localIds = 0;
  const listeners = new Set();
  const photos = new Map();

  function emit() {
    listeners.forEach((fn) => fn(state));
  }
  function set(patch) {
    state = { ...state, ...patch };
    recompute();
  }
  function chatName(id) {
    const c = state.chats.find((x) => x.id === id);
    return (c && c.name) || (state.prefs.chats[id] && state.prefs.chats[id].name) || "Someone";
  }
  // Who is waiting, the new-chats count, and the copy kept for offline Home.
  function recompute() {
    const prefs = state.prefs;
    const chosen = Object.keys(prefs.chats).map((id) => ({
      id,
      name: chatName(id),
      level: prefs.chats[id].level,
      since: R.waitingSince(state.messages[id] || [], prefs.chats[id].handled)
    }));
    const waiting = state.status === "connected" || state.status === "connecting" ? R.waitingOrder(chosen, Date.now(), prefs.limits) : state.waiting;
    const newChats = state.chats.filter((c) => !prefs.chats[c.id] && c.lastMessage && !c.lastMessage.out && c.lastMessage.date > connectedAt).length;
    state = { ...state, waiting, newChats };
    if (state.status === "connected") write(CACHE, { waiting, at: Date.now() });
    emit();
  }
  function addMessage(m) {
    const list = state.messages[m.chatId] || [];
    if (list.some((x) => x.id === m.id)) return;
    const messages = { ...state.messages, [m.chatId]: [...list, m].sort((a, b) => a.id - b.id) };
    const known = state.chats.some((c) => c.id === m.chatId);
    if (!known) refreshChats();
    const chats = known ? state.chats.map((c) => (c.id === m.chatId && (!c.lastMessage || c.lastMessage.id <= m.id) ? { ...c, lastMessage: m } : c)) : [{ id: m.chatId, name: chatName(m.chatId), username: null, lastMessage: m, unread: 1, readOutboxMaxId: 0 }, ...state.chats];
    const typing = { ...state.typing };
    if (!m.out) delete typing[m.chatId];
    state = { ...state, messages, chats, typing };
  }

  // Someone not in the list wrote: fetch the list again for their name.
  let refreshing = null;
  function refreshChats() {
    if (refreshing || !client) return;
    const c = client;
    refreshing = setTimeout(() => {
      c.listPrivateChats(100)
        .then((list) => {
          if (c !== client) return;
          const fresh = new Map(list.map((x) => [x.id, x]));
          set({ chats: [...list, ...state.chats.filter((x) => !fresh.has(x.id))].map((x) => (fresh.has(x.id) ? { ...fresh.get(x.id), lastMessage: newer(fresh.get(x.id).lastMessage, (state.chats.find((y) => y.id === x.id) || {}).lastMessage) } : x)) });
        })
        .catch(() => {})
        .finally(() => (refreshing = null));
    }, 300);
  }
  const newer = (a, b) => (!a ? b || null : !b ? a : a.id >= b.id ? a : b);
  function handle(u) {
    switch (u.type) {
      case "message":
        addMessage(u.message);
        recompute();
        break;
      case "read":
        if (u.out) set({ chats: state.chats.map((c) => (c.id === u.chatId ? { ...c, readOutboxMaxId: Math.max(c.readOutboxMaxId || 0, u.maxId) } : c)) });
        break;
      case "typing": {
        const until = Date.now() + TYPING_MS;
        set({ typing: { ...state.typing, [u.chatId]: until } });
        setTimeout(() => {
          if (state.typing[u.chatId] === until) {
            const typing = { ...state.typing };
            delete typing[u.chatId];
            set({ typing });
          }
        }, TYPING_MS);
        break;
      }
      case "connection":
        if (state.status === "connected" || state.status === "connecting") set({ status: u.state === "connected" ? "connected" : "connecting" });
        break;
      case "loggedOut":
        loggedOut();
        break;
    }
  }
  function loggedOut() {
    const device = read(DEVICE);
    if (device) write(DEVICE, { apiId: device.apiId, apiHash: device.apiHash });
    teardown();
    state = { ...blank(), prefs: state.prefs, status: "loggedOut" };
    emit();
  }
  function teardown() {
    run++;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    clearInterval(tick);
    clearTimeout(retryTimer);
    tick = null;
    if (client) client.disconnect();
    client = null;
  }

  async function start(opts) {
    if (opts) {
      onPrefs = opts.onPrefs || onPrefs;
      state = { ...state, prefs: normalizePrefs(opts.prefs) };
      // Already running (started right after logging in): just catch up.
      if (client) return setPrefs(opts.prefs);
    }
    if (client) return;
    const device = read(DEVICE);
    if (!device || !device.session) {
      set({ status: state.status === "loggedOut" ? "loggedOut" : "none" });
      return;
    }
    const mine = ++run;
    const cache = read(CACHE);
    set({ status: "connecting", cached: cache && cache.waiting, waiting: (cache && cache.waiting) || [] });
    try {
      const c = await C.createClient(device);
      if (mine !== run) return;
      client = c;
      unsubscribe = c.onUpdate(handle);
      await c.connect();
      if (!(await c.isAuthorized())) throw { code: "UNAUTHORIZED" };
      const [me, chats] = [await c.me(), await c.listPrivateChats(100)];
      if (mine !== run) return;
      connectedAt = Date.now();
      state = { ...state, me, chats };
      await Promise.all(Object.keys(state.prefs.chats).map((id) => loadRecent(id, mine)));
      if (mine !== run) return;
      tick = setInterval(recompute, 60e3);
      set({ status: "connected", everConnected: true });
    } catch (e) {
      if (mine !== run) return;
      const err = C.normalizeError(e);
      if (err.code === "UNAUTHORIZED") return loggedOut();
      teardown();
      state = { ...state, status: "offline", waiting: state.cached || [] };
      emit();
      // Try again in a while; nothing to tell the person beyond the card.
      retryTimer = setTimeout(() => start(), 30e3);
    }
  }
  async function loadRecent(id, mine) {
    if (!client || state.messages[id]) return;
    try {
      const list = await client.getMessages(id, { limit: 50 });
      if (mine !== undefined && mine !== run) return;
      state = { ...state, messages: { ...state.messages, [id]: list } };
    } catch {
      // The chat stays without messages until it is opened.
    }
  }
  function stop() {
    teardown();
    state = { ...blank(), prefs: state.prefs };
    emit();
  }

  // ---------- Logging in ----------
  let pendingCreds = null;
  async function beginLogin(apiId, apiHash) {
    teardown();
    pendingCreds = { apiId: Number(apiId), apiHash };
    const c = await C.createClient({ ...pendingCreds, session: "" });
    await c.connect();
    return c;
  }
  async function finishLogin(loginClient, me) {
    write(DEVICE, { ...pendingCreds, session: loginClient.saveSession(), me });
    loginClient.disconnect();
    state = { ...state, status: "none" };
    deviceChanged();
    await start();
  }
  async function logout() {
    const c = client;
    teardown();
    if (c) await c.logout().catch(() => {});
    write(DEVICE, null);
    write(CACHE, null);
    state = { ...blank(), prefs: state.prefs };
    emit();
    deviceChanged();
  }

  // ---------- Chats ----------
  async function openChat(id) {
    if (!client) return;
    await loadRecent(id);
    const list = state.messages[id] || [];
    // Seen in ONE counts as read in ONE: the chat stops waiting. Telegram
    // isn't told, so the other person sees no read receipt.
    const lastIn = [...list].reverse().find((m) => !m.out);
    const pref = state.prefs.chats[id];
    if (lastIn && pref && !(pref.handled >= lastIn.id)) savePrefs({ ...state.prefs, chats: { ...state.prefs.chats, [id]: { ...pref, handled: lastIn.id } } });
    client
      .status(id)
      .then((s) => set({ presence: { ...state.presence, [id]: s } }))
      .catch(() => {});
    recompute();
  }
  async function loadOlder(id) {
    const list = state.messages[id] || [];
    if (!client || !list.length) return 0;
    const older = await client.getMessages(id, { beforeId: list[0].id, limit: 50 });
    set({ messages: { ...state.messages, [id]: [...older.filter((m) => !list.some((x) => x.id === m.id)), ...list] } });
    return older.length;
  }
  function setPending(id, fn) {
    set({ pending: { ...state.pending, [id]: fn(state.pending[id] || []) } });
  }
  async function send(id, text, replyToId, localId) {
    localId = localId || `l${++localIds}`;
    setPending(id, (list) => [...list.filter((p) => p.localId !== localId), { localId, text, replyToId: replyToId || null, failed: false }]);
    try {
      const m = await client.sendMessage(id, text, { replyToId });
      addMessage({ ...m, chatId: id });
      setPending(id, (list) => list.filter((p) => p.localId !== localId));
      set({ flood: null });
      return m;
    } catch (e) {
      const err = C.normalizeError(e);
      setPending(id, (list) => list.map((p) => (p.localId === localId ? { ...p, failed: true } : p)));
      if (err.code === "FLOOD_WAIT") set({ flood: err.seconds });
      return null;
    }
  }
  function retry(id, localId) {
    const p = (state.pending[id] || []).find((x) => x.localId === localId);
    return p ? send(id, p.text, p.replyToId, localId) : Promise.resolve(null);
  }
  function savePrefs(prefs) {
    state = { ...state, prefs };
    onPrefs({ chats: prefs.chats, limits: prefs.limits });
    recompute();
  }
  async function setLevel(id, level, name) {
    const chats = { ...state.prefs.chats };
    if (level) chats[id] = { ...chats[id], level, name: name || chatName(id) };
    else delete chats[id];
    savePrefs({ ...state.prefs, chats });
    if (level) {
      await loadRecent(id);
      recompute();
    }
  }
  function markHandled(id) {
    const lastIn = [...(state.messages[id] || [])].reverse().find((m) => !m.out);
    if (!lastIn || !state.prefs.chats[id]) return;
    savePrefs({ ...state.prefs, chats: { ...state.prefs.chats, [id]: { ...state.prefs.chats[id], handled: lastIn.id } } });
  }
  function setPrefs(p) {
    state = { ...state, prefs: normalizePrefs(p) };
    Object.keys(state.prefs.chats).forEach((id) => loadRecent(id).then(recompute));
    recompute();
  }
  async function media(chatId, messageId) {
    const blob = client && (await client.downloadMedia(chatId, messageId));
    return blob ? URL.createObjectURL(blob) : null;
  }
  async function photo(chatId) {
    if (!photos.has(chatId)) photos.set(chatId, client ? client.profilePhoto(chatId).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null) : Promise.resolve(null));
    return photos.get(chatId);
  }

  window.__oneTelegram = {
    start,
    stop,
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    hasLogin: () => !!(read(DEVICE) || {}).session,
    savedKey: () => {
      const d = read(DEVICE);
      return d ? { apiId: d.apiId, apiHash: d.apiHash } : null;
    },
    beginLogin,
    finishLogin,
    logout,
    openChat,
    loadOlder,
    send,
    retry,
    setLevel,
    markHandled,
    setPrefs,
    media,
    photo
  };
  window.dispatchEvent(new Event("one-telegram-ready"));
})();
