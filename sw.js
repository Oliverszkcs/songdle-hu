// Az alkalmazás saját fájljait tároljuk. A Deezer API és a borítók a hálózatról jönnek;
// a hangot a játék csak streameli, nem tárolja.
const CACHE = "songdle-hu-v47";
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/config.js",
  "js/deezer.js",
  "js/app.js",
  "data/years.json",
  "manifest.json",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

// Fájlonként tároljuk, és egy sikertelen fájl nem buktatja el a telepítést:
// a service worker így akkor is aktív lesz, ha a gyorsítótár nem elérhető.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("songdle-hu-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Hálózat először (így a frissítések azonnal megjelennek), offline esetén gyorsítótár.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    // no-cache: a böngésző HTTP-gyorsítótárát is megkerüljük (a GitHub Pages 10 percig engedné),
    // így egy frissítés tényleg azonnal megjelenik.
    // (Navigációs kérésből nem lehet új kérést készíteni, ezért ott a címet adjuk át.)
    fetch(e.request.mode === "navigate" ? e.request.url : e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
