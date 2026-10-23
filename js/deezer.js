// Deezer API JSONP-n keresztül (a böngésző CORS miatt nem hívhatja közvetlenül).
(function () {
  const API = "https://api.deezer.com";
  let seq = 0;

  function jsonp(path, params = {}, timeoutMs = 12000) {
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

  window.Deezer = { jsonp, findArtistId, artistTop, track };
})();
