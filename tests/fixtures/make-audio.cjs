// Builds the small audio files the sound tests use (into fixtures/audio/,
// which git ignores). MP3s are encoded with lamejs and given hand-written
// ID3v2.3 tags, so the app's tag reader has something real to read.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const OUT = path.join(__dirname, "audio");
const RATE = 44100;

function tone(seconds, freq) {
  const n = Math.round(seconds * RATE);
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) s[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / RATE) * 0.3 * 32767);
  return s;
}

function wav(samples) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

let lamejs;
function mp3(samples) {
  if (!lamejs) {
    // lamejs 1.2.1's Node entry point is broken; its single-file build works.
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(require.resolve("lamejs/lame.all.js"), "utf8") + ";this.lamejs=lamejs;", ctx);
    lamejs = ctx.lamejs;
  }
  const enc = new lamejs.Mp3Encoder(1, RATE, 96);
  const parts = [];
  for (let i = 0; i < samples.length; i += 1152) parts.push(Buffer.from(enc.encodeBuffer(samples.subarray(i, i + 1152))));
  parts.push(Buffer.from(enc.flush()));
  return Buffer.concat(parts);
}

// 1×1 green PNG for the cover.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function frame(id, body) {
  const h = Buffer.alloc(10);
  h.write(id, 0);
  h.writeUInt32BE(body.length, 4);
  return Buffer.concat([h, body]);
}
const text = (id, value) => frame(id, Buffer.concat([Buffer.from([0]), Buffer.from(value, "latin1")]));
function syncsafe(n) {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}
function id3({ title, artist, album, track }) {
  const apic = frame("APIC", Buffer.concat([Buffer.from([0]), Buffer.from("image/png\0", "latin1"), Buffer.from([3, 0]), PNG]));
  const frames = Buffer.concat([text("TIT2", title), text("TPE1", artist), text("TALB", album), text("TRCK", String(track)), apic]);
  return Buffer.concat([Buffer.from("ID3"), Buffer.from([3, 0, 0]), syncsafe(frames.length), frames]);
}

fs.mkdirSync(path.join(OUT, "album"), { recursive: true });
fs.writeFileSync(path.join(OUT, "tone.wav"), wav(tone(2, 440)));
fs.writeFileSync(path.join(OUT, "loop.wav"), wav(tone(4, 220)));
fs.writeFileSync(path.join(OUT, "album/01.mp3"), Buffer.concat([id3({ title: "First Song", artist: "Test Artist", album: "Test Album", track: 1 }), mp3(tone(3, 330))]));
fs.writeFileSync(path.join(OUT, "album/02.mp3"), Buffer.concat([id3({ title: "Second Song", artist: "Test Artist", album: "Test Album", track: 2 }), mp3(tone(3, 392))]));
fs.writeFileSync(path.join(OUT, "untagged.mp3"), mp3(tone(2, 523)));
fs.writeFileSync(path.join(OUT, "not-audio.txt"), "just some notes\n");
fs.writeFileSync(path.join(OUT, "broken.mp3"), Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 7919) % 251)));
console.log("audio fixtures written to", OUT);
