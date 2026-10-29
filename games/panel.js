// ONE — Retro games panel: the list of games, best scores and the shared
// game sounds. It loads in the background after ONE opens (loadGames in
// index.html). Each game lives in its own file (games/<file>.js and .css),
// loaded only when it is opened; only one game is ever mounted and running.
(function () {
  const kit = window.__oneKit;
  const React2 = kit.React;
  const reactDom = kit.ReactDOM;
  const { IconButton, FOCUSABLE } = kit;
  const { Trophy, X, ArrowLeft, Volume2, VolumeX } = kit.icons;
  /* ---------- Home: retro games ---------- */
  // Little games that open from the meadow. Best scores are kept per device.
  const GAMES_KEY = "one.games.v1";
  function loadGameRecords() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(GAMES_KEY) || "null");
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  }
  function saveGameRecord(game, best) {
    try {
      const all = loadGameRecords();
      all[game] = { ...all[game], best };
      window.localStorage.setItem(GAMES_KEY, JSON.stringify(all));
    } catch {
      // Storage blocked: the record lasts until the page closes.
    }
  }
  function useGameRecord(game) {
    const [best, setBest] = React2.useState(() => (loadGameRecords()[game] || {}).best || 0);
    const offer = React2.useCallback(
      (score) => {
        if (score <= best) return false;
        setBest(score);
        saveGameRecord(game, score);
        return true;
      },
      [game, best]
    );
    return [best, offer];
  }
  // Chiptune blips for the games: square and triangle waves, made on the spot.
  // Separate from the Sounds engine, so they play whether or not Sounds is on.
  // The on/off choice is kept per device next to the records.
  const RETRO_NOTES = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, C4: 261.63, G4: 392, E4: 329.63 };
  class RetroSound {
    constructor() {
      this.ctx = null;
      this.on = loadGameRecords().sound !== false;
      this.played = []; // the last few cues, for tests
    }
    setOn(on) {
      this.on = on;
      try {
        const all = loadGameRecords();
        all.sound = on;
        window.localStorage.setItem(GAMES_KEY, JSON.stringify(all));
      } catch {
        // Storage blocked: the choice lasts until the page closes.
      }
    }
    // [frequency, start, length, wave, volume]; a second frequency slides the pitch.
    play(cue, notes) {
      this.played = [...this.played.slice(-19), cue];
      if (!this.on) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        if (!this.ctx) {
          this.ctx = new AC();
          this.out = this.ctx.createGain();
          this.out.gain.value = 0.16;
          this.out.connect(this.ctx.destination);
        }
        if (this.ctx.state !== "running") this.ctx.resume();
        const t0 = this.ctx.currentTime + 0.01;
        for (const [f, at, len, wave = "square", vol = 1, slideTo] of notes) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = wave;
          o.frequency.setValueAtTime(f, t0 + at);
          if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + at + len);
          g.gain.setValueAtTime(0, t0 + at);
          g.gain.linearRampToValueAtTime(vol, t0 + at + 0.008);
          g.gain.setValueAtTime(vol, t0 + at + len * 0.6);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
          o.connect(g).connect(this.out);
          o.start(t0 + at);
          o.stop(t0 + at + len + 0.02);
        }
      } catch {
        // No sound on this device; the game plays on silently.
      }
    }
    start() {
      const { C5, E5, G5, C6 } = RETRO_NOTES;
      this.play("start", [[C5, 0, 0.09], [E5, 0.09, 0.09], [G5, 0.18, 0.09], [C6, 0.27, 0.16]]);
    }
    turn() {
      this.play("turn", [[220, 0, 0.03, "triangle", 0.5]]);
    }
    // Bigger fruit, brighter jingle.
    eat(points) {
      const { E5, G5, C6, E6, G6 } = RETRO_NOTES;
      const run = [E5, G5, C6, E6, G6].slice(0, Math.min(5, 1 + points));
      this.play("eat", run.map((f, i) => [f, i * 0.05, 0.07, "square", 0.8]));
    }
    pause() {
      this.play("pause", [[RETRO_NOTES.G5, 0, 0.07], [RETRO_NOTES.C5, 0.08, 0.1]]);
    }
    resume() {
      this.play("resume", [[RETRO_NOTES.C5, 0, 0.07], [RETRO_NOTES.G5, 0.08, 0.1]]);
    }
    over() {
      const { G4, E4, C4 } = RETRO_NOTES;
      this.play("over", [[180, 0, 0.12, "sawtooth", 0.7, 90], [G4, 0.18, 0.16, "square", 0.8], [E4, 0.36, 0.16, "square", 0.8], [C4, 0.54, 0.4, "square", 0.8, 120]]);
    }
    record() {
      const { C5, E5, G5, C6, E6, G6 } = RETRO_NOTES;
      this.play("record", [[C5, 0, 0.1], [E5, 0.1, 0.1], [G5, 0.2, 0.1], [C6, 0.3, 0.12], [G5, 0.44, 0.08], [C6, 0.52, 0.12], [E6, 0.66, 0.12], [G6, 0.8, 0.35, "triangle", 1]]);
    }
    // Tetris
    tMove() {
      this.play("tmove", [[330, 0, 0.025, "triangle", 0.45]]);
    }
    tRotate() {
      this.play("trotate", [[RETRO_NOTES.A5, 0, 0.04, "square", 0.6, 1100]]);
    }
    tLock() {
      this.play("tlock", [[140, 0, 0.09, "triangle", 1, 70]]);
    }
    // One note more for each extra line.
    tLines(n) {
      const { C5, E5, G5, C6 } = RETRO_NOTES;
      this.play("tlines", [C5, E5, G5, C6].slice(0, n + 1).map((f, i) => [f, i * 0.06, 0.08, "square", 0.8]));
    }
    tTetris() {
      const { C5, E5, G5, C6, E6, G6 } = RETRO_NOTES;
      this.play("ttetris", [[C5, 0, 0.07], [E5, 0.07, 0.07], [G5, 0.14, 0.07], [C6, 0.21, 0.07], [E6, 0.28, 0.07], [G6, 0.35, 0.3, "triangle", 1], [C6, 0.35, 0.3, "square", 0.5]]);
    }
    tLevel() {
      const { G5, C6, E6, G6 } = RETRO_NOTES;
      this.play("tlevel", [[G5, 0, 0.06], [C6, 0.06, 0.06], [E6, 0.12, 0.06], [G6, 0.18, 0.14]]);
    }
    // 2048
    g48Move() {
      this.play("g48move", [[300, 0, 0.03, "triangle", 0.4]]);
    }
    // Bigger merges sound higher.
    g48Merge(value) {
      const step = Math.min(10, Math.log2(value) - 1);
      this.play("g48merge", [[RETRO_NOTES.C5 * Math.pow(2, step / 6), 0, 0.08, "square", 0.6], [RETRO_NOTES.C5 * Math.pow(2, (step + 4) / 6), 0.06, 0.08, "square", 0.5]]);
    }
    g48Win() {
      this.record();
    }
    // Minesweeper
    msOpen() {
      this.play("msopen", [[600, 0, 0.03, "triangle", 0.4]]);
    }
    msFlag() {
      this.play("msflag", [[RETRO_NOTES.E5, 0, 0.05, "square", 0.5], [RETRO_NOTES.A5, 0.05, 0.06, "square", 0.5]]);
    }
    msBoom() {
      this.bBoom();
      this.played = [...this.played.slice(-19), "msboom"];
    }
    msWin() {
      this.record();
    }
    // Breakout
    bPaddle() {
      this.play("bpaddle", [[220, 0, 0.07, "square", 0.7, 160]]);
    }
    // Higher for bricks nearer the top.
    bHit(row) {
      this.play("bhit", [[RETRO_NOTES.C5 * Math.pow(2, (11 - Math.min(11, row)) / 12), 0, 0.05, "square", 0.6]]);
    }
    bSteel() {
      this.play("bsteel", [[1800, 0, 0.05, "square", 0.35], [2400, 0.01, 0.07, "triangle", 0.3]]);
    }
    bBoom() {
      this.played = [...this.played.slice(-19), "bboom"];
      if (!this.on) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.play("bboom-tone", [[120, 0, 0.25, "sawtooth", 0.5, 40]]);
        const ctx = this.ctx;
        const len = Math.floor(ctx.sampleRate * 0.3);
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 900;
        src.buffer = buffer;
        src.connect(filter).connect(this.out);
        src.start();
      } catch {
        // No sound on this device.
      }
    }
    bCatch() {
      const { C6, E6, G6 } = RETRO_NOTES;
      this.play("bcatch", [[C6, 0, 0.06, "triangle", 0.8], [E6, 0.06, 0.06, "triangle", 0.8], [G6, 0.12, 0.12, "triangle", 0.8]]);
    }
    bLost() {
      this.play("blost", [[RETRO_NOTES.G5, 0, 0.5, "square", 0.6, 180]]);
    }
    bCleared() {
      const { C5, E5, G5, C6, E6, G6 } = RETRO_NOTES;
      this.play("bcleared", [[C5, 0, 0.08], [E5, 0.08, 0.08], [G5, 0.16, 0.08], [C6, 0.24, 0.12], [E6, 0.36, 0.12], [G6, 0.48, 0.3, "triangle", 1]]);
    }
  }
  const retroSound = new RetroSound();
  window.__oneRetroSound = retroSound;
  // mulberry32: a small seeded generator, so a seed replays the same game.
  function tetrisRandom(rng) {
    const next = (rng + 0x6d2b79f5) | 0;
    let t = Math.imul(next ^ (next >>> 15), next | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
  }
  // The game that is mounted right now (a test hook; cleared when it closes).
  function useActiveGame(id) {
    React2.useEffect(() => {
      window.__oneActiveGame = id;
      return () => {
        if (window.__oneActiveGame === id) delete window.__oneActiveGame;
      };
    }, [id]);
  }
  window.__oneGameKit = { React2, reactDom, IconButton, FOCUSABLE, icons: kit.icons, useGameRecord, loadGameRecords, saveGameRecord, retroSound, RETRO_NOTES, tetrisRandom, useActiveGame };
  window.__oneGameModules = window.__oneGameModules || {};
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  // Metadata only; each game's code is in games/<file>.js. `best` says what
  // the card shows from the saved records.
  const GAMES = [
    { id: "snake", title: "Snake", blurb: "Eat fruit, grow long, mind the walls.", emoji: "🐍", file: "snake" },
    { id: "tetris", title: "Tetris", blurb: "Stack the blocks, clear the lines.", emoji: "🧱", file: "tetris" },
    { id: "breakout", title: "Breakout", blurb: "Break every brick, catch the power-ups.", emoji: "🏓", file: "breakout" },
    {
      id: "2048",
      title: "2048",
      blurb: "Slide, merge, reach 2048.",
      emoji: "🔢",
      file: "2048",
      best: (records) => `Best ${Math.max(0, ...[3, 4, 5, 6].map((n) => (records[`2048-${n}`] || {}).best || 0))}`
    },
    {
      id: "minesweeper",
      title: "Minesweeper",
      blurb: "Clear the field without a boom.",
      emoji: "💣",
      file: "minesweeper",
      best: (records, clock) => {
        const t = (records["mines-easy"] || {}).best;
        return t ? `Best ${clock(t)}` : "Best —";
      }
    }
  ];
  const bestText = (g, records) => (g.best ? g.best(records, fmtClock) : `Best ${(records[g.id] || {}).best || 0}`);
  // Loads a game's script and styles once; a failure is forgotten so the next
  // try starts fresh.
  const loading = new Map();
  function loadGame(id) {
    const g = GAMES.find((x) => x.id === id);
    if (!g) return Promise.reject(new Error("unknown game"));
    if (window.__oneGameModules[id]) return Promise.resolve(window.__oneGameModules[id]);
    if (loading.has(id)) return loading.get(id);
    const tags = [];
    const add = (el) =>
      new Promise((resolve, reject) => {
        el.onload = resolve;
        el.onerror = reject;
        tags.push(el);
        document.head.appendChild(el);
      });
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `games/${g.file}.css`;
    const js = document.createElement("script");
    js.src = `games/${g.file}.js`;
    const p = Promise.all([add(css), add(js)])
      .then(() => {
        if (!window.__oneGameModules[id]) throw new Error("The game file didn't start.");
        return window.__oneGameModules[id];
      })
      .catch((err) => {
        loading.delete(id);
        for (const el of tags) el.remove();
        throw err;
      });
    loading.set(id, p);
    return p;
  }
  function GamesPanel({ onClose }) {
    const [gameId, setGameId] = React2.useState(null);
    const [mod, setMod] = React2.useState(null);
    const [waiting, setWaiting] = React2.useState(null);
    const [failed, setFailed] = React2.useState(null);
    const pending = React2.useRef(null);
    const ref = React2.useRef(null);
    const records = React2.useMemo(loadGameRecords, [gameId]);
    const game = mod && GAMES.find((g) => g.id === gameId);
    // Opens a game once its file is here. Only the latest choice wins, so a
    // slow file can't open over a game chosen after it.
    const openGame = (id) => {
      pending.current = id;
      setFailed(null);
      const spinner = window.setTimeout(() => pending.current === id && setWaiting(id), 120);
      loadGame(id)
        .then((m) => {
          if (pending.current !== id) return;
          setMod(m);
          setGameId(id);
        })
        .catch(() => pending.current === id && setFailed(id))
        .finally(() => {
          window.clearTimeout(spinner);
          setWaiting((w) => (w === id ? null : w));
        });
    };
    const backToList = () => {
      pending.current = null;
      setGameId(null);
      setMod(null);
    };
    React2.useEffect(() => {
      const opener = document.activeElement;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
        if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus();
      };
    }, []);
    // Focus the first thing on each screen: a game card, or the game's Play button.
    React2.useEffect(() => {
      const t = window.setTimeout(() => {
        const el = ref.current && (ref.current.querySelector("[data-autofocus]") || ref.current.querySelector(FOCUSABLE));
        if (el) el.focus();
      }, 20);
      return () => window.clearTimeout(t);
    }, [gameId]);
    // Esc steps back: from a game to the list, then closes. It listens on the
    // window, so it works even while focus is between screens.
    const backRef = React2.useRef(null);
    // An open game may take Esc first (Tetris pauses with it).
    const escapeRef = React2.useRef(null);
    backRef.current = () => {
      if (game && escapeRef.current && escapeRef.current()) return;
      if (game) backToList();
      else onClose();
    };
    React2.useEffect(() => {
      const onKey = (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        backRef.current();
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, []);
    const onKeyDown = (e) => {
      if (e.key === "Tab" && ref.current) {
        const items = Array.from(ref.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    return reactDom.createPortal(
      React2.createElement(
        "div",
        {
          className: "overlay games-overlay",
          onMouseDown: (e) => {
            if (e.target === e.currentTarget) onClose();
          }
        },
        React2.createElement(
          "div",
          { ref, className: "games", role: "dialog", "aria-modal": "true", "aria-label": game ? game.title : "Retro games", onKeyDown },
          React2.createElement(
            "div",
            { className: "games__head" },
            game && React2.createElement(IconButton, { label: "All games", onClick: backToList }, React2.createElement(ArrowLeft, { size: 18 })),
            React2.createElement("h2", { className: "games__title" }, game ? game.title : "Retro games"),
            React2.createElement(IconButton, { label: "Close games", className: "games__close", onClick: onClose }, React2.createElement(X, { size: 18 }))
          ),
          game
            ? React2.createElement(mod.Component, { key: game.id, escapeRef })
            : React2.createElement(
                "div",
                { className: "games__list" },
                GAMES.map((g) =>
                  React2.createElement(
                    "button",
                    {
                      key: g.id,
                      type: "button",
                      className: "game-card",
                      "aria-busy": waiting === g.id ? "true" : void 0,
                      "data-loading": waiting === g.id ? "true" : void 0,
                      onClick: () => openGame(g.id)
                    },
                    React2.createElement("span", { className: "game-card__art", "aria-hidden": true }, g.emoji),
                    React2.createElement("span", { className: "game-card__title" }, g.title),
                    React2.createElement("span", { className: "game-card__blurb" }, g.blurb),
                    React2.createElement("span", { className: "game-card__best" }, React2.createElement(Trophy, { size: 14, "aria-hidden": true }), bestText(g, records))
                  )
                ),
                failed && React2.createElement("p", { className: "games__error", role: "alert" }, "Couldn't open this game. Check your connection and try again."),
                React2.createElement("p", { className: "games__soon" }, "More retro games are on the way.")
              )
        )
      ),
      document.body
    );
  }
  window.__oneGames = { GamesPanel, loadGame };
})();
