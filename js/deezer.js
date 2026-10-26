// Deezer API. Elsősorban a saját Workerünkön keresztül, sima JSON-ként (a Deezer nem küld CORS-fejlécet,
// így a böngésző közvetlenül nem kérheti le). Ha a Worker nem elérhető (vagy elfogyott a napi kerete),
// tartalékként JSONP-vel, közvetlenül a Deezertől: így a játék akkor is megy.
(function () {
  const API = "https://api.deezer.com";
  const PROXY = (window.SONGDLE_CONFIG || {}).DEEZER_PROXY || "";
  let seq = 0;
  // A Deezer 5 másodpercenként kb. 50 kérést enged: a kéréseket egyenletesen elosztjuk.
  const MIN_GAP_MS = 130;
  let nextSlot = 0;
  // Ha a Worker kétszer egymás után hibázik (vagy keretre/kvótára hivatkozik), egy ideig nem is
  // próbáljuk, rögtön a tartalékot használjuk. Egy elakadt kérés miatt még nem mondunk le róla.
  const PROXY_PAUSE_MS = 2 * 60e3;
  let proxyDownUntil = 0, proxyFails = 0;

  async function jsonp(path, params = {}, timeoutMs = 12000) {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (PROXY && Date.now() >= proxyDownUntil) {
      try {
        const data = await viaProxy(path, params, timeoutMs);
        proxyFails = 0;
        return data;
      } catch (e) {
        if (!e.fallback) { proxyFails = 0; throw e; }
        if (e.limit || ++proxyFails >= 2) {
          proxyDownUntil = Date.now() + PROXY_PAUSE_MS;
          proxyFails = 0;
        }
      }
    }
    return request(path, params, timeoutMs);
  }

  // A Deezer saját hibája (pl. nincs ilyen dal) végleges; a Worker vagy a hálózat hibája után jöhet a tartalék.
  async function viaProxy(path, params, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const fail = (msg, limit = false) => Object.assign(new Error(msg), { fallback: true, limit });
    let data;
    try {
      const res = await fetch(`${PROXY}${path}?${new URLSearchParams(params)}`, { signal: ctrl.signal });
      // 429: a Worker IP-nkénti korlátja, vagy elfogyott a Cloudflare napi kerete (1027-es hiba).
      if (!res.ok) throw fail("Közvetítő: HTTP " + res.status, res.status === 429);
      data = await res.json();
    } catch (e) {
      throw e.fallback ? e : fail("Közvetítő: " + e.message);
    } finally {
      clearTimeout(timer);
    }
    if (data && data.error) {
      // 4: kvóta – a Worker közös IP-címéről elfogyhat, a játékosé még jó lehet.
      if (data.error.code === 4) throw fail("Közvetítő: kvóta", true);
      throw new Error(data.error.message || "Deezer hiba");
    }
    return data;
  }

  function request(path, params, timeoutMs) {
    return new Promise((resolve, reject) => {
      const cb = "__dz_cb_" + Date.now().toString(36) + "_" + seq++;
      const qs = new URLSearchParams({ ...params, output: "jsonp", callback: cb });
      const script = document.createElement("script");
      let done = false;

      const cleanup = () => {
        done = true;
        clearTimeout(timer);
        delete window[cb];
        script.remove();
      };
      const timer = setTimeout(() => {
        if (done) return;
        cleanup();
        // A már elindult kérés a script eltávolítása után is lefut: egy üres hívás fogadja, ne legyen hiba.
        window[cb] = () => { delete window[cb]; };
        reject(new Error("Időtúllépés: " + path));
      }, timeoutMs);

      window[cb] = (data) => {
        cleanup();
        if (data && data.error) reject(new Error(data.error.message || "Deezer hiba"));
        else resolve(data);
      };
      script.onerror = () => {
        if (done) return;
        cleanup();
        reject(new Error("Hálózati hiba: " + path));
      };
      script.src = `${API}${path}?${qs}`;
      document.head.appendChild(script);
    });
  }

  async function findArtistId(name) {
    const res = await jsonp("/search/artist", { q: name, limit: 10 });
    const norm = (s) => s.toLocaleLowerCase("hu").trim();
    const exact = (res.data || []).filter((a) => norm(a.name) === norm(name));
    exact.sort((a, b) => b.nb_fan - a.nb_fan);
    return exact.length ? exact[0].id : null;
  }

  async function artistTop(id, limit) {
    const res = await jsonp(`/artist/${id}/top`, { limit });
    return res.data || [];
  }

  function track(id) {
    return jsonp(`/track/${id}`);
  }

  function artist(id) {
    return jsonp(`/artist/${id}`);
  }

  window.Deezer = { jsonp, findArtistId, artistTop, track, artist };
})();
