// ONE service worker: lets the installed app open offline.
// Pages load from the network first (so updates show up), falling back to the
// cached copy; libraries, fonts and icons come from the cache first.
// Sync requests to Supabase are never cached.
const CACHE = "one-v6";
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
  "./games/games.js",
  "./games/games.css",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"
];
// cdn.jsdelivr.net serves three.js for the Home meadow; Wikimedia serves the
// free nature recordings and music; api.quran.com resolves recitations.
// All are cached on first use.
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
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
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

  // The page and the install manifest always come from the network when online,
  // so Chrome never installs ONE from an outdated manifest.
  if (req.mode === "navigate" || (sameOrigin && url.pathname.endsWith(".webmanifest"))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res.status === 200 || res.type === "opaque") {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});
