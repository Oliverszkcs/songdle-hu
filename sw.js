// Az alkalmazás saját fájljait tároljuk. A Deezer API és a borítók a hálózatról jönnek;
// a hangot a játék csak streameli, nem tárolja.
const CACHE = "songdle-hu-v57";
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "fonts/outfit-latin.woff2",
  "fonts/outfit-latin-ext.woff2",
  "js/config.js",
  "js/deezer.js",
  "js/app.js",
  "data/years.json",
  "manifest.json",
  "favicon.ico",
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

// A tárolóban használt kulcs: oldalbetöltésnél „./”, az alkalmazás fájljainál maga a kérés, minden másnál semmi.
const SCOPE = new URL("./", self.location).pathname;
function cacheKey(req, url) {
  if (req.mode === "navigate") return "./";
  const path = url.pathname.startsWith(SCOPE) ? url.pathname.slice(SCOPE.length) : "";
  return SHELL.includes(path) ? req : null;
}

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
        // Csak az alkalmazás saját fájljait tesszük el (a ?c=…, ?parbaj=… linkeket egyetlen „./” alatt),
        // így a tároló nem telik meg minden megnyitott kihívással.
        const key = cacheKey(e.request, url);
        if (res.ok && key) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
        }
        return res;
      })
      // Offline: oldalbetöltésre a mentett oldal, minden másra a mentett fájl vagy hiba (nem HTML egy JSON helyett).
      .catch(() => caches.match(cacheKey(e.request, url) || e.request, { ignoreSearch: true })
        .then((r) => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
