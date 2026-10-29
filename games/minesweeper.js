// ONE — Minesweeper. Loaded only when this game is opened from Retro games
// (games/panel.js); leaving the game unmounts it and stops everything it runs.
(function () {
  const { React2, IconButton, icons, loadGameRecords, saveGameRecord, retroSound, tetrisRandom, useActiveGame } = window.__oneGameKit;
  const { Volume2, VolumeX } = icons;
  /* Minesweeper rules */
  // A grid of squares. Mines are placed on the first open, never on the
  // opened square or its neighbours, so the first click always opens an area.
  const LEVELS = { easy: { rows: 9, cols: 9, mines: 10 }, medium: { rows: 16, cols: 16, mines: 40 }, hard: { rows: 16, cols: 30, mines: 99 } };
  function around(s, i) {
    const r = Math.floor(i / s.cols);
    const c = i % s.cols;
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < s.rows && cc < s.cols) out.push(rr * s.cols + cc);
      }
    return out;
  }
  function withCounts(s) {
    for (let i = 0; i < s.cells.length; i++) s.cells[i].n = around(s, i).filter((j) => s.cells[j].mine).length;
    return s;
  }
  function minesNew(level, seed, { portrait = false } = {}) {
    let { rows, cols, mines } = LEVELS[level];
    if (portrait && cols > rows) [rows, cols] = [cols, rows];
    return { level, rows, cols, mines, placed: false, cells: Array.from({ length: rows * cols }, () => ({ mine: false, open: false, flag: false, n: 0 })), status: "ready", hit: null, startedAt: null, endedAt: null, rng: seed | 0 };
  }
  function minesFromLayout(rows, cols, mineIndexes) {
    const s = { level: "custom", rows, cols, mines: mineIndexes.length, placed: true, cells: Array.from({ length: rows * cols }, (_, i) => ({ mine: mineIndexes.includes(i), open: false, flag: false, n: 0 })), status: "playing", hit: null, startedAt: Date.now(), endedAt: null, rng: 1 };
    return withCounts(s);
  }
  function place(s, first) {
    const keep = new Set([first, ...around(s, first)]);
    const spots = [];
    for (let i = 0; i < s.cells.length; i++) if (!keep.has(i)) spots.push(i);
    for (let k = 0; k < s.mines && spots.length; k++) {
      const [v, next] = tetrisRandom(s.rng);
      s.rng = next;
      const j = Math.floor(v * spots.length);
      s.cells[spots[j]].mine = true;
      spots.splice(j, 1);
    }
    s.placed = true;
    return withCounts(s);
  }
  const copy = (s) => ({ ...s, cells: s.cells.map((x) => ({ ...x })) });
  const live = (s) => s.status === "ready" || s.status === "playing";
  function finish(s) {
    if (s.status === "playing" && s.cells.every((x) => x.mine || x.open)) {
      s.status = "won";
      s.endedAt = Date.now();
    }
    return s;
  }
  // Opens a square; an empty one opens its neighbours, and so on.
  function openFrom(s, start) {
    const queue = [start];
    while (queue.length) {
      const i = queue.pop();
      const x = s.cells[i];
      if (x.open || x.flag) continue;
      x.open = true;
      if (x.mine) {
        s.status = "lost";
        s.hit = i;
        s.endedAt = Date.now();
        return s;
      }
      if (x.n === 0) for (const j of around(s, i)) if (!s.cells[j].open) queue.push(j);
    }
    return s;
  }
  function minesOpen(state, r, c) {
    if (!live(state)) return state;
    const i = r * state.cols + c;
    if (state.cells[i].open || state.cells[i].flag) return state;
    let s = copy(state);
    if (!s.placed) s = place(s, i);
    if (s.status === "ready") {
      s.status = "playing";
      s.startedAt = Date.now();
    }
    return finish(openFrom(s, i));
  }
  // A revealed number whose flags are all placed opens the rest around it.
  function minesChord(state, r, c) {
    if (state.status !== "playing") return state;
    const i = r * state.cols + c;
    const x = state.cells[i];
    if (!x.open || !x.n) return state;
    const near = around(state, i);
    if (near.filter((j) => state.cells[j].flag).length !== x.n) return state;
    let s = copy(state);
    for (const j of near) if (s.status === "playing" && !s.cells[j].open && !s.cells[j].flag) openFrom(s, j);
    return finish(s);
  }
  function minesFlag(state, r, c) {
    if (!live(state)) return state;
    const i = r * state.cols + c;
    if (state.cells[i].open) return state;
    const s = copy(state);
    s.cells[i].flag = !s.cells[i].flag;
    return s;
  }
  const minesLeft = (s) => s.mines - s.cells.filter((x) => x.flag).length;
  window.__oneMines = { LEVELS, minesNew, minesFromLayout, minesOpen, minesChord, minesFlag, minesLeft };

  /* Minesweeper on screen */
  const LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const portraitPhone = () => window.matchMedia("(max-width: 520px) and (orientation: portrait)").matches;
  const fresh = (level) => minesNew(level, window.__oneMinesSeed ?? Date.now(), { portrait: portraitPhone() });
  const bestTime = (level) => (loadGameRecords()[`mines-${level}`] || {}).best || null;
  function Minesweeper({ escapeRef }) {
    useActiveGame("minesweeper");
    const [level, setLevel] = React2.useState("easy");
    const [game, setGame] = React2.useState(() => fresh("easy"));
    const [now, setNow] = React2.useState(Date.now());
    const [flagMode, setFlagMode] = React2.useState(false);
    const [record, setRecord] = React2.useState(false);
    const [paused, setPaused] = React2.useState(false);
    const [soundOn, setSoundOn] = React2.useState(retroSound.on);
    const gameRef = React2.useRef(game);
    gameRef.current = game;
    const press = React2.useRef(null);
    const playRef = React2.useRef(null);
    const newGame = React2.useCallback((lvl = level) => {
      setGame(fresh(lvl));
      setRecord(false);
      setPaused(false);
    }, [level]);
    const chooseLevel = (lvl) => {
      setLevel(lvl);
      newGame(lvl);
    };
    // The clock ticks only while playing (and not paused).
    React2.useEffect(() => {
      if (game.status !== "playing" || paused) return;
      const id = window.setInterval(() => setNow(Date.now()), 250);
      return () => window.clearInterval(id);
    }, [game.status, paused]);
    // Pausing holds the clock: the start time moves forward by the pause.
    const pausedAt = React2.useRef(null);
    React2.useEffect(() => {
      if (paused) pausedAt.current = Date.now();
      else if (pausedAt.current) {
        const gap = Date.now() - pausedAt.current;
        pausedAt.current = null;
        setGame((g) => (g.startedAt ? { ...g, startedAt: g.startedAt + gap } : g));
        setNow(Date.now());
      }
    }, [paused]);
    const apply = (next) => {
      const was = gameRef.current;
      if (next === was) return;
      gameRef.current = next;
      setGame(next);
      setNow(Date.now());
      if (next.status === "lost") retroSound.msBoom();
      else if (next.status === "won") {
        retroSound.msWin();
        const sec = Math.max(1, Math.floor((next.endedAt - next.startedAt) / 1000));
        const best = bestTime(next.level);
        if (!best || sec < best) {
          saveGameRecord(`mines-${next.level}`, sec);
          setRecord(true);
        }
      } else if (next.cells.filter((x) => x.open).length !== was.cells.filter((x) => x.open).length) retroSound.msOpen();
      else retroSound.msFlag();
    };
    const act = (r, c, how) => {
      const g = gameRef.current;
      if (paused) return;
      if (how === "flag") return apply(minesFlag(g, r, c));
      const x = g.cells[r * g.cols + c];
      if (x.open) return apply(minesChord(g, r, c));
      apply(flagMode ? minesFlag(g, r, c) : minesOpen(g, r, c));
    };
    React2.useEffect(() => {
      window.__oneMinesSolve = () => {
        const g = gameRef.current;
        g.cells.forEach((x, i) => {
          const cur = gameRef.current;
          if (!x.mine && !cur.cells[i].open && cur.status !== "lost") act(Math.floor(i / g.cols), i % g.cols, "open");
        });
      };
      return () => {
        delete window.__oneMinesSolve;
      };
    });
    const togglePause = React2.useCallback(() => {
      if (gameRef.current.status === "playing") setPaused((p) => !p);
    }, []);
    const toggleSound = React2.useCallback(() => {
      setSoundOn((on) => {
        retroSound.setOn(!on);
        return !on;
      });
    }, []);
    React2.useEffect(() => {
      if (!escapeRef) return;
      escapeRef.current = () => {
        if (gameRef.current.status !== "playing" || paused) return false;
        setPaused(true);
        return true;
      };
      return () => {
        escapeRef.current = null;
      };
    }, [escapeRef, paused]);
    React2.useEffect(() => {
      const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          togglePause();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleSound();
        }
      };
      const onHide = () => document.hidden && gameRef.current.status === "playing" && setPaused(true);
      window.addEventListener("keydown", onKey);
      document.addEventListener("visibilitychange", onHide);
      return () => {
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("visibilitychange", onHide);
      };
    }, [togglePause, toggleSound]);
    React2.useEffect(() => {
      if (game.status === "won" || game.status === "lost") window.requestAnimationFrame(() => playRef.current && playRef.current.focus());
    }, [game.status]);
    // Arrows move between squares; F flags the focused one.
    const onGridKey = (e) => {
      const el = e.target.closest(".ms-cell");
      if (!el) return;
      const r = Number(el.dataset.r);
      const c = Number(el.dataset.c);
      const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
      if (step) {
        e.preventDefault();
        const next = e.currentTarget.querySelector(`.ms-cell[data-r='${r + step[0]}'][data-c='${c + step[1]}']`);
        if (next) next.focus();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        act(r, c, "flag");
      }
    };
    // A long press flags (touch and pen).
    const endPress = () => {
      if (press.current) window.clearTimeout(press.current.timer);
    };
    const onPointerDown = (e, r, c) => {
      // A new press starts fresh, even if the last long press got no click.
      endPress();
      press.current = null;
      if (e.pointerType === "mouse") return;
      const start = { x: e.clientX, y: e.clientY };
      const timer = window.setTimeout(() => {
        press.current = { ...press.current, done: true };
        act(r, c, "flag");
      }, 400);
      press.current = { timer, start, done: false };
    };
    const onPointerMove = (e) => {
      const p = press.current;
      if (p && !p.done && Math.hypot(e.clientX - p.start.x, e.clientY - p.start.y) > 8) {
        window.clearTimeout(p.timer);
        press.current = null;
      }
    };
    React2.useEffect(() => () => endPress(), []);
    const onClick = (r, c) => {
      if (press.current && press.current.done) {
        press.current = null;
        return;
      }
      press.current = null;
      act(r, c, "open");
    };
    const elapsed = game.startedAt ? Math.floor(((game.endedAt || now) - game.startedAt) / 1000) : 0;
    const over = game.status === "won" || game.status === "lost";
    const cells = game.cells.map((x, i) => {
      const r = Math.floor(i / game.cols);
      const c = i % game.cols;
      const showMine = game.status === "lost" && x.mine;
      const wrongFlag = game.status === "lost" && x.flag && !x.mine;
      const state = x.open ? "open" : x.flag ? "flag" : "closed";
      const label = x.open ? (x.mine ? "Mine" : x.n ? `${x.n}` : "Empty") : x.flag ? "Flagged" : "Hidden";
      return React2.createElement(
        "button",
        {
          key: i,
          type: "button",
          className: "ms-cell",
          "data-r": r,
          "data-c": c,
          "data-state": state,
          "data-n": x.open && !x.mine ? x.n : void 0,
          "data-mine": showMine ? "true" : void 0,
          "data-hit": game.hit === i ? "true" : void 0,
          "data-wrong": wrongFlag ? "true" : void 0,
          "aria-label": `Row ${r + 1}, column ${c + 1}: ${label}`,
          tabIndex: r === 0 && c === 0 ? 0 : -1,
          onClick: () => onClick(r, c),
          onContextMenu: (e) => {
            e.preventDefault();
            // After a touch long press (Android sends contextmenu too) the timer flags.
            if (press.current) return;
            act(r, c, "flag");
          },
          onPointerDown: (e) => onPointerDown(e, r, c),
          onPointerUp: endPress,
          onPointerCancel: endPress,
          onPointerMove
        },
        wrongFlag ? "✕" : showMine ? "💣" : x.flag ? "🚩" : x.open && x.n ? x.n : ""
      );
    });
    return React2.createElement(
      "div",
      { className: "ms", "data-status": paused ? "paused" : game.status, style: { "--rows": game.rows, "--cols": game.cols } },
      React2.createElement(
        "div",
        { className: "ms-bar" },
        React2.createElement(
          "div",
          { className: "ms-levels", role: "radiogroup", "aria-label": "Level" },
          Object.keys(LEVELS).map((l) => React2.createElement("button", { key: l, type: "button", role: "radio", className: "ms-level", "aria-checked": level === l ? "true" : "false", onClick: () => chooseLevel(l) }, LEVEL_NAMES[l]))
        ),
        React2.createElement("span", { className: "ms-count", "aria-label": "Time" }, "⏱ ", React2.createElement("span", { className: "num", "data-testid": "ms-time" }, clock(elapsed))),
        React2.createElement("span", { className: "ms-count", "aria-label": "Mines left" }, "💣 ", React2.createElement("span", { className: "num", "data-testid": "ms-left" }, minesLeft(game))),
        React2.createElement(
          "label",
          { className: "ms-flagmode" },
          React2.createElement("input", { type: "checkbox", role: "switch", "aria-label": "Flag mode", checked: flagMode, onChange: (e) => setFlagMode(e.target.checked) }),
          React2.createElement("span", { "aria-hidden": true }, "🚩 Flag mode")
        ),
        React2.createElement("button", { type: "button", className: "snake-pause ms-new", onClick: () => newGame() }, "New game"),
        React2.createElement(
          IconButton,
          { label: "Game sounds", className: "snake-mute", "aria-pressed": soundOn ? "true" : "false", onClick: toggleSound },
          React2.createElement(soundOn ? Volume2 : VolumeX, { size: 20 })
        )
      ),
      React2.createElement(
        "div",
        { className: "ms-frame" },
        React2.createElement("div", { className: "ms-grid", role: "grid", "aria-label": `Minesweeper, ${game.rows} by ${game.cols}`, "data-rows": game.rows, "data-cols": game.cols, onKeyDown: onGridKey, onContextMenu: (e) => e.preventDefault() }, cells)
      ),
      (over || paused) &&
        React2.createElement(
          "div",
          { className: "ms-result", role: "status" },
          game.status === "won" && record && React2.createElement("span", { className: "snake-record" }, "🏆 New best time!"),
          React2.createElement("h3", { className: "snake-message__title" }, paused ? "Paused" : game.status === "won" ? `You cleared it in ${clock(Math.max(1, elapsed))}!` : "Boom!"),
          React2.createElement("button", { ref: playRef, type: "button", className: "snake-play", onClick: () => (paused ? setPaused(false) : newGame()) }, paused ? "Resume" : "New game")
        ),
      React2.createElement("p", { className: "snake-hint" }, "Click to open · right-click to flag · click a number to open around it · arrows + Enter / F with the keyboard")
    );
  }
  window.__oneGameModules = window.__oneGameModules || {};
  window.__oneGameModules.minesweeper = { Component: Minesweeper };
})();
