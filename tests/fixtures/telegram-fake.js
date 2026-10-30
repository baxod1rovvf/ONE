// A fake Telegram for the browser tests: the same methods as the client in
// pages/telegram/client.js, driven by window.__tgFake. Tests describe the
// account with window.__tgFakeSeed (set before ONE starts) and steer it with
// __tgFake.push(update), __tgFake.scanQr(), __tgFake.revoke() and __tgFake.fail.
(function () {
  const H = 3600e3;
  const now = Date.now();
  function defaultSeed() {
    return {
      me: { id: "1", name: "Owner", username: "owner" },
      needsPassword: false,
      chats: [],
      messages: {}
    };
  }
  const fake = (window.__tgFake = {
    seed: null,
    authorized: false,
    sent: [],
    reads: [],
    calls: [],
    fail: {},
    listeners: new Set(),
    qr: null,
    H,
    now,
    push(update) {
      if (update.type === "message") {
        const list = (fake.seed.messages[update.message.chatId] = fake.seed.messages[update.message.chatId] || []);
        list.push(update.message);
        const chat = fake.seed.chats.find((c) => c.id === update.message.chatId);
        if (chat) chat.lastMessage = update.message;
      }
      fake.listeners.forEach((fn) => fn(update));
    },
    scanQr() {
      if (fake.qr) fake.qr();
    },
    revoke() {
      fake.authorized = false;
      fake.push({ type: "loggedOut" });
    }
  });
  const err = (e) => Promise.reject(e === true ? { code: "OTHER" } : e);
  const failing = (name) => {
    fake.calls.push(name);
    const f = fake.fail[name];
    return f ? err(f) : null;
  };

  window.__oneTelegramFakeClient = async ({ session }) => {
    fake.seed = fake.seed || window.__tgFakeSeed || defaultSeed();
    fake.seed.messages = fake.seed.messages || {};
    if (session) fake.authorized = true;
    let pending = null;
    return {
      async connect() {
        const f = failing("connect");
        if (f) return f;
      },
      async isAuthorized() {
        return fake.authorized;
      },
      async me() {
        return fake.seed.me;
      },
      saveSession() {
        return fake.authorized ? "fake-session" : "";
      },
      startQrLogin(onQr, getPassword) {
        onQr("tg://login?token=fake");
        return new Promise((resolve, reject) => {
          fake.qr = async () => {
            try {
              if (fake.seed.needsPassword) {
                for (;;) {
                  const pw = await getPassword();
                  if (pw === "secret") break;
                }
              }
              fake.authorized = true;
              resolve(fake.seed.me);
            } catch (e) {
              reject(e);
            }
          };
        });
      },
      async sendCode(phone) {
        const f = failing("sendCode");
        if (f) return f;
        pending = phone;
        return { phoneCodeHash: "hash" };
      },
      async signIn({ code }) {
        const f = failing("signIn");
        if (f) return f;
        if (code !== "12345") return err({ code: "CODE_INVALID" });
        if (fake.seed.needsPassword) return { needsPassword: true };
        fake.authorized = true;
        return fake.seed.me;
      },
      async checkPassword(pw) {
        const f = failing("checkPassword");
        if (f) return f;
        if (pw !== "secret") return err({ code: "PASSWORD_INVALID" });
        fake.authorized = true;
        return fake.seed.me;
      },
      async listPrivateChats() {
        if (!fake.authorized) return err({ code: "UNAUTHORIZED" });
        return fake.seed.chats.map((c) => ({ unread: 0, readOutboxMaxId: 0, username: null, lastMessage: null, ...c }));
      },
      async getMessages(chatId, { beforeId, limit = 50 } = {}) {
        const all = fake.seed.messages[chatId] || [];
        const older = beforeId ? all.filter((m) => m.id < beforeId) : all;
        return older.slice(-limit);
      },
      async sendMessage(chatId, text, { replyToId } = {}) {
        const f = failing("send");
        if (f) return f;
        const list = (fake.seed.messages[chatId] = fake.seed.messages[chatId] || []);
        const id = Math.max(0, ...list.map((m) => m.id)) + 1;
        const m = { id, chatId, out: true, date: Date.now(), text, replyToId: replyToId || null, media: null };
        list.push(m);
        fake.sent.push(m);
        return m;
      },
      async markRead(chatId, maxId) {
        fake.reads.push({ chatId, maxId });
      },
      async downloadMedia() {
        // A 1×1 PNG, so previews have something to show.
        const b = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
        return new Blob([Uint8Array.from(b, (ch) => ch.charCodeAt(0))], { type: "image/png" });
      },
      async profilePhoto() {
        return null;
      },
      async status(chatId) {
        const c = fake.seed.chats.find((x) => x.id === chatId);
        return (c && c.status) || { online: false, lastSeen: null };
      },
      onUpdate(fn) {
        fake.listeners.add(fn);
        return () => fake.listeners.delete(fn);
      },
      async logout() {
        fake.authorized = false;
      },
      disconnect() {}
    };
  };
})();
