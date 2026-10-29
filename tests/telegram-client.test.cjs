// How pages/telegram/client.js turns GramJS objects into ONE's plain shapes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mapMessage, mapUser, mapStatus, normalizeError, isPrivatePerson } = require("../pages/telegram/client.js");

// GramJS ids are BigIntegers; anything with toString() stands in for one.
const big = (n) => ({ toString: () => String(n) });
const doc = (mimeType, attributes, size = 2048) => ({ className: "MessageMediaDocument", document: { mimeType, size: big(size), attributes } });

test("a text message with a reply", () => {
  const m = { id: 7, out: false, date: 1700000000, message: "hi", peerId: { className: "PeerUser", userId: big(42) }, replyTo: { replyToMsgId: 3 }, media: null };
  assert.deepEqual(mapMessage(m), { id: 7, chatId: "42", out: false, date: 1700000000000, text: "hi", replyToId: 3, media: null });
});

test("media kinds", () => {
  const base = { id: 1, out: true, date: 1, message: "", peerId: { userId: big(5) } };
  assert.deepEqual(mapMessage({ ...base, media: { className: "MessageMediaPhoto" } }).media, { kind: "photo" });
  assert.equal(mapMessage({ ...base, media: doc("audio/ogg", [{ className: "DocumentAttributeAudio", voice: true }]) }).media.kind, "voice");
  assert.equal(mapMessage({ ...base, media: doc("image/webp", [{ className: "DocumentAttributeSticker" }]) }).media.kind, "sticker");
  assert.equal(mapMessage({ ...base, media: doc("video/mp4", [{ className: "DocumentAttributeVideo" }]) }).media.kind, "video");
  assert.deepEqual(mapMessage({ ...base, media: doc("application/pdf", [{ className: "DocumentAttributeFilename", fileName: "plan.pdf" }], 5000) }).media, { kind: "file", name: "plan.pdf", size: 5000 });
  assert.deepEqual(mapMessage({ ...base, media: { className: "MessageMediaGeo" } }).media, { kind: "other" });
});

test("people: name, username, and who counts as a private person", () => {
  assert.deepEqual(mapUser({ id: big(9), firstName: "Aziz", lastName: "Karimov", username: "aziz" }), { id: "9", name: "Aziz Karimov", username: "aziz" });
  assert.deepEqual(mapUser({ id: big(9), firstName: "Mom" }), { id: "9", name: "Mom", username: null });
  assert.equal(mapUser({ id: big(9) }).name, "Deleted account");
  assert.equal(isPrivatePerson({ className: "User", id: big(1) }), true);
  assert.equal(isPrivatePerson({ className: "User", id: big(1), bot: true }), false);
  assert.equal(isPrivatePerson({ className: "User", id: big(1), deleted: true }), false);
  assert.equal(isPrivatePerson({ className: "User", id: big(1), self: true }), false);
  assert.equal(isPrivatePerson({ className: "Channel", id: big(1) }), false);
});

test("online and last seen", () => {
  assert.deepEqual(mapStatus({ className: "UserStatusOnline", expires: 100 }), { online: true, lastSeen: null });
  assert.deepEqual(mapStatus({ className: "UserStatusOffline", wasOnline: 1700000000 }), { online: false, lastSeen: 1700000000000 });
  assert.deepEqual(mapStatus(undefined), { online: false, lastSeen: null });
});

test("errors in ONE's words", () => {
  assert.deepEqual(normalizeError({ errorMessage: "FLOOD_WAIT", seconds: 240 }), { code: "FLOOD_WAIT", seconds: 240 });
  assert.deepEqual(normalizeError({ errorMessage: "PHONE_CODE_INVALID" }), { code: "CODE_INVALID" });
  assert.deepEqual(normalizeError({ errorMessage: "PHONE_CODE_EXPIRED" }), { code: "CODE_EXPIRED" });
  assert.deepEqual(normalizeError({ errorMessage: "PASSWORD_HASH_INVALID" }), { code: "PASSWORD_INVALID" });
  assert.deepEqual(normalizeError({ errorMessage: "AUTH_KEY_UNREGISTERED" }), { code: "UNAUTHORIZED" });
  assert.deepEqual(normalizeError({ errorMessage: "SESSION_REVOKED" }), { code: "UNAUTHORIZED" });
  assert.deepEqual(normalizeError(new Error("WebSocket connection failed")), { code: "NETWORK" });
  assert.deepEqual(normalizeError({ errorMessage: "SOMETHING_ELSE" }), { code: "OTHER" });
  // Already normalized errors pass through.
  assert.deepEqual(normalizeError({ code: "FLOOD_WAIT", seconds: 30 }), { code: "FLOOD_WAIT", seconds: 30 });
});
