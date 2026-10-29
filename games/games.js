// ONE — Retro games (Snake, Tetris). This file loads in the background after
// ONE opens (see loadGames in index.html), so the Games panel opens at once.
// index.html shares what the games need through window.__oneKit; the panel is
// handed back as window.__oneGames.
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
  }
  const retroSound = new RetroSound();
  window.__oneRetroSound = retroSound;
  // Snake: a 10×10 field, fruit to eat, and walls (and its own tail) to avoid.
  // The rules are plain functions of the state, so a tick is snakeStep(state, dir).
  const SNAKE_SIZE = 10;
  // Rarer fruit is worth more.
  const SNAKE_FRUITS = [
    { id: "apple", emoji: "🍎", label: "Apple", points: 1, weight: 4 },
    { id: "banana", emoji: "🍌", label: "Banana", points: 2, weight: 3 },
    { id: "strawberry", emoji: "🍓", label: "Strawberry", points: 3, weight: 2 },
    { id: "cherry", emoji: "🍒", label: "Cherry", points: 5, weight: 1 }
  ];
  const SNAKE_DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const SNAKE_OPPOSITE = { up: "down", down: "up", left: "right", right: "left" };
  function snakeFood(snake, rand) {
    const taken = new Set(snake.map((c) => c.y * SNAKE_SIZE + c.x));
    const free = [];
    for (let i = 0; i < SNAKE_SIZE * SNAKE_SIZE; i++) if (!taken.has(i)) free.push(i);
    if (!free.length) return null;
    const cell = free[Math.floor(rand() * free.length)];
    let roll = rand() * SNAKE_FRUITS.reduce((n, f) => n + f.weight, 0);
    const fruit = SNAKE_FRUITS.find((f) => (roll -= f.weight) < 0) || SNAKE_FRUITS[0];
    return { x: cell % SNAKE_SIZE, y: Math.floor(cell / SNAKE_SIZE), fruit: fruit.id };
  }
  function snakeNew(rand = Math.random) {
    const snake = [
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 2, y: 5 }
    ];
    return { snake, dir: "right", food: snakeFood(snake, rand), score: 0, eaten: 0, status: "ready", last: null };
  }
  // One move. "over" when the head leaves the field or bites the body; "won"
  // when the snake fills the whole field.
  function snakeStep(state, dir = state.dir, rand = Math.random) {
    if (state.status !== "playing") return state;
    const heading = SNAKE_DIRS[dir] && dir !== SNAKE_OPPOSITE[state.dir] ? dir : state.dir;
    const [dx, dy] = SNAKE_DIRS[heading];
    const head = { x: state.snake[0].x + dx, y: state.snake[0].y + dy };
    const eats = !!state.food && state.food.x === head.x && state.food.y === head.y;
    // The tail moves out of the way this tick unless the snake grows.
    const body = eats ? state.snake : state.snake.slice(0, -1);
    const out = head.x < 0 || head.y < 0 || head.x >= SNAKE_SIZE || head.y >= SNAKE_SIZE;
    if (out || body.some((c) => c.x === head.x && c.y === head.y)) {
      return { ...state, dir: heading, status: "over", crash: out ? "wall" : "tail" };
    }
    const snake = [head, ...body];
    if (!eats) return { ...state, dir: heading, snake, last: null };
    const fruit = SNAKE_FRUITS.find((f) => f.id === state.food.fruit);
    const food = snakeFood(snake, rand);
    return {
      ...state,
      dir: heading,
      snake,
      food,
      score: state.score + fruit.points,
      eaten: state.eaten + 1,
      last: { fruit: fruit.id, points: fruit.points, at: state.eaten + 1, x: head.x, y: head.y },
      status: food ? "playing" : "won"
    };
  }
  // Starts slow and speeds up a little with every fruit.
  function snakeDelay(eaten) {
    return Math.max(120, 280 - eaten * 10);
  }
  window.__oneSnake = { snakeNew, snakeStep, snakeFood, SNAKE_SIZE, SNAKE_FRUITS };
  const SNAKE_KEYS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
    W: "up",
    S: "down",
    A: "left",
    D: "right"
  };
  function DpadArrow({ dir }) {
    const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
    return React2.createElement(
      "svg",
      { viewBox: "0 0 24 24", width: 26, height: 26, "aria-hidden": true, style: { transform: `rotate(${rot}deg)` } },
      React2.createElement("path", { d: "M12 5 20 17H4z", fill: "currentColor", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" })
    );
  }
  function SnakeGame() {
    const [game, setGame] = React2.useState(() => snakeNew());
    const [best, offerBest] = useGameRecord("snake");
    const [record, setRecord] = React2.useState(false);
    const [pop, setPop] = React2.useState(null);
    const queue = React2.useRef([]);
    const playRef = React2.useRef(null);
    const swipe = React2.useRef(null);
    const statusRef = React2.useRef(game.status);
    statusRef.current = game.status;
    const dirRef = React2.useRef(game.dir);
    dirRef.current = game.dir;
    const prevStatus = React2.useRef(game.status);
    const gameRef = React2.useRef(game);
    gameRef.current = game;
    // The drawing glides between moves: during each tick it slides from the
    // previous body (prev) to the current one, so it runs one move behind the rules.
    const anim = React2.useRef({ prev: game.snake, elapsed: 0 });
    const layerRef = React2.useRef(null);
    const [soundOn, setSoundOn] = React2.useState(retroSound.on);
    const toggleSound = React2.useCallback(() => {
      setSoundOn((on) => {
        retroSound.setOn(!on);
        return !on;
      });
    }, []);
    const start = React2.useCallback(() => {
      if (gameRef.current.status === "paused") return setGame((g) => (g.status === "paused" ? { ...g, status: "playing" } : g));
      const fresh = { ...snakeNew(), status: "playing" };
      queue.current = [];
      anim.current = { prev: fresh.snake, elapsed: 0 };
      setRecord(false);
      setPop(null);
      setGame(fresh);
    }, []);
    const togglePause = React2.useCallback(() => {
      setGame((g) => (g.status === "playing" ? { ...g, status: "paused" } : g.status === "paused" ? { ...g, status: "playing" } : g));
    }, []);
    // Turns wait in a short queue, so two quick presses (up, then left) both land.
    const turn = React2.useCallback((dir) => {
      const q = queue.current;
      const facing = q.length ? q[q.length - 1] : dirRef.current;
      if (statusRef.current === "playing" && dir !== facing && dir !== SNAKE_OPPOSITE[facing]) retroSound.turn();
      if (q.length < 3) q.push(dir);
      setGame((g) => (g.status === "ready" ? { ...g, status: "playing" } : g));
    }, []);
    // Draws the snake at a point t (0–1) of the current move, straight into the SVG.
    const draw = React2.useCallback((t) => {
      const layer = layerRef.current;
      if (!layer) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) t = 1;
      const S = gameRef.current.snake;
      const P = anim.current.prev;
      const mid = (c) => [c.x + 0.5, c.y + 0.5];
      const lerp = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const head = lerp(mid(P[0]), mid(S[0]));
      const pts = [head, ...S.slice(1).map(mid)];
      // Unless it just grew, the tail end slides up after the body.
      if (S.length === P.length) pts.push(lerp(mid(P[P.length - 1]), mid(S[S.length - 1])));
      const d = "M" + pts.map((p) => `${p[0].toFixed(3)} ${p[1].toFixed(3)}`).join("L");
      for (const path of layer.querySelectorAll("[data-body]")) path.setAttribute("d", d);
      // The head turns smoothly at the start of a move.
      const angleOf = (a, b, fallback) => (a.x === b.x && a.y === b.y ? fallback : (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
      const facing = { right: 0, down: 90, left: 180, up: -90 }[gameRef.current.dir];
      const to = angleOf(P[0], S[0], facing);
      const from = P.length > 1 ? angleOf(P[1], P[0], to) : to;
      const turnBy = ((to - from + 540) % 360) - 180;
      const angle = from + turnBy * Math.min(1, t / 0.35);
      layer.querySelector(".snake-face").setAttribute("transform", `translate(${head[0].toFixed(3)} ${head[1].toFixed(3)}) rotate(${angle.toFixed(1)})`);
    }, []);
    // One loop per frame while playing: time adds up, and every snakeDelay ms
    // the rules take a step. Pausing keeps the time, so a move resumes mid-way.
    React2.useEffect(() => {
      if (game.status !== "playing") return;
      let raf = 0;
      let last = null;
      const frame = (ts) => {
        const a = anim.current;
        if (last != null) a.elapsed += Math.min(ts - last, 100);
        last = ts;
        const g = gameRef.current;
        if (g.status === "playing" && a.elapsed >= snakeDelay(g.eaten)) {
          a.elapsed = Math.min(a.elapsed - snakeDelay(g.eaten), snakeDelay(g.eaten));
          let dir = g.dir;
          while (queue.current.length) {
            const next = queue.current.shift();
            if (next !== dir && next !== SNAKE_OPPOSITE[dir]) {
              dir = next;
              break;
            }
          }
          const next = snakeStep(g, dir);
          if (next.status === "playing") a.prev = g.snake;
          else {
            a.prev = next.snake;
            a.elapsed = 0;
          }
          gameRef.current = next;
          setGame(next);
        }
        draw(Math.min(1, a.elapsed / snakeDelay(gameRef.current.eaten)));
        raf = window.requestAnimationFrame(frame);
      };
      raf = window.requestAnimationFrame(frame);
      return () => window.cancelAnimationFrame(raf);
    }, [game.status, draw]);
    React2.useLayoutEffect(() => {
      draw(Math.min(1, anim.current.elapsed / snakeDelay(game.eaten)));
    }, [game, draw]);
    React2.useEffect(() => {
      if (game.last) {
        // The fruit is reached as the drawing arrives, a moment after the rules eat it.
        const ms = snakeDelay(game.eaten - 1);
        const bite = window.setTimeout(() => retroSound.eat(game.last.points), ms * 0.7);
        setPop({ ...game.last, ms });
        const id = window.setTimeout(() => setPop(null), ms + 700);
        return () => {
          window.clearTimeout(bite);
          window.clearTimeout(id);
        };
      }
    }, [game.last]);
    React2.useEffect(() => {
      const was = prevStatus.current;
      prevStatus.current = game.status;
      if (game.status === "playing") {
        if (was === "paused") retroSound.resume();
        else retroSound.start();
      } else if (game.status === "paused") {
        retroSound.pause();
      }
      if (game.status === "over" || game.status === "won") {
        const isRecord = offerBest(game.score);
        if (isRecord) setRecord(true);
        window.requestAnimationFrame(() => playRef.current && playRef.current.focus());
        // A crash sound first, then the fanfare for a new record or a full field.
        if (game.status === "over") retroSound.over();
        if (game.status === "won" || isRecord) {
          const id = window.setTimeout(() => retroSound.record(), game.status === "won" ? 0 : 950);
          return () => window.clearTimeout(id);
        }
      }
    }, [game.status]);
    // A hidden tab pauses the game.
    React2.useEffect(() => {
      const onHide = () => {
        if (document.hidden) setGame((g) => (g.status === "playing" ? { ...g, status: "paused" } : g));
      };
      document.addEventListener("visibilitychange", onHide);
      return () => document.removeEventListener("visibilitychange", onHide);
    }, []);
    React2.useEffect(() => {
      const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const dir = SNAKE_KEYS[e.key];
        if (dir) {
          e.preventDefault();
          turn(dir);
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleSound();
        } else if (e.key === " " || e.key === "p" || e.key === "P") {
          e.preventDefault();
          const status = statusRef.current;
          if (status === "playing" || status === "paused") togglePause();
          else start();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [turn, togglePause, start, toggleSound]);
    const onPointerDown = (e) => {
      swipe.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      const from = swipe.current;
      swipe.current = null;
      if (!from) return;
      const dx = e.clientX - from.x;
      const dy = e.clientY - from.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    };
    const cells = [];
    for (let y = 0; y < SNAKE_SIZE; y++) {
      for (let x = 0; x < SNAKE_SIZE; x++) {
        const food = game.food && game.food.x === x && game.food.y === y ? SNAKE_FRUITS.find((f) => f.id === game.food.fruit) : null;
        const content = food && React2.createElement("span", { className: "snake-fruit", "data-fruit": food.id, role: "img", "aria-label": food.label }, food.emoji);
        cells.push(React2.createElement("div", { key: `${x}-${y}`, className: "snake-cell", "data-dark": (x + y) % 2 ? "true" : void 0 }, content));
      }
    }
    const crashed = game.status === "over";
    const eyes = [-0.2, 0.2].map((y) =>
      React2.createElement(
        "g",
        { key: y, transform: `translate(0.14 ${y})` },
        React2.createElement("circle", { className: "snake-eye", r: 0.15 }),
        crashed
          ? React2.createElement("path", { className: "snake-eye-x", d: "M-0.07 -0.07L0.07 0.07M0.07 -0.07L-0.07 0.07" })
          : React2.createElement(
              React2.Fragment,
              null,
              React2.createElement("circle", { className: "snake-pupil", cx: 0.045, r: 0.08 }),
              React2.createElement("circle", { className: "snake-glint", cx: 0.07, cy: -0.035, r: 0.025 })
            )
      )
    );
    const layer = React2.createElement(
      "svg",
      { ref: layerRef, className: "snake-layer", viewBox: `0 0 ${SNAKE_SIZE} ${SNAKE_SIZE}`, "data-crash": crashed ? "true" : void 0, "aria-hidden": true },
      React2.createElement("path", { className: "snake-line snake-line--edge", "data-body": "" }),
      React2.createElement("path", { className: "snake-line snake-line--skin", "data-body": "" }),
      React2.createElement("path", { className: "snake-line snake-line--spots", "data-body": "" }),
      React2.createElement(
        "g",
        { className: "snake-face" },
        React2.createElement("path", { className: "snake-tongue", d: "M0.4 0H0.66M0.66 0L0.76 -0.07M0.66 0L0.76 0.07" }),
        React2.createElement("ellipse", { className: "snake-skull", cx: 0.04, rx: 0.47, ry: 0.43 }),
        React2.createElement("circle", { className: "snake-cheek", cx: -0.1, cy: -0.31, r: 0.065 }),
        React2.createElement("circle", { className: "snake-cheek", cx: -0.1, cy: 0.31, r: 0.065 }),
        eyes
      )
    );
    const head = game.snake[0];
    const ended = game.status === "over" || game.status === "won";
    const message =
      game.status === "ready"
        ? { title: "Ready?", sub: "Eat the fruit. Don’t hit the walls or your tail.", action: "Play" }
        : game.status === "paused"
        ? { title: "Paused", sub: "Take a breath.", action: "Resume" }
        : game.status === "won"
        ? { title: "You filled the field!", sub: `${game.score} points`, action: "Play again" }
        : game.status === "over"
        ? { title: game.crash === "tail" ? "Ouch, your tail!" : "Bonk! A wall.", sub: `${game.score} ${game.score === 1 ? "point" : "points"}`, action: "Play again" }
        : null;
    return React2.createElement(
      "div",
      { className: "snake", "data-status": game.status },
      React2.createElement(
        "div",
        { className: "snake-hud" },
        React2.createElement(
          "div",
          { className: "snake-stat" },
          React2.createElement("span", { className: "snake-stat__label" }, "Score"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "snake-score" }, game.score)
        ),
        React2.createElement(
          "div",
          { className: "snake-stat snake-stat--best" },
          React2.createElement("span", { className: "snake-stat__label" }, React2.createElement(Trophy, { size: 14, "aria-hidden": true }), "Best"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "snake-best" }, best)
        ),
        React2.createElement(
          "button",
          { type: "button", className: "snake-pause", onClick: togglePause, disabled: game.status !== "playing" && game.status !== "paused" },
          game.status === "paused" ? "Resume" : "Pause"
        ),
        React2.createElement(
          IconButton,
          { label: "Game sounds", className: "snake-mute", "aria-pressed": soundOn ? "true" : "false", onClick: toggleSound },
          React2.createElement(soundOn ? Volume2 : VolumeX, { size: 20 })
        )
      ),
      React2.createElement(
        "div",
        {
          className: "snake-board",
          role: "grid",
          "aria-label": `Snake field, ${SNAKE_SIZE} by ${SNAKE_SIZE}`,
          "data-head": `${head.x},${head.y}`,
          "data-length": game.snake.length,
          onPointerDown,
          onPointerUp,
          onPointerCancel: () => (swipe.current = null)
        },
        cells,
        pop &&
          React2.createElement(
            "span",
            { key: `gulp-${pop.at}`, className: "snake-fruit snake-fruit--gulp", style: { "--x": pop.x, "--y": pop.y, "--gulp": `${pop.ms}ms` }, "aria-hidden": true },
            SNAKE_FRUITS.find((f) => f.id === pop.fruit).emoji
          ),
        layer,
        pop && React2.createElement("span", { key: pop.at, className: "snake-pop", style: { "--x": pop.x, "--y": pop.y, "--gulp": `${pop.ms}ms` }, "aria-hidden": true }, `+${pop.points}`),
        message &&
          React2.createElement(
            "div",
            { className: "snake-message", role: "status" },
            ended && record && game.score > 0 && React2.createElement("span", { className: "snake-record" }, "🏆 New record!"),
            React2.createElement("h3", { className: "snake-message__title" }, message.title),
            React2.createElement("p", { className: "snake-message__sub" }, message.sub),
            React2.createElement("button", { ref: playRef, type: "button", className: "snake-play", onClick: start, "data-autofocus": true }, message.action)
          )
      ),
      React2.createElement(
        "div",
        { className: "snake-dpad", role: "group", "aria-label": "Steer the snake" },
        ["up", "left", "right", "down"].map((d) =>
          React2.createElement(
            "button",
            { key: d, type: "button", className: `snake-dpad__btn snake-dpad__btn--${d}`, "aria-label": d[0].toUpperCase() + d.slice(1), onPointerDown: (e) => (e.preventDefault(), turn(d)), onClick: (e) => e.detail === 0 && turn(d) },
            React2.createElement(DpadArrow, { dir: d })
          )
        )
      ),
      React2.createElement(
        "ul",
        { className: "snake-legend", "aria-label": "Fruit points" },
        SNAKE_FRUITS.map((f) => React2.createElement("li", { key: f.id }, React2.createElement("span", { "aria-hidden": true }, f.emoji), `${f.label} +${f.points}`))
      ),
      React2.createElement("p", { className: "snake-hint" }, "Arrow keys or WASD to steer · Space to pause · M for sound · swipe on touch screens")
    );
  }
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
  // mulberry32: a small seeded generator, so a seed replays the same game.
  function tetrisRandom(rng) {
    const next = (rng + 0x6d2b79f5) | 0;
    let t = Math.imul(next ^ (next >>> 15), next | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
  }
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
  /* Breakout maps */
  // A fixed set of 30 maps, dealt in a shuffled order. Each map is a pattern
  // maker plus settings and a seed, so it always builds the same bricks. The
  // makers only choose which squares of the 12×12 brick grid are filled; the
  // builder then decides what kind each brick is.
  const BREAKOUT = { W: 480, H: 640, COLS: 12, ROWS: 12, BW: 34, BH: 16, GAP: 4, X0: 14, Y0: 56 };
  function breakoutRng(seed) {
    let state = seed | 0;
    return () => {
      const [value, next] = tetrisRandom(state);
      state = next;
      return value;
    };
  }
  const cellKey = (col, row) => `${col},${row}`;
  const centredFrom = (width) => Math.floor((BREAKOUT.COLS - width) / 2);
  const breakoutMakers = {
    wall(rng, { rows, cols }) {
      const out = new Set();
      const c0 = centredFrom(cols);
      for (let r = 0; r < rows; r++) for (let c = c0; c < c0 + cols; c++) out.add(cellKey(c, r));
      return out;
    },
    // Two blocks at the sides with an empty middle.
    twin(rng, { rows, cols }) {
      const out = new Set();
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          out.add(cellKey(c, r));
          out.add(cellKey(BREAKOUT.COLS - 1 - c, r));
        }
      return out;
    },
    // Random squares on the left half, mirrored to the right.
    mirror(rng, { rows, density }) {
      const out = new Set();
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < BREAKOUT.COLS / 2; c++)
          if (rng() < density) {
            out.add(cellKey(c, r));
            out.add(cellKey(BREAKOUT.COLS - 1 - c, r));
          }
      return out;
    },
    pyramid(rng, { rows, shape }) {
      const out = new Set();
      for (let r = 0; r < rows; r++) {
        const step = shape === "down" ? rows - 1 - r : r;
        const width = shape === "steps" ? BREAKOUT.COLS - 2 * Math.floor(r / 2) * 2 : Math.min(BREAKOUT.COLS, 2 + 2 * step);
        const c0 = centredFrom(width);
        for (let c = c0; c < c0 + width; c++) out.add(cellKey(c, r));
      }
      return out;
    },
    diamonds(rng, { count, r: radius }) {
      const out = new Set();
      for (let i = 0; i < count; i++) {
        const cx = (BREAKOUT.COLS / count) * (i + 0.5) - 0.5;
        for (let r = 0; r <= radius * 2; r++)
          for (let c = 0; c < BREAKOUT.COLS; c++) if (Math.abs(c - cx) + Math.abs(r - radius) <= radius + 0.5) out.add(cellKey(c, r));
      }
      return out;
    },
    stripes(rng, { rows, style }) {
      const out = new Set();
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < BREAKOUT.COLS; c++) {
          const on = style === "rows" ? r % 2 === 0 : style === "cols" ? c % 2 === 0 : (c + r) % 2 === 0;
          if (on) out.add(cellKey(c, r));
        }
      return out;
    },
    pillars(rng, { rows, width, gap }) {
      const out = new Set();
      const period = width + gap;
      const span = Math.floor((BREAKOUT.COLS + gap) / period) * period - gap;
      const c0 = centredFrom(span);
      for (let r = 0; r < rows; r++) for (let c = 0; c < span; c++) if (c % period < width) out.add(cellKey(c0 + c, r));
      return out;
    },
    // A ring of bricks, an empty moat, and a core in the middle.
    fortress(rng, { core, thick }) {
      const out = new Set();
      const size = core + 2 * (thick + 1);
      const c0 = centredFrom(size);
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) {
          const edge = Math.min(r, c, size - 1 - r, size - 1 - c);
          if (edge < thick || edge > thick) out.add(cellKey(c0 + c, r));
        }
      return out;
    },
    // Cave-like blobs: random fill, then three smoothing passes.
    caves(rng, { rows, density }) {
      let grid = Array.from({ length: rows }, () => Array.from({ length: BREAKOUT.COLS }, () => rng() < density));
      for (let pass = 0; pass < 3; pass++) {
        grid = grid.map((line, r) =>
          line.map((on, c) => {
            let n = 0;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && grid[r + dr] && grid[r + dr][c + dc]) n++;
            return n >= 5 ? true : n <= 2 ? false : on;
          })
        );
      }
      const out = new Set();
      grid.forEach((line, r) => line.forEach((on, c) => on && out.add(cellKey(c, r))));
      return out;
    },
    // A band that waves across the grid.
    waves(rng, { thick, amp, period }) {
      const out = new Set();
      const phase = rng() * Math.PI * 2;
      for (let c = 0; c < BREAKOUT.COLS; c++) {
        const top = Math.round(amp + amp * Math.sin((2 * Math.PI * c) / period + phase));
        for (let r = top; r < top + thick; r++) out.add(cellKey(c, r));
      }
      return out;
    }
  };
  const NEON = ["#ff5fa2", "#ff9f43", "#ffd93d", "#6bdc7b", "#4dd8f0", "#7b8cff", "#c07bff"];
  const STEEL = "#9aa3b5";
  const BOMB = "#ff5a36";
  function breakoutColor(palette, kind, col, row) {
    if (kind === "steel") return STEEL;
    if (kind === "explosive") return BOMB;
    if (palette === "regions") return NEON[Math.floor((col * NEON.length) / BREAKOUT.COLS)];
    if (palette === "by-kind") return kind === "strong" ? NEON[6] : kind === "bonus" ? NEON[2] : NEON[4];
    return NEON[row % NEON.length];
  }
  // Squares → bricks. Kinds are given out by count (not by chance), so a map
  // always has the mix its definition asks for. Steel only goes where it keeps
  // every breakable brick reachable.
  function breakoutBuild(def) {
    const rng = breakoutRng(def.seed);
    const cells = [...breakoutMakers[def.maker](rng, def.params)]
      .map((k) => k.split(",").map(Number))
      .filter(([c, r]) => c >= 0 && c < BREAKOUT.COLS && r >= 0 && r < BREAKOUT.ROWS)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const order = cells.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const n = cells.length;
    const count = (share) => Math.round(share * n);
    const kinds = Array(n).fill("normal");
    let at = 0;
    const give = (kind, k) => {
      for (let i = 0; i < k && at < n; i++) kinds[order[at++]] = kind;
    };
    give("explosive", count(def.mix.explosive));
    give("bonus", count(def.mix.bonus));
    give("strong", count(def.mix.strong));
    const bricks = cells.map(([col, row], i) => {
      const kind = kinds[i];
      const hp = kind === "strong" ? 2 + (i % (def.mix.maxHp - 1)) : 1;
      return { col, row, kind, hp, maxHp: hp, color: breakoutColor(def.palette, kind, col, row) };
    });
    // Strong bricks reach the tier's top strength.
    const strong = bricks.filter((b) => b.kind === "strong");
    if (strong.length) strong[0].hp = strong[0].maxHp = def.mix.maxHp;
    // Steel goes on normal bricks, skipping any spot that would seal something off.
    let steel = count(def.mix.steel);
    for (let i = at; i < n && steel > 0; i++) {
      const b = bricks[order[i]];
      if (b.kind !== "normal") continue;
      const was = { kind: b.kind, hp: b.hp, color: b.color };
      Object.assign(b, { kind: "steel", hp: Infinity, maxHp: Infinity, color: STEEL });
      if (breakoutCheck(bricks).ok) steel--;
      else Object.assign(b, was, { maxHp: was.hp });
    }
    return bricks;
  }
  // Every breakable brick must be reachable by the ball, which comes from
  // below the bricks and can also pass above them. Steel blocks the way;
  // breakable bricks count as open, because they can be broken.
  function breakoutCheck(bricks) {
    const breakable = bricks.filter((b) => b.kind !== "steel").length;
    if (breakable < 8) return { ok: false, breakable, reason: "too-few" };
    const steel = new Set(bricks.filter((b) => b.kind === "steel").map((b) => cellKey(b.col, b.row)));
    for (let r = 0; r < BREAKOUT.ROWS; r++) {
      let all = true;
      for (let c = 0; c < BREAKOUT.COLS && all; c++) all = steel.has(cellKey(c, r));
      if (all) return { ok: false, breakable, reason: "sealed" };
    }
    const bottom = Math.max(...bricks.map((b) => b.row)) + 1;
    const seen = new Set();
    const queue = [];
    for (let c = 0; c < BREAKOUT.COLS; c++) queue.push([c, bottom]);
    while (queue.length) {
      const [c, r] = queue.pop();
      const k = cellKey(c, r);
      if (c < 0 || c >= BREAKOUT.COLS || r < -1 || r > bottom || seen.has(k) || steel.has(k)) continue;
      seen.add(k);
      queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    const unreachable = bricks.some((b) => b.kind !== "steel" && !seen.has(cellKey(b.col, b.row)));
    return unreachable ? { ok: false, breakable, reason: "unreachable" } : { ok: true, breakable };
  }
  // A shuffled order of all 30 maps that never starts with the map just played.
  function breakoutDeck(rng, lastId) {
    const ids = BREAKOUT_MAPS.map((d) => d.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (ids[0] === lastId) {
      const j = 1 + Math.floor(rng() * (ids.length - 1));
      [ids[0], ids[j]] = [ids[j], ids[0]];
    }
    return ids;
  }
  const GENTLE = { strong: 0.05, maxHp: 2, steel: 0, explosive: 0.02, bonus: 0.08 };
  const MEDIUM = { strong: 0.22, maxHp: 3, steel: 0.05, explosive: 0.05, bonus: 0.08 };
  const TOUGH = { strong: 0.4, maxHp: 5, steel: 0.1, explosive: 0.06, bonus: 0.08 };
  const map = (id, tier, maker, params, seed, palette = "rainbow-rows") => ({ id, tier, maker, params, seed, palette, mix: tier === "gentle" ? GENTLE : tier === "medium" ? MEDIUM : TOUGH });
  const BREAKOUT_MAPS = [
    map("g-wall", "gentle", "wall", { rows: 4, cols: 10 }, 11),
    map("g-twin", "gentle", "twin", { rows: 4, cols: 4 }, 12, "regions"),
    map("g-pyramid", "gentle", "pyramid", { rows: 5, shape: "up" }, 13),
    map("g-stripes", "gentle", "stripes", { rows: 5, style: "rows" }, 14),
    map("g-pillars", "gentle", "pillars", { rows: 4, width: 2, gap: 1 }, 15, "regions"),
    map("g-diamonds", "gentle", "diamonds", { count: 2, r: 2 }, 16),
    map("g-mirror", "gentle", "mirror", { rows: 4, density: 0.55 }, 17, "regions"),
    map("g-waves", "gentle", "waves", { thick: 2, amp: 1, period: 6 }, 18),
    map("g-caves", "gentle", "caves", { rows: 5, density: 0.6 }, 19, "by-kind"),
    map("g-checker", "gentle", "stripes", { rows: 5, style: "checker" }, 20),
    map("m-wall", "medium", "wall", { rows: 7, cols: 11 }, 31),
    map("m-twin", "medium", "twin", { rows: 7, cols: 4 }, 32, "regions"),
    map("m-pyramid", "medium", "pyramid", { rows: 6, shape: "down" }, 33),
    map("m-diamond", "medium", "diamonds", { count: 1, r: 3 }, 34),
    map("m-fortress", "medium", "fortress", { core: 2, thick: 1 }, 35, "by-kind"),
    map("m-mirror", "medium", "mirror", { rows: 6, density: 0.5 }, 36, "regions"),
    map("m-caves", "medium", "caves", { rows: 7, density: 0.55 }, 37),
    map("m-waves", "medium", "waves", { thick: 3, amp: 2, period: 8 }, 38),
    map("m-pillars", "medium", "pillars", { rows: 6, width: 1, gap: 1 }, 39),
    map("m-columns", "medium", "stripes", { rows: 7, style: "cols" }, 40, "regions"),
    map("m-steps", "medium", "pyramid", { rows: 6, shape: "steps" }, 41),
    map("m-diamonds", "medium", "diamonds", { count: 2, r: 3 }, 42, "by-kind"),
    map("t-wall", "tough", "wall", { rows: 10, cols: 12 }, 51),
    map("t-twin", "tough", "twin", { rows: 9, cols: 5 }, 52, "regions"),
    map("t-fortress", "tough", "fortress", { core: 4, thick: 1 }, 53, "by-kind"),
    map("t-keep", "tough", "fortress", { core: 2, thick: 2 }, 54),
    map("t-mirror", "tough", "mirror", { rows: 9, density: 0.6 }, 55, "regions"),
    map("t-caves", "tough", "caves", { rows: 10, density: 0.55 }, 56),
    map("t-waves", "tough", "waves", { thick: 4, amp: 3, period: 10 }, 57),
    map("t-pillars", "tough", "pillars", { rows: 10, width: 2, gap: 1 }, 58, "regions")
  ];
  const BREAKOUT_FALLBACK = map("fallback", "gentle", "wall", { rows: 6, cols: 10 }, 1);
  // A map's bricks; a map that ever fails the check is replaced by a plain wall.
  function breakoutMap(id) {
    const def = BREAKOUT_MAPS.find((d) => d.id === id) || BREAKOUT_FALLBACK;
    const bricks = breakoutBuild(def);
    return breakoutCheck(bricks).ok ? bricks : breakoutBuild(BREAKOUT_FALLBACK);
  }
  window.__oneBreakout = { BREAKOUT, BREAKOUT_MAPS, breakoutMakers, breakoutRng, breakoutBuild, breakoutCheck, breakoutDeck, breakoutMap };
  const GAMES = [
    { id: "snake", title: "Snake", blurb: "Eat fruit, grow long, mind the walls.", emoji: "🐍", Component: SnakeGame },
    { id: "tetris", title: "Tetris", blurb: "Stack the blocks, clear the lines.", emoji: "🧱", Component: TetrisGame }
  ];
  function GamesPanel({ onClose }) {
    const [gameId, setGameId] = React2.useState(null);
    const ref = React2.useRef(null);
    const records = React2.useMemo(loadGameRecords, [gameId]);
    const game = GAMES.find((g) => g.id === gameId);
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
      if (game) setGameId(null);
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
            game && React2.createElement(IconButton, { label: "All games", onClick: () => setGameId(null) }, React2.createElement(ArrowLeft, { size: 18 })),
            React2.createElement("h2", { className: "games__title" }, game ? game.title : "Retro games"),
            React2.createElement(IconButton, { label: "Close games", className: "games__close", onClick: onClose }, React2.createElement(X, { size: 18 }))
          ),
          game
            ? React2.createElement(game.Component, { escapeRef })
            : React2.createElement(
                "div",
                { className: "games__list" },
                GAMES.map((g) =>
                  React2.createElement(
                    "button",
                    { key: g.id, type: "button", className: "game-card", onClick: () => setGameId(g.id) },
                    React2.createElement("span", { className: "game-card__art", "aria-hidden": true }, g.emoji),
                    React2.createElement("span", { className: "game-card__title" }, g.title),
                    React2.createElement("span", { className: "game-card__blurb" }, g.blurb),
                    React2.createElement("span", { className: "game-card__best" }, React2.createElement(Trophy, { size: 14, "aria-hidden": true }), `Best ${(records[g.id] || {}).best || 0}`)
                  )
                ),
                React2.createElement("p", { className: "games__soon" }, "More retro games are on the way.")
              )
        )
      ),
      document.body
    );
  }
  window.__oneGames = { GamesPanel };
})();
