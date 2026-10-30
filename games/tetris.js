// ONE — Tetris. Loaded only when this game is opened from Retro games
// (games/panel.js); leaving the game unmounts it and stops everything it runs.
(function () {
  const { React2, reactDom, IconButton, FOCUSABLE, icons, useGameRecord, loadGameRecords, retroSound, RETRO_NOTES, tetrisRandom, useActiveGame } = window.__oneGameKit;
  const { Trophy, X, ArrowLeft, Volume2, VolumeX } = icons;
  /* Tetris rules */
  // Classic Tetris on a 10×18 field. Like Snake, the rules are plain functions
  // of the state: each takes a state and returns a new one, and the component
  // only runs the timers and draws. field[y][x] is null or a shape id; y = 0
  // is the top row, and squares above it or past the walls count as blocked.
  const TETRIS_W = 10;
  const TETRIS_H = 18;
  // Spawn orientation, flat side down, inside a box of `box` squares.
  const TETRIS_SHAPES = {
    I: { color: "white", box: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    O: { color: "yellow", box: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    T: { color: "pink", box: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    S: { color: "green", box: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    Z: { color: "red", box: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
    J: { color: "blue", box: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { color: "orange", box: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }
  };
  const TETRIS_IDS = Object.keys(TETRIS_SHAPES);
  // Nudges tried, in order, when a plain turn doesn't fit. I may also move
  // down one, so it can stand up right after it spawns on the top row.
  const TETRIS_KICKS = [[-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];
  const TETRIS_I_KICKS = [...TETRIS_KICKS, [0, -2], [0, 1]];
  function tetrisCells({ shape, rot, x, y }) {
    const { box, cells } = TETRIS_SHAPES[shape];
    return cells.map(([cx, cy]) => {
      for (let i = 0; i < rot; i++) [cx, cy] = [box - 1 - cy, cx];
      return [x + cx, y + cy];
    });
  }
  function tetrisFits(field, piece) {
    return tetrisCells(piece).every(([x, y]) => x >= 0 && x < TETRIS_W && y >= 0 && y < TETRIS_H && !field[y][x]);
  }
  function tetrisSpawnPiece(shape) {
    return { shape, rot: 0, x: shape === "O" ? 4 : 3, y: shape === "I" ? -1 : 0 };
  }
  // Takes the next shape from the bag, shuffling a fresh bag of all 7 when it runs out.
  function tetrisDraw(bag, rng) {
    if (!bag.length) {
      bag = [...TETRIS_IDS];
      for (let i = bag.length - 1; i > 0; i--) {
        let r;
        [r, rng] = tetrisRandom(rng);
        const j = Math.floor(r * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return { shape: bag[0], bag: bag.slice(1), rng };
  }
  function tetrisNew(seed) {
    const first = tetrisDraw([], seed | 0);
    const second = tetrisDraw(first.bag, first.rng);
    return {
      field: Array.from({ length: TETRIS_H }, () => Array(TETRIS_W).fill(null)),
      piece: tetrisSpawnPiece(first.shape),
      next: second.shape,
      bag: second.bag,
      rng: second.rng,
      score: 0,
      lines: 0,
      level: 1,
      status: "ready",
      clearing: [],
      lockMoves: 0,
      grounded: false,
      last: null
    };
  }
  // The next piece comes in and a new one is drawn for the preview.
  function tetrisDeal(state) {
    const drawn = tetrisDraw(state.bag, state.rng);
    return { ...state, piece: tetrisSpawnPiece(state.next), next: drawn.shape, bag: drawn.bag, rng: drawn.rng, lockMoves: 0, grounded: false };
  }
  // Input only counts while a piece is in play (not during a line-clear flash).
  function tetrisLive(state) {
    return state.status === "playing" && !state.clearing.length;
  }
  function tetrisPlace(state, piece) {
    return { ...state, piece, lockMoves: state.grounded ? state.lockMoves + 1 : state.lockMoves };
  }
  function tetrisMove(state, dx) {
    if (!tetrisLive(state)) return state;
    const piece = { ...state.piece, x: state.piece.x + dx };
    return tetrisFits(state.field, piece) ? tetrisPlace(state, piece) : state;
  }
  function tetrisRotate(state, dir) {
    if (!tetrisLive(state) || state.piece.shape === "O") return state;
    const turned = { ...state.piece, rot: (state.piece.rot + (dir > 0 ? 1 : 3)) % 4 };
    for (const [dx, dy] of [[0, 0], ...(turned.shape === "I" ? TETRIS_I_KICKS : TETRIS_KICKS)]) {
      const piece = { ...turned, x: turned.x + dx, y: turned.y + dy };
      if (tetrisFits(state.field, piece)) return tetrisPlace(state, piece);
    }
    return state;
  }
  // Where the piece would land: the same piece at its lowest free row.
  function tetrisGhost(state) {
    let piece = state.piece;
    while (tetrisFits(state.field, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };
    return piece;
  }
  const TETRIS_POINTS = [0, 100, 300, 500, 800];
  // Milliseconds per row: 800 at level 1, 70 less each level, never under 80.
  function tetrisGravity(level) {
    return Math.max(80, 800 - (level - 1) * 70);
  }
  // Deals the next piece; if it doesn't fit, the game is over.
  function tetrisSpawn(state) {
    const dealt = tetrisDeal(state);
    return tetrisFits(dealt.field, dealt.piece) ? dealt : { ...dealt, status: "over" };
  }
  // One row down. A piece that can't fall any further is "grounded" the
  // moment it lands; the component then runs the lock delay.
  function tetrisTick(state) {
    if (!tetrisLive(state)) return state;
    const piece = { ...state.piece, y: state.piece.y + 1 };
    if (tetrisFits(state.field, piece)) return { ...state, piece, grounded: !tetrisFits(state.field, { ...piece, y: piece.y + 1 }) };
    return state.grounded ? state : { ...state, grounded: true };
  }
  function tetrisSoftDrop(state) {
    const next = tetrisTick(state);
    return next !== state && next.piece !== state.piece ? { ...next, score: next.score + 1 } : next;
  }
  function tetrisHardDrop(state) {
    if (!tetrisLive(state)) return state;
    const piece = tetrisGhost(state);
    return tetrisLock({ ...state, piece, score: state.score + 2 * (piece.y - state.piece.y) });
  }
  // The piece joins the field. Full rows start their flash (tetrisClear
  // removes them); with none, the next piece comes in at once.
  function tetrisLock(state) {
    if (!tetrisLive(state)) return state;
    const field = state.field.map((row) => [...row]);
    for (const [x, y] of tetrisCells(state.piece)) field[y][x] = state.piece.shape;
    const clearing = [];
    field.forEach((row, y) => row.every(Boolean) && clearing.push(y));
    const locked = { ...state, field, clearing, grounded: false, last: state.last };
    return clearing.length ? locked : tetrisSpawn(locked);
  }
  // Removes the flashing rows, drops everything above them, and scores the
  // clear at the level it was made on.
  function tetrisClear(state) {
    const n = state.clearing.length;
    if (!n || state.status !== "playing") return state;
    const gone = new Set(state.clearing);
    const kept = state.field.filter((_, y) => !gone.has(y));
    const field = [...Array.from({ length: n }, () => Array(TETRIS_W).fill(null)), ...kept];
    const points = TETRIS_POINTS[n] * state.level;
    const lines = state.lines + n;
    const level = 1 + Math.floor(lines / 10);
    const last = { lines: n, points, levelUp: level > state.level, at: ((state.last && state.last.at) || 0) + 1 };
    return tetrisSpawn({ ...state, field, clearing: [], score: state.score + points, lines, level, last });
  }
  window.__oneTetris = {
    TETRIS_W,
    TETRIS_H,
    TETRIS_SHAPES,
    TETRIS_POINTS,
    tetrisNew,
    tetrisRandom,
    tetrisCells,
    tetrisFits,
    tetrisDeal,
    tetrisSpawn,
    tetrisMove,
    tetrisRotate,
    tetrisGhost,
    tetrisGravity,
    tetrisTick,
    tetrisSoftDrop,
    tetrisHardDrop,
    tetrisLock,
    tetrisClear
  };
  /* Tetris on screen */
  const TETRIS_KEYS = {
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
    ArrowDown: "down",
    s: "down",
    S: "down",
    ArrowUp: "cw",
    w: "cw",
    W: "cw",
    x: "cw",
    X: "cw",
    z: "ccw",
    Z: "ccw"
  };
  // Held moves repeat like the arcade: a pause, then a quick run.
  const TETRIS_REPEAT_FIRST = 170;
  const TETRIS_REPEAT_EVERY = 50;
  // A new game. Tests may fix the seed (__oneTetrisSeed) and the starting field (__oneTetrisField).
  function tetrisFresh() {
    const state = tetrisNew(window.__oneTetrisSeed ?? Date.now());
    return window.__oneTetrisField ? { ...state, field: window.__oneTetrisField.map((row) => [...row]) } : state;
  }
  function TetrisGame({ escapeRef }) {
    useActiveGame("tetris");
    const [game, setGame] = React2.useState(tetrisFresh);
    const gameRef = React2.useRef(game);
    gameRef.current = game;
    const [best, offerBest] = useGameRecord("tetris");
    const [record, setRecord] = React2.useState(false);
    const [burst, setBurst] = React2.useState(null);
    const [soundOn, setSoundOn] = React2.useState(retroSound.on);
    const playRef = React2.useRef(null);
    const prevStatus = React2.useRef(game.status);
    const held = React2.useRef(null);
    // Runs a rule on the latest state; returns [before, after].
    const apply = React2.useCallback((rule) => {
      const before = gameRef.current;
      const after = rule(before);
      if (after !== before) {
        gameRef.current = after;
        setGame(after);
      }
      return [before, after];
    }, []);
    const actions = React2.useMemo(() => {
      const lockSound = ([before, after]) => after.field !== before.field && retroSound.tLock();
      const moveSound = ([before, after]) => after.piece !== before.piece && retroSound.tMove();
      return {
        left: () => moveSound(apply((s) => tetrisMove(s, -1))),
        right: () => moveSound(apply((s) => tetrisMove(s, 1))),
        down: () => apply(tetrisSoftDrop),
        cw: () => {
          const [b, a] = apply((s) => tetrisRotate(s, 1));
          if (a.piece !== b.piece) retroSound.tRotate();
        },
        ccw: () => {
          const [b, a] = apply((s) => tetrisRotate(s, -1));
          if (a.piece !== b.piece) retroSound.tRotate();
        },
        hard: () => lockSound(apply(tetrisHardDrop)),
        // Locks a grounded piece, unless a move took it off its ledge.
        lock: () => lockSound(apply((s) => (tetrisFits(s.field, { ...s.piece, y: s.piece.y + 1 }) ? { ...s, grounded: false } : tetrisLock(s))))
      };
    }, [apply]);
    const stopRepeat = React2.useCallback(() => {
      const h = held.current;
      if (!h) return;
      window.clearTimeout(h.timer);
      window.clearInterval(h.timer);
      held.current = null;
    }, []);
    const startRepeat = React2.useCallback(
      (key, action) => {
        stopRepeat();
        const h = { key, timer: 0 };
        h.timer = window.setTimeout(() => {
          h.timer = window.setInterval(() => actions[action](), TETRIS_REPEAT_EVERY);
        }, TETRIS_REPEAT_FIRST);
        held.current = h;
      },
      [actions, stopRepeat]
    );
    const start = React2.useCallback(() => {
      const g = gameRef.current;
      if (g.status === "paused") return apply((s) => ({ ...s, status: "playing" }));
      const fresh = { ...tetrisFresh(), status: "playing" };
      setRecord(false);
      setBurst(null);
      apply(() => fresh);
    }, [apply]);
    const togglePause = React2.useCallback(() => {
      stopRepeat();
      apply((s) => (s.status === "playing" ? { ...s, status: "paused" } : s.status === "paused" ? { ...s, status: "playing" } : s));
    }, [apply, stopRepeat]);
    const toggleSound = React2.useCallback(() => {
      setSoundOn((on) => {
        retroSound.setOn(!on);
        return !on;
      });
    }, []);
    // Esc pauses a running game; otherwise the panel steps back.
    React2.useEffect(() => {
      if (!escapeRef) return;
      escapeRef.current = () => {
        if (gameRef.current.status !== "playing") return false;
        togglePause();
        return true;
      };
      return () => {
        escapeRef.current = null;
      };
    }, [escapeRef, togglePause]);
    const live = game.status === "playing" && !game.clearing.length;
    // Gravity.
    React2.useEffect(() => {
      if (!live) return;
      const id = window.setInterval(() => apply(tetrisTick), tetrisGravity(game.level));
      return () => window.clearInterval(id);
    }, [live, game.level, apply]);
    // Lock delay: 500 ms after touching down, restarted by each move (at most 15).
    React2.useEffect(() => {
      if (!live || !game.grounded) return;
      if (game.lockMoves >= 15) return void actions.lock();
      const id = window.setTimeout(actions.lock, 500);
      return () => window.clearTimeout(id);
    }, [live, game.grounded, game.lockMoves, game.piece.shape, actions]);
    // Full rows flash, then go.
    React2.useEffect(() => {
      if (!game.clearing.length || game.status !== "playing") return;
      const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const id = window.setTimeout(() => apply(tetrisClear), quick ? 0 : 250);
      return () => window.clearTimeout(id);
    }, [game.clearing, game.status, apply]);
    React2.useEffect(() => {
      const last = game.last;
      if (!last) return;
      if (last.lines === 4) {
        retroSound.tTetris();
        setBurst(last.at);
      } else retroSound.tLines(last.lines);
      if (last.levelUp) {
        const id = window.setTimeout(() => retroSound.tLevel(), 450);
        return () => window.clearTimeout(id);
      }
    }, [game.last && game.last.at]);
    React2.useEffect(() => {
      if (burst == null) return;
      const id = window.setTimeout(() => setBurst(null), 900);
      return () => window.clearTimeout(id);
    }, [burst]);
    React2.useEffect(() => {
      const was = prevStatus.current;
      prevStatus.current = game.status;
      if (was === game.status) return;
      if (game.status !== "playing") stopRepeat();
      if (game.status === "playing") {
        if (was === "paused") retroSound.resume();
        else retroSound.start();
      } else if (game.status === "paused") retroSound.pause();
      else if (game.status === "over") {
        const isRecord = offerBest(game.score);
        if (isRecord) setRecord(true);
        retroSound.over();
        window.requestAnimationFrame(() => playRef.current && playRef.current.focus());
        if (isRecord) {
          const id = window.setTimeout(() => retroSound.record(), 950);
          return () => window.clearTimeout(id);
        }
      }
    }, [game.status]);
    // A hidden tab pauses the game; leaving the window lets go of held keys.
    React2.useEffect(() => {
      const onHide = () => {
        if (document.hidden && gameRef.current.status === "playing") togglePause();
      };
      document.addEventListener("visibilitychange", onHide);
      window.addEventListener("blur", stopRepeat);
      return () => {
        document.removeEventListener("visibilitychange", onHide);
        window.removeEventListener("blur", stopRepeat);
        stopRepeat();
      };
    }, [togglePause, stopRepeat]);
    React2.useEffect(() => {
      const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const action = TETRIS_KEYS[e.key];
        const status = gameRef.current.status;
        if (action) {
          e.preventDefault();
          if (e.repeat || status !== "playing") return;
          actions[action]();
          if (action === "left" || action === "right" || action === "down") startRepeat(e.key.toLowerCase(), action);
        } else if (e.key === " ") {
          e.preventDefault();
          if (e.repeat) return;
          if (status === "playing") actions.hard();
          else if (status === "ready" || status === "over") start();
        } else if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          togglePause();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleSound();
        }
      };
      const onUp = (e) => {
        if (held.current && held.current.key === e.key.toLowerCase()) stopRepeat();
      };
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onUp);
      return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onUp);
      };
    }, [actions, start, togglePause, toggleSound, startRepeat, stopRepeat]);
    // What each square shows: locked blocks, the falling piece, its shadow.
    const view = game.field.map((row) => row.map((shape) => ({ shape })));
    if (game.status !== "ready" && !game.clearing.length) {
      if (game.status !== "over") for (const [x, y] of tetrisCells(tetrisGhost(game))) if (!view[y][x].shape) view[y][x] = { ghost: true };
      for (const [x, y] of tetrisCells(game.piece)) if (y >= 0 && y < TETRIS_H) view[y][x] = { shape: game.piece.shape, active: true };
    }
    const flashing = new Set(game.clearing);
    const cells = [];
    view.forEach((row, y) =>
      row.forEach((c, x) =>
        cells.push(
          React2.createElement("div", {
            key: `${x}-${y}`,
            className: "tetris-cell",
            "data-shape": c.shape || void 0,
            "data-active": c.active ? "true" : void 0,
            "data-ghost": c.ghost ? "true" : void 0,
            "data-clearing": flashing.has(y) ? "true" : void 0
          })
        )
      )
    );
    const nextShape = TETRIS_SHAPES[game.next];
    const nextCells = new Set(nextShape.cells.map(([x, y]) => `${x + (nextShape.box === 2 ? 1 : 0)},${y + (nextShape.box === 4 ? 0 : 1)}`));
    const mini = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) mini.push(React2.createElement("div", { key: `${x}-${y}`, className: "tetris-mini", "data-shape": nextCells.has(`${x},${y}`) ? game.next : void 0 }));
    const stat = (label, value, id) =>
      React2.createElement(
        "div",
        { className: `tetris-stat tetris-stat--${id.slice(7)}` },
        React2.createElement("span", { className: "snake-stat__label" }, label),
        React2.createElement("span", { className: "snake-stat__value num", "data-testid": id }, value)
      );
    const message =
      game.status === "ready"
        ? { title: "Ready?", sub: "Fill a row to clear it. Don’t let the blocks reach the top.", action: "Play" }
        : game.status === "paused"
        ? { title: "Paused", sub: "Take a breath.", action: "Resume" }
        : game.status === "over"
        ? { title: "Game over", sub: `${game.score} ${game.score === 1 ? "point" : "points"}`, action: "Play again" }
        : null;
    return React2.createElement(
      "div",
      { className: "tetris", "data-status": game.status },
      React2.createElement(
        "div",
        {
          className: "tetris-board",
          role: "grid",
          "aria-label": `Tetris field, ${TETRIS_W} by ${TETRIS_H}`,
          "data-piece": game.piece.shape,
          "data-x": game.piece.x,
          "data-y": game.piece.y,
          "data-rot": game.piece.rot,
          "data-grounded": game.grounded ? "true" : void 0,
          onClick: (e) => e.target.classList.contains("tetris-cell") && actions.cw()
        },
        cells,
        burst != null && React2.createElement("span", { key: burst, className: "tetris-burst", "aria-hidden": true }, "TETRIS!"),
        message &&
          React2.createElement(
            "div",
            { className: "snake-message", role: "status" },
            game.status === "over" && record && game.score > 0 && React2.createElement("span", { className: "snake-record" }, "🏆 New record!"),
            React2.createElement("h3", { className: "snake-message__title" }, message.title),
            React2.createElement("p", { className: "snake-message__sub" }, message.sub),
            React2.createElement("button", { ref: playRef, type: "button", className: "snake-play", onClick: start, "data-autofocus": true }, message.action)
          )
      ),
      React2.createElement(
        "div",
        { className: "tetris-side" },
        React2.createElement(
          "div",
          { className: "tetris-stat tetris-stat--next" },
          React2.createElement("span", { className: "snake-stat__label" }, "Next"),
          React2.createElement("div", { className: "tetris-next", "data-shape": game.next, "aria-label": `Next: ${game.next}`, role: "img" }, mini)
        ),
        stat("Score", game.score, "tetris-score"),
        stat("Lines", game.lines, "tetris-lines"),
        stat("Level", game.level, "tetris-level"),
        React2.createElement(
          "div",
          { className: "tetris-stat tetris-stat--best" },
          React2.createElement("span", { className: "snake-stat__label" }, React2.createElement(Trophy, { size: 14, "aria-hidden": true }), "Best"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "tetris-best" }, best)
        ),
        React2.createElement(
          "div",
          { className: "tetris-buttons" },
          React2.createElement(
            "button",
            { type: "button", className: "snake-pause", onClick: togglePause, disabled: game.status !== "playing" && game.status !== "paused", "aria-label": game.status === "paused" ? "Resume" : "Pause" },
            // Very narrow screens show just the symbol.
            React2.createElement("span", { className: "tetris-pause__text", "aria-hidden": true }, game.status === "paused" ? "Resume" : "Pause"),
            React2.createElement("span", { className: "tetris-pause__glyph", "aria-hidden": true }, game.status === "paused" ? "▶" : "❚❚")
          ),
          React2.createElement(
            IconButton,
            { label: "Game sounds", className: "snake-mute", "aria-pressed": soundOn ? "true" : "false", onClick: toggleSound },
            React2.createElement(soundOn ? Volume2 : VolumeX, { size: 20 })
          )
        )
      ),
      React2.createElement(
        "div",
        { className: "tetris-touch", role: "group", "aria-label": "Tetris controls" },
        [
          ["Left", "left", "◀", true],
          ["Right", "right", "▶", true],
          ["Rotate", "cw", "↻", false],
          ["Soft drop", "down", "▼", true],
          ["Hard drop", "hard", "⤓", false]
        ].map(([label, action, glyph, repeats]) =>
          React2.createElement(
            "button",
            {
              key: label,
              type: "button",
              className: "tetris-touch__btn",
              "aria-label": label,
              // Acts on press, so a held button repeats; a keyboard press (detail 0) acts on click.
              onPointerDown: (e) => {
                e.preventDefault();
                if (gameRef.current.status !== "playing") return;
                actions[action]();
                if (repeats) startRepeat(`touch-${action}`, action);
              },
              onPointerUp: stopRepeat,
              onPointerLeave: stopRepeat,
              onPointerCancel: stopRepeat,
              onClick: (e) => e.detail === 0 && gameRef.current.status === "playing" && actions[action]()
            },
            glyph
          )
        )
      ),
      React2.createElement("p", { className: "snake-hint tetris-hint" }, "←→ move · ↑ rotate · ↓ soft drop · Space hard drop · P pause · M sound")
    );
  }
  window.__oneGameModules = window.__oneGameModules || {};
  window.__oneGameModules["tetris"] = { Component: TetrisGame };
})();
