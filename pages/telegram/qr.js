// ONE — a small QR code encoder for the Telegram login link: byte mode,
// error correction level M, versions 1 to 10 (up to 213 bytes). It works
// offline and needs no library. encodeQR(text) returns the modules as rows
// of booleans (true = dark). Browser: window.__oneQR; Node: module.exports.
(function (root) {
  "use strict";
  // Per version (index = version): error correction codewords per block, and
  // the blocks as [count, data codewords] for level M.
  const EC = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  // ---------- Reed-Solomon over GF(256) ----------
  const EXP = new Array(512);
  const LOG = new Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function generator(degree) {
    let g = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(g.length + 1).fill(0);
      g.forEach((c, j) => {
        next[j] ^= c;
        next[j + 1] ^= mul(c, EXP[i]);
      });
      g = next;
    }
    return g;
  }
  function remainder(data, degree) {
    const g = generator(degree);
    const r = new Array(degree).fill(0);
    for (const d of data) {
      const f = d ^ r.shift();
      r.push(0);
      for (let i = 0; i < degree; i++) r[i] ^= mul(g[i + 1], f);
    }
    return r;
  }

  // ---------- Codewords ----------
  function dataCapacity(v) {
    return EC[v][1].reduce((n, [count, size]) => n + count * size, 0);
  }
  function codewords(bytes, v) {
    const bits = [];
    const put = (value, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    put(4, 4); // byte mode
    put(bytes.length, v < 10 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    const cap = dataCapacity(v) * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
    for (let pad = 0xec; data.length < cap / 8; pad ^= 0xec ^ 0x11) data.push(pad);
    // Split into blocks, add error correction, interleave.
    const [ecLen, groups] = EC[v];
    const blocks = [];
    let at = 0;
    groups.forEach(([count, size]) => {
      for (let i = 0; i < count; i++) {
        const d = data.slice(at, at + size);
        at += size;
        blocks.push({ d, e: remainder(d, ecLen) });
      }
    });
    const out = [];
    const longest = Math.max(...blocks.map((b) => b.d.length));
    for (let i = 0; i < longest; i++) blocks.forEach((b) => i < b.d.length && out.push(b.d[i]));
    for (let i = 0; i < ecLen; i++) blocks.forEach((b) => out.push(b.e[i]));
    return out;
  }

  // ---------- The matrix ----------
  function bch(value, poly, polyBits) {
    let v = value << (polyBits - 1);
    for (let i = 31 - Math.clz32(v); i >= polyBits - 1; i--) if ((v >>> i) & 1) v ^= poly << (i - polyBits + 1);
    return (value << (polyBits - 1)) | v;
  }
  function build(v, words, mask) {
    const n = v * 4 + 17;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, dark) => {
      m[y][x] = dark;
      fixed[y][x] = true;
    };
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= n || y >= n) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          set(x, y, d !== 2 && d !== 4);
        }
    };
    finder(3, 3);
    finder(n - 4, 3);
    finder(3, n - 4);
    for (let i = 8; i < n - 8; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    const al = ALIGN[v];
    al.forEach((cy, i) =>
      al.forEach((cx, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      })
    );
    // Format bits: level M (00) and the mask.
    const format = bch(mask, 0x537, 11) ^ 0x5412;
    const fbit = (i) => ((format >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, fbit(i));
    set(8, 7, fbit(6));
    set(8, 8, fbit(7));
    set(7, 8, fbit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, fbit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, fbit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, fbit(i));
    set(8, n - 8, true);
    if (v >= 7) {
      const info = bch(v, 0x1f25, 13);
      for (let i = 0; i < 18; i++) {
        const dark = ((info >>> i) & 1) === 1;
        const a = n - 11 + (i % 3);
        const b = Math.floor(i / 3);
        set(a, b, dark);
        set(b, a, dark);
      }
    }
    // Data, in the zigzag order, masked.
    const masks = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      (x) => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
      (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    ];
    let bit = 0;
    const total = words.length * 8;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let k = 0; k < n; k++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? n - 1 - k : k;
          if (fixed[y][x]) continue;
          let dark = bit < total ? ((words[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1 : false;
          bit++;
          if (masks[mask](x, y)) dark = !dark;
          m[y][x] = dark;
        }
      }
    }
    return m;
  }
  // The usual penalty score: lower is easier for readers.
  function penalty(m) {
    const n = m.length;
    let score = 0;
    const lines = [];
    for (let i = 0; i < n; i++) {
      lines.push(m[i]);
      lines.push(m.map((row) => row[i]));
    }
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      const s = line.map((d) => (d ? 1 : 0)).join("");
      for (const p of ["10111010000", "00001011101"]) for (let i = s.indexOf(p); i >= 0; i = s.indexOf(p, i + 1)) score += 40;
    }
    let dark = 0;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        if (m[y][x]) dark++;
        if (y < n - 1 && x < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
      }
    score += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
    return score;
  }

  function encodeQR(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let v = 1;
    while (v <= 10 && bytes.length + (v < 10 ? 2 : 3) > dataCapacity(v)) v++;
    if (v > 10) throw new Error("Text too long for a QR code here.");
    const words = codewords(bytes, v);
    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const m = build(v, words, mask);
      const s = penalty(m);
      if (s < bestScore) {
        best = m;
        bestScore = s;
      }
    }
    return best;
  }

  const api = { encodeQR };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.__oneQR = api;
})(typeof window !== "undefined" ? window : globalThis);
