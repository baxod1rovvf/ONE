// ONE — Home page. It loads into the same page as index.html (see
// loadPage there), so switching to it never reloads anything. index.html
// shares what the page needs through window.__oneApp; the page is handed
// back in window.__onePages.
(function () {
  "use strict";
  const {
    IconButton, Moon, React2, STARS, SoundsButton, Sun, createLucideIcon, isTypingTarget,
    loadGames, useSound, useStore, useTheme, useToast
  } = window.__oneApp;
  /**
   * @license lucide-react v0.454.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   */
  const Gamepad2 = createLucideIcon("Gamepad2", [
    ["line", { x1: "6", x2: "10", y1: "11", y2: "11", key: "1gktln" }],
    ["line", { x1: "8", x2: "8", y1: "9", y2: "13", key: "qnk9ow" }],
    ["line", { x1: "15", x2: "15.01", y1: "12", y2: "12", key: "krot7o" }],
    ["line", { x1: "18", x2: "18.01", y1: "10", y2: "10", key: "1lcuu1" }],
    ["path", { d: "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z", key: "mfqc10" }]
  ]);
  /* ---------- Meadow (three.js) ---------- */
  // The live Home scene: a rolling hill of instanced grass blades with
  // wildflowers, a tree on the crest, drifting clouds, sun or moon and stars.
  // Plain JS so React only has to start it, steer it and dispose of it.
  const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
  let threeLoading = null;
  function loadThree() {
    if (!threeLoading) {
      threeLoading = import(THREE_URL).catch((e) => {
        threeLoading = null;
        throw e;
      });
    }
    return threeLoading;
  }
  function canUseWebGL() {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  }
  // Morning (0) → pink dusk (0.5) → night (1).
  const MEADOW_PALETTES = [
    { skyTop: "#2c82de", horizon: "#cfe8fb", haze: "#fff0d2", fog: "#cfe4f2", sun: "#fff8e0", hemiSky: "#dff0ff", hemiGround: "#4f7a3a", light: "#fff4dc", grassBase: "#2c6e25", grassTip: "#a6e26c", ground: "#3f8a30", hillFar: "#9cbfae", hillFar2: "#b9d3c4", cloud: "#ffffff", leaf: "#62b046", trunk: "#6a4a2e" },
    { skyTop: "#3d2b7a", horizon: "#ff86ae", haze: "#ffb27a", fog: "#c76f98", sun: "#ffb48a", hemiSky: "#f0a0c0", hemiGround: "#3a2a3a", light: "#ff9a7a", grassBase: "#283c2c", grassTip: "#9a845e", ground: "#2e3a2c", hillFar: "#7a4a7a", hillFar2: "#9a5a86", cloud: "#f19ab4", leaf: "#2f402e", trunk: "#3a2a2a" },
    { skyTop: "#040a24", horizon: "#1c2a6e", haze: "#2a3a8c", fog: "#0f1a46", sun: "#eef2ff", hemiSky: "#3a4c9a", hemiGround: "#071a1a", light: "#9fb4ff", grassBase: "#051a1a", grassTip: "#1f6656", ground: "#082220", hillFar: "#111c46", hillFar2: "#18245a", cloud: "#2a3672", leaf: "#1d4a48", trunk: "#2a2436" }
  ];
  const FLOWER_COLORS = ["#ffffff", "#ffd84a", "#ff8fc0", "#b48cff"];
  function meadowHeight(x, z) {
    const hill = 3.8 * Math.exp(-(x * x) / (2 * 15 * 15) - ((z + 13) * (z + 13)) / (2 * 10 * 10));
    return hill + 0.3 * Math.sin(x * 0.12) * Math.cos(z * 0.1) - 1.2;
  }
  // Small deterministic random so the meadow is the same on every visit.
  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const smooth = (x) => x * x * (3 - 2 * x);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smoothstepJs = (a, b, x) => smooth(clamp01((x - a) / (b - a)));
  const MEADOW_CAMERA_Z = 6.5;
  const GRASS_WIND_GLSL = `
    uniform float uTime;
    uniform float uMotion;
    vec2 windAt(vec3 base) {
      float w = sin(uTime * 1.6 + base.x * 0.35 + base.z * 0.22) * 0.55
              + sin(uTime * 2.7 + base.x * 0.9 - base.z * 0.4) * 0.25
              + sin(uTime * 0.5 + base.z * 0.08) * 0.35;
      return normalize(vec2(1.0, 0.35)) * w * uMotion;
    }
    uniform sampler2D uTouch;
    uniform vec4 uTouchRect;
    // rg: direction the grass is pushed, b: pressure (1 fresh, fading to 0).
    vec3 touchAt(vec3 base) {
      vec2 uv = (base.xz - uTouchRect.xy) / uTouchRect.zw;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
      return texture2D(uTouch, uv).rgb;
    }
  `;
  // The part of the hill the pressure map covers (x, z, width, depth).
  const TOUCH_RECT = [-26, MEADOW_CAMERA_Z - 35, 52, 36.5];
  const TOUCH_SIZE = 256;
  class Meadow {
    constructor(THREE, canvas, { time = 0, reducedMotion = false } = {}) {
      this.loop = this.loop.bind(this);
      this.THREE = THREE;
      this.canvas = canvas;
      this.reducedMotion = reducedMotion;
      this.timeLinear = time;
      this.timeTarget = time;
      this.frames = 0;
      this.disposed = false;
      this.onFirstFrame = null;
      this.raf = 0;
      this.clock = 0;
      this.lastNow = 0;
      this.lowWindows = 0;
      this.fpsWindow = { frames: 0, start: 0 };
      this.fps = 0;
      this.paused = false;
      this.pressureLeft = 0; // upper bound of the pressure map, tracked on the CPU
      this.pointerActive = false;
      this.lastTouch = null;
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      this.bladesTarget = !coarse && window.innerWidth >= 768 ? 60000 : 18000;
      this.pixelRatioCap = 2;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
      this.pal = {};
      for (const k of Object.keys(MEADOW_PALETTES[0])) this.pal[k] = new THREE.Color();
      this.build();
      this.applyPalette();
      this.resizeObserver = new ResizeObserver(() => this.resize(canvas.clientWidth, canvas.clientHeight));
      this.resizeObserver.observe(canvas);
      // Nothing to draw for a hidden tab; pick up where we left off on return.
      this.onVisibility = () => {
        if (document.hidden) {
          if (this.raf) cancelAnimationFrame(this.raf);
          this.raf = 0;
        } else {
          this.lastNow = performance.now();
          this.fpsWindow = { frames: 0, start: this.lastNow };
          if (this.reducedMotion) this.requestRender();
          else this.wake();
        }
      };
      document.addEventListener("visibilitychange", this.onVisibility);
      this.resize(canvas.clientWidth, canvas.clientHeight);
    }
    get time() {
      const t = smooth(clamp01(this.timeLinear));
      return t < 1e-4 ? 0 : t > 1 - 1e-4 ? 1 : t;
    }
    build() {
      const THREE = this.THREE;
      const scene = this.scene;
      const camY = meadowHeight(0, MEADOW_CAMERA_Z) + 0.95;
      this.camera.position.set(0, camY, MEADOW_CAMERA_Z);
      this.camera.lookAt(0, meadowHeight(0, -13) + 3.6, -13);
      scene.fog = new THREE.Fog(0xffffff, 25, 140);
      // Sky dome with sun and moon drawn in the shader.
      this.skyUniforms = {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uHaze: { value: new THREE.Color() },
        uSunColor: { value: new THREE.Color() },
        uMoonColor: { value: new THREE.Color("#f2f5ff") },
        uSunDir: { value: new THREE.Vector3() },
        uMoonDir: { value: new THREE.Vector3() },
        uSun: { value: 1 },
        uMoon: { value: 0 }
      };
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(300, 32, 16),
        new THREE.ShaderMaterial({
          uniforms: this.skyUniforms,
          side: THREE.BackSide,
          depthWrite: false,
          vertexShader: `
            varying vec3 vDir;
            void main() {
              vDir = position;
              vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              gl_Position = p.xyww;
            }`,
          fragmentShader: `
            uniform vec3 uTop, uHorizon, uHaze, uSunColor, uMoonColor, uSunDir, uMoonDir;
            uniform float uSun, uMoon;
            varying vec3 vDir;
            void main() {
              vec3 d = normalize(vDir);
              vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.6, d.y));
              col = mix(uHaze, col, smoothstep(-0.04, 0.16, d.y));
              float sd = max(dot(d, normalize(uSunDir)), 0.0);
              col += uSunColor * (pow(sd, 6.0) * 0.28 + pow(sd, 60.0) * 0.45) * uSun;
              col = mix(col, uSunColor * 1.15, smoothstep(0.99935, 0.9996, sd) * uSun);
              float md = max(dot(d, normalize(uMoonDir)), 0.0);
              col += uMoonColor * (pow(md, 18.0) * 0.22 + pow(md, 300.0) * 0.4) * uMoon;
              col = mix(col, uMoonColor, smoothstep(0.99962, 0.99978, md) * uMoon);
              gl_FragColor = vec4(col, 1.0);
              #include <colorspace_fragment>
            }`
        })
      );
      sky.renderOrder = -10;
      sky.frustumCulled = false;
      scene.add(sky);
      // Stars.
      const rand = seededRandom(7);
      const starPos = new Float32Array(900 * 3);
      for (let i = 0; i < 900; i++) {
        const u = rand() * Math.PI * 2;
        const v = 0.04 + rand() * 0.96;
        const r = 260;
        starPos.set([Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r], i * 3);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      this.stars.renderOrder = -9;
      scene.add(this.stars);
      // Clouds: soft canvas-drawn puffs on sprites.
      const cloudCanvas = document.createElement("canvas");
      cloudCanvas.width = 256;
      cloudCanvas.height = 128;
      const cx = cloudCanvas.getContext("2d");
      for (const [x, y, r] of [[70, 80, 46], [118, 62, 56], [170, 78, 44], [128, 90, 40], [205, 88, 30], [40, 92, 28]]) {
        const g = cx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.6, "rgba(255,255,255,0.55)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        cx.fillStyle = g;
        cx.fillRect(0, 0, 256, 128);
      }
      this.cloudTexture = new THREE.CanvasTexture(cloudCanvas);
      this.cloudTexture.colorSpace = THREE.SRGBColorSpace;
      this.clouds = [];
      for (const [x, y, z, s] of [[-70, 34, -150, 70], [-10, 46, -170, 82], [55, 30, -140, 60], [110, 42, -175, 76], [-125, 50, -180, 70], [20, 24, -120, 44]]) {
        const mat = new THREE.SpriteMaterial({ map: this.cloudTexture, transparent: true, depthWrite: false, fog: false, opacity: 0.92 });
        const sp = new THREE.Sprite(mat);
        sp.position.set(x, y, z);
        sp.scale.set(s, s / 2, 1);
        sp.renderOrder = -8;
        scene.add(sp);
        this.clouds.push(sp);
      }
      // Lights.
      this.hemi = new THREE.HemisphereLight(0xffffff, 0x446633, 1.6);
      scene.add(this.hemi);
      this.sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
      scene.add(this.sunLight);
      // Distant hills.
      this.farHills = [];
      for (const [z, amp, seed, key] of [[-150, 12, 3, "hillFar2"], [-95, 8, 5, "hillFar"]]) {
        const r2 = seededRandom(seed);
        const pts = [];
        const phase = r2() * 10;
        for (let i = 0; i <= 80; i++) {
          const x = -260 + (i / 80) * 520;
          const y = amp * (0.55 + 0.3 * Math.sin(x * 0.02 + phase) + 0.15 * Math.sin(x * 0.055 + phase * 2));
          pts.push(x, y);
        }
        const shape = new THREE.Shape();
        shape.moveTo(-260, -30);
        for (let i = 0; i < pts.length; i += 2) shape.lineTo(pts[i], pts[i + 1]);
        shape.lineTo(260, -30);
        const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }));
        mesh.position.set(0, -2, z);
        mesh.userData.key = key;
        scene.add(mesh);
        this.farHills.push(mesh);
      }
      // The hill.
      const hillGeo = new THREE.PlaneGeometry(140, 110, 140, 110);
      hillGeo.rotateX(-Math.PI / 2);
      hillGeo.translate(0, 0, -35);
      const hp = hillGeo.attributes.position;
      for (let i = 0; i < hp.count; i++) hp.setY(i, meadowHeight(hp.getX(i), hp.getZ(i)));
      hillGeo.computeVertexNormals();
      this.hill = new THREE.Mesh(hillGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      scene.add(this.hill);
      // The tree on the crest.
      const tree = new THREE.Group();
      const tx = 2.4;
      const tz = -14;
      tree.position.set(tx, meadowHeight(tx, tz) - 0.1, tz);
      this.trunkMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, 2.6, 8), this.trunkMat);
      trunk.position.y = 1.3;
      tree.add(trunk);
      this.leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const leafGeo = new THREE.IcosahedronGeometry(1, 2);
      for (const [x, y, z, r] of [[0, 3.2, 0, 1.55], [-1.3, 2.8, 0.2, 1.15], [1.35, 2.9, -0.1, 1.2], [0.4, 3.9, 0.3, 1.1], [-0.6, 3.7, -0.5, 1.05], [0.9, 2.5, 0.7, 0.95], [-0.2, 2.6, 0.9, 1.0]]) {
        const leaf = new THREE.Mesh(leafGeo, this.leafMat);
        leaf.position.set(x, y, z);
        leaf.scale.set(r * 1.1, r * 0.85, r);
        tree.add(leaf);
      }
      scene.add(tree);
      this.tree = tree;
      this.buildTouch();
      this.buildGrass();
      this.buildFireflies();
    }
    // Pressure map: where the hand has brushed the grass. Two render targets
    // ping-pong; each pointer move paints a stroke, each step fades it.
    buildTouch() {
      const THREE = this.THREE;
      const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
      this.touchTargets = [new THREE.WebGLRenderTarget(TOUCH_SIZE, TOUCH_SIZE, opts), new THREE.WebGLRenderTarget(TOUCH_SIZE, TOUCH_SIZE, opts)];
      this.touchRead = 0;
      this.touchCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.touchUniforms = {
        uPrev: { value: null },
        uDecay: { value: 1 },
        uFrom: { value: new THREE.Vector2() },
        uTo: { value: new THREE.Vector2() },
        uPaint: { value: 0 },
        uRadius: { value: 1.15 },
        uSize: { value: new THREE.Vector2(TOUCH_RECT[2], TOUCH_RECT[3]) }
      };
      this.touchQuad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          uniforms: this.touchUniforms,
          depthTest: false,
          depthWrite: false,
          vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
          fragmentShader: `
            uniform sampler2D uPrev;
            uniform float uDecay, uPaint, uRadius;
            uniform vec2 uFrom, uTo, uSize;
            varying vec2 vUv;
            void main() {
              vec4 prev = texture2D(uPrev, vUv);
              float p = max(prev.b * uDecay - (1.0 - uDecay) * 0.04, 0.0);
              vec2 dir = prev.rg;
              if (uPaint > 0.5) {
                vec2 w = vUv * uSize, a = uFrom * uSize, b = uTo * uSize;
                vec2 ba = b - a;
                float h = clamp(dot(w - a, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
                vec2 off = w - (a + ba * h);
                float d = length(off);
                float dab = 1.0 - smoothstep(uRadius * 0.35, uRadius, d);
                vec2 along = length(ba) > 1e-4 ? normalize(ba) : vec2(0.0);
                vec2 push = normalize(off / max(d, 1e-4) + along * 0.7 + vec2(1e-4));
                if (dab > p) dir = mix(dir, push, dab);
                p = max(p, dab);
              }
              gl_FragColor = vec4(dir, p, 1.0);
            }`
        })
      );
      this.touchScene = new THREE.Scene();
      this.touchScene.add(this.touchQuad);
      // A tiny target the map is boiled down to, to read back the strongest press.
      this.touchMaxTarget = new THREE.WebGLRenderTarget(8, 8, { depthBuffer: false });
      this.touchMaxUniforms = { uMap: { value: null } };
      this.touchMaxScene = new THREE.Scene();
      this.touchMaxScene.add(
        new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.ShaderMaterial({
            uniforms: this.touchMaxUniforms,
            depthTest: false,
            depthWrite: false,
            vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
            fragmentShader: `
              uniform sampler2D uMap;
              varying vec2 vUv;
              void main() {
                vec2 cell = floor(vUv * 8.0) / 8.0;
                float m = 0.0;
                for (int y = 0; y < 32; y++)
                  for (int x = 0; x < 32; x++)
                    m = max(m, texture2D(uMap, cell + (vec2(x, y) + 0.5) / 256.0).b);
                gl_FragColor = vec4(m, m, m, 1.0);
              }`
          })
        )
      );
      this.touchPixels = new Uint8Array(8 * 8 * 4);
      this.raycaster = new THREE.Raycaster();
      this.ndc = new THREE.Vector2();
      // Clear both targets.
      for (const t of this.touchTargets) {
        this.renderer.setRenderTarget(t);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear();
      }
      this.renderer.setRenderTarget(null);
    }
    touchPass(decay, from, to) {
      const u = this.touchUniforms;
      u.uPrev.value = this.touchTargets[this.touchRead].texture;
      u.uDecay.value = decay;
      u.uPaint.value = from ? 1 : 0;
      if (from) {
        u.uFrom.value.copy(from);
        u.uTo.value.copy(to);
      }
      const write = 1 - this.touchRead;
      this.renderer.setRenderTarget(this.touchTargets[write]);
      this.renderer.render(this.touchScene, this.touchCamera);
      this.renderer.setRenderTarget(null);
      this.touchRead = write;
      this.grassUniforms.uTouch.value = this.touchTargets[write].texture;
    }
    // ndcX/ndcY in -1..1. Mouse hover counts as touching; touch counts while down.
    setPointer(ndcX, ndcY, active) {
      if (this.disposed) return;
      if (!active) {
        this.pointerActive = false;
        this.lastTouch = null;
        return;
      }
      this.ndc.set(ndcX, ndcY);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const hit = this.raycaster.intersectObject(this.hill, false)[0];
      if (!hit) {
        this.pointerActive = false;
        this.lastTouch = null;
        return;
      }
      this.pointerActive = true;
      const uv = new this.THREE.Vector2((hit.point.x - TOUCH_RECT[0]) / TOUCH_RECT[2], (hit.point.z - TOUCH_RECT[1]) / TOUCH_RECT[3]);
      if (uv.x < 0 || uv.y < 0 || uv.x > 1 || uv.y > 1) {
        this.lastTouch = null;
        return;
      }
      this.touchPass(1, this.lastTouch || uv, uv);
      this.lastTouch = uv;
      this.pressureLeft = 1;
      this.spawnTrailFirefly(hit.point);
      this.requestRender();
    }
    touchMax() {
      this.touchMaxUniforms.uMap.value = this.touchTargets[this.touchRead].texture;
      this.renderer.setRenderTarget(this.touchMaxTarget);
      this.renderer.render(this.touchMaxScene, this.touchCamera);
      this.renderer.readRenderTargetPixels(this.touchMaxTarget, 0, 0, 8, 8, this.touchPixels);
      this.renderer.setRenderTarget(null);
      let m = 0;
      for (let i = 0; i < this.touchPixels.length; i += 4) m = Math.max(m, this.touchPixels[i]);
      return m / 255;
    }
    // Fireflies: 40 wander over the meadow at night, up to 60 more rise from
    // freshly brushed grass and fade after three seconds.
    buildFireflies() {
      const THREE = this.THREE;
      const rand = seededRandom(23);
      this.ambientFlies = Array.from({ length: 40 }, () => {
        const d = 1.5 + rand() * 16;
        const x = (rand() * 2 - 1) * (1.2 + d * 0.55);
        const z = MEADOW_CAMERA_Z - d;
        return { x, z, y: meadowHeight(x, z) + 0.25 + rand() * 0.8, phase: rand() * 10, speed: 0.6 + rand() * 0.8, blink: 1.5 + rand() * 2 };
      });
      this.trailFlies = [];
      this.trailNext = 0;
      const total = 100;
      this.flyPositions = new Float32Array(total * 3);
      this.flyAlpha = new Float32Array(total);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(this.flyPositions, 3));
      geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.flyAlpha, 1));
      this.flyUniforms = { uOpacity: { value: 0 }, uScale: { value: 1 } };
      this.fireflies = new THREE.Points(
        geo,
        new THREE.ShaderMaterial({
          uniforms: this.flyUniforms,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          vertexShader: `
            attribute float aAlpha;
            uniform float uScale;
            varying float vAlpha;
            void main() {
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = clamp(uScale * 140.0 / -mv.z, 3.0, 48.0);
              vAlpha = aAlpha;
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: `
            uniform float uOpacity;
            varying float vAlpha;
            void main() {
              float r = length(gl_PointCoord - 0.5) * 2.0;
              float glow = smoothstep(1.0, 0.0, r);
              glow = glow * glow + smoothstep(0.25, 0.0, r);
              gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * glow, glow * vAlpha * uOpacity);
              #include <colorspace_fragment>
            }`
        })
      );
      this.fireflies.frustumCulled = false;
      this.fireflies.renderOrder = 5;
      this.scene.add(this.fireflies);
    }
    spawnTrailFirefly(point) {
      const now = this.clock;
      if (this.trailFlies.length && now - this.lastSpawn < 0.02) return;
      this.lastSpawn = now;
      const fly = { x: point.x + (Math.random() - 0.5) * 0.8, z: point.z + (Math.random() - 0.5) * 0.8, y: point.y + 0.1, born: now };
      if (this.trailFlies.length < 60) this.trailFlies.push(fly);
      else {
        this.trailFlies[this.trailNext] = fly;
        this.trailNext = (this.trailNext + 1) % 60;
      }
    }
    updateFireflies() {
      const t = this.clock;
      const pos = this.flyPositions;
      const alpha = this.flyAlpha;
      this.ambientFlies.forEach((f, i) => {
        pos[i * 3] = f.x + Math.sin(t * f.speed * 0.5 + f.phase) * 0.7;
        pos[i * 3 + 1] = f.y + Math.sin(t * f.speed + f.phase * 2) * 0.18;
        pos[i * 3 + 2] = f.z + Math.cos(t * f.speed * 0.4 + f.phase) * 0.7;
        alpha[i] = 0.55 + 0.45 * Math.sin(t * f.blink + f.phase);
      });
      for (let i = 0; i < 60; i++) {
        const k = 40 + i;
        const f = this.trailFlies[i];
        const age = f ? t - f.born : 99;
        if (!f || age > 3) {
          alpha[k] = 0;
          continue;
        }
        pos[k * 3] = f.x + Math.sin(age * 3 + i) * 0.08;
        pos[k * 3 + 1] = f.y + (age / 3) * 0.3 + 0.1;
        pos[k * 3 + 2] = f.z;
        alpha[k] = Math.min(1, age * 6) * (1 - age / 3);
      }
      const g = this.fireflies.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      this.flyUniforms.uOpacity.value = smoothstepJs(0.6, 1, this.time);
    }
    visibleFireflies() {
      const o = this.flyUniforms.uOpacity.value;
      let n = 0;
      for (let i = 0; i < this.flyAlpha.length; i++) if (this.flyAlpha[i] * o > 0.05) n++;
      return n;
    }
    buildGrass() {
      const THREE = this.THREE;
      const N = this.bladesTarget;
      const rand = seededRandom(11);
      const offsets = new Float32Array(N * 3);
      const params = new Float32Array(N * 4);
      const jitter = new Float32Array(N);
      // Spread blades over the part of the hill the camera sees: a wedge that
      // widens with distance, so nearby grass is as dense as far grass.
      const maxD = 34;
      const width = (d) => 1.4 + d * 0.62;
      const place = (out, i) => {
        let d;
        do d = 0.3 + rand() * maxD;
        while (rand() > width(d) / width(maxD));
        const x = (rand() * 2 - 1) * width(d);
        const z = MEADOW_CAMERA_Z - d;
        out[i * 3] = x;
        out[i * 3 + 1] = meadowHeight(x, z);
        out[i * 3 + 2] = z;
        return d;
      };
      for (let i = 0; i < N; i++) {
        const d = place(offsets, i);
        params[i * 4] = 0.38 + rand() * 0.42 + (d < 3 ? 0.15 : 0);
        params[i * 4 + 1] = 0.028 + rand() * 0.022;
        params[i * 4 + 2] = rand() * Math.PI * 2;
        params[i * 4 + 3] = (rand() - 0.5) * 0.5;
        jitter[i] = rand();
      }
      // A blade: 5 segments tapering to a point.
      const SEG = 5;
      const pos = [];
      const idx = [];
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        if (s < SEG) pos.push(-0.5, t, 0, 0.5, t, 0);
        else pos.push(0, 1, 0);
      }
      for (let s = 0; s < SEG - 1; s++) {
        const a = s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      idx.push((SEG - 1) * 2, (SEG - 1) * 2 + 1, SEG * 2);
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
      geo.setAttribute("aParams", new THREE.InstancedBufferAttribute(params, 4));
      geo.setAttribute("aJitter", new THREE.InstancedBufferAttribute(jitter, 1));
      geo.instanceCount = N;
      this.grassUniforms = {
        uTime: { value: 0 },
        uMotion: { value: this.reducedMotion ? 0 : 1 },
        uBase: { value: new THREE.Color() },
        uTip: { value: new THREE.Color() },
        uFogColor: { value: new THREE.Color() },
        uFogNear: { value: 25 },
        uFogFar: { value: 140 },
        uTouch: { value: this.touchTargets[0].texture },
        uTouchRect: { value: new THREE.Vector4(...TOUCH_RECT) },
        uPressTint: { value: new THREE.Color() }
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.grassUniforms,
        side: THREE.DoubleSide,
        vertexShader: `
          uniform float uFogNear; uniform float uFogFar;
          attribute vec3 aOffset;
          attribute vec4 aParams;
          attribute float aJitter;
          ${GRASS_WIND_GLSL}
          varying float vT;
          varying float vJ;
          varying float vFog;
          varying float vPress;
          void main() {
            float t = position.y;
            float c = cos(aParams.z), s = sin(aParams.z);
            vec3 p = vec3(position.x * aParams.y * (1.0 - t * 0.8), t * aParams.x, 0.0);
            p = vec3(p.x * c, p.y, p.x * s);
            vec2 wind = windAt(aOffset);
            float bend = t * t * aParams.x;
            p.xz += (vec2(aParams.w, aParams.w * 0.4) + wind * 0.45) * bend;
            p.y -= length(wind) * 0.08 * bend;
            // Touched blades bend away from the hand and lie down.
            vec3 touch = touchAt(aOffset);
            float press = touch.b * uMotion;
            p.xz += touch.rg * press * bend * 1.4;
            p.y *= 1.0 - 0.75 * press * t;
            vec4 mv = modelViewMatrix * vec4(p + aOffset, 1.0);
            vPress = touch.b;
            vT = t;
            vJ = aJitter;
            vFog = smoothstep(uFogNear, uFogFar, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uBase, uTip, uFogColor, uPressTint;
          varying float vT;
          varying float vJ;
          varying float vFog;
          varying float vPress;
          void main() {
            vec3 col = mix(uBase, uTip, smoothstep(0.0, 1.0, vT));
            col *= 0.78 + 0.34 * vJ;
            // Brushed grass shows its lighter side, like a stroked lawn.
            col = mix(col, col * 1.5 + uPressTint, smoothstep(0.0, 0.7, vPress) * 0.85);
            col = mix(col, uFogColor, vFog);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`
      });
      this.grass = new THREE.Mesh(geo, mat);
      this.grass.frustumCulled = false;
      this.scene.add(this.grass);
      // Wildflowers: small round heads above the blades, same wind.
      const F = Math.round(N * 0.03);
      const fOff = new Float32Array(F * 3);
      const fParams = new Float32Array(F * 4);
      const fColor = new Float32Array(F * 3);
      const c = new THREE.Color();
      for (let i = 0; i < F; i++) {
        place(fOff, i);
        fParams[i * 4] = 0.32 + rand() * 0.3;
        fParams[i * 4 + 1] = 0.032 + rand() * 0.018;
        fParams[i * 4 + 2] = rand() * Math.PI * 2;
        fParams[i * 4 + 3] = (rand() - 0.5) * 0.4;
        c.set(FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)]);
        fColor.set([c.r, c.g, c.b], i * 3);
      }
      const fGeo = new THREE.InstancedBufferGeometry();
      fGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
      fGeo.setIndex([0, 1, 2, 0, 2, 3]);
      fGeo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(fOff, 3));
      fGeo.setAttribute("aParams", new THREE.InstancedBufferAttribute(fParams, 4));
      fGeo.setAttribute("aColor", new THREE.InstancedBufferAttribute(fColor, 3));
      fGeo.instanceCount = F;
      this.flowerUniforms = {
        uTime: this.grassUniforms.uTime,
        uMotion: this.grassUniforms.uMotion,
        uFogColor: this.grassUniforms.uFogColor,
        uFogNear: this.grassUniforms.uFogNear,
        uFogFar: this.grassUniforms.uFogFar,
        uTouch: this.grassUniforms.uTouch,
        uTouchRect: this.grassUniforms.uTouchRect,
        uShade: { value: 1 }
      };
      const fMat = new THREE.ShaderMaterial({
        uniforms: this.flowerUniforms,
        transparent: false,
        vertexShader: `
          uniform float uFogNear; uniform float uFogFar;
          attribute vec3 aOffset;
          attribute vec4 aParams;
          attribute vec3 aColor;
          ${GRASS_WIND_GLSL}
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vFog;
          void main() {
            vec2 wind = windAt(aOffset);
            vec3 head = aOffset + vec3(0.0, aParams.x, 0.0);
            head.xz += (vec2(aParams.w, aParams.w * 0.4) + wind * 0.45) * aParams.x;
            vec3 touch = touchAt(aOffset);
            head.xz += touch.rg * touch.b * uMotion * aParams.x * 1.4;
            head.y -= 0.6 * touch.b * uMotion * aParams.x;
            vec4 mv = modelViewMatrix * vec4(head, 1.0);
            mv.xy += position.xy * aParams.y;
            vUv = position.xy;
            vColor = aColor;
            vFog = smoothstep(uFogNear, uFogFar, -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uFogColor;
          uniform float uShade;
          varying vec2 vUv;
          varying vec3 vColor;
          varying float vFog;
          void main() {
            float r = length(vUv);
            float a = atan(vUv.y, vUv.x);
            float petal = 0.72 + 0.28 * cos(a * 5.0);
            if (r > petal) discard;
            vec3 col = mix(vec3(1.0, 0.85, 0.3), vColor, smoothstep(0.18, 0.3, r)) * uShade;
            col = mix(col, uFogColor, vFog);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`
      });
      this.flowers = new THREE.Mesh(fGeo, fMat);
      this.flowers.frustumCulled = false;
      this.scene.add(this.flowers);
    }
    applyPalette() {
      const t = this.time;
      const [a, b, k] = t <= 0.5 ? [MEADOW_PALETTES[0], MEADOW_PALETTES[1], t / 0.5] : [MEADOW_PALETTES[1], MEADOW_PALETTES[2], (t - 0.5) / 0.5];
      const tmpA = new this.THREE.Color();
      const tmpB = new this.THREE.Color();
      for (const key of Object.keys(this.pal)) this.pal[key].lerpColors(tmpA.set(a[key]), tmpB.set(b[key]), k);
      const p = this.pal;
      const u = this.skyUniforms;
      u.uTop.value.copy(p.skyTop);
      u.uHorizon.value.copy(p.horizon);
      u.uHaze.value.copy(p.haze);
      u.uSunColor.value.copy(p.sun);
      // The sun sinks to the left through dusk; the moon rises on the right.
      const sunK = clamp01(t / 0.62);
      u.uSunDir.value.set(-0.62 - 0.1 * sunK, 0.3 - 0.36 * sunK, -1);
      u.uSun.value = 1 - smoothstepJs(0.45, 0.62, t);
      const moonK = smoothstepJs(0.5, 1, t);
      u.uMoonDir.value.set(0.42, 0.04 + 0.2 * moonK, -1);
      u.uMoon.value = moonK;
      this.stars.material.opacity = smoothstepJs(0.55, 1, t) * 0.95;
      this.scene.fog.color.copy(p.fog);
      this.grassUniforms.uFogColor.value.copy(p.fog);
      this.grassUniforms.uBase.value.copy(p.grassBase);
      this.grassUniforms.uTip.value.copy(p.grassTip);
      // Daylight lifts brushed grass towards pale green; at night it glows a little.
      this.grassUniforms.uPressTint.value.setRGB(0.1 + 0.04 * t, 0.14 + 0.16 * t, 0.04 + 0.16 * t);
      this.flowerUniforms.uShade.value = 1 - 0.65 * t;
      this.hill.material.color.copy(p.ground);
      this.leafMat.color.copy(p.leaf);
      this.trunkMat.color.copy(p.trunk);
      for (const h of this.farHills) h.material.color.copy(p[h.userData.key]);
      for (const c of this.clouds) {
        c.material.color.copy(p.cloud);
        c.material.opacity = 0.92 - 0.45 * t;
      }
      this.hemi.color.copy(p.hemiSky);
      this.hemi.groundColor.copy(p.hemiGround);
      this.hemi.intensity = 1.9 - 0.6 * t;
      this.sunLight.color.copy(p.light);
      this.sunLight.intensity = 1.8 - 1.3 * t;
      // Key light from the front left so the tree and the hill face us lit.
      this.sunLight.position.set(-25, 40, 30);
    }
    setTime(target, { instant = false } = {}) {
      this.timeTarget = target;
      if (instant || this.reducedMotion) {
        this.timeLinear = target;
        this.applyPalette();
        this.requestRender();
      } else this.wake();
    }
    resize(width, height) {
      if (!width || !height || this.disposed) return;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelRatioCap));
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      // Keep the hill and the tree framed on tall phone screens.
      this.camera.fov = width / height < 0.8 ? 62 : 48;
      this.camera.updateProjectionMatrix();
      this.size = { width, height };
      this.requestRender();
    }
    // Called once per second with the measured frame rate. Two slow seconds in
    // a row halve the blade count (never below 9000) and cap pixel ratio.
    reportFps(fps) {
      this.fps = fps;
      if (fps >= 45) {
        this.lowWindows = 0;
        return;
      }
      this.lowWindows += 1;
      if (this.lowWindows < 2) return;
      this.lowWindows = 0;
      const g = this.grass.geometry;
      g.instanceCount = Math.max(9000, Math.floor(g.instanceCount / 2));
      this.flowers.geometry.instanceCount = Math.round(g.instanceCount * 0.03);
      if (this.pixelRatioCap > 1.5) {
        this.pixelRatioCap = 1.5;
        if (this.size) this.resize(this.size.width, this.size.height);
      }
    }
    start() {
      this.started = true;
      this.lastNow = performance.now();
      this.fpsWindow = { frames: 0, start: this.lastNow };
      if (this.reducedMotion) this.requestRender();
      else this.wake();
    }
    wake() {
      if (this.started && !this.raf && !this.disposed && !document.hidden) this.raf = requestAnimationFrame(this.loop);
    }
    // With reduced motion nothing animates on its own: draw on demand, and keep
    // drawing only while a touch glow is fading out.
    requestRender() {
      if (!this.reducedMotion) return this.wake();
      if (!this.started || this.raf || this.disposed || document.hidden) return;
      this.lastNow = performance.now();
      const frame = () => {
        this.raf = 0;
        if (this.disposed) return;
        const now = performance.now();
        const elapsed = Math.max(0, (now - this.lastNow) / 1000);
        this.lastNow = now;
        this.render(Math.min(0.1, elapsed), elapsed);
        if (this.pressureLeft > 0.01 && !document.hidden) this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    }
    loop(now) {
      this.raf = 0;
      if (this.disposed) return;
      const elapsed = Math.max(0, (now - this.lastNow) / 1000);
      this.lastNow = now;
      if (!this.paused) this.render(Math.min(0.1, elapsed), elapsed);
      if (document.hidden) return;
      this.fpsWindow.frames += 1;
      if (now - this.fpsWindow.start >= 1000) {
        this.reportFps((this.fpsWindow.frames * 1000) / (now - this.fpsWindow.start));
        this.fpsWindow = { frames: 0, start: now };
      }
      this.raf = requestAnimationFrame(this.loop);
    }
    // dt drives wind and clouds (clamped so a stalled tab doesn't jump);
    // elapsed is real time, so Morning ↔ Night takes 2.5 s even on slow devices.
    render(dt, elapsed = dt) {
      if (this.disposed) return;
      this.step(dt, elapsed);
      this.renderOnce();
    }
    // Advances the simulation: time of day, wind, clouds, fading pressure, fireflies.
    step(dt, elapsed = dt) {
      if (this.disposed) return;
      if (this.timeLinear !== this.timeTarget) {
        const step = Math.min(elapsed, 0.5) / 2.5;
        this.timeLinear = this.timeTarget > this.timeLinear ? Math.min(this.timeTarget, this.timeLinear + step) : Math.max(this.timeTarget, this.timeLinear - step);
        this.applyPalette();
      }
      this.clock += dt;
      this.grassUniforms.uTime.value = this.clock;
      if (!this.reducedMotion) {
        for (const c of this.clouds) {
          c.position.x += dt * 1.2;
          if (c.position.x > 170) c.position.x = -170;
        }
      }
      // Real time (capped), so a trail fades in ~3 s even when frames are slow.
      const decay = Math.pow(0.05, Math.min(elapsed, 0.5) / 3);
      this.pressureLeft *= decay;
      this.touchPass(decay, null, null);
      this.updateFireflies();
    }
    renderOnce() {
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
      this.frames += 1;
      if (this.frames === 1 && this.onFirstFrame) this.onFirstFrame();
    }
    stats() {
      return {
        frames: this.frames,
        blades: this.grass.geometry.instanceCount,
        bladesTarget: this.bladesTarget,
        time: this.time,
        animating: !this.reducedMotion && !this.disposed,
        fps: this.fps,
        width: this.size ? this.size.width : 0,
        height: this.size ? this.size.height : 0,
        aspect: this.camera.aspect,
        pixelRatio: this.renderer.getPixelRatio(),
        disposed: this.disposed,
        touchMax: this.disposed ? 0 : this.touchMax(),
        fireflies: this.disposed ? 0 : this.visibleFireflies()
      };
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
      this.cloudTexture.dispose();
      for (const t of this.touchTargets) t.dispose();
      this.touchMaxTarget.dispose();
      this.touchQuad.geometry.dispose();
      this.touchQuad.material.dispose();
      this.touchMaxScene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }
  }
  /* ---------- Break mode ---------- */
  function formatCountdown(ms) {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }
  // A one-minute break measured against the wall clock, so a hidden tab still
  // ends on time. onEnd gets "done" or "user".
  function useBreak(durationMs = 60000, onEnd) {
    const [endsAt, setEndsAt] = React2.useState(null);
    const [, tick] = React2.useState(0);
    const endsAtRef = React2.useRef(null);
    const onEndRef = React2.useRef(onEnd);
    onEndRef.current = onEnd;
    const end = React2.useCallback((reason) => {
      if (endsAtRef.current == null) return;
      endsAtRef.current = null;
      setEndsAt(null);
      if (onEndRef.current) onEndRef.current(reason);
    }, []);
    const start = React2.useCallback(() => {
      endsAtRef.current = Date.now() + durationMs;
      setEndsAt(endsAtRef.current);
    }, [durationMs]);
    React2.useEffect(() => {
      if (endsAt == null) return;
      const check = () => {
        if (Date.now() >= endsAt) end("done");
        else tick((n) => n + 1);
      };
      const id = window.setInterval(check, 250);
      document.addEventListener("visibilitychange", check);
      return () => {
        window.clearInterval(id);
        document.removeEventListener("visibilitychange", check);
      };
    }, [endsAt, end]);
    const isActive = React2.useCallback(() => endsAtRef.current != null, []);
    return { active: endsAt != null, remainingMs: endsAt == null ? 0 : Math.max(0, endsAt - Date.now()), start, end, isActive };
  }
  const BreakPill = React2.forwardRef(function BreakPill2({ remainingMs, onEnd }, ref) {
    return React2.createElement(
      "div",
      { className: "break-pill glass", role: "timer", "aria-live": "off", "aria-label": `Break, ${formatCountdown(remainingMs)} left` },
      React2.createElement("span", { className: "break-pill__label" }, "break"),
      React2.createElement("span", { className: "break-pill__time num" }, formatCountdown(remainingMs)),
      React2.createElement("button", { ref, type: "button", className: "break-pill__end", onClick: onEnd }, "end")
    );
  });
  /* ---------- Home: touch grass ---------- */
  // Home is a meadow you can touch. The live scene (Meadow, three.js) draws into
  // the canvas; MeadowFallback is a painted version shown until the first
  // frame, or for good when WebGL or three.js is unavailable.
  const HAND_PATH = "M11.5 30.5c-3.4-1.9-6.6-6.4-8-10.2-.6-1.7.9-3 2.4-2.1l3.1 2.4V7.7a1.9 1.9 0 0 1 3.8 0v7.6V4.6a1.9 1.9 0 0 1 3.8 0v10.7V5.8a1.9 1.9 0 0 1 3.8 0v9.9V8.6a1.9 1.9 0 0 1 3.8 0v11.6c0 5.6-3.4 10.3-8.6 10.3z";
  // Little "touch" ticks drawn beside the hand while it presses the grass.
  const HAND_TICKS = "M3 9.5 5.6 11M5.5 4.5l1.6 2.5M11 1.2v2.6";
  function HandCursor({ targetRef }) {
    const ref = React2.useRef(null);
    React2.useEffect(() => {
      const target = targetRef.current;
      const hand = ref.current;
      if (!target || !hand) return;
      const show = (on) => {
        hand.dataset.show = on ? "true" : "false";
      };
      const onMove = (e) => {
        if (e.pointerType !== "mouse") return show(false);
        const overUi = e.target instanceof Element && e.target.closest("button, a, input, [role=radio], [role=timer], [role=status]");
        hand.style.transform = `translate3d(${e.clientX - 13}px, ${e.clientY - 5}px, 0)`;
        show(!overUi);
      };
      const onDown = (e) => {
        if (e.pointerType === "mouse") hand.dataset.down = "true";
      };
      const onUp = () => {
        delete hand.dataset.down;
      };
      const onLeave = () => {
        onUp();
        show(false);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerdown", onDown);
      target.addEventListener("pointerup", onUp);
      target.addEventListener("pointercancel", onLeave);
      target.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onLeave);
      return () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerdown", onDown);
        target.removeEventListener("pointerup", onUp);
        target.removeEventListener("pointercancel", onLeave);
        target.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("blur", onLeave);
      };
    }, [targetRef]);
    return React2.createElement(
      "div",
      { ref, className: "hand-cursor", "data-show": "false", "aria-hidden": true },
      React2.createElement(
        "svg",
        { viewBox: "0 0 32 32", width: 40, height: 40 },
        React2.createElement("path", { className: "hand-cursor__ticks", d: HAND_TICKS }),
        React2.createElement("path", { className: "hand-cursor__hand", d: HAND_PATH })
      )
    );
  }
  // Deterministic blades so the painting looks the same every time.
  const FALLBACK_BLADES = Array.from({ length: 140 }, (_, i) => {
    const x = (i * 97.3) % 1440;
    const base = 700 + ((i * 31) % 100);
    const h = 40 + ((i * 53) % 70);
    const lean = ((i * 17) % 30) - 15;
    return `M${x.toFixed(0)} ${base}q${(lean / 2).toFixed(0)} ${-h / 2} ${lean} ${-h}`;
  }).join("");
  function MeadowFallback({ time, hidden }) {
    const night = time === "night";
    return React2.createElement(
      "svg",
      { className: "meadow-fallback", "data-hidden": hidden ? "true" : void 0, viewBox: "0 0 1440 900", preserveAspectRatio: "xMidYMax slice", "aria-hidden": true },
      React2.createElement(
        "defs",
        null,
        React2.createElement(
          "linearGradient",
          { id: "mf-sky", x1: 0, y1: 0, x2: 0, y2: 1 },
          React2.createElement("stop", { offset: "0", stopColor: night ? "#0a1233" : "#3f97ea" }),
          React2.createElement("stop", { offset: "0.6", stopColor: night ? "#1b2668" : "#a9d6f8" }),
          React2.createElement("stop", { offset: "1", stopColor: night ? "#30357e" : "#fff1d6" })
        ),
        React2.createElement(
          "linearGradient",
          { id: "mf-hill", x1: 0, y1: 0, x2: 0, y2: 1 },
          React2.createElement("stop", { offset: "0", stopColor: night ? "#1f5a4c" : "#8ad45a" }),
          React2.createElement("stop", { offset: "1", stopColor: night ? "#0b2a2c" : "#3f9a34" })
        ),
        React2.createElement(
          "radialGradient",
          { id: "mf-glow" },
          React2.createElement("stop", { offset: "0", stopColor: night ? "#dfe8ff" : "#fffbe6", stopOpacity: 0.9 }),
          React2.createElement("stop", { offset: "1", stopColor: night ? "#dfe8ff" : "#fffbe6", stopOpacity: 0 })
        )
      ),
      React2.createElement("rect", { width: 1440, height: 900, fill: "url(#mf-sky)" }),
      night && STARS.map((st, i) => React2.createElement("circle", { key: i, cx: (parseFloat(st.left) / 100) * 1440, cy: (parseFloat(st.top) / 100) * 520, r: 1.4, fill: "#fff", opacity: 0.8 })),
      React2.createElement("circle", { cx: night ? 1080 : 260, cy: night ? 320 : 330, r: 120, fill: "url(#mf-glow)" }),
      React2.createElement("circle", { cx: night ? 1080 : 260, cy: night ? 320 : 330, r: night ? 26 : 34, fill: night ? "#f4f6ff" : "#fffdf0" }),
      React2.createElement("path", { d: "M0 560c200-40 420-60 640-30s520 20 800-20v200H0z", fill: night ? "#18305a" : "#9cc7a6", opacity: 0.7 }),
      React2.createElement("path", { d: "M0 640c240-120 560-150 820-120s440 50 620 80v300H0z", fill: "url(#mf-hill)" }),
      React2.createElement(
        "g",
        { transform: "translate(830 470)" },
        React2.createElement("path", { d: "M-6 60c4-18 3-38 0-58h12c-3 20-4 40 0 58z", fill: night ? "#2b2130" : "#6b4a2f" }),
        [[-34, 0, 34], [10, -16, 38], [44, 6, 30], [-6, -42, 30], [0, 14, 34]].map(([x, y, r], i) =>
          React2.createElement("circle", { key: i, cx: x, cy: y, r, fill: night ? "#183c3a" : i % 2 ? "#4ea640" : "#5cb84a" })
        )
      ),
      React2.createElement("path", { d: FALLBACK_BLADES, stroke: night ? "#2c7a63" : "#5fb845", strokeWidth: 3, strokeLinecap: "round", fill: "none" })
    );
  }
  function HomePage({ onBreakChange }) {
    const { data, setSettings } = useStore();
    const theme = useTheme(data.settings.theme);
    const time = theme === "dark" ? "night" : "morning";
    const rootRef = React2.useRef(null);
    const canvasRef = React2.useRef(null);
    const meadowRef = React2.useRef(null);
    const timeRef = React2.useRef(time);
    timeRef.current = time;
    const [sceneReady, setSceneReady] = React2.useState(false);
    const sound = useSound();
    const [welcome, setWelcome] = React2.useState(false);
    const [gamesOpen, setGamesOpen] = React2.useState(false);
    const [games, setGames] = React2.useState(() => window.__oneGames || null);
    const [gamesWaiting, setGamesWaiting] = React2.useState(false);
    const gamesLoading = React2.useRef(false);
    const toast = useToast();
    // The games file is usually loaded already (see loadGames); if not, the
    // panel opens as soon as it arrives, with a spinner only after 120 ms.
    const openGames = () => {
      if (window.__oneGames) {
        setGames(window.__oneGames);
        setGamesOpen(true);
        return;
      }
      if (gamesLoading.current) return;
      gamesLoading.current = true;
      const spinner = window.setTimeout(() => setGamesWaiting(true), 120);
      loadGames()
        .then((mod) => {
          setGames(mod);
          setGamesOpen(true);
        })
        .catch(() => toast({ tone: "error", message: "Couldn't open the games. Check your connection and try again." }))
        .finally(() => {
          window.clearTimeout(spinner);
          gamesLoading.current = false;
          setGamesWaiting(false);
        });
    };
    const breakButtonRef = React2.useRef(null);
    const endButtonRef = React2.useRef(null);
    const pause = useBreak(60000, (reason) => {
      if (reason === "done") {
        sound.engine.chime();
        setWelcome(true);
      }
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        const idle = !active || active === document.body || (rootRef.current && rootRef.current.contains(active));
        if (idle && breakButtonRef.current) breakButtonRef.current.focus();
      });
    });
    React2.useEffect(() => {
      if (!welcome) return;
      const id = window.setTimeout(() => setWelcome(false), 2500);
      return () => window.clearTimeout(id);
    }, [welcome]);
    React2.useEffect(() => {
      if (onBreakChange) onBreakChange(pause.active);
      if (pause.active && endButtonRef.current) endButtonRef.current.focus();
    }, [pause.active]);
    React2.useEffect(() => () => onBreakChange && onBreakChange(false), []);
    React2.useEffect(() => {
      if (!canUseWebGL()) return;
      let cancelled = false;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      loadThree()
        .then((THREE) => {
          if (cancelled || !canvasRef.current) return;
          const meadow = new Meadow(THREE, canvasRef.current, { time: timeRef.current === "night" ? 1 : 0, reducedMotion });
          meadow.onFirstFrame = () => setSceneReady(true);
          meadowRef.current = meadow;
          window.__oneMeadow = meadow;
          meadow.start();
        })
        .catch(() => {
          // Offline before three.js was cached, or WebGL failed: keep the painting.
        });
      return () => {
        cancelled = true;
        const meadow = meadowRef.current;
        if (meadow) {
          meadow.dispose();
          if (window.__oneMeadow === meadow) delete window.__oneMeadow;
          meadowRef.current = null;
        }
      };
    }, []);
    React2.useEffect(() => {
      if (meadowRef.current) meadowRef.current.setTime(time === "night" ? 1 : 0);
    }, [time]);
    // Pointer → meadow. A mouse touches the grass just by moving over it; a
    // finger or pen only while pressed. UI on top of the meadow never paints.
    React2.useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      let down = false;
      const send = (e, active) => {
        const meadow = meadowRef.current;
        const canvas = canvasRef.current;
        if (!meadow || !canvas) return;
        const overUi = e.target instanceof Element && e.target.closest("button, a, input, [role=radio], [role=timer], [role=status]");
        if (!active || overUi) return meadow.setPointer(0, 0, false);
        const r = canvas.getBoundingClientRect();
        meadow.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), true);
      };
      const onMove = (e) => send(e, e.pointerType === "mouse" || down);
      const onDown = (e) => {
        down = true;
        send(e, true);
      };
      const onUp = (e) => {
        down = false;
        if (e.pointerType !== "mouse") send(e, false);
      };
      const onLeave = (e) => {
        down = false;
        send(e, false);
      };
      const onBlur = () => {
        down = false;
        if (meadowRef.current) meadowRef.current.setPointer(0, 0, false);
      };
      root.addEventListener("pointermove", onMove);
      root.addEventListener("pointerdown", onDown);
      root.addEventListener("pointerup", onUp);
      root.addEventListener("pointercancel", onLeave);
      root.addEventListener("pointerleave", onLeave);
      window.addEventListener("blur", onBlur);
      return () => {
        root.removeEventListener("pointermove", onMove);
        root.removeEventListener("pointerdown", onDown);
        root.removeEventListener("pointerup", onUp);
        root.removeEventListener("pointercancel", onLeave);
        root.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("blur", onBlur);
      };
    }, []);
    const chooseTime = (t) => setSettings({ theme: t === "night" ? "dark" : "light" });
    // During a break: Esc ends it, M and N switch the time of day. Listening
    // all the time (and asking the break) means a key pressed right after the
    // break starts is never missed.
    const chooseTimeRef = React2.useRef(chooseTime);
    chooseTimeRef.current = chooseTime;
    React2.useEffect(() => {
      const chooseTime = (t) => chooseTimeRef.current(t);
      const onKey = (e) => {
        if (!pause.isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
        if (isTypingTarget(e.target) || document.querySelector(".overlay")) return;
        if (e.key === "Escape") {
          e.preventDefault();
          pause.end("user");
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          e.stopImmediatePropagation();
          chooseTime("morning");
        } else if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          e.stopImmediatePropagation();
          chooseTime("night");
        }
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, [pause.isActive, pause.end]);
    const onTimeKey = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        chooseTime(time === "night" ? "morning" : "night");
      }
    };
    const timeOption = (value, label, Icon) =>
      React2.createElement(
        "button",
        {
          type: "button",
          role: "radio",
          className: "meadow-time__opt",
          "aria-checked": time === value ? "true" : "false",
          tabIndex: time === value ? 0 : -1,
          onClick: () => chooseTime(value),
          onKeyDown: onTimeKey
        },
        React2.createElement(Icon, { size: 15, "aria-hidden": true }),
        label
      );
    return React2.createElement(
      "div",
      { ref: rootRef, className: "meadow-home", "data-time": time, "data-break": pause.active ? "true" : void 0 },
      React2.createElement("canvas", { ref: canvasRef, className: "meadow-canvas", "aria-hidden": true }),
      React2.createElement(MeadowFallback, { time, hidden: sceneReady }),
      React2.createElement(
        "header",
        { className: "meadow-hero" },
        React2.createElement("h1", { className: "meadow-hero__title" }, "touch grass"),
        React2.createElement("p", { className: "meadow-hero__sub" }, "without leaving your desk"),
        React2.createElement("button", { ref: breakButtonRef, type: "button", className: "meadow-break", onClick: pause.start, tabIndex: pause.active ? -1 : void 0 }, "try a break")
      ),
      pause.active && React2.createElement(BreakPill, { ref: endButtonRef, remainingMs: pause.remainingMs, onEnd: () => pause.end("user") }),
      welcome && React2.createElement("div", { className: "meadow-welcome glass", role: "status" }, "welcome back 🌱"),
      React2.createElement(
        "div",
        { className: "meadow-controls glass", role: "group", "aria-label": "Meadow controls", inert: pause.active ? "" : void 0 },
        React2.createElement("div", { className: "meadow-time", role: "radiogroup", "aria-label": "Time of day" }, timeOption("morning", "Morning", Sun), timeOption("night", "Night", Moon)),
        React2.createElement(SoundsButton, { className: "meadow-sound" }),
        React2.createElement(
          IconButton,
          {
            label: "Games",
            className: "meadow-sound meadow-games",
            "aria-haspopup": "dialog",
            "aria-expanded": gamesOpen ? "true" : "false",
            "aria-busy": gamesWaiting ? "true" : void 0,
            "data-loading": gamesWaiting ? "true" : void 0,
            onClick: openGames
          },
          React2.createElement(Gamepad2, { size: 18 })
        )
      ),
      gamesOpen && games && React2.createElement(games.GamesPanel, { onClose: () => setGamesOpen(false) }),
      React2.createElement(HandCursor, { targetRef: rootRef })
    );
  }
  window.__onePages = window.__onePages || {};
  window.__onePages.home = HomePage;
})();
