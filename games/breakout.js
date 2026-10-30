// ONE — Breakout. Loaded only when this game is opened from Retro games
// (games/panel.js); leaving the game unmounts it and stops everything it runs.
(function () {
  const { React2, reactDom, IconButton, FOCUSABLE, icons, useGameRecord, loadGameRecords, retroSound, RETRO_NOTES, tetrisRandom, useActiveGame } = window.__oneGameKit;
  const { Trophy, X, ArrowLeft, Volume2, VolumeX } = icons;
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
  /* Breakout physics */
  // breakoutStep(state, ms, input) moves everything by ms and returns a new
  // state; `events` says what happened in that step (for sounds and effects).
  // Each step is cut into sub-steps of at most 4 px of ball travel, so a fast
  // ball can't slip through a brick.
  const PADDLE = { Y: 600, H: 12, W: 88, WIDE: 132, KEYS: 520 };
  const BALL = { R: 7, SPEED: 340, SLOW: 238 };
  const CAPSULE = { W: 30, H: 14, FALL: 140 };
  const EFFECT_MS = { wide: 15000, slow: 12000 };
  const CAPSULE_KINDS = [["wide", 3], ["multi", 3], ["slow", 3], ["life", 1]];
  const MIN_ANGLE = (15 * Math.PI) / 180;
  // A ball that hits steel this many times in a row, with no brick or paddle
  // in between, is turned towards the paddle (it may be wedged).
  const STALL_HITS = 6;
  function breakoutRoll(s) {
    const [value, next] = tetrisRandom(s.seed);
    s.seed = next;
    return value;
  }
  function brickRect(b) {
    return { x: BREAKOUT.X0 + b.col * (BREAKOUT.BW + BREAKOUT.GAP), y: BREAKOUT.Y0 + b.row * (BREAKOUT.BH + BREAKOUT.GAP), w: BREAKOUT.BW, h: BREAKOUT.BH };
  }
  function stuckBall(paddle) {
    return { x: paddle.x, y: PADDLE.Y - BALL.R - 1, vx: 0, vy: 0, stuck: true, stall: 0 };
  }
  // A new map: fresh bricks, paddle, ball and power-ups; score and lives stay.
  function breakoutLoadMap(s, id) {
    s.mapId = id;
    s.bricks = breakoutMap(id);
    s.paddle = { x: BREAKOUT.W / 2, w: PADDLE.W };
    s.balls = [stuckBall(s.paddle)];
    s.capsules = [];
    s.effects = { wide: 0, slow: 0 };
    s.speed = BALL.SPEED;
    s.status = "ready";
    s.clearMs = 0;
  }
  function breakoutNew(seed) {
    const s = { seed: seed | 0, deck: [], deckIndex: 0, score: 0, lives: 3, events: [] };
    s.deck = breakoutDeck(() => breakoutRoll(s), null);
    breakoutLoadMap(s, s.deck[0]);
    return s;
  }
  function breakoutWithBricks(state, bricks) {
    return { ...state, bricks: bricks.map((b) => ({ ...b })) };
  }
  // Keeps the ball's speed but never lets it travel flatter than 15°.
  function steepen(ball) {
    const speed = Math.hypot(ball.vx, ball.vy);
    if (!speed) return;
    const minVy = speed * Math.sin(MIN_ANGLE);
    if (Math.abs(ball.vy) < minVy) {
      ball.vy = (ball.vy > 0 ? 1 : -1) * minVy;
      ball.vx = (ball.vx >= 0 ? 1 : -1) * Math.sqrt(speed * speed - minVy * minVy);
    }
  }
  // Slow on or off: every ball changes speed together, straight away.
  function syncSpeed(s) {
    const speed = s.effects.slow > 0 ? BALL.SLOW : BALL.SPEED;
    if (speed === s.speed) return;
    for (const ball of s.balls) {
      const now = Math.hypot(ball.vx, ball.vy);
      if (now) {
        ball.vx *= speed / now;
        ball.vy *= speed / now;
      }
    }
    s.speed = speed;
  }
  function launch(ball, s) {
    const angle = (breakoutRoll(s) - 0.5) * ((20 * Math.PI) / 180);
    Object.assign(ball, { stuck: false, vx: s.speed * Math.sin(angle), vy: -s.speed * Math.cos(angle), stall: 0 });
  }
  function breakoutStep(state, dtMs, input) {
    if (state.status === "paused" || state.status === "over") return state;
    const dt = Math.min(dtMs, 50);
    const s = { ...state, events: [], paddle: { ...state.paddle }, effects: { ...state.effects }, balls: state.balls.map((b) => ({ ...b })), capsules: state.capsules.map((c) => ({ ...c })) };
    const emit = (type, extra) => s.events.push({ type, ...extra });
    if (s.status === "cleared") {
      s.clearMs += dt;
      if (s.clearMs >= 1500) {
        s.deckIndex++;
        if (s.deckIndex >= s.deck.length) {
          s.deck = breakoutDeck(() => breakoutRoll(s), s.mapId);
          s.deckIndex = 0;
        }
        breakoutLoadMap(s, s.deck[s.deckIndex]);
      }
      return s;
    }
    // Paddle: follows the pointer, or slides with the keys.
    s.effects.wide = Math.max(0, s.effects.wide - (s.status === "playing" ? dt : 0));
    s.effects.slow = Math.max(0, s.effects.slow - (s.status === "playing" ? dt : 0));
    s.paddle.w = s.effects.wide > 0 ? PADDLE.WIDE : PADDLE.W;
    if (input.targetX != null) s.paddle.x = input.targetX;
    else s.paddle.x += (input.dir || 0) * PADDLE.KEYS * (dt / 1000);
    s.paddle.x = Math.max(s.paddle.w / 2, Math.min(BREAKOUT.W - s.paddle.w / 2, s.paddle.x));
    syncSpeed(s);
    for (const ball of s.balls) if (ball.stuck) ball.x = s.paddle.x;
    if (input.launch) {
      if (s.status === "ready") s.status = "playing";
      for (const ball of s.balls) if (ball.stuck) launch(ball, s);
    }
    if (s.status !== "playing") return s;

    let bricks = state.bricks.map((b) => ({ ...b }));
    const at = new Map(bricks.map((b) => [cellKey(b.col, b.row), b]));
    // One hit point off a brick; a broken explosive sets off its neighbours.
    const damage = (start) => {
      const queue = [start];
      const blown = new Set();
      while (queue.length) {
        const b = queue.shift();
        if (b.dead || b.kind === "steel") continue;
        b.hp -= 1;
        s.score += 10;
        emit("hit", { row: b.row });
        if (b.hp > 0) continue;
        b.dead = true;
        s.score += 10 * b.maxHp;
        emit("break", { row: b.row, col: b.col, kind: b.kind, color: b.color });
        if (b.kind === "bonus") {
          let roll = breakoutRoll(s) * 10;
          const kind = CAPSULE_KINDS.find(([, w]) => (roll -= w) < 0)[0];
          const r = brickRect(b);
          s.capsules.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, kind });
        }
        if (b.kind === "explosive" && !blown.has(b)) {
          blown.add(b);
          s.score += 20;
          emit("boom", { row: b.row, col: b.col });
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const n = (dr || dc) && at.get(cellKey(b.col + dc, b.row + dr));
              if (n && !n.dead) queue.push(n);
            }
        }
      }
    };
    const fastest = Math.max(0, ...s.balls.map((b) => Math.hypot(b.vx, b.vy)));
    const subSteps = Math.max(1, Math.ceil((fastest * dt) / 1000 / 4));
    const h = dt / subSteps;
    const R = BALL.R;
    let cleared = false;
    for (let i = 0; i < subSteps && !cleared; i++) {
      const hitThisStep = new Set();
      for (const ball of s.balls) {
        if (ball.stuck) continue;
        ball.x += (ball.vx * h) / 1000;
        ball.y += (ball.vy * h) / 1000;
        if (ball.x < R) (ball.x = R), (ball.vx = Math.abs(ball.vx));
        if (ball.x > BREAKOUT.W - R) (ball.x = BREAKOUT.W - R), (ball.vx = -Math.abs(ball.vx));
        if (ball.y < R) (ball.y = R), (ball.vy = Math.abs(ball.vy));
        // Paddle: where it hits sets the angle, up to 60° at the edges.
        const p = s.paddle;
        if (ball.vy > 0 && ball.y + R >= PADDLE.Y && ball.y - R <= PADDLE.Y + PADDLE.H && Math.abs(ball.x - p.x) <= p.w / 2 + R) {
          const offset = Math.max(-1, Math.min(1, (ball.x - p.x) / (p.w / 2)));
          const angle = offset * (Math.PI / 3);
          ball.vx = s.speed * Math.sin(angle);
          ball.vy = -s.speed * Math.cos(angle);
          ball.y = PADDLE.Y - R;
          ball.stall = 0;
          emit("paddle");
        }
        // Bricks: bounce off the nearest side of the first one touched.
        for (const b of bricks) {
          if (b.dead) continue;
          const r = brickRect(b);
          const cx = Math.max(r.x, Math.min(ball.x, r.x + r.w));
          const cy = Math.max(r.y, Math.min(ball.y, r.y + r.h));
          if ((ball.x - cx) ** 2 + (ball.y - cy) ** 2 >= R * R) continue;
          const dx = ball.x - (r.x + r.w / 2);
          const dy = ball.y - (r.y + r.h / 2);
          const overlapX = r.w / 2 + R - Math.abs(dx);
          const overlapY = r.h / 2 + R - Math.abs(dy);
          if (overlapX < overlapY) {
            ball.vx = (dx < 0 ? -1 : 1) * Math.abs(ball.vx || 1);
            ball.x += (dx < 0 ? -1 : 1) * overlapX;
          } else {
            ball.vy = (dy < 0 ? -1 : 1) * Math.abs(ball.vy);
            ball.y += (dy < 0 ? -1 : 1) * overlapY;
          }
          if (b.kind === "steel") {
            emit("steel");
            ball.stall = (ball.stall || 0) + 1;
          } else {
            ball.stall = 0;
            if (!hitThisStep.has(b)) {
              hitThisStep.add(b);
              damage(b);
            }
          }
          break;
        }
        if (ball.stall >= STALL_HITS) {
          const speedNow = Math.hypot(ball.vx, ball.vy);
          const angle = Math.atan2(ball.vy, ball.vx);
          const turn = (20 * Math.PI) / 180;
          const down = Math.PI / 2;
          const next = angle + Math.sign(down - angle || 1) * Math.min(turn, Math.abs(down - angle));
          ball.vx = speedNow * Math.cos(next) || speedNow * 0.34;
          ball.vy = speedNow * Math.sin(next);
          ball.stall = 0;
        }
        steepen(ball);
      }
      bricks = bricks.filter((b) => !b.dead);
      // The last brick gone: the map is cleared, even if a ball is falling out.
      cleared = !bricks.some((b) => b.kind !== "steel");
    }
    s.bricks = bricks;
    if (cleared) {
      s.status = "cleared";
      s.clearMs = 0;
      s.score += 500;
      emit("cleared");
      return s;
    }
    // Capsules fall; the paddle catches them.
    const p = s.paddle;
    s.capsules = s.capsules.filter((c) => {
      c.y += (CAPSULE.FALL * dt) / 1000;
      const caught = c.y + CAPSULE.H / 2 >= PADDLE.Y && c.y - CAPSULE.H / 2 <= PADDLE.Y + PADDLE.H && Math.abs(c.x - p.x) <= p.w / 2 + CAPSULE.W / 2;
      if (caught) {
        emit("catch", { kind: c.kind });
        if (c.kind === "wide") s.effects.wide = EFFECT_MS.wide;
        else if (c.kind === "slow") s.effects.slow = EFFECT_MS.slow;
        else if (c.kind === "life") {
          s.lives = Math.min(5, s.lives + 1);
          emit("life");
        } else if (c.kind === "multi") {
          const from = s.balls.find((b) => !b.stuck) || s.balls[0];
          if (from) {
            const sp = Math.hypot(from.vx, from.vy) || s.speed;
            const base = from.stuck ? -Math.PI / 2 : Math.atan2(from.vy, from.vx);
            for (const d of [-25, 25]) {
              const a = base + (d * Math.PI) / 180;
              s.balls.push({ x: from.x, y: from.y, vx: sp * Math.cos(a), vy: sp * Math.sin(a), stuck: false, stall: 0 });
            }
          }
        }
        return false;
      }
      return c.y - CAPSULE.H / 2 <= BREAKOUT.H;
    });
    if (s.effects.wide > 0) s.paddle.w = PADDLE.WIDE;
    syncSpeed(s);
    // Balls that fall out are gone; losing the last one costs a life.
    s.balls = s.balls.filter((b) => b.y - BALL.R <= BREAKOUT.H);
    if (!s.balls.length) {
      s.lives -= 1;
      emit("lost");
      if (s.lives <= 0) {
        s.lives = 0;
        s.status = "over";
        emit("over");
      } else {
        s.capsules = [];
        s.effects = { wide: 0, slow: 0 };
        s.paddle.w = PADDLE.W;
        s.speed = BALL.SPEED;
        s.balls = [stuckBall(s.paddle)];
      }
    }
    return s;
  }
  window.__oneBreakout = {
    BREAKOUT,
    BREAKOUT_MAPS,
    PADDLE,
    BALL,
    breakoutMakers,
    breakoutRng,
    breakoutBuild,
    breakoutCheck,
    breakoutDeck,
    breakoutMap,
    breakoutNew,
    breakoutStep,
    breakoutWithBricks,
    brickRect
  };
  /* Breakout on screen */
  // Fixed twinkling stars for the field.
  const BREAKOUT_STARS = Array.from({ length: 60 }, (_, i) => ({ x: (i * 97.13) % 480, y: (i * 151.7) % 640, r: 0.6 + ((i * 7) % 10) / 10, p: (i * 0.71) % 6.28 }));
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  const CAPSULE_LOOK = { wide: ["🟦", "#4d8dff"], multi: ["⚪", "#e8ecff"], slow: ["🐢", "#6bdc7b"], life: ["❤️", "#ff5fa2"] };
  // Draws one frame. `fx` holds what only the screen needs: particles, the
  // ball trail, the shake and flash, and the drop-in of a new map.
  function breakoutDraw(ctx, s, fx, t) {
    const scale = ctx.canvas.width / BREAKOUT.W;
    const shake = fx.shakeUntil > t ? 3 : 0;
    ctx.setTransform(scale, 0, 0, scale, shake ? (Math.random() - 0.5) * shake * scale : 0, shake ? (Math.random() - 0.5) * shake * scale : 0);
    const bg = ctx.createLinearGradient(0, 0, 0, BREAKOUT.H);
    bg.addColorStop(0, "#0b1030");
    bg.addColorStop(1, "#151c4a");
    ctx.fillStyle = bg;
    ctx.fillRect(-10, -10, BREAKOUT.W + 20, BREAKOUT.H + 20);
    ctx.strokeStyle = "rgba(120, 140, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= BREAKOUT.W; x += 32) ctx.moveTo(x, 0), ctx.lineTo(x, BREAKOUT.H);
    for (let y = 0; y <= BREAKOUT.H; y += 32) ctx.moveTo(0, y), ctx.lineTo(BREAKOUT.W, y);
    ctx.stroke();
    for (const st of BREAKOUT_STARS) {
      ctx.globalAlpha = fx.still ? 0.6 : 0.35 + 0.35 * Math.sin(t / 700 + st.p);
      ctx.fillStyle = "#fff";
      ctx.fillRect(st.x, st.y, st.r, st.r);
    }
    ctx.globalAlpha = 1;
    // Bricks (a new map drops in from above).
    const drop = fx.still ? 1 : Math.min(1, (t - fx.dropAt) / 400);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of s.bricks) {
      const r = brickRect(b);
      const y = r.y - (1 - Math.min(1, Math.max(0, drop * 1.6 - b.row * 0.05))) * 220;
      ctx.save();
      if (b.kind === "steel") {
        const g = ctx.createLinearGradient(0, y, 0, y + r.h);
        g.addColorStop(0, "#d5dae6");
        g.addColorStop(1, "#7d8597");
        ctx.fillStyle = g;
        roundRect(ctx, r.x, y, r.w, r.h, 4);
        ctx.fill();
        ctx.fillStyle = "#5d6475";
        for (const dx of [5, r.w - 5]) {
          ctx.beginPath();
          ctx.arc(r.x + dx, y + r.h / 2, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        const life = b.kind === "strong" ? 0.55 + 0.45 * (b.hp / b.maxHp) : 1;
        ctx.globalAlpha = life;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = fx.still ? 0 : 12;
        const g = ctx.createLinearGradient(0, y, 0, y + r.h);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.25, b.color);
        g.addColorStop(1, b.color);
        ctx.fillStyle = g;
        roundRect(ctx, r.x, y, r.w, r.h, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        if (b.kind === "strong") {
          if (b.hp < b.maxHp) {
            ctx.strokeStyle = "rgba(20, 20, 40, 0.45)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(r.x + 8, y + 2);
            ctx.lineTo(r.x + 13, y + 9);
            ctx.lineTo(r.x + 10, y + r.h - 2);
            ctx.stroke();
          }
          // White with a dark outline, readable on every brick colour.
          ctx.font = `700 ${breakoutDigitSize(scale).toFixed(1)}px Fredoka, system-ui, sans-serif`;
          ctx.lineJoin = "round";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(10, 14, 40, 0.75)";
          ctx.strokeText(String(b.hp), r.x + r.w / 2, y + r.h / 2 + 0.5);
          ctx.fillStyle = "#fff";
          ctx.fillText(String(b.hp), r.x + r.w / 2, y + r.h / 2 + 0.5);
        } else if (b.kind === "explosive") {
          const pulse = fx.still ? 1 : 1 + 0.15 * Math.sin(t / 150);
          ctx.fillStyle = "#fff6d0";
          ctx.font = `700 ${Math.round(13 * pulse)}px system-ui, sans-serif`;
          ctx.fillText("✸", r.x + r.w / 2, y + r.h / 2 + 0.5);
        } else if (b.kind === "bonus") {
          ctx.fillStyle = "#fff";
          ctx.font = "700 11px system-ui, sans-serif";
          ctx.fillText("★", r.x + r.w / 2, y + r.h / 2 + 0.5);
        }
      }
      ctx.restore();
    }
    // Capsules.
    ctx.font = "14px system-ui, sans-serif";
    for (const c of s.capsules) {
      const [emoji, color] = CAPSULE_LOOK[c.kind];
      ctx.fillStyle = "rgba(10, 14, 40, 0.75)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      roundRect(ctx, c.x - 15, c.y - 9, 30, 18, 9);
      ctx.fill();
      ctx.stroke();
      ctx.fillText(emoji, c.x, c.y + 1);
    }
    // Paddle.
    const p = s.paddle;
    ctx.save();
    ctx.shadowColor = "#4dd8f0";
    ctx.shadowBlur = fx.still ? 0 : 16;
    const pg = ctx.createLinearGradient(0, PADDLE.Y, 0, PADDLE.Y + PADDLE.H);
    pg.addColorStop(0, "#c9f6ff");
    pg.addColorStop(1, "#27b3d6");
    ctx.fillStyle = pg;
    roundRect(ctx, p.x - p.w / 2, PADDLE.Y, p.w, PADDLE.H, PADDLE.H / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    roundRect(ctx, p.x - p.w / 6, PADDLE.Y + 3, p.w / 3, 4, 2);
    ctx.fill();
    // Trail, then balls.
    if (!fx.still)
      fx.trail.forEach((pos, i) => {
        ctx.globalAlpha = ((i + 1) / fx.trail.length) * 0.25;
        ctx.fillStyle = "#7fe9ff";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, BALL.R * (0.5 + (0.5 * (i + 1)) / fx.trail.length), 0, Math.PI * 2);
        ctx.fill();
      });
    ctx.globalAlpha = 1;
    for (const ball of s.balls) {
      ctx.save();
      ctx.shadowColor = "#7fe9ff";
      ctx.shadowBlur = fx.still ? 0 : 14;
      const bg2 = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, BALL.R);
      bg2.addColorStop(0, "#ffffff");
      bg2.addColorStop(1, "#8feeff");
      ctx.fillStyle = bg2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL.R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Particles and flash.
    for (const q of fx.particles) {
      ctx.globalAlpha = Math.max(0, q.life);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    if (fx.flashUntil > t) {
      ctx.fillStyle = `rgba(255, 220, 180, ${(0.25 * (fx.flashUntil - t)) / 150})`;
      ctx.fillRect(0, 0, BREAKOUT.W, BREAKOUT.H);
    }
  }
  // Hit numbers: at least 9 CSS px on screen, never taller than a brick.
  function breakoutDigitSize(scale) {
    return Math.min(15, Math.max(11, 9.2 / scale));
  }
  window.__oneBreakout.breakoutDigitSize = breakoutDigitSize;
  const BREAKOUT_KEYS = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
  // A new run. Tests may fix the seed, the first map's bricks and the lives.
  function breakoutFresh() {
    let s = breakoutNew(window.__oneBreakoutSeed ?? Date.now());
    if (window.__oneBreakoutBricks) s = breakoutWithBricks(s, window.__oneBreakoutBricks);
    if (window.__oneBreakoutLives) s = { ...s, lives: window.__oneBreakoutLives };
    return s;
  }
  function BreakoutGame({ escapeRef }) {
    useActiveGame("breakout");
    const canvasRef = React2.useRef(null);
    const stateRef = React2.useRef(null);
    if (!stateRef.current) stateRef.current = breakoutFresh();
    const input = React2.useRef({ targetX: null, keys: new Set(), launch: false, loseBall: false });
    const fx = React2.useRef({ particles: [], trail: [], shakeUntil: 0, flashUntil: 0, dropAt: 0, still: false });
    const [hud, setHud] = React2.useState(() => ({ status: stateRef.current.status, score: 0, lives: stateRef.current.lives }));
    const [best, offerBest] = useGameRecord("breakout");
    const [record, setRecord] = React2.useState(false);
    const [hurt, setHurt] = React2.useState(0);
    const [soundOn, setSoundOn] = React2.useState(retroSound.on);
    const playRef = React2.useRef(null);
    const syncHud = React2.useCallback(() => {
      const s = stateRef.current;
      setHud((h) => (h.status === s.status && h.score === s.score && h.lives === s.lives ? h : { status: s.status, score: s.score, lives: s.lives }));
    }, []);
    const setStatus = React2.useCallback(
      (status) => {
        stateRef.current = { ...stateRef.current, status };
        syncHud();
      },
      [syncHud]
    );
    const restart = React2.useCallback(() => {
      stateRef.current = breakoutFresh();
      fx.current.particles = [];
      fx.current.dropAt = performance.now();
      setRecord(false);
      syncHud();
    }, [syncHud]);
    // Launching happens at once (a zero-length step), not on the next frame.
    // At game over only "Play again" (or Space after a moment) starts a new
    // run, so the score card isn't skipped by a tap meant for the last ball.
    const overAt = React2.useRef(0);
    const launch = React2.useCallback(() => {
      const s = stateRef.current;
      if (s.status !== "ready" && s.status !== "playing") return;
      stateRef.current = breakoutStep(s, 0, { targetX: input.current.targetX, dir: 0, launch: true });
      syncHud();
    }, [syncHud]);
    const playAgain = React2.useCallback(() => {
      restart();
      launch();
    }, [restart, launch]);
    const offerBestRef = React2.useRef(offerBest);
    offerBestRef.current = offerBest;
    const recordTimer = React2.useRef(0);
    React2.useEffect(() => () => window.clearTimeout(recordTimer.current), []);
    const togglePause = React2.useCallback(() => {
      const s = stateRef.current.status;
      if (s === "playing") setStatus("paused");
      else if (s === "paused") setStatus("playing");
    }, [setStatus]);
    const toggleSound = React2.useCallback(() => {
      setSoundOn((on) => {
        retroSound.setOn(!on);
        return !on;
      });
    }, []);
    React2.useEffect(() => {
      if (!escapeRef) return;
      escapeRef.current = () => {
        if (stateRef.current.status !== "playing") return false;
        togglePause();
        return true;
      };
      return () => {
        escapeRef.current = null;
      };
    }, [escapeRef, togglePause]);
    React2.useEffect(() => {
      // Test hooks: end the current ball, and read the screen effects.
      window.__oneBreakoutControl = { loseBall: () => (input.current.loseBall = true) };
      window.__oneBreakoutFx = fx.current;
      return () => {
        delete window.__oneBreakoutControl;
        delete window.__oneBreakoutFx;
      };
    }, []);
    // Sounds and effects from what happened in a step.
    const react = React2.useCallback((events, t) => {
      const f = fx.current;
      let hitSound = false;
      for (const e of events) {
        if (e.type === "paddle") retroSound.bPaddle();
        else if (e.type === "hit" && !hitSound) {
          hitSound = true;
          retroSound.bHit(e.row);
        } else if (e.type === "steel") retroSound.bSteel();
        else if (e.type === "break" && !f.still) {
          const r = brickRect(e);
          for (let i = 0; i < 10; i++) f.particles.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.8) * 200, life: 1, color: e.color });
        } else if (e.type === "boom") {
          retroSound.bBoom();
          if (!f.still) {
            f.shakeUntil = t + 150;
            f.flashUntil = t + 150;
          }
        } else if (e.type === "catch") retroSound.bCatch();
        else if (e.type === "lost") {
          retroSound.bLost();
          setHurt((n) => n + 1);
        } else if (e.type === "cleared") {
          retroSound.bCleared();
          if (!f.still) for (let i = 0; i < 60; i++) f.particles.push({ x: 240, y: 320, vx: (Math.random() - 0.5) * 520, vy: (Math.random() - 0.5) * 520, life: 1.4, color: NEON[i % NEON.length] });
        } else if (e.type === "over") {
          // The record is kept the moment the game ends.
          overAt.current = t;
          retroSound.over();
          if (offerBestRef.current(stateRef.current.score)) {
            setRecord(true);
            recordTimer.current = window.setTimeout(() => retroSound.record(), 950);
          }
        }
      }
    }, []);
    // The game loop.
    React2.useEffect(() => {
      let raf = 0;
      let last = performance.now();
      let lastAttrs = 0;
      let prevMap = stateRef.current.mapId;
      const frame = (t) => {
        window.__oneBreakoutFrames = (window.__oneBreakoutFrames || 0) + 1;
        const f = fx.current;
        f.still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const dt = t - last;
        last = t;
        let s = stateRef.current;
        if (input.current.loseBall && s.status === "playing") {
          input.current.loseBall = false;
          s = { ...s, balls: [] };
        }
        const keys = input.current.keys;
        const dir = (keys.has(1) ? 1 : 0) - (keys.has(-1) ? 1 : 0);
        const next = breakoutStep(s, dt, { targetX: input.current.targetX, dir, launch: input.current.launch });
        input.current.launch = false;
        stateRef.current = next;
        if (next.events.length) react(next.events, t);
        if (next.mapId !== prevMap) {
          prevMap = next.mapId;
          f.dropAt = t;
        }
        // Screen-only effects.
        f.particles = f.particles.filter((q) => {
          q.x += (q.vx * dt) / 1000;
          q.y += (q.vy * dt) / 1000;
          q.vy += (500 * dt) / 1000;
          q.life -= dt / 600;
          return q.life > 0;
        });
        if (next.status === "playing" && next.balls[0] && !next.balls[0].stuck) {
          f.trail.push({ x: next.balls[0].x, y: next.balls[0].y });
          if (f.trail.length > 8) f.trail.shift();
        } else f.trail = [];
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) breakoutDraw(ctx, next, f, t);
          if (t - lastAttrs > 100) {
            lastAttrs = t;
            canvas.dataset.paddleX = Math.round(next.paddle.x);
            canvas.dataset.balls = next.balls.length;
            canvas.dataset.bricks = next.bricks.filter((b) => b.kind !== "steel").length;
            canvas.dataset.map = next.mapId;
          }
        }
        syncHud();
        raf = window.requestAnimationFrame(frame);
      };
      raf = window.requestAnimationFrame(frame);
      return () => window.cancelAnimationFrame(raf);
    }, [react, syncHud]);
    React2.useEffect(() => {
      if (hud.status === "over") window.requestAnimationFrame(() => playRef.current && playRef.current.focus());
    }, [hud.status]);
    // The canvas is drawn at the screen's pixel density.
    React2.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const fit = () => {
        const w = canvas.clientWidth;
        if (!w) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(w * dpr * (BREAKOUT.H / BREAKOUT.W));
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);
    // Keys, a hidden tab, leaving the window.
    React2.useEffect(() => {
      const onKey = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const dir = BREAKOUT_KEYS[e.key];
        if (dir) {
          e.preventDefault();
          input.current.targetX = null;
          input.current.keys.add(dir);
        } else if (e.key === " " || e.key === "ArrowUp") {
          e.preventDefault();
          if (e.repeat) return;
          if (stateRef.current.status !== "over") launch();
          else if (performance.now() - overAt.current > 700) playAgain();
        } else if (e.key === "p" || e.key === "P") {
          e.preventDefault();
          togglePause();
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          toggleSound();
        }
      };
      const onUp = (e) => {
        const dir = BREAKOUT_KEYS[e.key];
        if (dir) input.current.keys.delete(dir);
      };
      const letGo = () => input.current.keys.clear();
      const onHide = () => {
        if (document.hidden && stateRef.current.status === "playing") setStatus("paused");
      };
      window.addEventListener("keydown", onKey);
      window.addEventListener("keyup", onUp);
      window.addEventListener("blur", letGo);
      document.addEventListener("visibilitychange", onHide);
      return () => {
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onUp);
        window.removeEventListener("blur", letGo);
        document.removeEventListener("visibilitychange", onHide);
      };
    }, [launch, playAgain, togglePause, toggleSound, setStatus]);
    const pointerX = (e) => {
      const r = canvasRef.current.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * BREAKOUT.W;
    };
    const onPointerMove = (e) => {
      if (e.pointerType === "mouse" || e.buttons) input.current.targetX = pointerX(e);
    };
    const onPointerDown = (e) => {
      input.current.targetX = pointerX(e);
      if (e.target.closest("button")) return;
      launch();
    };
    const status = hud.status;
    const message =
      status === "ready"
        ? { title: "Ready?", sub: "Break every brick. Catch the power-ups.", action: "Play", onClick: launch }
        : status === "paused"
        ? { title: "Paused", sub: "Take a breath.", action: "Resume", onClick: togglePause, extra: { label: "Restart", onClick: restart } }
        : status === "cleared"
        ? { title: "Map cleared!", sub: "+500" }
        : status === "over"
        ? { title: "Game over", sub: `${hud.score} ${hud.score === 1 ? "point" : "points"}`, action: "Play again", onClick: playAgain }
        : null;
    return React2.createElement(
      "div",
      { className: "breakout", "data-status": status },
      React2.createElement(
        "div",
        { className: "breakout-hud" },
        React2.createElement(
          "div",
          { className: "breakout-stat" },
          React2.createElement("span", { className: "snake-stat__label" }, "Score"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "breakout-score" }, hud.score)
        ),
        React2.createElement(
          "div",
          { className: "breakout-stat breakout-stat--lives", "data-hurt": hurt ? "true" : void 0, key: `lives-${hurt}` },
          React2.createElement("span", { className: "snake-stat__label" }, "Lives"),
          React2.createElement(
            "span",
            { className: "snake-stat__value" },
            React2.createElement("span", { className: "breakout-hearts", "aria-hidden": true }, "❤".repeat(hud.lives)),
            React2.createElement("span", { className: "breakout-lives num", "data-testid": "breakout-lives" }, hud.lives)
          )
        ),
        React2.createElement(
          "div",
          { className: "breakout-stat breakout-stat--best" },
          React2.createElement("span", { className: "snake-stat__label" }, React2.createElement(Trophy, { size: 14, "aria-hidden": true }), "Best"),
          React2.createElement("span", { className: "snake-stat__value num", "data-testid": "breakout-best" }, best)
        ),
        React2.createElement(
          "div",
          { className: "breakout-buttons" },
          React2.createElement(
            "button",
            { type: "button", className: "snake-pause", onClick: togglePause, disabled: status !== "playing" && status !== "paused" },
            status === "paused" ? "Resume" : "Pause"
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
        // The whole field steers and launches, even under a message.
        { className: "breakout-stage", onPointerMove, onPointerDown, onPointerLeave: () => (input.current.targetX = null) },
        React2.createElement("canvas", { ref: canvasRef, className: "breakout-field", role: "img", "aria-label": "Breakout field" }),
        message &&
          React2.createElement(
            "div",
            { className: "snake-message breakout-message", role: "status" },
            status === "over" && record && hud.score > 0 && React2.createElement("span", { className: "snake-record" }, "🏆 New record!"),
            React2.createElement("h3", { className: "snake-message__title" }, message.title),
            React2.createElement("p", { className: "snake-message__sub" }, message.sub),
            message.action && React2.createElement("button", { ref: playRef, type: "button", className: "snake-play", onClick: message.onClick, "data-autofocus": true }, message.action),
            message.extra && React2.createElement("button", { type: "button", className: "snake-pause breakout-restart", onClick: message.extra.onClick }, message.extra.label)
          )
      ),
      React2.createElement("p", { className: "snake-hint breakout-hint" }, "Mouse or ←→ to move · Click or Space to launch · P pause · M sound")
    );
  }
  window.__oneGameModules = window.__oneGameModules || {};
  window.__oneGameModules["breakout"] = { Component: BreakoutGame };
})();
