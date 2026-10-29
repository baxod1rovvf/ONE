// ONE — Memory sequences. Loaded only when this game is opened from Retro games
// (games/panel.js); leaving the game unmounts it and stops everything it runs.
(function () {
  const { React2, IconButton, icons, loadGameRecords, retroSound, tetrisRandom, useActiveGame, useGameRecord } = window.__oneGameKit;
  const { Trophy, Volume2, VolumeX } = icons;
  /* Memory rules */
  // Each round adds one colour to the sequence; the player repeats it all.
  // A wrong colour ends the game. The score is the number of rounds completed.
  const MEM_COLORS = [
    { name: "Green", fill: "#2ecc55" },
    { name: "Red", fill: "#f2453d" },
    { name: "Yellow", fill: "#f5d82a" },
    { name: "Blue", fill: "#3e6fd8" },
    { name: "Purple", fill: "#9b59d0" },
    { name: "Orange", fill: "#ff8c2e" }
  ];
  function memNew(colors, seed) {
    return { colors, sequence: [], step: 0, round: 0, score: 0, status: "ready", rng: seed };
  }
  function memNextRound(state) {
    const [v, rng] = tetrisRandom(state.rng);
    const sequence = [...state.sequence, Math.floor(v * state.colors)];
    return { ...state, rng, sequence, round: sequence.length, step: 0, status: "watch" };
  }
  function memPress(state, i) {
    if (state.status !== "input") return state;
    const expected = state.sequence[state.step];
    if (i !== expected) return { ...state, status: "over", wrong: { pressed: i, expected } };
    const step = state.step + 1;
    if (step === state.sequence.length) return { ...state, step, score: state.round, status: "done" };
    return { ...state, step };
  }
  // How long each colour stays lit while the sequence plays back.
  const memStepMs = (round) => Math.max(300, 600 - 20 * (round - 1));
  window.__oneMemory = { memNew, memNextRound, memPress, memStepMs, MEM_COLORS };

  /* Memory component */
  const MODES = [4, 6];
  const GAP_MS = 120;
  const LEAD_MS = 450; // a pause before each playback
  const NEXT_MS = 600; // a pause after a completed round
  const recordKey = (n) => `memory-${n}`;
  // Slices go clockwise; the first one ends at 12 o'clock, so it sits top-left.
  function slicePath(i, n) {
    const span = 360 / n;
    const from = 360 - span + i * span + 3;
    const to = from + span - 6;
    const at = (deg, r) => {
      const a = (deg * Math.PI) / 180;
      return `${(110 + r * Math.sin(a)).toFixed(2)} ${(110 - r * Math.cos(a)).toFixed(2)}`;
    };
    const big = to - from > 180 ? 1 : 0;
    return `M ${at(from, 104)} A 104 104 0 ${big} 1 ${at(to, 104)} L ${at(to, 44)} A 44 44 0 ${big} 0 ${at(from, 44)} Z`;
  }
  function MemoryGame({ escapeRef }) {
    useActiveGame("memory");
    const [colors, setColors] = React2.useState(4);
    const [game, setGame] = React2.useState(() => memNew(4, 1));
    const [paused, setPaused] = React2.useState(false);
    const [lit, setLit] = React2.useState(null);
    const [record, setRecord] = React2.useState(false);
    const [soundOn, setSoundOn] = React2.useState(retroSound.on);
    const [best4, offer4] = useGameRecord(recordKey(4));
    const [best6, offer6] = useGameRecord(recordKey(6));
    const best = colors === 6 ? best6 : best4;
    const offer = colors === 6 ? offer6 : offer4;
    const ref = React2.useRef({ game, paused });
    ref.current = { game, paused };
    const playRef = React2.useRef(null);
    const startedBest = React2.useRef(0);
    const flash = React2.useRef(null);
    React2.useEffect(() => {
      window.__oneMemoryControl = { state: () => ref.current.game };
      return () => {
        delete window.__oneMemoryControl;
        window.clearTimeout(flash.current);
      };
    }, []);
    const start = React2.useCallback(() => {
      startedBest.current = (loadGameRecords()[recordKey(colors)] || {}).best || 0;
      setRecord(false);
      setPaused(false);
      setLit(null);
      setGame(memNextRound(memNew(colors, window.__oneMemorySeed ?? Date.now())));
      retroSound.start();
    }, [colors]);
    const chooseColors = (n) => {
      setColors(n);
      setGame(memNew(n, 1));
    };
    // Playback: light each colour in turn, then it's the player's turn.
    // Pausing cancels it; resuming plays the whole sequence again.
    React2.useEffect(() => {
      if (game.status !== "watch" || paused) return;
      const ms = memStepMs(game.round);
      const timers = [];
      game.sequence.forEach((c, k) => {
        const on = LEAD_MS + k * (ms + GAP_MS);
        timers.push(
          window.setTimeout(() => {
            setLit(c);
            retroSound.memTone(c, ms / 1000);
          }, on)
        );
        timers.push(window.setTimeout(() => setLit(null), on + ms));
      });
      timers.push(window.setTimeout(() => setGame((g) => (g.status === "watch" ? { ...g, status: "input" } : g)), LEAD_MS + game.sequence.length * (ms + GAP_MS)));
      return () => {
        timers.forEach((t) => window.clearTimeout(t));
        setLit(null);
      };
    }, [game.status, game.round, paused]);
    // A completed round: keep the best score, then the next round.
    React2.useEffect(() => {
      if (game.status !== "done" || paused) return;
      offer(game.score);
      const t = window.setTimeout(() => setGame((g) => (g.status === "done" ? memNextRound(g) : g)), NEXT_MS);
      return () => window.clearTimeout(t);
    }, [game.status, game.score, paused]);
    const press = React2.useCallback((i) => {
      const { game: g, paused: p } = ref.current;
      if (p || g.status !== "input" || i >= g.colors) return;
      const next = memPress(g, i);
      setGame(next);
      window.clearTimeout(flash.current);
      if (next.status === "over") {
        setLit(null);
        retroSound.memWrong();
        if (next.score > startedBest.current) setRecord(true);
        return;
      }
      setLit(i);
      retroSound.memTone(i);
      flash.current = window.setTimeout(() => setLit(null), 220);
    }, []);
    const togglePause = React2.useCallback(() => {
      const st = ref.current.game.status;
      if (st !== "watch" && st !== "input" && st !== "done") return;
      setPaused((p) => {
        // Back from a pause, the current sequence plays again from the start.
        if (p) setGame((g) => (g.status === "input" ? { ...g, step: 0, status: "watch" } : g));
        return !p;
      });
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
        const st = ref.current.game.status;
        if (ref.current.paused || (st !== "watch" && st !== "input" && st !== "done")) return false;
        togglePause();
        return true;
      };
      return () => {
        escapeRef.current = null;
      };
    }, [escapeRef, togglePause]);
    React2.useEffect(() => {
      if (game.status === "over" || game.status === "ready" || paused) window.requestAnimationFrame(() => playRef.current && playRef.current.focus());
    }, [game.status, paused]);
    React2.useEffect(() => {
      const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const n = Number(e.key);
        if (n >= 1 && n <= 6) {
          e.preventDefault();
          press(n - 1);
        } else if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          togglePause();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleSound();
        }
      };
      const onHide = () => document.hidden && !ref.current.paused && ["watch", "input", "done"].includes(ref.current.game.status) && togglePause();
      window.addEventListener("keydown", onKey);
      document.addEventListener("visibilitychange", onHide);
      return () => {
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("visibilitychange", onHide);
      };
    }, [press, togglePause, toggleSound]);
    const over = game.status === "over";
    const message =
      game.status === "ready"
        ? { title: "Memory", sub: "Watch the colours light up, then repeat them in order.", action: "Play", onClick: start, modes: true }
        : paused
        ? { title: "Paused", sub: "The sequence plays again when you resume.", action: "Resume", onClick: togglePause }
        : over
        ? { title: "Game over", sub: `Wrong colour! You reached round ${game.round}.`, action: "Play again", onClick: start, modes: true }
        : null;
    const hint = game.status === "watch" ? "Watch…" : game.status === "input" ? "Your turn" : game.status === "done" ? "Well done!" : "";
    const status = paused ? "paused" : game.status;
    return React2.createElement(
      "div",
      { className: "mem", "data-status": status, "data-colors": colors },
      React2.createElement(
        "div",
        { className: "mem-hud" },
        React2.createElement(
          "div",
          { className: "snake-stat" },
          React2.createElement("span", { className: "snake-stat__label" }, "Score"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "mem-score" }, game.score)
        ),
        React2.createElement(
          "div",
          { className: "snake-stat snake-stat--best" },
          React2.createElement("span", { className: "snake-stat__label" }, React2.createElement(Trophy, { size: 14, "aria-hidden": true }), "Best"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "mem-best" }, best)
        ),
        React2.createElement("button", { type: "button", className: "snake-pause", onClick: togglePause, disabled: game.status === "ready" || over }, paused ? "Resume" : "Pause"),
        React2.createElement(
          IconButton,
          { label: "Game sounds", className: "snake-mute", "aria-pressed": soundOn ? "true" : "false", onClick: toggleSound },
          React2.createElement(soundOn ? Volume2 : VolumeX, { size: 20 })
        )
      ),
      React2.createElement(
        "div",
        { className: "mem-stage" },
        React2.createElement(
          "svg",
          { className: "mem-circle", viewBox: "0 0 220 220", role: "group", "aria-label": `Memory, ${colors} colours` },
          MEM_COLORS.slice(0, colors).map((c, i) =>
            React2.createElement("path", {
              key: `${colors}-${i}`,
              className: "mem-slice",
              d: slicePath(i, colors),
              fill: c.fill,
              role: "button",
              tabIndex: game.status === "input" && !paused ? 0 : -1,
              "aria-label": c.name,
              "aria-keyshortcuts": String(i + 1),
              "data-i": i,
              "data-lit": lit === i ? "true" : void 0,
              "data-right": over && game.wrong && game.wrong.expected === i ? "true" : void 0,
              "data-wrong": over && game.wrong && game.wrong.pressed === i ? "true" : void 0,
              style: { "--glow": c.fill },
              onPointerDown: (e) => {
                e.preventDefault();
                press(i);
              },
              onKeyDown: (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  press(i);
                }
              }
            })
          ),
          React2.createElement("circle", { className: "mem-hub", cx: 110, cy: 110, r: 38 }),
          React2.createElement("text", { className: "mem-round num", x: 110, y: 110, textAnchor: "middle", dominantBaseline: "central", "aria-label": "Round" }, game.round || "–")
        ),
        message &&
          React2.createElement(
            "div",
            { className: "snake-message mem-message", role: "status" },
            over && record && React2.createElement("span", { className: "snake-record" }, "🏆 New record!"),
            React2.createElement("h3", { className: "snake-message__title" }, message.title),
            React2.createElement("p", { className: "snake-message__sub" }, message.sub),
            message.modes &&
              React2.createElement(
                "div",
                { className: "mem-modes", role: "radiogroup", "aria-label": "Colours" },
                MODES.map((n) =>
                  React2.createElement("button", { key: n, type: "button", role: "radio", className: "mem-mode", "aria-checked": colors === n ? "true" : "false", onClick: () => chooseColors(n) }, `${n} colours`)
                )
              ),
            React2.createElement("button", { ref: playRef, type: "button", className: "snake-play", onClick: message.onClick, "data-autofocus": true }, message.action)
          )
      ),
      React2.createElement("p", { className: "mem-hint", "aria-live": "polite" }, hint),
      React2.createElement("p", { className: "snake-hint" }, `Tap the colours or press 1–${colors}, clockwise from the top-left · P pause · M sound`)
    );
  }
  window.__oneGameModules = window.__oneGameModules || {};
  window.__oneGameModules.memory = { Component: MemoryGame };
})();
