// ONE — Snake. Loaded only when this game is opened from Retro games
// (games/panel.js); leaving the game unmounts it and stops everything it runs.
(function () {
  const { React2, reactDom, IconButton, FOCUSABLE, icons, useGameRecord, loadGameRecords, retroSound, RETRO_NOTES, tetrisRandom, useActiveGame } = window.__oneGameKit;
  const { Trophy, X, ArrowLeft, Volume2, VolumeX } = icons;
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
    useActiveGame("snake");
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
  window.__oneGameModules = window.__oneGameModules || {};
  window.__oneGameModules["snake"] = { Component: SnakeGame };
})();
