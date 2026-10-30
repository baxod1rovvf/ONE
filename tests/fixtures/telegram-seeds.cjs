// Accounts for the fake Telegram (telegram-fake.js), shared by the tests.
const H = 3600e3;
const MIN = 60e3;
// A message from them (out: false) or from me (out: true), `ago` ms ago.
const msg = (chatId, id, out, ago, text = out ? "ok" : "hello") => ({ id, chatId, out, date: Date.now() - ago, text, replyToId: null, media: null });
// Aziz (High) waiting 5 h, Mom (Normal) waiting 2 h, Dilnoza (Low) answered,
// plus Bek, who isn't in ONE.
function seed() {
  const messages = {
    "11": [msg("11", 1, true, 6 * H), msg("11", 2, false, 5 * H, "Are you free?"), msg("11", 3, false, 4 * H, "Call me")],
    "12": [msg("12", 1, false, 2 * H, "Dinner at 7?")],
    "13": [msg("13", 1, false, 3 * H), msg("13", 2, true, 2.5 * H)],
    "14": [msg("14", 1, false, 10 * MIN, "Hey")]
  };
  const chat = (id, name, username) => ({ id, name, username, lastMessage: messages[id][messages[id].length - 1], unread: 0, readOutboxMaxId: 0 });
  return {
    me: { id: "1", name: "Owner", username: "owner" },
    chats: [chat("14", "Bek", "bek"), chat("12", "Mom", null), chat("11", "Aziz", "aziz"), chat("13", "Dilnoza", "dilnoza")],
    messages
  };
}
const PREFS = {
  telegram: {
    chats: { "11": { level: "high", name: "Aziz" }, "12": { level: "normal", name: "Mom" }, "13": { level: "low", name: "Dilnoza" } },
    limits: { normal: 180, low: 720 }
  }
};
// Aziz with 60 messages: 54 older ones a few days back, then a photo, a file
// and a sticker, a reply of mine, and his two unanswered messages.
function chatSeed() {
  const s = seed();
  const old = [];
  for (let i = 1; i <= 54; i++) old.push(msg("11", i, i % 2 === 0, 3 * 24 * H - i * MIN, `older ${i}`));
  const list = [
    ...old,
    { ...msg("11", 55, false, 8 * H, ""), media: { kind: "photo" } },
    { ...msg("11", 56, false, 7.5 * H, "Here is the plan"), media: { kind: "file", name: "plan.pdf", size: 5000 } },
    { ...msg("11", 57, false, 7 * H, ""), media: { kind: "sticker" } },
    { ...msg("11", 58, true, 6 * H, "Thanks, I'll look"), replyToId: 56 },
    msg("11", 59, false, 5 * H, "Are you free? https://example.com/agenda"),
    msg("11", 60, false, 4 * H, "Call me")
  ];
  s.messages["11"] = list;
  s.chats.find((c) => c.id === "11").lastMessage = list[list.length - 1];
  s.chats.find((c) => c.id === "11").readOutboxMaxId = 58;
  s.chats.find((c) => c.id === "11").status = { online: true, lastSeen: null };
  s.chats.find((c) => c.id === "12").status = { online: false, lastSeen: Date.now() - 5 * MIN + 30e3 };
  return s;
}

module.exports = { H, MIN, msg, seed, chatSeed, PREFS };
