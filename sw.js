// ONE service worker: ONE always opens from the copy saved on this device, so
// coming back takes no waiting, online or not. Pages and app files (scripts,
// styles, libraries, fonts, icons) come from the saved copy; only a missing
// file goes to the network, and is saved. New versions arrive through the
// Refresh button and the daily 23:59 update (updateApp in index.html), whose
// requests carry "x-one-fresh" and pass straight through.
// Sync requests to Supabase are never cached.
const CACHE = "one-v7";
const INDEX = new URL("./index.html", self.location.href).href;
// Surahs saved with "Keep offline"; never cleared by version updates.
const QURAN_OFFLINE = "one-quran-offline";
// Whole audio files (nature recordings, calm music) cached once played.
const MEDIA = "one-media";
// Where Quran.com's recitation files live.
const QURAN_AUDIO = /(^|\.)(quranicaudio|qurancdn)\.com$/;
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  // Every game's files (keep in step with GAME_FILES in index.html).
  ...["panel", "snake", "tetris", "breakout", "2048", "minesweeper"].flatMap((f) => [`./games/${f}.js`, `./games/${f}.css`]),
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"
];
// cdn.jsdelivr.net serves three.js for the Home meadow; Wikimedia serves the
// free nature recordings and music; api.quran.com resolves recitations.
// All are cached on first use.
// Hosts whose addresses are versioned (or immutable), so a saved copy never goes stale.
const PINNED_HOSTS = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.gstatic.com"];
const CACHEABLE_HOSTS = [
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "commons.wikimedia.org",
  "upload.wikimedia.org",
  "api.quran.com"
];

self.addEventListener("install", (event) => {
  // "reload" skips the browser's HTTP cache, so a new version never installs
  // with copies that are minutes old.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(new URL(url, self.location.href).href, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== QURAN_OFFLINE && k !== MEDIA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Media players ask for byte ranges ("Range: bytes=…"). A cache only holds
// whole files, so a range is cut from the cached whole file and answered as
// 206 Partial Content, which is what players (and Safari) require.
async function sliceFor(req, whole) {
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (!range || whole.type === "opaque") return whole;
  const buf = await whole.arrayBuffer();
  const size = buf.byteLength;
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "content-type": whole.headers.get("content-type") || "audio/mpeg",
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": String(end - start + 1),
      "accept-ranges": "bytes"
    }
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  // Updates fetch fresh files themselves and save them; never answer from here.
  if (req.headers.get("x-one-fresh")) {
    event.respondWith(fetch(req));
    return;
  }
  // A recitation kept offline is answered from its own cache.
  if (QURAN_AUDIO.test(url.hostname)) {
    event.respondWith(
      caches
        .open(QURAN_OFFLINE)
        .then((cache) => cache.match(req.url))
        .then((hit) => (hit ? sliceFor(req, hit) : fetch(req)))
    );
    return;
  }
  // Everything else from other sites (such as Supabase sync) is left alone.
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return;

  // Audio from the media hosts: from the whole-file cache when we have it;
  // otherwise from the network, while the whole file is saved once.
  if (req.headers.has("range") || req.destination === "audio") {
    event.respondWith(
      caches
        .open(MEDIA)
        .then((cache) => cache.match(req.url))
        .then((hit) => {
          if (hit) return sliceFor(req, hit);
          event.waitUntil(
            fetch(req.url, { mode: "cors" })
              .then((res) => (res.status === 200 ? caches.open(MEDIA).then((cache) => cache.put(req.url, res)) : null))
              .catch(() => {})
          );
          return fetch(req);
        })
    );
    return;
  }

  // A page load: the saved index.html (the app routes with #hash, so every
  // page is the same file). Only a first visit uses the network.
  if (req.mode === "navigate") {
    event.respondWith(fromCache(INDEX, req, { ignoreSearch: true }));
    return;
  }
  // ONE's own files and the pinned libraries and font files never change
  // under the same address: the saved copy is enough.
  if (sameOrigin || PINNED_HOSTS.includes(url.hostname)) {
    event.respondWith(fromCache(req, req));
    return;
  }
  // Everything else (the Quran API, the Google Fonts stylesheet, recordings'
  // pages): the saved copy now, refreshed in the background.
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        if (hit) event.waitUntil(fresh);
        return hit || fresh;
      })
    )
  );
});

// The saved copy when there is one; otherwise the network, saved for next time.
async function fromCache(key, req, options) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key, options);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200 || res.type === "opaque") await cache.put(key, res.clone());
  return res;
}
