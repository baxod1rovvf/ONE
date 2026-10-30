// The QR encoder (pages/telegram/qr.js): what it draws must read back, with a
// real QR reader, as the text it was given.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const jsQR = require("jsqr");
const { encodeQR } = require("../pages/telegram/qr.js");

// The matrix as an RGBA image: 4 modules of quiet zone, 4 px per module.
function read(matrix) {
  const n = matrix.length;
  const scale = 4;
  const size = (n + 8) * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!matrix[y][x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
    }
  const r = jsQR(px, size, size);
  return r && r.data;
}

test("a Telegram login link reads back exactly", () => {
  const text = "tg://login?token=AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
  assert.equal(read(encodeQR(text)), text);
});

test("short and long texts pick a version that fits, up to version 10", () => {
  for (const len of [1, 14, 15, 30, 60, 62, 63, 84, 100, 150, 200, 213]) {
    const text = "x".repeat(len - 1) + "!";
    const m = encodeQR(text);
    assert.equal(read(m), text, `length ${len}`);
    assert.equal((m.length - 17) % 4, 0);
  }
  assert.equal(encodeQR("a").length, 21);
});

test("text that can't fit throws", () => {
  assert.throws(() => encodeQR("x".repeat(214)), /too long/);
});

test("non-ASCII text survives as UTF-8", () => {
  const text = "Salom, dunyo — ✓";
  assert.equal(read(encodeQR(text)), text);
});
