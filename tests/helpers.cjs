// Shared test helpers: a static server for the repo, a Chromium launcher, and
// openApp(), which loads ONE with CDN libraries served from tests/node_modules
// (the CDNs are not always reachable from test sandboxes).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const MODULES = path.join(__dirname, "node_modules");
const STORE_KEY = "one.workspace.v1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function startServer() {
  const srv = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ROOT, pathname === "/" ? "index.html" : pathname);
    if (pathname === "/__blank") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<!doctype html><title>blank</title>");
      return;
    }
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<!doctype html><title>blank</title>");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    srv.listen(0, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${srv.address().port}`;
      resolve({ url, close: () => new Promise((r) => srv.close(() => r())) });
    });
  });
}

const CDN_FILES = [
  [/cdnjs\.cloudflare\.com\/.*\/react\.production\.min\.js$/, "react/umd/react.production.min.js"],
  [/cdnjs\.cloudflare\.com\/.*\/react-dom\.production\.min\.js$/, "react-dom/umd/react-dom.production.min.js"],
  [/cdn\.jsdelivr\.net\/npm\/three@0\.169\.0\/build\/three\.module\.js$/, "three/build/three.module.js"]
];
const BLOCKED = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
const FIXTURES = path.join(__dirname, "fixtures");
const AUDIO_HOSTS = /commons\.wikimedia\.org|upload\.wikimedia\.org|api\.quran\.com|audio\.test-quran\.example/;
const CORS = { "access-control-allow-origin": "*" };

// Sound sources (Wikimedia recordings and music, the Quran.com API and its
// audio) are answered from tests/fixtures.
function audioRoute(route, url) {
  const u = new URL(url);
  if (u.hostname === "api.quran.com") {
    if (/\/resources\/chapter_reciters/.test(u.pathname)) {
      return route.fulfill({ path: path.join(FIXTURES, "quran", "chapter_reciters.json"), contentType: "application/json", headers: CORS });
    }
    const m = /\/chapter_recitations\/(\d+)\/(\d+)/.exec(u.pathname);
    if (m) {
      const body = JSON.stringify({ audio_file: { audio_url: `https://audio.test-quran.example/${m[1]}/${m[2]}.mp3` } });
      return route.fulfill({ body, contentType: "application/json", headers: CORS });
    }
    return route.fulfill({ status: 404, body: "{}", headers: CORS });
  }
  const name = decodeURIComponent(u.pathname);
  // Music and recitations are long enough not to end between test steps.
  const long = /gymnop|sonata/i.test(name) || u.hostname === "audio.test-quran.example";
  const file = /rain|cricket/i.test(name) ? "loop.wav" : long ? "music.wav" : "tone.wav";
  return fulfillFile(route, path.join(FIXTURES, "audio", file), "audio/wav");
}

// Answers byte-range requests like a real media server, so audio can seek.
function fulfillFile(route, file, contentType) {
  const body = fs.readFileSync(file);
  const range = /bytes=(\d*)-(\d*)/.exec(route.request().headers().range || "");
  const headers = { ...CORS, "accept-ranges": "bytes" };
  if (!range) return route.fulfill({ status: 200, body, contentType, headers });
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
  return route.fulfill({
    status: 206,
    body: body.subarray(start, end + 1),
    contentType,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${body.length}` }
  });
}

async function launch(opts = {}) {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  browser.__oneOpts = opts;
  return browser;
}

async function newContext(browser, { viewport, hasTouch }) {
  const opts = browser.__oneOpts || {};
  const context = await browser.newContext({
    viewport,
    hasTouch,
    isMobile: false,
    reducedMotion: opts.reducedMotion ? "reduce" : "no-preference"
  });
  if (opts.webgl === false) {
    await context.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/.test(type)) return null;
        return get.call(this, type, ...rest);
      };
    });
  }
  await context.route(/^https:\/\//, (route) => {
    const url = route.request().url();
    if (BLOCKED.test(url)) return route.abort();
    // three.js (the 3D meadow) is only served to browsers launched with
    // { threeD: true }; elsewhere Home shows its painted fallback, which keeps
    // the software renderer used in CI free for the tests that need it.
    if ((opts.blockThree || !opts.threeD) && /three@/.test(url)) return route.abort();
    if (AUDIO_HOSTS.test(url)) return opts.blockAudio ? route.abort() : audioRoute(route, url);
    if (/open\.spotify\.com\/embed\/iframe-api\/v1/.test(url)) {
      return route.fulfill({ path: path.join(FIXTURES, "spotify-iframe-api.js"), contentType: "text/javascript", headers: CORS });
    }
    for (const [re, file] of CDN_FILES) {
      if (re.test(url)) {
        return route.fulfill({
          path: path.join(MODULES, file),
          contentType: "text/javascript",
          headers: { "access-control-allow-origin": "*" }
        });
      }
    }
    return route.abort();
  });
  return context;
}

function watchErrors(page) {
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const where = msg.location() && msg.location().url;
    if (where && (BLOCKED.test(where) || /three@/.test(where) || AUDIO_HOSTS.test(where) || /spotify\.com/.test(where))) return;
    if (/Failed to load resource/.test(msg.text()) && (!where || BLOCKED.test(where) || /three@/.test(where))) return;
    errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));
  return errors;
}

async function waitForApp(page) {
  await page.waitForFunction(() => {
    const root = document.getElementById("root");
    return root && root.children.length > 0;
  }, null, { timeout: 30000 });
}

async function openApp(browser, baseUrl, { route = "home", theme = "light", viewport = { width: 1280, height: 800 }, hasTouch = false, data, gesture = true } = {}) {
  const context = await newContext(browser, { viewport, hasTouch });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = watchErrors(page);
  const close = page.close.bind(page);
  page.close = async () => {
    await close();
    await context.close();
  };
  // First visit creates the sample workspace; then the stored settings are patched
  // on a blank page of the same origin, so the app never overwrites them.
  if (!data) {
    await page.goto(`${baseUrl}/index.html#tasks`);
    await waitForApp(page);
    await page.waitForFunction((k) => !!localStorage.getItem(k), STORE_KEY);
  }
  await page.goto(`${baseUrl}/__blank`);
  await page.evaluate(
    ({ key, data, theme }) => {
      const stored = data ? JSON.parse(JSON.stringify(data)) : JSON.parse(localStorage.getItem(key));
      stored.settings = { ...stored.settings, theme };
      localStorage.setItem(key, JSON.stringify(stored));
    },
    { key: STORE_KEY, data, theme }
  );
  await page.goto(`${baseUrl}/index.html#${route}`);
  await waitForApp(page);
  // One harmless click in the top-left corner, so the page counts as touched
  // (browsers keep sound off until then).
  if (gesture) await page.mouse.click(2, 2);
  return { page, errors };
}

module.exports = { startServer, launch, openApp, STORE_KEY, ROOT };
