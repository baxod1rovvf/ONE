// ONE — Telegram: the only code that talks to GramJS. It turns GramJS objects
// into ONE's plain shapes, so the rest of ONE (and the tests, which use a fake
// client with the same methods) never sees GramJS. Browser:
// window.__oneTelegramClient; Node (the mapping tests): module.exports.
(function (root) {
  "use strict";
  const GRAMJS = "pages/telegram/gramjs-2.26.22.js";
  const idOf = (x) => (x === null || x === undefined ? null : String(x));

  // ---------- Mapping ----------
  function mediaOf(media) {
    if (!media) return null;
    if (media.className === "MessageMediaPhoto") return { kind: "photo" };
    if (media.className !== "MessageMediaDocument" || !media.document) return { kind: "other" };
    const d = media.document;
    const attrs = d.attributes || [];
    const has = (name) => attrs.find((a) => a.className === name);
    const audio = has("DocumentAttributeAudio");
    if (audio && audio.voice) return { kind: "voice" };
    if (has("DocumentAttributeSticker")) return { kind: "sticker" };
    if (has("DocumentAttributeVideo")) return { kind: "video" };
    const file = has("DocumentAttributeFilename");
    return { kind: "file", name: file ? file.fileName : "File", size: Number(String(d.size || 0)) };
  }
  // chatId: the other person; GramJS gives it as peerId (or userId on the
  // short form of a private message).
  function mapMessage(m, chatId) {
    const peer = m.peerId || {};
    return {
      id: m.id,
      chatId: idOf(chatId ?? peer.userId ?? m.userId),
      out: !!m.out,
      date: m.date * 1000,
      text: m.message || "",
      replyToId: (m.replyTo && m.replyTo.replyToMsgId) || null,
      media: mediaOf(m.media)
    };
  }
  function mapUser(u) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
    return { id: idOf(u.id), name: name || "Deleted account", username: u.username || null };
  }
  function mapStatus(s) {
    if (s && s.className === "UserStatusOnline") return { online: true, lastSeen: null };
    if (s && s.className === "UserStatusOffline") return { online: false, lastSeen: s.wasOnline * 1000 };
    return { online: false, lastSeen: null };
  }
  // Private chats with people: no bots, deleted accounts or Saved Messages.
  function isPrivatePerson(e) {
    return !!e && e.className === "User" && !e.bot && !e.deleted && !e.self;
  }
  const UNAUTHORIZED = ["AUTH_KEY_UNREGISTERED", "SESSION_REVOKED", "SESSION_EXPIRED", "USER_DEACTIVATED", "USER_DEACTIVATED_BAN", "AUTH_KEY_INVALID"];
  function normalizeError(e) {
    if (e && typeof e.code === "string" && /^[A-Z_]+$/.test(e.code)) return e.seconds ? { code: e.code, seconds: e.seconds } : { code: e.code };
    const msg = (e && (e.errorMessage || e.message)) || "";
    if (/^FLOOD_WAIT/.test(msg)) return { code: "FLOOD_WAIT", seconds: e.seconds || Number(msg.split("_").pop()) || 30 };
    if (msg === "PHONE_CODE_INVALID" || msg === "PHONE_CODE_EMPTY") return { code: "CODE_INVALID" };
    if (msg === "PHONE_CODE_EXPIRED") return { code: "CODE_EXPIRED" };
    if (msg === "PASSWORD_HASH_INVALID") return { code: "PASSWORD_INVALID" };
    if (UNAUTHORIZED.includes(msg)) return { code: "UNAUTHORIZED" };
    if (/network|websocket|connection|timeout|not connected|disconnect/i.test(msg)) return { code: "NETWORK" };
    return { code: "OTHER" };
  }

  // ---------- The client ----------
  async function createClient({ apiId, apiHash, session }) {
    if (root.__oneTelegramFakeClient) return root.__oneTelegramFakeClient({ apiId, apiHash, session });
    await root.__oneApp.loadScript(GRAMJS);
    const { TelegramClient, StringSession, Api, computeCheck } = root.GramJS;
    const creds = { apiId: Number(apiId), apiHash };
    const tg = new TelegramClient(new StringSession(session || ""), creds.apiId, apiHash, { connectionRetries: 5, useWSS: true });
    const people = new Map(); // id -> GramJS User, with the access hash requests need
    const listeners = new Set();
    const emit = (u) => listeners.forEach((fn) => fn(u));
    // Every call goes through here: a revoked session is reported once as
    // "loggedOut", and errors reach ONE in its own words.
    let gone = false;
    const call = async (fn) => {
      try {
        return await fn();
      } catch (e) {
        const err = normalizeError(e);
        if (err.code === "UNAUTHORIZED" && !gone) {
          gone = true;
          emit({ type: "loggedOut" });
        }
        throw err;
      }
    };
    const person = async (chatId) => {
      if (people.has(chatId)) return people.get(chatId);
      const u = await tg.getEntity(chatId);
      people.set(chatId, u);
      return u;
    };
    const asMe = (u) => {
      people.set(idOf(u.id), u);
      return mapUser(u);
    };
    tg.addEventHandler((u) => {
      if (!u) return;
      if (typeof u.state === "number" && !u.className) {
        emit({ type: "connection", state: u.state === 1 ? "connected" : u.state === -1 ? "offline" : "connecting" });
        return;
      }
      switch (u.className) {
        case "UpdateNewMessage":
          if (u.message && u.message.peerId && u.message.peerId.className === "PeerUser") emit({ type: "message", message: mapMessage(u.message) });
          break;
        case "UpdateShortMessage":
          emit({ type: "message", message: mapMessage(u, u.userId) });
          break;
        case "UpdateReadHistoryInbox":
        case "UpdateReadHistoryOutbox":
          if (u.peer && u.peer.className === "PeerUser") emit({ type: "read", chatId: idOf(u.peer.userId), maxId: u.maxId, out: u.className === "UpdateReadHistoryOutbox" });
          break;
        case "UpdateUserTyping":
          emit({ type: "typing", chatId: idOf(u.userId) });
          break;
      }
    });
    return {
      connect: () => call(() => tg.connect()),
      isAuthorized: () => call(() => tg.checkAuthorization()),
      me: () => call(async () => asMe(await tg.getMe())),
      saveSession: () => tg.session.save(),
      startQrLogin: (onQr, getPassword) =>
        call(async () => {
          const user = await tg.signInUserWithQrCode(creds, {
            qrCode: async ({ token }) => onQr(`tg://login?token=${token.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`),
            password: async () => getPassword(),
            onError: async (e) => {
              throw e;
            }
          });
          return asMe(user);
        }),
      sendCode: (phone) => call(async () => ({ phoneCodeHash: (await tg.sendCode(creds, phone)).phoneCodeHash })),
      signIn: ({ phone, phoneCodeHash, code }) =>
        call(async () => {
          try {
            const r = await tg.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code }));
            if (!r.user) throw { errorMessage: "SIGN_UP_REQUIRED" };
            return asMe(r.user);
          } catch (e) {
            if (e && e.errorMessage === "SESSION_PASSWORD_NEEDED") return { needsPassword: true };
            throw e;
          }
        }),
      checkPassword: (password) =>
        call(async () => {
          const info = await tg.invoke(new Api.account.GetPassword());
          const r = await tg.invoke(new Api.auth.CheckPassword({ password: await computeCheck(info, password) }));
          return asMe(r.user);
        }),
      listPrivateChats: (limit = 100) =>
        call(async () => {
          const dialogs = await tg.getDialogs({ limit });
          return dialogs
            .filter((d) => isPrivatePerson(d.entity))
            .map((d) => {
              const id = idOf(d.entity.id);
              people.set(id, d.entity);
              return {
                ...mapUser(d.entity),
                lastMessage: d.message ? mapMessage(d.message, id) : null,
                unread: d.unreadCount || 0,
                readOutboxMaxId: (d.dialog && d.dialog.readOutboxMaxId) || 0
              };
            });
        }),
      getMessages: (chatId, { beforeId, limit = 50 } = {}) =>
        call(async () => {
          const list = await tg.getMessages(await person(chatId), { limit, offsetId: beforeId || 0 });
          return [...list].reverse().map((m) => mapMessage(m, chatId));
        }),
      sendMessage: (chatId, text, { replyToId } = {}) =>
        call(async () => mapMessage(await tg.sendMessage(await person(chatId), { message: text, replyTo: replyToId || undefined }), chatId)),
      markRead: (chatId, maxId) => call(async () => tg.invoke(new Api.messages.ReadHistory({ peer: await person(chatId), maxId }))),
      downloadMedia: (chatId, messageId) =>
        call(async () => {
          const [m] = await tg.getMessages(await person(chatId), { ids: messageId });
          const data = m && (await tg.downloadMedia(m, {}));
          return data && data.length ? new Blob([data]) : null;
        }),
      profilePhoto: (chatId) =>
        call(async () => {
          const data = await tg.downloadProfilePhoto(await person(chatId), { isBig: false });
          return data && data.length ? new Blob([data], { type: "image/jpeg" }) : null;
        }),
      status: (chatId) =>
        call(async () => {
          const [u] = await tg.invoke(new Api.users.GetUsers({ id: [await person(chatId)] }));
          return mapStatus(u && u.status);
        }),
      onUpdate: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      logout: () => call(() => tg.invoke(new Api.auth.LogOut())).finally(() => tg.disconnect().catch(() => {})),
      disconnect: () => tg.disconnect().catch(() => {})
    };
  }

  const api = { createClient, mapMessage, mapUser, mapStatus, isPrivatePerson, normalizeError };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__oneTelegramClient = api;
})(typeof window !== "undefined" ? window : globalThis);
