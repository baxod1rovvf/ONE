// ONE — 2048. Loaded only when this game is opened from Retro games
// (games/panel.js); leaving the game unmounts it and stops everything it runs.
(function () {
  const { React2, IconButton, icons, loadGameRecords, saveGameRecord, retroSound, tetrisRandom, useActiveGame } = window.__oneGameKit;
  const { Trophy, Volume2, VolumeX } = icons;
  /* 2048 rules */
  // Slide tiles, merge equal pairs (each tile once per move), and a new 2 or 4
  // appears after every move that changed something. The state keeps a list of
  // tiles with ids, so the screen can slide each tile to its new square.
  const T48_SIZES = [3, 4, 5, 6];
  const T48_VECTORS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
  function t48Roll(s) {
    const [v, next] = tetrisRandom(s.rng);
    s.rng = next;
    return v;
  }
  function t48Cells(state) {
    const cells = Array.from({ length: state.size }, () => Array(state.size).fill(0));
    for (const t of state.tiles) cells[t.r][t.c] = t.v;
    return cells;
  }
  // A new 2 (or, one time in ten, a 4) on a random empty square.
  function t48Spawn(state) {
    const s = { ...state, tiles: [...state.tiles] };
    const taken = new Set(s.tiles.map((t) => t.r * s.size + t.c));
    const free = [];
    for (let i = 0; i < s.size * s.size; i++) if (!taken.has(i)) free.push(i);
    if (!free.length) return s;
    const at = free[Math.floor(t48Roll(s) * free.length)];
    const v = t48Roll(s) < 0.9 ? 2 : 4;
    s.tiles.push({ id: s.nextId, r: Math.floor(at / s.size), c: at % s.size, v, fresh: true });
    s.nextId += 1;
    return s;
  }
  function t48FromCells(cells, seed) {
    const tiles = [];
    let id = 1;
    cells.forEach((row, r) => row.forEach((v, c) => v && tiles.push({ id: id++, r, c, v })));
    return { size: cells.length, tiles, score: 0, won: false, kept: false, over: false, undo: null, rng: seed | 0, nextId: id };
  }
  function t48New(size, seed) {
    let s = t48FromCells(Array.from({ length: size }, () => Array(size).fill(0)), seed);
    s = t48Spawn(s);
    return t48Spawn(s);
  }
  function t48CanMove(state) {
    const cells = t48Cells(state);
    const n = state.size;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (!cells[r][c]) return true;
        if (c + 1 < n && cells[r][c] === cells[r][c + 1]) return true;
        if (r + 1 < n && cells[r][c] === cells[r + 1][c]) return true;
      }
    return false;
  }
  function t48Move(state, dir) {
    const n = state.size;
    const [dr, dc] = T48_VECTORS[dir];
    const at = new Map(state.tiles.map((t) => [t.r * n + t.c, t]));
    const tiles = [];
    const merges = [];
    let gained = 0;
    let moved = false;
    for (let line = 0; line < n; line++) {
      // Squares of this line, starting at the edge the tiles move towards.
      const squares = [];
      for (let k = 0; k < n; k++) {
        const k2 = dr + dc > 0 ? n - 1 - k : k;
        squares.push(dr ? [k2, line] : [line, k2]);
      }
      const out = [];
      for (const [r, c] of squares) {
        const t = at.get(r * n + c);
        if (!t) continue;
        const last = out[out.length - 1];
        if (last && !last.merged && last.v === t.v) {
          last.v *= 2;
          last.merged = true;
          gained += last.v;
          moved = true;
        } else out.push({ id: t.id, v: t.v, from: [r, c], merged: false });
      }
      out.forEach((t, k) => {
        const [r, c] = squares[k];
        if (r !== t.from[0] || c !== t.from[1]) moved = true;
        tiles.push({ id: t.id, r, c, v: t.v, merged: t.merged });
        if (t.merged) merges.push({ r, c, v: t.v });
      });
    }
    if (!moved) return { state, moved: false, merges: [], gained: 0 };
    let next = { ...state, tiles, score: state.score + gained, undo: { tiles: state.tiles, score: state.score } };
    if (!next.won && tiles.some((t) => t.v >= 2048)) next.won = true;
    next = t48Spawn(next);
    next.over = !t48CanMove(next);
    return { state: next, moved: true, merges, gained };
  }
  function t48Undo(state) {
    if (!state.undo) return state;
    return { ...state, tiles: state.undo.tiles, score: state.undo.score, over: false, undo: null };
  }
  const t48Keep = (state) => ({ ...state, kept: true });
  const t48ShowWin = (state) => state.won && !state.kept;
  window.__one2048 = { T48_SIZES, t48New, t48FromCells, t48Cells, t48Move, t48CanMove, t48Spawn, t48Undo, t48Keep, t48ShowWin };

  /* 2048 on screen */
  const T48_KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down" };
  const recordKey = (size) => `2048-${size}`;
  const bestOf = (size) => (loadGameRecords()[recordKey(size)] || {}).best || 0;
  function freshGame(size) {
    const cells = window.__one2048Cells;
    if (cells && cells.length === size) return t48FromCells(cells, window.__one2048Seed ?? 1);
    return t48New(size, window.__one2048Seed ?? Date.now());
  }
  function Game2048({ escapeRef }) {
    useActiveGame("2048");
    const [size, setSize] = React2.useState(4);
    const [game, setGame] = React2.useState(() => freshGame(4));
    const [status, setStatus] = React2.useState("ready");
    const [best, setBest] = React2.useState(() => bestOf(4));
    const [record, setRecord] = React2.useState(false);
    const [gain, setGain] = React2.useState(null);
    const [soundOn, setSoundOn] = React2.useState(retroSound.on);
    const ref = React2.useRef({ game, status, size });
    ref.current = { game, status, size };
    const playRef = React2.useRef(null);
    const startedBest = React2.useRef(best);
    const start = React2.useCallback(() => {
      const s = ref.current.size;
      const g = freshGame(s);
      startedBest.current = bestOf(s);
      setGame(g);
      setBest(bestOf(s));
      setRecord(false);
      setGain(null);
      setStatus(t48CanMove(g) ? "playing" : "over");
      retroSound.start();
    }, []);
    const chooseSize = (s) => {
      setSize(s);
      ref.current.size = s;
      setGame(freshGame(s));
      setBest(bestOf(s));
    };
    const move = React2.useCallback((dir) => {
      const { game: g, status: st, size: s } = ref.current;
      if (st !== "playing") return;
      const out = t48Move(g, dir);
      if (!out.moved) return;
      setGame(out.state);
      if (out.gained) {
        setGain({ n: out.gained, at: out.state.nextId });
        retroSound.g48Merge(Math.max(...out.merges.map((m) => m.v)));
      } else retroSound.g48Move();
      // The best score follows the score as it grows.
      if (out.state.score > bestOf(s)) {
        saveGameRecord(recordKey(s), out.state.score);
        setBest(out.state.score);
      }
      if (t48ShowWin(out.state)) {
        setStatus("won");
        retroSound.g48Win();
      } else if (out.state.over) {
        setStatus("over");
        retroSound.over();
        if (out.state.score > startedBest.current) setRecord(true);
      }
    }, []);
    const undo = React2.useCallback(() => {
      const { game: g, status: st } = ref.current;
      if (!g.undo || (st !== "playing" && st !== "over")) return;
      setGame(t48Undo(g));
      setStatus("playing");
    }, []);
    const keepGoing = () => {
      const g = t48Keep(ref.current.game);
      setGame(g);
      // The winning move may also have filled the board for good.
      if (g.over) {
        setStatus("over");
        retroSound.over();
      } else setStatus("playing");
    };
    const togglePause = React2.useCallback(() => setStatus((st) => (st === "playing" ? "paused" : st === "paused" ? "playing" : st)), []);
    const toggleSound = React2.useCallback(() => {
      setSoundOn((on) => {
        retroSound.setOn(!on);
        return !on;
      });
    }, []);
    React2.useEffect(() => {
      if (!escapeRef) return;
      escapeRef.current = () => {
        if (ref.current.status !== "playing") return false;
        togglePause();
        return true;
      };
      return () => {
        escapeRef.current = null;
      };
    }, [escapeRef, togglePause]);
    React2.useEffect(() => {
      if (status === "over" || status === "won" || status === "ready") window.requestAnimationFrame(() => playRef.current && playRef.current.focus());
    }, [status]);
    React2.useEffect(() => {
      const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const dir = T48_KEYS[e.key];
        if (dir) {
          if (ref.current.status === "playing") e.preventDefault();
          move(dir);
        } else if (e.key === "u" || e.key === "U") {
          e.preventDefault();
          undo();
        } else if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          togglePause();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleSound();
        }
      };
      const onHide = () => document.hidden && ref.current.status === "playing" && setStatus("paused");
      window.addEventListener("keydown", onKey);
      document.addEventListener("visibilitychange", onHide);
      return () => {
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("visibilitychange", onHide);
      };
    }, [move, undo, togglePause, toggleSound]);
    // Swipes on the board.
    const swipe = React2.useRef(null);
    const onPointerDown = (e) => (swipe.current = { x: e.clientX, y: e.clientY });
    const onPointerUp = (e) => {
      const from = swipe.current;
      swipe.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    };
    const n = game.size;
    const message =
      status === "ready"
        ? { title: "2048", sub: "Slide the tiles. Equal tiles merge. Reach 2048!", action: "Play", onClick: start, sizes: true }
        : status === "paused"
        ? { title: "Paused", sub: "Take a breath.", action: "Resume", onClick: togglePause }
        : status === "won"
        ? { title: "You win!", sub: "You made 2048.", action: "Keep going", onClick: keepGoing, extra: { label: "New game", onClick: start } }
        : status === "over"
        ? { title: "Game over", sub: `${game.score} ${game.score === 1 ? "point" : "points"}`, action: "Play again", onClick: start, extra: game.undo ? { label: "Undo", onClick: undo } : null }
        : null;
    return React2.createElement(
      "div",
      { className: "g48", "data-status": status, style: { "--n": n } },
      React2.createElement(
        "div",
        { className: "g48-hud" },
        React2.createElement(
          "div",
          { className: "snake-stat g48-stat" },
          React2.createElement("span", { className: "snake-stat__label" }, "Score"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "g48-score" }, game.score),
          gain && React2.createElement("span", { key: gain.at, className: "g48-gain", "aria-hidden": true }, `+${gain.n}`)
        ),
        React2.createElement(
          "div",
          { className: "snake-stat snake-stat--best g48-stat" },
          React2.createElement("span", { className: "snake-stat__label" }, React2.createElement(Trophy, { size: 14, "aria-hidden": true }), "Best"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "g48-best" }, best)
        ),
        React2.createElement("button", { type: "button", className: "snake-pause", onClick: undo, disabled: !game.undo || status === "ready" || status === "paused" || status === "won" }, "Undo"),
        React2.createElement(
          IconButton,
          { label: "Game sounds", className: "snake-mute", "aria-pressed": soundOn ? "true" : "false", onClick: toggleSound },
          React2.createElement(soundOn ? Volume2 : VolumeX, { size: 20 })
        )
      ),
      React2.createElement(
        "div",
        { className: "g48-board", "data-size": n, role: "grid", "aria-label": `2048 board, ${n} by ${n}`, onPointerDown, onPointerUp, onPointerCancel: () => (swipe.current = null) },
        Array.from({ length: n * n }, (_, i) => React2.createElement("div", { key: `bg${i}`, className: "g48-cell", "aria-hidden": true })),
        game.tiles.map((t) =>
          React2.createElement(
            "div",
            {
              key: t.id,
              className: "g48-tile",
              "data-value": t.v,
              "data-r": t.r,
              "data-c": t.c,
              "data-big": t.v > 2048 ? "true" : void 0,
              "data-merged": t.merged ? "true" : void 0,
              "data-fresh": t.fresh ? "true" : void 0,
              "data-digits": String(t.v).length,
              style: { "--r": t.r, "--c": t.c }
            },
            React2.createElement("span", { key: t.merged ? `m${t.v}` : "v", className: "g48-tile__v" }, t.v)
          )
        ),
        message &&
          React2.createElement(
            "div",
            { className: "snake-message g48-message", role: "status" },
            status === "over" && record && React2.createElement("span", { className: "snake-record" }, "🏆 New record!"),
            React2.createElement("h3", { className: "snake-message__title" }, message.title),
            React2.createElement("p", { className: "snake-message__sub" }, message.sub),
            message.sizes &&
              React2.createElement(
                "div",
                { className: "g48-sizes", role: "radiogroup", "aria-label": "Board size" },
                T48_SIZES.map((s) =>
                  React2.createElement("button", { key: s, type: "button", role: "radio", className: "g48-size", "aria-checked": size === s ? "true" : "false", onClick: () => chooseSize(s) }, `${s}×${s}`)
                )
              ),
            React2.createElement("button", { ref: playRef, type: "button", className: "snake-play", onClick: message.onClick, "data-autofocus": true }, message.action),
            message.extra && React2.createElement("button", { type: "button", className: "snake-pause g48-extra", onClick: message.extra.onClick }, message.extra.label)
          )
      ),
      React2.createElement("p", { className: "snake-hint" }, "Arrow keys or WASD to slide · swipe on touch screens · U undo · P pause · M sound")
    );
  }
  window.__oneGameModules = window.__oneGameModules || {};
  window.__oneGameModules["2048"] = { Component: Game2048 };
})();
