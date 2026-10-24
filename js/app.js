(function () {
  "use strict";

  const CFG = window.SONGDLE_CONFIG;
  const LENGTHS = CFG.CLIP_LENGTHS;
  const MAX_TRIES = LENGTHS.length;
  const MAX_LEN = LENGTHS[MAX_TRIES - 1];
  const FULL_PREVIEW = 30;
  const POINTS = [100, 80, 60, 40, 25, 10];
  const STREAK_BONUS = 5, STREAK_BONUS_MAX = 50;
  const SET_SIZE = 5; // ennyi dal egy kör a végtelen módban
  const DIFFS = CFG.DAILY_DIFFICULTIES;
  const diffById = (id) => DIFFS.find((d) => d.id === id) || DIFFS[0];
  const WAVE_BARS = 64;
  const DEFAULT_TINT = ["#b8333f", "#1e9e54", "#e8e2d6"];
  const LS = "songdle.";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const $ = (id) => document.getElementById(id);
  const el = {
    categories: $("categories"), categoriesWrap: $("categoriesWrap"), dailyBanner: $("dailyBanner"),
    segmented: $("segmented"), streakLine: $("streakLine"), guesses: $("guesses"), tries: $("tries"),
    status: $("status"), reveal: $("reveal"),
    revealResult: $("revealResult"), revealTitle: $("revealTitle"), revealArtist: $("revealArtist"),
    revealAlbum: $("revealAlbum"), revealEmoji: $("revealEmoji"), revealPoints: $("revealPoints"),
    stage: $("stage"), viz: $("viz"), disc: $("disc"), discCover: $("discCover"),
    ringUnlocked: $("ringUnlocked"), ringProgress: $("ringProgress"), floatPoints: $("floatPoints"),
    wave: $("wave"), waveMarks: $("waveMarks"), timeNow: $("timeNow"), timeMax: $("timeMax"),
    clipLen: $("clipLen"), playBtn: $("playBtn"), controls: $("controls"),
    input: $("guessInput"), clearBtn: $("clearBtn"), suggestions: $("suggestions"),
    skipBtn: $("skipBtn"), submitBtn: $("submitBtn"), doneButtons: $("doneButtons"),
    shareBtn: $("shareBtn"), nextBtn: $("nextBtn"), audio: $("audio"),
    loadBar: $("loadBar"), loadFill: $("loadFill"),
    statsDialog: $("statsDialog"), statGrid: $("statGrid"), statGridDaily: $("statGridDaily"),
    statPoints: $("statPoints"), dist: $("dist"), helpDialog: $("helpDialog"), confirmDialog: $("confirmDialog"),
    toast: $("toast"), confetti: $("confetti"), pointsPill: $("pointsPill"), pointsNum: $("pointsNum"), roundLabel: $("roundLabel"), confirmText: $("confirmText"),
    setBar: $("setBar"), setSlots: $("setSlots"), setRecord: $("setRecord"), revealSet: $("revealSet"),
    roundPts: $("roundPts"), roundNum: $("roundNum"),
    modeEndless: $("modeEndless"), modeDaily: $("modeDaily"), modeArtist: $("modeArtist"),
    artistView: $("artistView"), game: document.querySelector(".game"), scroll: $("scroll"),
    volumeBtn: $("volumeBtn"), volumePop: $("volumePop"), volumeRange: $("volumeRange"),
    volumeVal: $("volumeVal"), muteBtn: $("muteBtn"),
  };

  // ---------- Tárolás ----------
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(LS + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(LS + key, JSON.stringify(value)); } catch { /* tele vagy tiltott */ }
  }

  // ---------- Szöveg ----------
  const fold = (s) => s.toLocaleLowerCase("hu").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const norm = (s) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();
  function baseTitle(t) {
    const stripped = t.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "");
    return norm(stripped) || norm(t);
  }
  const fmt = (s) => `0:${String(Math.floor(s)).padStart(2, "0")}`;
  const coverUrl = (md5, size) =>
    md5 ? `https://cdn-images.dzcdn.net/images/cover/${md5}/${size}x${size}-000000-80-0-0.jpg` : "";
  const artistLine = (t) => (t.feat && t.feat.length ? `${t.artist} feat. ${t.feat.join(", ")}` : t.artist);
  const trackLabel = (t) => `${t.title} – ${artistLine(t)}`;

  // ---------- Dátum (napi dal: budapesti idő szerint) ----------
  const TZ = "Europe/Budapest";
  const dateKey = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
  function shiftDate(key, days) {
    const d = new Date(key + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function msToNextDay() {
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
    }).formatToParts(now).map((p) => [p.type, +p.value || 0]));
    return ((24 - parts.hour) * 3600 - parts.minute * 60 - parts.second) * 1000 - now.getMilliseconds();
  }
  const prettyDate = (key) =>
    new Date(key + "T12:00:00Z").toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

  function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Dalkészlet ----------
  const excludeRe = new RegExp(CFG.EXCLUDE_TITLE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

  function slimTrack(t) {
    return {
      id: t.id, title: t.title, artist: t.artist.name, album: t.album ? t.album.title : "",
      feat: [...new Set((t.contributors || []).map((c) => c.name))].filter((n) => n !== t.artist.name),
      md5: t.md5_image || (t.album && t.album.md5_image) || "", rank: t.rank || 0,
    };
  }

  async function withRetry(fn) {
    for (const delay of [2000, 4000]) {
      try { return await fn(); } catch (e) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return fn();
  }

  // A régi, 50 dalos gyorsítótár (artist2.*) helyett 100 dalos (artist3.*); a régit töröljük.
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(LS + "artist2.")).forEach((k) => localStorage.removeItem(k));
  } catch { /* nem elérhető */ }

  async function loadArtist(artist) {
    const cacheKey = "artist3." + (artist.id || norm(artist.name));
    const cached = load(cacheKey, null);
    if (cached && Date.now() - cached.ts < CFG.POOL_CACHE_HOURS * 3600e3) return cached.tracks;
    // Offline (vagy ha a Deezer nem válaszol) a régebbi lista is jó.
    if (cached && !navigator.onLine) return cached.tracks;
    try { return await fetchArtist(artist, cacheKey); } catch (e) {
      if (cached) return cached.tracks;
      throw e;
    }
  }

  async function fetchArtist(artist, cacheKey) {
    let id = artist.id;
    if (!id) id = await withRetry(() => Deezer.findArtistId(artist.name));
    let tracks = [];
    if (id) {
      const raw = await withRetry(() => Deezer.artistTop(id, CFG.TRACKS_PER_ARTIST));
      // Csak olyan dal, amelyen az előadó tényleg szerepel (fő előadó vagy közreműködő).
      const features = (t) => t.artist.id === id || (t.contributors || []).some((c) => c.id === id);
      tracks = raw.filter((t) => t.readable !== false && t.preview && !excludeRe.test(t.title) && features(t)).map(slimTrack);
    }
    save(cacheKey, { ts: Date.now(), tracks });
    return tracks;
  }

  // Hangrészletek gyorsítótára: a legutóbbi CLIP_KEEP dal teljes előnézete a böngészőben marad,
  // így gyenge térerőn (vagy offline) is lehet játszani. A következő dalt előre letöltjük.
  const CLIP_CACHE = "songdle-clips-v1", CLIP_KEEP = 30;
  const clipKey = (id) => new URL(`__clip/${id}`, location.href).href;
  async function cachedClip(id) {
    try {
      const res = await (await caches.open(CLIP_CACHE)).match(clipKey(id));
      if (!res) return null;
      return { blob: await res.blob(), meta: JSON.parse(decodeURIComponent(res.headers.get("x-meta") || "%7B%7D")) };
    } catch { return null; }
  }
  async function storeClip(id, blob, meta) {
    try {
      const c = await caches.open(CLIP_CACHE);
      await c.put(clipKey(id), new Response(blob, {
        headers: { "content-type": blob.type || "audio/mpeg", "x-meta": encodeURIComponent(JSON.stringify(meta)) },
      }));
      const keys = await c.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - CLIP_KEEP)).map((k) => c.delete(k)));
    } catch { /* nincs Cache API vagy betelt */ }
  }
  async function cachedClipIds() {
    try {
      return (await (await caches.open(CLIP_CACHE)).keys()).map((r) => +r.url.split("/").pop());
    } catch { return []; }
  }

  // Egy dal hangja és adatai: a gyorsítótárból, vagy a Deezerről (és eltesszük).
  const clipRequests = new Map();
  function loadClip(t) {
    if (!clipRequests.has(t.id)) {
      clipRequests.set(t.id, fetchClip(t).finally(() => setTimeout(() => clipRequests.delete(t.id), 60e3)));
    }
    return clipRequests.get(t.id);
  }
  async function fetchClip(t) {
    const hit = await cachedClip(t.id);
    if (hit) return { ...hit.meta, blob: hit.blob };
    const full = await Deezer.track(t.id);
    if (!full.preview) throw new Error("Nincs előnézet");
    const meta = {
      preview: full.preview,
      md5: (full.album && full.album.md5_image) || t.md5,
      year: ((full.release_date || (full.album && full.album.release_date) || "").match(/^\d{4}/) || [""])[0],
      feat: full.contributors ? [...new Set(full.contributors.map((c) => c.name))] : null,
    };
    try {
      const res = await fetch(full.preview);
      if (res.ok) {
        const blob = await res.blob();
        storeClip(t.id, blob, meta);
        return { ...meta, blob };
      }
    } catch { /* streamelve játsszuk */ }
    return meta;
  }

  const nameKey = (s) => norm(s).split(" ").sort().join(" ");
  const sameName = (x, y) => nameKey(x) === nameKey(y);

  // Egyszerre néhány kérés; a tempót a deezer.js szabályozza.
  async function loadArtists(artists, onProgress) {
    const results = [];
    let next = 0, done = 0;
    async function worker() {
      while (next < artists.length) {
        const a = artists[next++];
        try {
          // src: melyik beállított előadótól jött a dal (a dallista így csoportosít)
          let list = await loadArtist(a);
          if (a.only) {
            const want = new Set(a.only.map(baseTitle));
            list = list.filter((t) => want.has(baseTitle(t.title)));
          }
          if (a.top) list = [...list].sort((x, y) => y.rank - x.rank).slice(0, a.top);
          // Ha a Deezer csak kis-nagybetűben vagy ékezetben tér el (pl. „General”, „BÓDI GUSZTI”),
          // a configban megadott írásmódot mutatjuk.
          results.push(...list.map((t) => {
            // Fordított névsorrendnél is (pl. „Klári Katona” → „Katona Klári”).
            const artist = sameName(t.artist, a.name) ? a.name : t.artist;
            // A Deezer néha a fő előadót közreműködőként is felsorolja („Generál feat. General”).
            const feat = (t.feat || []).filter((f) => !sameName(f, artist));
            return { ...t, artist, feat, src: a.name };
          }));
        } catch (e) { console.warn("Nem sikerült:", a.name, e); }
        onProgress(++done, artists.length);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return results;
  }

  const isLive = (t) => /\blive\b|\bél[őo]\b|koncert/i.test(t.title);

  // Kitiltott dalok: a configban megadottak teljesen kimaradnak; a játékos által
  // jelentettek bent maradnak (tippelni lehet rájuk), csak nem sorsoljuk őket.
  // Az `aka` nevek (pl. Locomotiv GT) helyett a config szerinti név látszik (LGT), de a régi névre is lehet keresni.
  const AKA = new Map(CFG.ARTISTS.flatMap((a) => (a.aka || []).map((n) => [n, a.name])));
  const shownName = (n) => AKA.get(n) || n;
  const configBlocked = new Set((CFG.BLOCKED_TRACKS || []).map((b) => (typeof b === "object" ? b.id : b)));
  let reported = load("reported", []);
  const isReported = (id) => reported.some((r) => r.id === id);

  function buildPool(tracks) {
    const byKey = new Map();
    for (const t of tracks) {
      if (configBlocked.has(t.id)) continue;
      if (AKA.has(t.artist)) { t.aka = t.artist; t.artist = shownName(t.artist); }
      if (t.feat) t.feat = t.feat.map(shownName).filter((n) => n !== t.artist);
      t.base = baseTitle(t.title);
      t.key = t.base + "|" + norm(t.artist);
      const prev = byKey.get(t.key);
      const better = !prev || (isLive(prev) && !isLive(t)) || (isLive(prev) === isLive(t) && t.rank > prev.rank);
      if (better) byKey.set(t.key, t);
    }
    // Előadónként csak a legnépszerűbb MAX_SONGS_PER_ARTIST dal marad.
    const max = CFG.MAX_SONGS_PER_ARTIST || Infinity;
    const bySrc = new Map();
    for (const t of byKey.values()) {
      const k = t.src || t.artist;
      if (!bySrc.has(k)) bySrc.set(k, []);
      bySrc.get(k).push(t);
    }
    const pool = [...bySrc.values()].flatMap((list) => list.sort((a, b) => b.rank - a.rank).slice(0, max));
    for (const t of pool) {
      t.feat = t.feat || [];
      t.nTitle = norm(t.title);
      t.nArtist = norm(t.artist);
      t.nArtists = [t.artist, ...t.feat].map(norm);
      t.hay = t.nTitle + " " + t.nArtists.join(" ") + (t.aka ? " " + norm(t.aka) : "");
    }
    pool.sort((a, b) => a.title.localeCompare(b.title, "hu"));
    assignWeights(pool);
    return pool;
  }

  // Népszerűségi súly: a lista rangsor szerinti helyéből (0 = leggyengébb,
  // 1 = legnagyobb sláger) exponenciálisan, hogy a kiugró értékek ne torzítsanak.
  function assignWeights(list) {
    const bias = CFG.POPULARITY_BIAS ?? 2;
    const byRank = [...list].sort((a, b) => a.rank - b.rank);
    const n = byRank.length;
    byRank.forEach((t, i) => {
      const p = n > 1 ? i / (n - 1) : 1;
      t.pct = p;
      t.weight = Math.exp(bias * (p - 1));
    });
  }

  function weightedPick(list, rnd) {
    const total = list.reduce((s, t) => s + (t.weight ?? 1), 0);
    let r = rnd() * total;
    for (const t of list) {
      r -= t.weight ?? 1;
      if (r <= 0) return t;
    }
    return list[list.length - 1];
  }

  // Évtized-kategóriák: minden előadó dalaiból a megjelenési év szerint szűrünk.
  const DECADES = CFG.DECADES || [];
  const decadeOf = (id) => DECADES.find((d) => d.id === id);
  const allCats = [...CFG.CATEGORIES, ...DECADES];
  const catLabel = (id) => (allCats.find((c) => c.id === id) || { label: id }).label;
  const artistsFor = (cat) => cat === "all" || decadeOf(cat) ? CFG.ARTISTS : CFG.ARTISTS.filter((a) => (a.tags || []).includes(cat));

  // A dalok megjelenési éve (tools/build-years.mjs készíti); csak az évtized-kategóriákhoz kell.
  let yearsData = null;
  async function loadYears() {
    if (yearsData) return yearsData;
    try {
      const res = await fetch("data/years.json");
      yearsData = res.ok ? (await res.json()).years || {} : {};
    } catch { yearsData = {}; }
    return yearsData;
  }

  // A napi dal mindenkinek ugyanaz: a nehézség népszerűségi sávjából az a dal
  // nyer, amelyiknek a (dátum, nehézség, dal) hash-e a legnagyobb. Így ha két
  // játékos dallistája kicsit eltér, a nyertes akkor is ugyanaz marad. A saját jelentés
  // itt nem számít (csak a végtelen módban), hogy a napi dal tényleg mindenkinek ugyanaz legyen.
  function pickDailyTrack(date, diff) {
    let best = null, bestScore = -1;
    for (const t of pool) {
      if (isLive(t) || t.pct < diff.from || (t.pct >= diff.to && diff.to < 1)) continue;
      const score = hashString(`songdle-hu:${date}:${diff.id}:${t.id}`);
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  }

  // ---------- Állapot ----------
  // A „versus” (párbaj, kihívás) módot nem mentjük: újratöltés után a mentett fülre térünk vissza.
  let mode = ["daily", "artist"].includes(load("mode", "endless")) ? load("mode", "endless") : "endless";
  let category = load("category", "all");
  if (!allCats.some((c) => c.id === category)) category = "all";
  // Nehéz mód (végtelen): a dal eleje visszafelé szól, hosszabb részletekkel, több pontért.
  let hard = load("hard", false);
  const HARD_MULT = CFG.HARD_MULTIPLIER || 1.5;
  const HARD_MULT_TEXT = String(HARD_MULT).replace(".", ",");
  const HARD_LENGTHS = (CFG.HARD_CLIP_LENGTHS || []).length === MAX_TRIES ? CFG.HARD_CLIP_LENGTHS : LENGTHS;
  const lengthsOf = (r) => (r && r.reverse ? HARD_LENGTHS : LENGTHS);
  const multOf = (r) => r.mode === "daily" ? diffById(r.diff).multiplier : r.reverse ? HARD_MULT : 1;
  let pool = [];
  // round: { mode, date?, track, attempts: [{type, label, key?}], done, won, points, preview, md5 }
  let round = null;
  let selected = null;
  let loadToken = 0;

  const defaultStats = () => ({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0, 0] });
  let stats = Object.assign(defaultStats(), load("stats", {}));
  let dailyDiff = diffById(load("dailyDiff", DIFFS[0].id)).id;
  // Nehézségenként külön napi statisztika. A régi (egyetlen) napi statisztika a Közepesbe kerül.
  const dailyStatsAll = (() => {
    const saved = load("dailyStats2", null);
    const legacy = saved ? null : load("dailyStats", null);
    const all = {};
    for (const d of DIFFS) {
      all[d.id] = Object.assign(defaultStats(), { lastWin: null },
        saved ? saved[d.id] : legacy && d.id === "medium" ? legacy : {});
    }
    return all;
  })();
  const dailyStats = (id = dailyDiff) => dailyStatsAll[id];
  let points = load("points", 0);
  // Végtelen mód: 5 dalos kör (dalonkénti eredmény) és a legjobb kör pontszáma.
  let game = load("game", { results: [] });
  let bestGame = load("bestGame", 0);
  const gameScore = () => game.results.reduce((a, r) => a + r.pts, 0);
  const gameDone = () => game.results.length >= SET_SIZE;
  let shownPoints = points;
  // Párbaj (élő, két játékos) és kihívás (link egy barát 5 dalos körével):
  // { kind: "battle" | "challenge", ids, idx, results: [{won, pts, tries}],
  //   opp: { name, score?, results: [], live: {} }, waiting }
  let versus = null;
  const VS_SONGS = CFG.VERSUS_SONGS || 5;
  const vsScore = (results) => (results || []).reduce((a, r) => a + (r ? r.pts : 0), 0);
  const vsOver = () => versus && versus.results.filter(Boolean).length >= versus.ids.length;
  const vsOppOver = () => versus && (versus.kind === "challenge" || versus.oppGone
    || versus.opp.results.filter(Boolean).length >= versus.ids.length);

  function dailyStreakNow(id = dailyDiff) {
    const s = dailyStats(id), today = dateKey();
    return s.lastWin === today || s.lastWin === shiftDate(today, -1) ? s.streak : 0;
  }

  const dailyKey = (date, id) => `daily.${date}.${id}`;
  const dailyResult = (id) => load(dailyKey(dateKey(), id), null);
  function nextUnplayedDiff() {
    const start = DIFFS.findIndex((d) => d.id === dailyDiff);
    for (let k = 1; k < DIFFS.length; k++) {
      const d = DIFFS[(start + k) % DIFFS.length];
      const r = dailyResult(d.id);
      if (!r || !r.done) return d;
    }
    return null;
  }

  // Magyaros szólások a visszajelzésekhez (hideg–meleg, szólásmondások).
  // seed (pl. a dal azonosítója) esetén ugyanarra a dalra mindig ugyanaz a szöveg jön.
  const pickOne = (list, seed) => list[(seed ?? Math.floor(Math.random() * 1e6)) % list.length];
  const HU = {
    idle: ["Nyomd meg a lemezt, és figyelj!", "Hegyezd a füled!", "Szól a nóta – ráismersz?"],
    wrong: ["Hideg!", "Mellé!", "Nem ez az."],
    lost: ["Most nem jött össze", "Sebaj, majd a következő!", "Ez most nem a te nótád volt"],
    win: ["Elsőre! Le a kalappal!", "Fején találtad a szöget!", "Ez az, megvan!",
      "Lassan járj, tovább érsz!", "Hajszálon múlt!", "Az utolsó pillanatban!"],
  };

  function setStatus(msg, isError) {
    if (el.status.textContent === (msg || "")) return;
    el.status.textContent = msg || "";
    el.status.classList.toggle("error", !!isError);
    retrigger(el.status, "flash");
  }

  function retrigger(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    // Hosszabb magyarázat: szélesebb doboz, tovább látszik.
    el.toast.classList.toggle("long", msg.length > 50);
    el.toast.hidden = false;
    retrigger(el.toast, "show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, Math.max(2200, msg.length * 55));
  }

  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* nem támogatott */ } };

  function confirmDialog() {
    return new Promise((resolve) => {
      el.confirmDialog.returnValue = "";
      el.confirmDialog.addEventListener("close", () => resolve(el.confirmDialog.returnValue === "ok"), { once: true });
      el.confirmDialog.showModal();
    });
  }

  function setLoading(on, fraction) {
    el.stage.classList.toggle("loading", on);
    el.loadBar.hidden = !on;
    if (on) el.loadFill.style.width = Math.round((fraction || 0) * 100) + "%";
  }

  // ---------- Háttérszín a borítóból ----------
  function setTint(colors) {
    const root = document.documentElement.style;
    root.setProperty("--t1", colors[0]);
    root.setProperty("--t2", colors[1]);
    root.setProperty("--t3", colors[2]);
  }

  // A borító legélénkebb színeit keresi meg (a CDN engedi a CORS-t).
  function coverColors(img) {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 24;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0;
        px.push({ r, g, b, score: sat * 0.7 + (max / 255) * 0.3, hue: hueOf(r, g, b) });
      }
      px.sort((a, b) => b.score - a.score);
      const picks = [];
      for (const p of px) {
        if (picks.every((q) => Math.min(Math.abs(q.hue - p.hue), 360 - Math.abs(q.hue - p.hue)) > 40)) picks.push(p);
        if (picks.length === 3) break;
      }
      while (picks.length < 3) picks.push(px[picks.length * 7] || px[0]);
      return picks.map((p) => `rgb(${boost(p.r, p.g, p.b).join(",")})`);
    } catch { return DEFAULT_TINT; }
  }
  function hueOf(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), dd = max - min;
    if (!dd) return 0;
    const h = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    return (h * 60 + 360) % 360;
  }
  function boost(r, g, b) {
    // élénkebb, világosabb változat a háttérhez
    const max = Math.max(r, g, b, 1), k = 230 / max;
    return [r, g, b].map((v) => Math.min(255, Math.round(v * k)));
  }

  // ---------- Mód és kategória ----------
  function renderMode() {
    el.segmented.dataset.mode = mode;
    el.modeEndless.setAttribute("aria-selected", String(mode === "endless"));
    el.modeDaily.setAttribute("aria-selected", String(mode === "daily"));
    el.modeArtist.setAttribute("aria-selected", String(mode === "artist"));
    document.body.dataset.mode = mode;
    el.dailyBanner.hidden = mode !== "daily" && mode !== "versus";
    if (mode === "versus") {
      el.dailyBanner.textContent = "";
      const b = document.createElement("b");
      b.textContent = versus.opp.name;
      el.dailyBanner.append(versus.kind === "battle" ? "⚔️ Párbaj · Te vs " : "🎯 Kihívás · ", b,
        versus.kind === "battle" ? `${versus.cat ? " · " + versus.cat : ""} · ${versus.ids.length} dal` : ` · ${versus.opp.score} pont – győzd le!`);
    } else {
      const d = diffById(dailyDiff);
      el.dailyBanner.innerHTML = `Mai dal · <b>${prettyDate(dateKey())}</b> · ${d.label} · <b>×${d.multiplier}</b> pont`;
    }
    updateNextButton();
  }

  function updateNextButton() {
    el.nextBtn.disabled = false;
    if (mode === "versus") {
      if (!vsOver()) {
        const waiting = versus.waiting;
        el.nextBtn.textContent = waiting ? "Várakozás…" : "Következő dal →";
        el.nextBtn.disabled = waiting;
      } else el.nextBtn.textContent = versus.kind === "battle" && peerConn ? "🔁 Visszavágó" : "Vissza a játékba →";
      return;
    }
    if (mode !== "daily") { el.nextBtn.textContent = gameDone() ? "Új kör →" : "Következő dal →"; return; }
    const next = nextUnplayedDiff();
    el.nextBtn.textContent = next ? `${next.icon} ${next.label} →` : "Végtelen mód →";
  }

  // A „Napi” fülön jelzi, hány mai dal van még hátra.
  function updateDailyBadge() {
    const left = DIFFS.filter((d) => { const r = dailyResult(d.id); return !r || !r.done; }).length;
    const badge = $("dailyBadge");
    badge.hidden = left === 0;
    badge.textContent = left;
    badge.title = `${left} napi dal van hátra`;
    const ab = $("artistBadge");
    ab.hidden = adDone();
    ab.textContent = "1";
    ab.title = "A mai előadó még nincs meg";
  }

  // Csak a chip-sort görgetjük, és csak ha a kiválasztott chip kilóg. A scrollIntoView
  // mobilon az egész oldalt is elcsúsztathatja oldalra.
  function revealChip(b) {
    const row = b.parentElement, r = row.getBoundingClientRect(), c = b.getBoundingClientRect();
    if (c.left >= r.left + 12 && c.right <= r.right - 28) return;
    // Betöltéskor azonnal ugrik, csak koppintásra animál (különben oldalra csúszik a sor).
    const smooth = !reducedMotion.matches && navigator.userActivation && navigator.userActivation.isActive;
    row.scrollTo({ left: row.scrollLeft + c.left - r.left - (r.width - c.width) / 2, behavior: smooth ? "smooth" : "auto" });
  }

  function renderCategories() {
    updateDailyBadge();
    el.categories.innerHTML = "";
    el.categories.classList.toggle("cat-bar", mode === "endless");
    if (mode === "daily") return renderDifficulties();
    if (mode === "versus") {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = versus.kind === "battle" ? "✕ Kilépés a párbajból" : "✕ Kilépés a kihívásból";
      b.addEventListener("click", () => leaveVersus());
      el.categories.appendChild(b);
      return;
    }
    // Végtelen módban egyetlen sáv: a választott kategória (koppintásra lap nyílik) és a párbaj.
    const pick = document.createElement("button");
    pick.className = "cat-pill";
    pick.setAttribute("aria-haspopup", "dialog");
    const c = fillCatPill(pick, category, decadeOf(category) ? "Évtized" : "Kategória");
    if (hard) pick.querySelector(".cat-chev").insertAdjacentHTML("beforebegin", `<span class="cat-hard">🔥 ×${HARD_MULT_TEXT}</span>`);
    pick.setAttribute("aria-label", `Kategória: ${c.label}${hard ? ", nehéz mód" : ""}. Váltás`);
    pick.addEventListener("click", () => openCatSheet({ current: category, onPick: changeCategory }));
    el.categories.appendChild(pick);

    const battle = document.createElement("button");
    battle.className = "chip battle-chip";
    battle.textContent = "⚔️ Párbaj";
    battle.addEventListener("click", openBattle);
    el.categories.appendChild(battle);
  }

  // Kategóriaválasztó lap: műfajok, évtizedek és a nehéz mód kapcsolója egy helyen.
  // Kategória-gomb tartalma (ikon, felirat, név, nyíl) – a végtelen módban és a párbajnál is.
  function fillCatPill(btn, id, caption) {
    const c = allCats.find((x) => x.id === id) || CFG.CATEGORIES[0];
    btn.innerHTML = `<span class="cat-ico" aria-hidden="true"></span><span class="cat-text"><small></small><b></b></span>`
      + `<svg class="cat-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    btn.querySelector(".cat-ico").textContent = decadeOf(c.id) ? "📅" : c.icon || "🎵";
    btn.querySelector("small").textContent = caption;
    btn.querySelector("b").textContent = c.label;
    return c;
  }

  const catSheet = $("catSheet"), hardSwitch = $("hardSwitch");
  // opts: current (kiválasztott id), onPick(id), title, withHard (nehéz mód kapcsoló látszik-e)
  function openCatSheet({ current, onPick, title = "Mit játszunk?", withHard = true }) {
    const tiles = (box, list, decades) => {
      box.innerHTML = "";
      for (const c of list) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cat-tile";
        b.setAttribute("aria-pressed", String(c.id === current));
        if (decades) {
          b.textContent = c.short || c.label;
          b.setAttribute("aria-label", c.label);
        } else {
          b.innerHTML = `<span aria-hidden="true"></span><span></span>`;
          b.children[0].textContent = c.icon || "🎵";
          b.children[1].textContent = c.label;
        }
        b.addEventListener("click", () => {
          catSheet.close();
          onPick(c.id);
        });
        box.appendChild(b);
      }
    };
    tiles($("catGenres"), CFG.CATEGORIES, false);
    tiles($("catDecades"), DECADES, true);
    $("catSheetTitle").textContent = title;
    $("hardRow").hidden = !withHard;
    hardSwitch.checked = hard;
    catSheet.showModal();
  }
  hardSwitch.addEventListener("change", () => { if (hardSwitch.checked !== hard) toggleHard(); });
  // A háttérre koppintva is bezárul.
  catSheet.addEventListener("click", (e) => { if (e.target === catSheet) catSheet.close(); });

  function toggleHard() {
    hard = !hard;
    save("hard", hard);
    renderCategories();
    // Ha a dalt még el sem kezdte, rögtön erre a dalra is érvényes.
    // Csak a még meg sem hallgatott dalra érvényes azonnal (különben előre lehetne hallgatni sima módban).
    const fresh = round && round.mode === "endless" && !round.done && !round.attempts.length && !round.heard;
    if (fresh) {
      round.reverse = hard;
      persistRound();
      buildWave(false);
      renderAll();
    }
    toast(hard
      ? `🔥 Nehéz mód: a dal visszafelé szól, hosszabb részletekkel, ×${HARD_MULT_TEXT} pont${fresh ? "" : " (a következő daltól)"}.`
      : `Nehéz mód kikapcsolva${fresh ? "" : " (a következő daltól)"}.`);
  }

  function renderDifficulties() {
    for (const d of DIFFS) {
      const b = document.createElement("button");
      b.className = "chip diff-chip";
      b.dataset.diff = d.id;
      const active = d.id === dailyDiff;
      b.setAttribute("aria-pressed", String(active));
      const r = dailyResult(d.id);
      const state = r && r.done ? (r.won ? "won" : "lost") : "";
      if (state) b.classList.add(state);
      b.innerHTML = `<span class="diff-dot" aria-hidden="true">${d.icon}</span><span></span><span class="diff-mult">×${d.multiplier}</span>`
        + (state ? `<span class="diff-state" aria-label="${state === "won" ? "megfejtve" : "nem sikerült"}">${state === "won" ? "✓" : "✗"}</span>` : "");
      b.children[1].textContent = d.label;
      // Telefonon a nem kiválasztott szintnél csak a pötty látszik, ezért a név a felolvasónak is kell.
      b.setAttribute("aria-label", `${d.label} ×${d.multiplier}${state === "won" ? ", megfejtve" : state === "lost" ? ", nem sikerült" : ""}`);
      b.addEventListener("click", () => changeDifficulty(d.id));
      el.categories.appendChild(b);
      if (active) requestAnimationFrame(() => revealChip(b));
    }
  }

  function changeDifficulty(id) {
    if (id === dailyDiff) return;
    // A félbehagyott napi kör el van mentve, később folytatható.
    dailyDiff = id;
    save("dailyDiff", id);
    renderMode();
    renderCategories();
    enterMode();
  }

  async function changeCategory(id) {
    if (id === category) return;
    // Kategóriaváltáskor az 5 dalos kör újraindul.
    const midSong = round && round.mode === "endless" && !round.done && round.attempts.length > 0;
    const inSet = game.results.length > 0 && !gameDone();
    if (midSong || inSet) {
      el.confirmText.textContent = midSong
        ? "A mostani dal vesztesnek számít, a sorozatod nullázódik, és az 5 dalos kör újraindul. Folytatod?"
        : `Az 5 dalos kör újraindul (eddig ${gameScore()} pont, ${game.results.length}/${SET_SIZE} dal). Folytatod?`;
      if (!(await confirmDialog())) return;
      if (midSong) finishRound(false, true);
    }
    game = { results: [] };
    save("game", game);
    category = id;
    save("category", category);
    save("round", null);
    renderCategories();
    enterMode();
  }

  function changeMode(m) {
    if (m === mode) return;
    if (mode === "versus") closeVersus();
    // A félbehagyott végtelen kör megmarad, visszaváltáskor folytatható.
    mode = m;
    save("mode", mode);
    renderMode();
    renderCategories();
    enterMode();
  }

  async function enterMode() {
    const token = ++loadToken;
    stopAudio();
    adLeave();
    round = null;
    stopCountdown();
    resetStage();
    setControls(false);
    showDone(false);
    renderAll();
    el.artistView.hidden = mode !== "artist";
    el.game.hidden = mode === "artist";
    if (mode === "artist") {
      setLoading(false);
      el.scroll.scrollTop = 0;
      return openArtistGame();
    }

    const poolCategory = mode === "endless" ? category : "all";
    setLoading(true, 0);
    setStatus("Dalok betöltése…");
    const tracks = await loadArtists(artistsFor(poolCategory), (d, n) => {
      if (token !== loadToken) return;
      setLoading(true, d / n);
      el.status.textContent = `Dalok betöltése… ${d}/${n}`;
    });
    if (token !== loadToken) return;
    pool = buildPool(tracks);
    const decade = decadeOf(poolCategory);
    if (decade) {
      const years = await loadYears();
      if (token !== loadToken) return;
      pool = pool.filter((t) => years[t.id] >= decade.from && years[t.id] <= decade.to);
      assignWeights(pool);
    }
    if (!pool.length) {
      setLoading(false);
      setStatus(decade ? "Ebben az évtizedben most nincs dal. Válassz másikat!"
        : "Nem sikerült dalokat betölteni. Ellenőrizd az internetkapcsolatot, és frissítsd az oldalt.", true);
      return;
    }
    if (mode === "versus") return vsStartSong();

    if (mode === "daily") {
      const date = dateKey();
      const saved = load(dailyKey(date, dailyDiff), null);
      // Ha ma már elkezdte, ugyanaz a dal marad akkor is, ha közben frissült a dallista.
      const track = (saved && pool.find((p) => p.id === saved.trackId)) || pickDailyTrack(date, diffById(dailyDiff));
      if (!track) {
        setLoading(false);
        return setStatus("Nem sikerült betölteni a mai dalt. Próbáld újra később.", true);
      }
      return startRound(track, saved && saved.trackId === track.id ? saved : null);
    }

    const saved = load("round", null);
    if (saved && saved.category === category) {
      const t = pool.find((p) => p.id === saved.trackId);
      if (t) return startRound(t, saved);
    }
    startRound();
  }

  // ---------- Kör ----------
  // Előadó-rotáció: előbb előadót sorsolunk (a sokdalos előadók ne nyomják el a
  // kevésdalosakat), és kihagyjuk azt, aki az utolsó ARTIST_GAP körben szerepelt.
  const artistsOf = (t) => [t.src || t.artist, ...(t.nArtists || [norm(t.artist)])].map(norm);

  function pickTrack() {
    const recent = load("recent", []);
    const recentSet = new Set(recent);
    const allowed = pool.filter((t) => !isReported(t.id));
    const fresh = allowed.filter((t) => !recentSet.has(t.id));
    const cands = fresh.length ? fresh : allowed.length ? allowed : pool;

    const byId = new Map(pool.map((t) => [t.id, t]));
    const last = recent.map((id) => byId.get(id)).filter(Boolean);
    let list = cands;
    // Ha egy kategóriában kevés az előadó, rövidebb kihagyással próbálkozunk.
    for (let gap = CFG.ARTIST_GAP ?? 3; gap > 0; gap--) {
      const avoid = new Set(last.slice(0, gap).flatMap(artistsOf));
      const ok = cands.filter((t) => !artistsOf(t).some((a) => avoid.has(a)));
      if (ok.length) { list = ok; break; }
    }

    const groups = new Map();
    for (const t of list) {
      const k = norm(t.src || t.artist);
      if (!groups.has(k)) groups.set(k, { weight: 0, tracks: [] });
      const g = groups.get(k);
      g.tracks.push(t);
      g.weight += t.weight ?? 1;
    }
    for (const g of groups.values()) g.weight = Math.sqrt(g.weight);
    return weightedPick(weightedPick([...groups.values()], Math.random).tracks, Math.random);
  }

  async function startRound(track, saved) {
    const token = loadToken;
    const fixed = !!track;
    if (mode === "endless" && !saved && gameDone()) {
      game = { results: [] };
      save("game", game);
    }
    stopAudio();
    stopCountdown();
    round = null;
    selected = null;
    el.input.value = "";
    updateClear();
    hideSuggestions();
    showDone(false);
    setControls(false);
    resetStage();
    renderAll();
    setLoading(true, 1);

    for (let tries = 0; tries < 5 && !round; tries++) {
      // Offline (vagy ha többször nem sikerül) a már letöltött dalok közül sorsolunk.
      const t = track || ((!navigator.onLine || tries > 1) && await pickCachedTrack()) || takePrefetched() || pickTrack();
      if (!fixed) track = null;
      setStatus("Dal betöltése…");
      try {
        const clip = await loadClip(t);
        if (token !== loadToken) return;
        round = {
          mode, date: mode === "daily" ? dateKey() : null, diff: mode === "daily" ? dailyDiff : null, track: t,
          attempts: saved ? saved.attempts : [], done: !!(saved && saved.done), won: !!(saved && saved.won),
          points: saved && saved.points ? saved.points : null,
          // Nehéz mód: visszafelé szól; a mentett körnél a régi beállítás marad.
          reverse: saved ? !!saved.reverse : mode === "endless" && hard,
          heard: !!(saved && saved.heard),
          preview: clip.preview, blob: clip.blob || null,
          md5: clip.md5 || t.md5, year: clip.year || "",
        };
        if (!t.feat.length && clip.feat) {
          t.feat = clip.feat.map(shownName).filter((n) => norm(n) !== norm(t.artist));
          t.nArtists = [t.artist, ...t.feat].map(norm);
          t.hay = t.nTitle + " " + t.nArtists.join(" ") + (t.aka ? " " + norm(t.aka) : "");
        }
      } catch (e) {
        console.warn("Dal betöltése sikertelen:", t.title, e);
        saved = null;
        if (fixed) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (token !== loadToken) return;
    setLoading(false);
    if (!round) return setStatus("Nem sikerült dalt betölteni. Próbáld újra később.", true);

    if (round.mode === "endless") {
      const recent = load("recent", []).filter((id) => id !== round.track.id);
      recent.unshift(round.track.id);
      save("recent", recent.slice(0, CFG.RECENT_MEMORY));
    }
    persistRound();
    // Az eredeti év előre lekérve, hogy a megoldásnál már kész legyen.
    if (navigator.onLine) originalYear(round.track, round.year);

    setAudioSource();
    buildWave(true);
    renderAll();
    prefetchNext();

    if (round.done) {
      // Már lejátszott napi dal: csak a megoldást mutatjuk.
      showReveal(false);
      return;
    }
    setControls(true);
    setStatus(round.attempts.length ? "Folytasd, ahol abbahagytad!" : pickOne(HU.idle, round.track.id));
    el.playBtn.classList.add("pulse");
  }

  // A letöltött hangot helyi (blob) címről játsszuk, különben a Deezer-linkről.
  let blobUrl = "";
  function setAudioSource() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = round.blob ? URL.createObjectURL(round.blob) : "";
    el.audio.src = blobUrl || round.preview;
    el.audio.load();
  }

  // A következő dal előre: sorsolás és letöltés, amíg ezt játssza.
  let prefetched = null;
  function prefetchNext() {
    let t = null;
    if (round.mode === "versus") {
      const id = versus.ids[versus.idx + 1];
      t = id && pool.find((p) => p.id === id);
    } else if (round.mode === "endless") {
      t = pickTrack();
      prefetched = { track: t, category };
    }
    if (t && navigator.onLine) loadClip(t).catch(() => {});
  }
  function takePrefetched() {
    const p = prefetched;
    prefetched = null;
    if (!p || mode !== "endless" || p.category !== category || !pool.includes(p.track)) return null;
    return isReported(p.track.id) || (round && round.track.id === p.track.id) ? null : p.track;
  }
  async function pickCachedTrack() {
    const ids = new Set(await cachedClipIds());
    const recent = new Set(load("recent", []).slice(0, 10));
    const list = pool.filter((t) => ids.has(t.id) && !isReported(t.id));
    const fresh = list.filter((t) => !recent.has(t.id));
    const from = fresh.length ? fresh : list;
    return from.length ? from[Math.floor(Math.random() * from.length)] : null;
  }

  function persistRound() {
    if (!round || round.mode === "versus") return;
    if (round.mode === "daily") {
      save(dailyKey(round.date, round.diff), {
        trackId: round.track.id, attempts: round.attempts, done: round.done, won: round.won, points: round.points,
      });
    } else if (!round.done) {
      save("round", { category, trackId: round.track.id, attempts: round.attempts, reverse: round.reverse, heard: round.heard });
    } else {
      save("round", null);
    }
  }

  function currentLength() {
    if (!round) return LENGTHS[0];
    if (round.done) return FULL_PREVIEW;
    return lengthsOf(round)[Math.min(round.attempts.length, MAX_TRIES - 1)];
  }
  const scaleLength = () => (round && round.done ? FULL_PREVIEW : MAX_LEN);

  function registerAttempt(attempt) {
    round.attempts.push(attempt);
    if (round.mode === "versus" && attempt.type !== "right" && round.attempts.length < MAX_TRIES) vsSendProgress();
    if (attempt.type === "right") return finishRound(true);
    if (round.attempts.length >= MAX_TRIES) return finishRound(false);
    persistRound();
    stopAudio();
    renderAll(true);
    retrigger(el.clipLen, "bump");
    el.playBtn.classList.add("pulse");
    const len = currentLength();
    if (attempt.type === "skip") setStatus(`Most már ${len} mp-et hallhatsz.`);
    else {
      vibrate(60);
      retrigger(el.input, "shake");
      setStatus(attempt.type === "near"
        ? `Meleg! Jó előadó, de nem ez a dal. Most már ${len} mp.`
        : `${pickOne(HU.wrong)} Most már ${len} mp-et hallhatsz.`);
    }
  }

  function scoreFor(won, tries, streakAfter, multiplier) {
    if (!won) return { base: 0, bonus: 0, total: 0 };
    const base = Math.round(POINTS[tries - 1] * multiplier);
    const bonus = Math.min(Math.max(streakAfter - 1, 0) * STREAK_BONUS, STREAK_BONUS_MAX);
    return { base, bonus, total: base + bonus };
  }

  function finishRound(won, silent) {
    round.done = true;
    round.won = won;
    const tries = round.attempts.length;

    // Párbajban és kihívásban nincs sorozat, statisztika és összpont: csak a meccs számít.
    if (round.mode === "versus") {
      round.points = scoreFor(won, tries, 0, 1);
      versus.results[versus.idx] = { won, pts: round.points.total, tries };
      vsSendProgress();
      countEvent(won ? "versus-song-won" : "versus-song-lost");
    } else finishStats(won, tries, silent);
    if (silent) return;
    if (round.mode === "daily") renderCategories();

    stopAudio();
    buildWave(false);
    renderAll(true);
    if (won) {
      confetti();
      vibrate([30, 40, 30]);
      floatPoints(round.points.total);
      if (round.mode !== "versus") setTimeout(() => animatePoints(), 500);
    } else {
      vibrate(150);
    }
    showReveal(true);
  }

  function finishStats(won, tries, silent) {
    let s;
    if (round.mode === "daily") {
      s = dailyStats(round.diff);
      if (won) {
        s.streak = s.lastWin === shiftDate(round.date, -1) ? s.streak + 1 : 1;
        s.lastWin = round.date;
      } else s.streak = 0;
    } else {
      s = stats;
      s.streak = won ? s.streak + 1 : 0;
    }
    s.played++;
    if (won) s.wins++;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    s.dist[won ? tries - 1 : MAX_TRIES]++;
    if (round.mode === "daily") save("dailyStats2", dailyStatsAll);
    else save("stats", s);

    round.points = scoreFor(won, tries, s.streak, multOf(round));
    points += round.points.total;
    save("points", points);
    if (round.mode === "endless" && !silent && !gameDone()) {
      // A dal azonosítója a kihíváshoz kell (a kör 5 dala megosztható).
      game.results.push({ won, pts: round.points.total, id: round.track.id });
      if (gameDone()) {
        const score = gameScore();
        game.record = score > bestGame && score > 0;
        game.prevBest = bestGame;
        if (game.record) { bestGame = score; save("bestGame", bestGame); }
      }
      save("game", game);
    }
    persistRound();
  }

  function emojiRow(r) {
    const map = { right: "🟩", near: "🟨", wrong: "🟥", skip: "⬛" };
    let s = r.attempts.map((a) => map[a.type] || "⬛").join("");
    for (let i = r.attempts.length; i < MAX_TRIES; i++) s += "⬜";
    return s;
  }

  // Eredeti megjelenési év. A Deezer gyakran egy későbbi válogatás évét adja (pl. egy
  // 2024-es „Best of” lemezét), ezért a MusicBrainz első megjelenési dátumával
  // pontosítunk: az azonos előadójú, azonos című felvételek (a „Dal I.”, „Dal II”
  // változatokkal együtt) legkorábbi éve. Dalonként egyszer kérdezzük le.
  const PART_SUFFIX = /^(.*?)(?: (?:i|ii|iii|iv|v|vi|[1-9]))?$/;
  // Összevetéshez: névelő („A 67-es út”) és sorszám („… II.”) nélkül.
  const songKey = (s) => norm(s).replace(/^az? /, "").match(PART_SUFFIX)[1];
  // Egy dalhoz egyszerre csak egy kérés fut (a kör eleji előtöltés és a megoldás közös).
  const yearRequests = new Map();
  function originalYear(t, deezerYear) {
    const cached = load("year." + t.id, null);
    if (cached) return Promise.resolve(cached);
    if (!yearRequests.has(t.id)) {
      yearRequests.set(t.id, lookupYear(t, deezerYear).finally(() => yearRequests.delete(t.id)));
    }
    return yearRequests.get(t.id);
  }
  async function lookupYear(t, deezerYear) {
    const key = "year." + t.id;
    const fallback = deezerYear && deezerYear !== "0000" ? deezerYear : null;
    try {
      const raw = t.title.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim() || t.title;
      const q = `recording:"${raw.replace(/"/g, "")}" AND artist:"${t.artist.replace(/"/g, "")}"`;
      const url = "https://musicbrainz.org/ws/2/recording?" + new URLSearchParams({ query: q, fmt: "json", limit: "40" });
      const get = async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        try { return await fetch(url, { signal: ctrl.signal }); } finally { clearTimeout(timer); }
      };
      let res = await get();
      // A MusicBrainz másodpercenként egy kérést enged; túlterheléskor egyszer újrapróbáljuk.
      if (res.status === 503 || res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await get();
      }
      if (!res.ok) return fallback;
      const data = await res.json();
      const want = songKey(raw), artist = norm(t.artist);
      let best = fallback ? +fallback : Infinity;
      for (const r of data.recordings || []) {
        const credit = norm((r["artist-credit"] || []).map((a) => a.name).join(" "));
        if (!credit.includes(artist) || songKey(r.title) !== want) continue;
        const yr = parseInt(String(r["first-release-date"] || "").slice(0, 4), 10);
        if (yr > 1900 && yr < best) best = yr;
      }
      const result = Number.isFinite(best) ? String(best) : fallback;
      if (result) save(key, result);
      return result;
    } catch {
      return fallback;
    }
  }

  function showReveal(autoplay) {
    const t = round.track;
    setControls(false);
    showDone(true);
    el.playBtn.disabled = false;
    el.playBtn.classList.remove("pulse");

    el.discCover.classList.remove("loaded");
    el.discCover.onload = () => {
      el.discCover.classList.add("loaded");
      setTint(coverColors(el.discCover));
    };
    el.discCover.src = coverUrl(round.md5, 500);
    el.discCover.alt = `${t.album} borítója`;
    el.disc.classList.add("revealed");

    el.revealResult.textContent = round.won
      ? HU.win[Math.min(round.attempts.length, HU.win.length) - 1]
      : pickOne(HU.lost, t.id);
    el.revealResult.classList.toggle("lost", !round.won);
    el.revealTitle.textContent = t.title;
    el.revealArtist.textContent = artistLine(t);
    el.revealAlbum.textContent = t.album;
    // A megjelenés éve a megoldásnál (nyerés és vesztés esetén is). Előbb a Deezer-évet
    // mutatjuk, majd a MusicBrainz szerinti eredeti évre cseréljük, ha az korábbi.
    const y = document.createElement("span");
    y.className = "reveal-year";
    const shownRound = round;
    if (round.year && round.year !== "0000") {
      y.textContent = round.year;
      el.revealAlbum.append(" ", y);
    }
    originalYear(t, round.year).then((v) => {
      if (round !== shownRound || !v || v === y.textContent) return;
      y.textContent = v;
      if (!y.isConnected) el.revealAlbum.append(" ", y);
      retrigger(y, "bump");
    });
    el.revealEmoji.textContent = emojiRow(round);
    const p = round.points;
    el.revealPoints.textContent = p && p.total
      ? `+${p.total} pont` + (p.bonus ? ` (🔥 +${p.bonus})` : "")
      : "";
    const setOver = round.mode === "endless" && gameDone();
    el.revealSet.hidden = !setOver && !(round.mode === "versus" && vsOver());
    if (round.mode === "versus") {
      if (vsOver()) renderVsSummary(autoplay);
    } else if (setOver) {
      const score = gameScore();
      el.revealSet.innerHTML = game.record
        ? `🏁 Kör vége: <b>${score}</b> pont · <span class="rec">🏆 Új rekord!</span>`
        : `🏁 Kör vége: <b>${score}</b> pont · rekord: ${bestGame}`;
      if (game.record && autoplay) setTimeout(confetti, 700);
    }
    el.reveal.hidden = false;
    retrigger(el.reveal, "in");
    $("scroll").scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });

    renderReportBtn();
    updateNextButton();
    if (round.mode === "daily") startCountdown();
    else if (round.mode === "versus" && versus.waiting) setStatus(`Várakozás: ${versus.opp.name} még ezen a dalon dolgozik…`);
    else setStatus("Koppints a lemezre a teljes előnézethez.");
    if (autoplay) playClip();
    el.nextBtn.focus({ preventScroll: true });
  }

  function resetStage() {
    el.disc.classList.remove("revealed");
    el.discCover.classList.remove("loaded");
    el.discCover.removeAttribute("src");
    el.reveal.hidden = true;
    setTint(DEFAULT_TINT);
  }

  function showDone(on) {
    el.controls.hidden = on;
    el.doneButtons.hidden = !on;
    if (!on) el.reveal.hidden = true;
  }

  let countdownTimer = 0;
  function startCountdown() {
    stopCountdown();
    const tick = () => {
      const ms = msToNextDay();
      if (ms <= 0 || !round || dateKey() !== round.date) { stopCountdown(); if (mode === "daily") enterMode(); return; }
      const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1e3) % 60;
      el.status.textContent = `Új napi dal: ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      el.status.classList.remove("error");
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopCountdown() { clearInterval(countdownTimer); }

  // ---------- Megjelenítés ----------
  function renderAll(animate) {
    renderGuesses(animate);
    renderTries();
    renderRoundPoints();
    renderWaveState(0, true);
    renderClipInfo();
    renderStreak();
  }

  function renderGuesses(animateLast) {
    el.guesses.innerHTML = "";
    const attempts = round ? round.attempts : [];
    attempts.forEach((a, i) => {
      const li = document.createElement("li");
      li.className = a.type;
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = { right: "✓", wrong: "✗", near: "~", skip: "»" }[a.type];
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = a.type === "skip" ? `Kihagyva · ${lengthsOf(round)[i]} mp` : a.label;
      li.append(mark, label);
      if (a.type === "near") {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "jó előadó";
        li.appendChild(tag);
      }
      if (animateLast && i === attempts.length - 1) li.classList.add("new");
      el.guesses.appendChild(li);
    });
  }

  function renderTries() {
    el.tries.innerHTML = "";
    const attempts = round ? round.attempts : [];
    for (let i = 0; i < MAX_TRIES; i++) {
      const pill = document.createElement("i");
      if (attempts[i]) pill.className = attempts[i].type;
      else if (round && !round.done && i === attempts.length) pill.className = "current";
      el.tries.appendChild(pill);
    }
  }

  function renderClipInfo() {
    const total = scaleLength();
    el.timeMax.textContent = fmt(total);
    el.timeNow.textContent = fmt(0);
    el.clipLen.textContent = !round ? " " : round.done ? "Teljes előnézet" : `${currentLength()} mp`;
    if (round && !round.done && round.reverse) {
      // Nehéz mód: külön színnel, mert a színátmenetes szövegben az emoji is elszíneződne.
      const s = document.createElement("span");
      s.className = "clip-hard";
      s.textContent = "⏪ visszafelé";
      el.clipLen.append(" · ", s);
    }
    el.ringUnlocked.style.strokeDashoffset = round ? 100 - (currentLength() / total) * 100 : 100;
    el.ringProgress.style.strokeDashoffset = 100;
    if (round && !round.done) {
      const remaining = MAX_TRIES - round.attempts.length;
      const nextLen = lengthsOf(round)[round.attempts.length + 1];
      el.skipBtn.textContent = remaining === 1 ? "Feladom" : `Kihagyás +${nextLen - currentLength()} mp`;
    }
  }

  // Hullámforma: a dalhoz kötött, ál-véletlen oszlopok (a hangot nem kell előre letölteni).
  let waveBars = [];
  let waveUnlocked = -1;
  function buildWave(intro) {
    el.wave.innerHTML = "";
    el.wave.classList.toggle("intro", !!intro && !reducedMotion.matches);
    const rng = mulberry32(round ? round.track.id : 1);
    const raw = Array.from({ length: WAVE_BARS }, () => rng());
    const total = scaleLength();
    waveBars = raw.map((v, i) => {
      const smooth = (v + (raw[i - 1] ?? v) + (raw[i + 1] ?? v)) / 3;
      const t = ((i + 0.5) / WAVE_BARS) * total;
      const env = 0.45 + 0.55 * Math.min(1, t / 5);
      const h = Math.max(0.12, Math.min(1, (0.25 + smooth * 0.9) * env));
      const bar = document.createElement("i");
      bar.style.height = Math.round(h * 100) + "%";
      if (intro) bar.style.animationDelay = i * 8 + "ms";
      el.wave.appendChild(bar);
      return { node: bar, t };
    });
    waveUnlocked = -1;

    el.waveMarks.innerHTML = "";
    if (total === MAX_LEN) {
      for (const l of lengthsOf(round)) {
        const m = document.createElement("span");
        m.textContent = l + "s";
        m.style.left = Math.min(97, (l / total) * 100) + "%";
        el.waveMarks.appendChild(m);
      }
    }
  }

  function renderWaveState(playedSec, sweep) {
    if (!waveBars.length) return;
    const unlockedSec = round ? currentLength() : 0;
    const newlyFrom = waveUnlocked;
    waveBars.forEach((b, i) => {
      const unlocked = b.t <= unlockedSec;
      const played = playedSec > 0 && b.t <= playedSec;
      if (sweep && unlocked && b.t > newlyFrom && newlyFrom >= 0) b.node.style.transitionDelay = (i * 14) % 500 + "ms";
      else b.node.style.transitionDelay = "";
      b.node.classList.toggle("unlocked", unlocked);
      b.node.classList.toggle("played", played);
    });
    if (sweep) waveUnlocked = unlockedSec;
    [...el.waveMarks.children].forEach((m, i) => m.classList.toggle("on", lengthsOf(round)[i] <= unlockedSec));
  }

  function renderStreak() {
    const flame = '<span class="flame">🔥</span>';
    if (mode === "daily") {
      const st = dailyStreakNow(), s = dailyStats(), d = diffById(dailyDiff);
      el.streakLine.innerHTML = st > 0
        ? `${flame} ${d.label} sorozat: <b>${st}</b> nap · legjobb: ${s.maxStreak}`
        : s.played ? `${d.label} legjobb sorozat: ${s.maxStreak} nap` : "Találd ki a mai dalt!";
    } else if (mode === "versus") {
      el.streakLine.textContent = vsOppLine();
    } else {
      el.streakLine.innerHTML = stats.streak > 0
        ? `${flame} Sorozat: <b>${stats.streak}</b> · legjobb: ${stats.maxStreak}`
        : stats.played ? `Legjobb sorozat: ${stats.maxStreak}` : "";
    }
  }

  // A kör pontja: játék közben a még megszerezhető pont, a végén a megszerzett.
  function renderRoundPoints() {
    renderSetBar();
    if (mode === "artist") {
      const st = adState();
      el.roundLabel.textContent = "ma";
      el.roundNum.textContent = st.done ? (st.gaveUp ? "0" : "+" + st.points) : adPointsFor(st.guesses.length + 1, st);
      el.roundPts.className = "round-pts" + (st.done ? (st.gaveUp ? " lost" : " won") : "");
      return;
    }
    if (mode === "versus") {
      el.roundNum.textContent = vsScore(versus.results);
      el.roundLabel.textContent = `dal ${Math.min(versus.idx + 1, versus.ids.length)}/${versus.ids.length}`;
      el.roundPts.className = "round-pts";
      return;
    }
    if (mode !== "daily") {
      const prevE = el.roundNum.textContent;
      el.roundNum.textContent = gameScore();
      el.roundLabel.textContent = `kör ${Math.min(game.results.length + (round && !round.done ? 1 : 0), SET_SIZE) || 1}/${SET_SIZE}`;
      el.roundPts.className = "round-pts" + (gameDone() && game.record ? " won" : "");
      if (prevE !== el.roundNum.textContent) retrigger(el.roundPts, "tick");
      return;
    }
    el.roundLabel.textContent = "dal";
    let n = null, state = "";
    if (round && round.done) {
      n = round.points ? round.points.total : 0;
      state = n ? "won" : "lost";
    } else if (round) {
      const daily = round.mode === "daily";
      const s = daily ? dailyStats(round.diff) : stats;
      const streakAfter = daily ? (s.lastWin === shiftDate(round.date, -1) ? s.streak + 1 : 1) : s.streak + 1;
      n = scoreFor(true, round.attempts.length + 1, streakAfter, multOf(round)).total;
    }
    const prev = el.roundNum.textContent;
    el.roundNum.textContent = n === null ? "–" : (state === "won" ? "+" : "") + n;
    el.roundPts.className = "round-pts " + state;
    if (prev !== el.roundNum.textContent && n !== null) retrigger(el.roundPts, "tick");
  }

  // Az 5 dalos kör állása: dalonként a megszerzett pont, az aktuálisnál a még elérhető.
  function renderSetBar() {
    el.setBar.hidden = mode !== "endless";
    renderVsBar();
    if (mode !== "endless") return;
    el.setSlots.innerHTML = "";
    for (let i = 0; i < SET_SIZE; i++) {
      const r = game.results[i], slot = document.createElement("span");
      if (r) {
        slot.className = r.won ? "won" : "lost";
        slot.textContent = r.won ? r.pts : "✗";
      } else if (i === game.results.length && round && !round.done) {
        slot.className = "current";
        slot.textContent = scoreFor(true, round.attempts.length + 1, stats.streak + 1, multOf(round)).total;
      }
      el.setSlots.appendChild(slot);
    }
    el.setRecord.textContent = bestGame;
  }

  function renderPoints() {
    el.pointsNum.textContent = shownPoints.toLocaleString("hu-HU");
  }

  function animatePoints() {
    const from = shownPoints, to = points, start = performance.now(), dur = 1100;
    if (from === to) return;
    retrigger(el.pointsPill, "bump");
    if (!reducedMotion.matches) {
      for (let i = 0; i < 12; i++) {
        const sp = document.createElement("i");
        sp.className = "spark";
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, d = 26 + Math.random() * 22;
        sp.style.setProperty("--sx", Math.cos(a) * d + "px");
        sp.style.setProperty("--sy", Math.sin(a) * d + "px");
        sp.style.animationDelay = Math.random() * 0.12 + "s";
        el.pointsPill.appendChild(sp);
        setTimeout(() => sp.remove(), 1100);
      }
    }
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      shownPoints = Math.round(from + (to - from) * eased);
      renderPoints();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function floatPoints(n) {
    if (!n) return;
    el.floatPoints.textContent = `+${n}`;
    retrigger(el.floatPoints, "go");
  }

  function setControls(on) {
    el.input.disabled = !on;
    el.skipBtn.disabled = !on;
    el.playBtn.disabled = !on;
    if (!on) el.playBtn.classList.remove("pulse");
    updateSubmit();
  }

  function updateSubmit() {
    el.submitBtn.disabled = el.input.disabled || !el.input.value.trim();
  }
  function updateClear() {
    el.clearBtn.hidden = !el.input.value;
  }

  function confetti() {
    if (reducedMotion.matches) return;
    const colors = ["#e0444f", "#f4f1ea", "#1ed760", "#5fd98a", "#ffc547", "#e0444f"];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement("i");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.setProperty("--dx", (Math.random() - 0.5) * 240 + "px");
      c.style.setProperty("--rot", Math.random() * 900 + "deg");
      c.style.animationDuration = 1.4 + Math.random() * 1.4 + "s";
      c.style.animationDelay = Math.random() * 0.3 + "s";
      if (i % 3 === 0) { c.style.width = "10px"; c.style.height = "10px"; c.style.borderRadius = "50%"; }
      el.confetti.appendChild(c);
    }
    setTimeout(() => { el.confetti.innerHTML = ""; }, 3200);
  }

  // Hullám-effekt koppintáskor
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn, .chip, .segmented button");
    if (!btn || btn.disabled || reducedMotion.matches) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const rip = document.createElement("span");
    rip.className = "ripple";
    rip.style.width = rip.style.height = size + "px";
    rip.style.left = e.clientX - r.left - size / 2 + "px";
    rip.style.top = e.clientY - r.top - size / 2 + "px";
    btn.appendChild(rip);
    setTimeout(() => rip.remove(), 650);
  });

  // ---------- Hang (Web Audio: hangerő + vizualizáció) ----------
  let actx = null, gainNode = null, analyser = null, freq = null;

  function ensureAudioGraph() {
    if (actx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      // iOS: a némító kapcsoló ne némítsa el a játékot.
      if (navigator.audioSession) navigator.audioSession.type = "playback";
      actx = new Ctx();
      const src = actx.createMediaElementSource(el.audio);
      analyser = actx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      freq = new Uint8Array(analyser.frequencyBinCount);
      gainNode = actx.createGain();
      src.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(actx.destination);
      applyVolume();
    } catch (e) {
      console.warn("Web Audio nem érhető el:", e);
      actx = null;
    }
  }

  // A Dallista előnézet-lejátszója (a hangerő-szabályzó is kezeli).
  const libAudio = new Audio();
  libAudio.crossOrigin = "anonymous";
  libAudio.preload = "none";

  let rafId = 0;
  let playToken = 0; // minden megállítás érvényteleníti a még induló lejátszást

  function stopAudio() {
    playToken++;
    cancelAnimationFrame(rafId);
    el.audio.pause();
    if (revSource) {
      const s = revSource;
      revSource = null;
      try { s.stop(); } catch { /* már leállt */ }
      s.disconnect();
    }
    document.body.classList.remove("playing");
    el.playBtn.classList.remove("playing", "loading");
    el.playBtn.setAttribute("aria-label", "Lejátszás");
    el.ringProgress.style.strokeDashoffset = 100;
    el.timeNow.textContent = fmt(0);
    renderWaveState(0, false);
  }

  async function playClip() {
    if (!round) return;
    if (el.playBtn.classList.contains("playing") || el.playBtn.classList.contains("loading")) return stopAudio();
    ensureAudioGraph();
    if (actx && actx.state === "suspended") actx.resume();
    el.playBtn.classList.remove("pulse");
    // Ha egyszer meghallgatta, a nehéz mód kapcsolása már csak a következő dalra hat.
    if (!round.done && !round.heard) { round.heard = true; persistRound(); }
    const token = ++playToken;
    el.playBtn.classList.add("loading");
    // Nehéz mód: visszafelé (Web Audio nélkül marad a sima lejátszás). A megfejtés után előre szól.
    if (round.reverse && !round.done && actx) return playReversed(token);
    try {
      el.audio.currentTime = 0;
      await el.audio.play();
    } catch (e) {
      if (token !== playToken) return; // közben megállították (pl. kihagyás)
      console.warn(e);
      el.playBtn.classList.remove("loading");
      setStatus("Nem sikerült lejátszani. Próbáld újra!", true);
      return;
    }
    // Ha indulás közben kihagyott vagy tippelt, ez a lejátszás már elavult.
    if (token !== playToken) { el.audio.pause(); return; }
    startTicker(token, () => el.audio.currentTime, () => el.audio.ended);
  }

  // Lejátszás közben: gomb állapota, gyűrű, idő és hullámforma; a részlet végén megáll.
  function startTicker(token, elapsed, ended) {
    el.playBtn.classList.remove("loading");
    el.playBtn.classList.add("playing");
    document.body.classList.add("playing");
    el.playBtn.setAttribute("aria-label", "Megállítás");
    const total = scaleLength();
    const tick = () => {
      if (token !== playToken) return;
      const t = Math.max(0, elapsed());
      el.ringProgress.style.strokeDashoffset = 100 - Math.min(t / total, 1) * 100;
      el.timeNow.textContent = fmt(t);
      renderWaveState(t, false);
      if (t >= currentLength() || ended()) return stopAudio();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  // Nehéz mód: a hangmintákat megfordítjuk, és a dal első másodperceit visszafelé játsszuk.
  let revSource = null;
  let revCache = null; // { id, buf } – csak az aktuális dal
  async function reversedBuffer(r) {
    if (revCache && revCache.id === r.track.id) return revCache.buf;
    const data = r.blob ? await r.blob.arrayBuffer() : await (await fetch(r.preview)).arrayBuffer();
    const buf = await actx.decodeAudioData(data);
    for (let c = 0; c < buf.numberOfChannels; c++) buf.getChannelData(c).reverse();
    revCache = { id: r.track.id, buf };
    return buf;
  }
  async function playReversed(token) {
    let buf;
    try {
      buf = await reversedBuffer(round);
    } catch (e) {
      if (token !== playToken) return;
      console.warn(e);
      el.playBtn.classList.remove("loading");
      setStatus("Nem sikerült lejátszani. Próbáld újra!", true);
      return;
    }
    if (token !== playToken) return;
    const len = Math.min(currentLength(), buf.duration);
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    // A megfordított hangban az eredeti eleje a végén van: onnan indulunk, így a dal legelején ér véget.
    src.start(0, buf.duration - len, len);
    revSource = src;
    const startedAt = actx.currentTime;
    let done = false;
    src.onended = () => { done = true; };
    startTicker(token, () => actx.currentTime - startedAt, () => done);
  }

  el.audio.addEventListener("waiting", () => {
    if (el.playBtn.classList.contains("playing")) el.playBtn.classList.add("loading");
  });
  el.audio.addEventListener("playing", () => el.playBtn.classList.remove("loading"));
  el.audio.addEventListener("error", () => {
    if (!round || !el.audio.getAttribute("src") || el.audio.src.startsWith("blob:")) return;
    // Lejárt előnézet-link: frissítjük.
    Deezer.track(round.track.id).then((full) => {
      if (full.preview && full.preview !== round.preview) {
        round.preview = full.preview;
        el.audio.src = full.preview;
        el.audio.load();
      }
    }).catch(() => setStatus("Hiba a hang betöltésekor.", true));
  });

  // Kör alakú vizualizáció a lemez körül.
  const vctx = el.viz.getContext("2d");
  let vizSize = 0;
  const VIZ_BARS = 72;
  const vizLevels = new Float32Array(VIZ_BARS);
  let accentColor = "#1ed760";

  function sizeViz() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = el.viz.getBoundingClientRect();
    vizSize = r.width;
    el.viz.width = Math.round(r.width * dpr);
    el.viz.height = Math.round(r.height * dpr);
    vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawViz(now) {
    requestAnimationFrame(drawViz);
    if (document.hidden || !vizSize) return;
    const playing = document.body.classList.contains("playing");
    const loading = el.stage.classList.contains("loading");
    if (playing && analyser) analyser.getByteFrequencyData(freq);
    const cx = vizSize / 2, cy = vizSize / 2;
    const discR = el.disc.getBoundingClientRect().width / 2;
    const inner = discR + 14;
    const maxLen = Math.max(10, cx - inner - 4);
    vctx.clearRect(0, 0, vizSize, vizSize);
    vctx.lineCap = "round";
    vctx.lineWidth = Math.max(2, (2 * Math.PI * inner) / VIZ_BARS * 0.45);
    for (let i = 0; i < VIZ_BARS; i++) {
      const half = i < VIZ_BARS / 2 ? i : VIZ_BARS - i;
      let target;
      if (playing && analyser) {
        const bin = Math.floor(2 + (half / (VIZ_BARS / 2)) * (freq.length * 0.55));
        target = freq[bin] / 255;
      } else if (playing) {
        target = 0.35 + 0.3 * Math.sin(now / 160 + i * 0.7);
      } else if (loading) {
        const pos = ((now / 900) * VIZ_BARS) % VIZ_BARS;
        const dist = Math.min(Math.abs(i - pos), VIZ_BARS - Math.abs(i - pos));
        target = Math.max(0, 0.5 - dist * 0.06);
      } else {
        target = reducedMotion.matches ? 0.06 : 0.05 + 0.04 * Math.sin(now / 700 + i * 0.35);
      }
      vizLevels[i] += (target - vizLevels[i]) * 0.25;
      const len = 3 + vizLevels[i] * maxLen;
      const a = (i / VIZ_BARS) * Math.PI * 2 - Math.PI / 2;
      const cos = Math.cos(a), sin = Math.sin(a);
      vctx.globalAlpha = 0.25 + vizLevels[i] * 0.75;
      vctx.strokeStyle = accentColor;
      vctx.beginPath();
      vctx.moveTo(cx + cos * inner, cy + sin * inner);
      vctx.lineTo(cx + cos * (inner + len), cy + sin * (inner + len));
      vctx.stroke();
    }
    vctx.globalAlpha = 1;
  }

  // A vizualizáció színe a háttérárnyalatot követi.
  setInterval(() => {
    const c = getComputedStyle(document.documentElement).getPropertyValue("--t1").trim();
    if (c) accentColor = c;
  }, 400);

  // A vászon méretét a színpad méretváltozásához igazítjuk (billentyűzet, címsor, megfejtés):
  // különben a régi kép felnagyítva, elmosódva látszik.
  window.addEventListener("resize", sizeViz);
  if (window.ResizeObserver) new ResizeObserver(sizeViz).observe(el.viz);

  // ---------- Hangerő ----------
  let volume = load("volume", { level: 80, muted: false });

  function applyVolume() {
    const level = Math.max(0, Math.min(1, volume.level / 100));
    const silent = volume.muted || volume.level === 0;
    if (gainNode) {
      gainNode.gain.setTargetAtTime(silent ? 0 : level, actx.currentTime, 0.03);
      el.audio.volume = 1;
      el.audio.muted = false;
      libAudio.volume = 1;
    } else {
      el.audio.volume = level;
      libAudio.volume = silent ? 0 : level;
      el.audio.muted = silent;
    }
    el.volumeRange.value = volume.level;
    el.volumeRange.style.setProperty("--fill", volume.level + "%");
    el.volumeVal.textContent = volume.muted ? "néma" : volume.level + "%";
    el.muteBtn.textContent = volume.muted ? "🔈" : "🔇";
    el.muteBtn.setAttribute("aria-label", volume.muted ? "Hang be" : "Némítás");
    el.volumeBtn.classList.toggle("muted", silent);
    el.volumeBtn.classList.toggle("low", !silent && volume.level < 50);
    save("volume", volume);
  }

  el.volumeRange.addEventListener("input", () => {
    volume.level = +el.volumeRange.value;
    volume.muted = false;
    applyVolume();
  });
  el.muteBtn.addEventListener("click", () => { volume.muted = !volume.muted; applyVolume(); });
  el.volumeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = el.volumePop.hidden;
    el.volumePop.hidden = !open;
    el.volumeBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("pointerdown", (e) => {
    if (!el.volumePop.hidden && !el.volumePop.contains(e.target) && !el.volumeBtn.contains(e.target)) {
      el.volumePop.hidden = true;
      el.volumeBtn.setAttribute("aria-expanded", "false");
    }
  });

  // ---------- Automatikus kiegészítés ----------
  let suggestionItems = [];
  let activeIndex = -1;

  // Az ebben a körben már tippelt dalok ne jelenjenek meg újra.
  function guessedKeys() {
    const keys = new Set();
    if (!round) return keys;
    for (const a of round.attempts) {
      if (a.key) keys.add(a.key);
      else if (a.label) keys.add("label:" + a.label);
    }
    return keys;
  }

  // Minden beírt szónak szerepelnie kell a címben vagy valamelyik előadóban
  // (a közreműködőket is beleértve). Ha a keresés több előadót is érint,
  // a közös dalaik kerülnek előre.
  function search(q) {
    const nq = norm(q);
    if (!nq) return [];
    const tokens = nq.split(" ");
    const guessed = guessedKeys();
    const hits = [];
    for (const t of pool) {
      if (guessed.has(t.key) || guessed.has("label:" + trackLabel(t))) continue;
      if (!tokens.every((tok) => t.hay.includes(tok))) continue;
      const artistsHit = t.nArtists.filter((a) => tokens.some((tok) => a.includes(tok))).length;
      let score = t.nTitle.startsWith(nq) ? 0
        : t.nArtists.some((a) => a.startsWith(nq)) ? 1
        : t.nTitle.includes(nq) ? 2 : 3;
      if (artistsHit >= 2) score -= 2;
      hits.push({ t, score });
    }
    hits.sort((a, b) => a.score - b.score || b.t.rank - a.t.rank);
    // Az előadó nevét beírva az összes dala látszódjon (a lista görgethető).
    return hits.slice(0, 60).map((h) => h.t);
  }

  // A beírt szöveget kiemeli a találatban (ékezetektől függetlenül).
  function highlighted(text, q) {
    const frag = document.createDocumentFragment();
    const ft = fold(text);
    if (ft.length !== text.length) { frag.append(text); return frag; }
    const on = new Array(text.length).fill(false);
    for (const tok of fold(q).split(/\s+/).filter(Boolean)) {
      const i = ft.indexOf(tok);
      if (i >= 0) for (let k = i; k < i + tok.length; k++) on[k] = true;
    }
    let i = 0;
    while (i < text.length) {
      let j = i;
      while (j < text.length && on[j] === on[i]) j++;
      if (on[i]) {
        const mark = document.createElement("mark");
        mark.textContent = text.slice(i, j);
        frag.append(mark);
      } else frag.append(text.slice(i, j));
      i = j;
    }
    return frag;
  }

  function renderSuggestions() {
    const q = el.input.value;
    suggestionItems = search(q);
    activeIndex = suggestionItems.length ? 0 : -1;
    el.suggestions.innerHTML = "";
    if (!q.trim()) return hideSuggestions();
    if (!suggestionItems.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Nincs ilyen dal a listában";
      el.suggestions.appendChild(li);
    }
    suggestionItems.forEach((t, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activeIndex));
      const img = document.createElement("img");
      img.className = "s-cover";
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      if (t.md5) img.src = coverUrl(t.md5, 120);
      const text = document.createElement("span");
      text.className = "s-text";
      const title = document.createElement("span");
      title.className = "s-title";
      title.appendChild(highlighted(t.title, q));
      const artist = document.createElement("span");
      artist.className = "s-artist";
      artist.appendChild(highlighted(t.artist, q));
      if (t.feat.length) {
        const feat = document.createElement("span");
        feat.className = "s-feat";
        feat.append(" feat. ", highlighted(t.feat.join(", "), q));
        artist.appendChild(feat);
      }
      text.append(title, artist);
      li.append(img, text);
      // A mousedown tiltása megtartja a fókuszt (és a billentyűzetet); a választás
      // click-re történik, így mobilon a lista görgetése nem választ ki dalt.
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => choose(t));
      el.suggestions.appendChild(li);
    });
    const wasHidden = el.suggestions.hidden;
    el.suggestions.hidden = false;
    if (wasHidden) retrigger(el.suggestions, "open");
    fitSuggestions();
    el.suggestions.scrollTop = 0;
  }

  // A lista ne lógjon ki a látható területből, ha a billentyűzet nyitva van.
  function fitSuggestions() {
    if (el.suggestions.hidden) return;
    const vv = window.visualViewport;
    const top = vv ? vv.offsetTop : 0;
    const space = el.input.getBoundingClientRect().top - top - 16;
    // Legfeljebb a képernyő ~40%-a, hogy a lemez közepe (lejátszás gomb) látszódjon.
    const cap = Math.min(340, window.innerHeight * 0.4);
    el.suggestions.style.maxHeight = Math.max(120, Math.min(cap, space)) + "px";
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitSuggestions);
    window.visualViewport.addEventListener("scroll", fitSuggestions);
  }

  function hideSuggestions() {
    el.suggestions.hidden = true;
    suggestionItems = [];
    activeIndex = -1;
  }

  function highlight(i) {
    activeIndex = i;
    [...el.suggestions.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
    const li = el.suggestions.children[i];
    // Csak a listát görgetjük (a scrollIntoView az oldalt is mozgathatja).
    if (li) {
      const s = el.suggestions;
      if (li.offsetTop < s.scrollTop) s.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > s.scrollTop + s.clientHeight) s.scrollTop = li.offsetTop + li.offsetHeight - s.clientHeight;
    }
  }

  function choose(t) {
    selected = t;
    el.input.value = trackLabel(t);
    hideSuggestions();
    updateSubmit();
    updateClear();
  }

  function submit() {
    if (!round || round.done) return;
    let guess = selected;
    if (!guess || el.input.value !== trackLabel(guess)) {
      guess = search(el.input.value)[0] || null;
    }
    if (!guess) {
      retrigger(el.input, "shake");
      setStatus("Válassz egy dalt a listából!", true);
      return;
    }
    const answer = round.track;
    const right = guess.key === answer.key || guess.base === answer.base;
    const near = !right && guess.nArtists.some((a) => answer.nArtists.includes(a));
    selected = null;
    el.input.value = "";
    hideSuggestions();
    updateSubmit();
    updateClear();
    registerAttempt({ type: right ? "right" : near ? "near" : "wrong", label: trackLabel(guess), key: guess.key });
  }

  el.input.addEventListener("input", () => { selected = null; renderSuggestions(); updateSubmit(); updateClear(); });
  el.input.addEventListener("focus", () => { if (el.input.value && !selected) renderSuggestions(); });
  el.input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
  el.input.addEventListener("keydown", (e) => {
    const open = !el.suggestions.hidden && suggestionItems.length;
    if (e.key === "ArrowDown" && open) { e.preventDefault(); highlight((activeIndex + 1) % suggestionItems.length); }
    else if (e.key === "ArrowUp" && open) { e.preventDefault(); highlight((activeIndex - 1 + suggestionItems.length) % suggestionItems.length); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (open && activeIndex >= 0) choose(suggestionItems[activeIndex]);
      else submit();
    } else if (e.key === "Escape") hideSuggestions();
  });
  el.clearBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.input.value = "";
    selected = null;
    hideSuggestions();
    updateSubmit();
    updateClear();
    el.input.focus();
  });

  // Vágólap: a modern API, ha nem megy (pl. http, fókusz nélkül), a régi módszer.
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      (document.querySelector("dialog[open]") || document.body).appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch { /* nem támogatott */ }
      ta.remove();
      return ok;
    }
  }

  // ---------- Megosztás ----------
  const homeUrl = () => location.origin + location.pathname;
  // Kihívás-link: a kör dalai (36-os számrendszerben), a pontszám és a név.
  function challengeUrl(ids, score) {
    const p = new URLSearchParams({ k: ids.map((id) => id.toString(36)).join("-"), p: score });
    const nick = load("nick", "");
    if (nick) p.set("n", nick);
    return homeUrl() + "?" + p;
  }

  async function shareText(text) {
    try {
      if (navigator.share && matchMedia("(hover: none)").matches) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    toast(await copyText(text) ? "Vágólapra másolva! ✨" : "Nem sikerült megosztani.");
  }

  async function share() {
    if (!round || !round.done) return;
    if (round.mode === "versus") return vsShare();
    const head = round.mode === "daily"
      ? `Songdle HU 📅 ${round.date} · ${diffById(round.diff).icon} ${diffById(round.diff).label}`
      : `Songdle HU 🎵 ${catLabel(category)}` + (round.reverse ? " · 🔥 visszafelé" : "");
    const streak = round.mode === "daily" ? dailyStreakNow(round.diff) : stats.streak;
    const lines = [head, emojiRow(round)];
    const extra = [];
    if (round.points && round.points.total) extra.push(`+${round.points.total} pont`);
    if (streak > 0) extra.push(`🔥 ${streak}`);
    if (extra.length) lines.push(extra.join(" · "));
    // Kör vége: a link kihívás – a barát ugyanazt az 5 dalt kapja.
    const ids = game.results.map((r) => r.id).filter(Boolean);
    if (round.mode === "endless" && gameDone() && ids.length === SET_SIZE) {
      lines.push(`🎯 Kör: ${gameScore()} pont – meg tudod verni?`, challengeUrl(ids, gameScore()));
      countEvent("challenge-sent");
    } else lines.push(homeUrl());
    return shareText(lines.join("\n"));
  }

  // ---------- Gombok és billentyűk ----------
  el.playBtn.addEventListener("click", playClip);
  el.disc.addEventListener("click", () => { if (!el.playBtn.disabled) playClip(); });
  // Mobilon a fókusz elvesztése bezárja a billentyűzetet, és az elugró elrendezés
  // miatt a koppintás mellé mehet. A mousedown tiltásával ez nem történik meg.
  for (const b of [el.submitBtn, el.skipBtn]) b.addEventListener("mousedown", (e) => e.preventDefault());
  el.submitBtn.addEventListener("click", submit);
  el.skipBtn.addEventListener("click", () => {
    if (round && !round.done) registerAttempt({ type: "skip" });
    el.input.blur();
  });
  el.nextBtn.addEventListener("click", () => {
    if (mode === "versus") return vsNext();
    if (mode !== "daily") return startRound();
    const next = nextUnplayedDiff();
    if (next) changeDifficulty(next.id);
    else changeMode("endless");
  });
  el.shareBtn.addEventListener("click", share);
  el.modeEndless.addEventListener("click", () => changeMode("endless"));
  el.modeDaily.addEventListener("click", () => changeMode("daily"));
  el.modeArtist.addEventListener("click", () => changeMode("artist"));

  document.addEventListener("keydown", (e) => {
    if (mode === "artist" || document.querySelector("dialog[open]") || e.target === el.input || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " && !el.playBtn.disabled) {
      e.preventDefault();
      playClip();
    } else if (e.key === "Enter" && round && round.done && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      el.nextBtn.click();
    }
  });

  // ---------- Párbaj és kihívás ----------
  // Közös meccs-motor: mindkét fél ugyanazt a VS_SONGS dalt kapja, dalonként a tippek
  // száma szerinti pontért (sorozatbónusz nélkül). A párbajban a gépek közvetlenül
  // (WebRTC, PeerJS) beszélnek egymással; a következő dal akkor jön, ha mindketten végeztek.
  const PEER_PREFIX = "songdlehu-";
  const PEER_LIB = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
  let peer = null, peerConn = null, peerHost = false;

  // Egy sorozat összeállítása: különböző előadóktól, a népszerűbb dalok felé húzva.
  function pickSet(list, n) {
    const out = [], used = new Set();
    const cands = list.filter((t) => !isLive(t) && !isReported(t.id));
    while (out.length < n) {
      const left = cands.filter((t) => !out.includes(t) && !artistsOf(t).some((a) => used.has(a)));
      const from = left.length ? left : cands.filter((t) => !out.includes(t));
      if (!from.length) break;
      const t = weightedPick(from, Math.random);
      out.push(t);
      artistsOf(t).forEach((a) => used.add(a));
    }
    return out.map((t) => t.id);
  }

  function startVersus(kind, ids, opp, cat = "") {
    stopAudio();
    versus = { kind, ids, cat, idx: 0, results: [], opp: { results: [], live: {}, ...opp }, waiting: false };
    mode = "versus";
    renderMode();
    renderCategories();
    enterMode();
    countEvent(kind + "-start");
  }

  // A meccs dalai a teljes dallistából jönnek; ha egy dal nincs meg (más a dallista), a Deezerről pótoljuk.
  async function vsStartSong() {
    const id = versus.ids[versus.idx];
    let t = pool.find((p) => p.id === id);
    if (!t) {
      try {
        const full = await Deezer.track(id);
        t = buildPool([slimTrack(full)])[0];
        pool.push(t);
      } catch { /* alább kezeljük */ }
    }
    if (!t) return setStatus("Ezt a dalt nem sikerült betölteni.", true);
    startRound(t, null);
  }

  function vsNext() {
    if (vsOver()) {
      if (versus.kind === "battle" && peerConn) return vsRematch();
      return leaveVersus();
    }
    // Párbajban megvárjuk, hogy az ellenfél is végezzen ezzel a dallal.
    if (versus.kind === "battle" && !versus.oppGone && !versus.opp.results[versus.idx]) {
      versus.waiting = true;
      updateNextButton();
      setStatus(`Várakozás: ${versus.opp.name} még ezen a dalon dolgozik…`);
      return;
    }
    versus.waiting = false;
    versus.idx++;
    vsStartSong();
  }

  function leaveVersus() {
    closeVersus();
    mode = load("mode", "endless");
    renderMode();
    renderCategories();
    enterMode();
  }

  function closeVersus() {
    if (peerConn) { try { peerConn.send({ type: "bye" }); } catch { /* már zárva */ } }
    peerClose();
    versus = null;
  }

  function renderVsBar() {
    const bar = $("vsBar");
    bar.hidden = mode !== "versus" || !versus;
    if (bar.hidden) return;
    const fill = (box, results, live, current) => {
      box.innerHTML = "";
      versus.ids.forEach((_, i) => {
        const r = results[i], slot = document.createElement("span");
        if (r) {
          slot.className = r.won ? "won" : "lost";
          slot.textContent = r.won ? r.pts : "✗";
        } else if (i === current) {
          slot.className = "current";
          // Az ellenfélnél: hányadik tippnél tart.
          slot.textContent = live && live[i] ? `${live[i].attempts + 1}.` : "…";
        }
        box.appendChild(slot);
      });
    };
    fill($("vsMe"), versus.results, null, versus.idx);
    const challenge = versus.kind === "challenge";
    // Kihívásnál a kihívó dalonkénti eredményét csak a végén mutatjuk.
    fill($("vsOpp"), challenge && !vsOver() ? [] : versus.opp.results, versus.opp.live, challenge ? -1 : versus.idx);
    $("vsOppName").textContent = versus.opp.name;
    $("vsMeScore").textContent = vsScore(versus.results);
    $("vsOppScore").textContent = challenge ? versus.opp.score : vsScore(versus.opp.results);
  }

  function vsOppLine() {
    if (!versus) return "";
    const name = versus.opp.name;
    if (versus.kind === "challenge") return `🎯 ${name}: ${versus.opp.score} pont ezen az ${versus.ids.length} dalon`;
    if (versus.oppGone) return `⚠️ ${name} kilépett – a meccset egyedül fejezed be.`;
    const done = versus.opp.results[versus.idx], live = versus.opp.live[versus.idx];
    if (done) return done.won ? `✓ ${name} kitalálta (${done.tries}. tippre, +${done.pts})` : `✗ ${name} nem találta ki`;
    if (live && live.attempts) return `⚔️ ${name}: ${live.attempts + 1}. tipp…`;
    return `⚔️ ${name} is hallgatja…`;
  }

  function vsResultText() {
    const me = vsScore(versus.results);
    const opp = versus.kind === "challenge" ? versus.opp.score : vsScore(versus.opp.results);
    if (!vsOppOver()) return { me, opp, verdict: `Várakozás: ${versus.opp.name} még játszik…`, win: null };
    const win = me > opp ? true : me < opp ? false : null;
    return { me, opp, win, verdict: win ? "🏆 Nyertél!" : win === false ? `${versus.opp.name} nyert` : "🤝 Döntetlen" };
  }

  function renderVsSummary(animate) {
    const r = vsResultText();
    el.revealSet.hidden = false;
    el.revealSet.textContent = "";
    const b = (s) => { const e = document.createElement("b"); e.textContent = s; return e; };
    el.revealSet.append("🏁 Te ", b(String(r.me)), ` – ${r.opp} ${versus.opp.name} · `);
    const v = document.createElement("span");
    v.className = r.win ? "rec" : "";
    v.textContent = r.verdict;
    el.revealSet.append(v);
    if (r.win && animate) setTimeout(confetti, 700);
    if (vsOppOver() && !versus.counted) {
      versus.counted = true;
      countEvent(`${versus.kind}-${r.win ? "won" : r.win === false ? "lost" : "draw"}`);
    }
  }

  async function vsShare() {
    const r = vsResultText();
    const rows = versus.results.map((x) => (x && x.won ? ["", "🟩", "🟩", "🟨", "🟨", "🟧", "🟥"][x.tries] || "🟩" : "⬛")).join("");
    const head = versus.kind === "battle" ? `Songdle HU ⚔️ Párbaj vs ${versus.opp.name}` : `Songdle HU 🎯 Kihívás vs ${versus.opp.name}`;
    const lines = [head, `${rows}  ${r.me} – ${r.opp}`, r.verdict];
    // A kihívást tovább is lehet küldeni a saját pontszámmal.
    if (vsOver()) lines.push(challengeUrl(versus.ids, r.me));
    else lines.push(homeUrl());
    return shareText(lines.join("\n"));
  }

  // ----- Kapcsolat (PeerJS: ingyenes nyilvános közvetítő a kapcsolódáshoz, utána közvetlen) -----
  function loadPeerLib() {
    if (window.Peer) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PEER_LIB;
      s.onload = resolve;
      s.onerror = () => reject(new Error("PeerJS"));
      document.head.appendChild(s);
    });
  }

  const bt = {
    dialog: $("battleDialog"), nick: $("nickInput"), start: $("battleStart"), wait: $("battleWait"),
    code: $("battleCode"), codeShow: $("battleCodeShow"), status: $("battleStatus"),
  };
  const battleStatus = (msg, isError) => {
    bt.status.textContent = msg || "";
    bt.status.classList.toggle("error", !!isError);
  };
  const nick = () => (bt.nick.value.trim() || load("nick", "") || "Ismeretlen").slice(0, 16);

  // A szobát nyitó választ kategóriát (műfaj vagy évtized); a vendég ugyanazokat a dalokat kapja.
  const battleCatId = () => {
    const id = load("battleCat", category);
    return allCats.some((c) => c.id === id) ? id : "all";
  };
  const battleCatBtn = $("battleCatBtn");
  function renderBattleCat() {
    const c = fillCatPill(battleCatBtn, battleCatId(), "Mit játszotok?");
    battleCatBtn.setAttribute("aria-label", `Mit játszotok: ${c.label}. Váltás`);
  }
  battleCatBtn.addEventListener("click", () => openCatSheet({
    current: battleCatId(),
    title: "Mit játszotok?",
    withHard: false,
    onPick: (id) => { save("battleCat", id); renderBattleCat(); },
  }));

  function openBattle(code) {
    if (bt.dialog.open) return;
    renderBattleCat();
    bt.nick.value = load("nick", "");
    bt.start.hidden = false;
    bt.wait.hidden = true;
    bt.code.value = typeof code === "string" ? code : "";
    battleStatus("");
    bt.dialog.showModal();
    if (typeof code === "string" && code) battleJoin();
  }

  function saveNick() {
    const n = bt.nick.value.trim().slice(0, 16);
    if (n) save("nick", n);
  }

  function peerClose() {
    try { if (peerConn) peerConn.close(); } catch { /* már zárva */ }
    try { if (peer) peer.destroy(); } catch { /* már zárva */ }
    peer = null;
    peerConn = null;
  }

  const ROOM_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const newRoomCode = () => Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");
  const battleLink = (code) => homeUrl() + "?parbaj=" + code;

  async function battleHost(attempt = 0) {
    saveNick();
    peerClose();
    battleStatus("Szoba nyitása…");
    try { await loadPeerLib(); } catch { return battleStatus("Nem sikerült betölteni a párbajt. Van internet?", true); }
    const code = newRoomCode();
    peerHost = true;
    peer = new window.Peer(PEER_PREFIX + code);
    peer.on("open", () => {
      bt.start.hidden = true;
      bt.wait.hidden = false;
      bt.codeShow.textContent = code;
      battleStatus("Várakozás a másik játékosra…");
    });
    peer.on("connection", (c) => {
      if (peerConn) { c.on("open", () => { c.send({ type: "full" }); setTimeout(() => c.close(), 300); }); return; }
      setupConn(c);
    });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id" && attempt < 3) return battleHost(attempt + 1);
      battleStatus("Hiba a kapcsolatban: " + (e.type || e.message), true);
    });
  }

  async function battleJoin() {
    const code = bt.code.value.trim().toUpperCase();
    if (code.length !== 4) return battleStatus("Írd be a 4 betűs kódot!", true);
    saveNick();
    peerClose();
    battleStatus("Csatlakozás…");
    try { await loadPeerLib(); } catch { return battleStatus("Nem sikerült betölteni a párbajt. Van internet?", true); }
    peerHost = false;
    peer = new window.Peer();
    peer.on("open", () => setupConn(peer.connect(PEER_PREFIX + code, { reliable: true })));
    peer.on("error", (e) => battleStatus(e.type === "peer-unavailable" ? "Nincs ilyen szoba (vagy már bezárt)." : "Hiba a kapcsolatban: " + (e.type || e.message), true));
  }

  function setupConn(c) {
    peerConn = c;
    c.on("open", () => c.send({ type: "hello", name: nick() }));
    c.on("data", onPeerData);
    c.on("close", () => {
      if (peerConn !== c) return;
      peerConn = null;
      if (versus && versus.kind === "battle" && !vsOppOver()) {
        versus.oppGone = true;
        versus.waiting = false;
        toast(`${versus.opp.name} kilépett a párbajból.`);
        renderAll();
        if (round && round.done) { updateNextButton(); if (vsOver()) renderVsSummary(false); }
      } else if (bt.dialog.open) battleStatus("A kapcsolat megszakadt.", true);
      else updateNextButton();
    });
  }

  let oppName = "";
  async function hostStartMatch() {
    battleStatus("Dalok sorsolása…");
    const catId = battleCatId();
    let list = buildPool(await loadArtists(artistsFor(catId), () => {}));
    const decade = decadeOf(catId);
    if (decade) {
      const years = await loadYears();
      list = list.filter((t) => years[t.id] >= decade.from && years[t.id] <= decade.to);
    }
    // Túl kevés dalnál (pl. hiányzó évadatok) a teljes listából sorsolunk.
    if (list.length < VS_SONGS) list = buildPool(await loadArtists(artistsFor("all"), () => {}));
    assignWeights(list);
    const ids = pickSet(list, VS_SONGS);
    const cat = catId === "all" ? "" : catLabel(catId);
    if (!peerConn) return;
    peerConn.send({ type: "start", ids, cat });
    if (bt.dialog.open) bt.dialog.close("started");
    startVersus("battle", ids, { name: oppName }, cat);
  }

  function vsRematch() {
    if (peerHost) return hostStartMatch();
    peerConn.send({ type: "rematch" });
    setStatus(`Visszavágó kérve – ${versus.opp.name} indítja…`);
  }

  function vsSendProgress() {
    if (!versus || versus.kind !== "battle" || !peerConn) return;
    const r = versus.results[versus.idx];
    peerConn.send({ type: "progress", idx: versus.idx, attempts: round.attempts.length, done: !!r, won: r && r.won, pts: r ? r.pts : 0, tries: r ? r.tries : 0 });
  }

  function onPeerData(m) {
    if (!m || typeof m !== "object") return;
    if (m.type === "hello") {
      oppName = String(m.name || "Ellenfél").slice(0, 16);
      if (peerHost) hostStartMatch();
      else battleStatus(`Kapcsolódva: ${oppName}. Indul a meccs…`);
    } else if (m.type === "full") {
      battleStatus("Ez a szoba már tele van.", true);
    } else if (m.type === "start" && Array.isArray(m.ids) && !peerHost) {
      if (bt.dialog.open) bt.dialog.close("started");
      startVersus("battle", m.ids.map(Number).slice(0, 10), { name: oppName }, String(m.cat || "").slice(0, 30));
    } else if (m.type === "rematch" && peerHost) {
      hostStartMatch();
    } else if (m.type === "progress" && versus && versus.kind === "battle") {
      const i = +m.idx;
      versus.opp.live[i] = { attempts: +m.attempts || 0 };
      if (m.done) versus.opp.results[i] = { won: !!m.won, pts: +m.pts || 0, tries: +m.tries || 0 };
      renderVsBar();
      renderStreak();
      if (round && round.done && vsOver()) renderVsSummary(true);
      // Ha erre vártunk, jöhet a következő dal.
      if (m.done && versus.waiting && i === versus.idx) {
        versus.waiting = false;
        vsNext();
      }
    } else if (m.type === "bye" && versus) {
      versus.oppGone = true;
    }
  }

  $("battleHostBtn").addEventListener("click", () => battleHost());
  $("battleJoinBtn").addEventListener("click", battleJoin);
  bt.code.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); battleJoin(); } });
  $("battleShareBtn").addEventListener("click", () => shareText(`Songdle HU ⚔️ Párbaj! Gyere, játsszunk: kód ${bt.codeShow.textContent}\n${battleLink(bt.codeShow.textContent)}`));
  bt.dialog.addEventListener("close", () => {
    saveNick();
    // Ha meccs nélkül zárta be, a szobát is bezárjuk.
    if (bt.dialog.returnValue !== "started" && !(versus && versus.kind === "battle")) peerClose();
  });

  // ---------- Látogatottság (GoatCounter, ha be van állítva) ----------
  function countEvent(name) {
    try {
      if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, event: true });
    } catch { /* nem elérhető */ }
  }
  if (CFG.GOATCOUNTER) {
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${CFG.GOATCOUNTER}.goatcounter.com/count`;
    document.head.appendChild(s);
  }

  // ---------- Statisztika ----------
  function statCells(container, s, streakNow) {
    const pct = s.played ? Math.round((s.wins / s.played) * 100) : 0;
    container.innerHTML = "";
    for (const [n, l] of [[s.played, "Játszott"], [pct + "%", "Nyert"], [streakNow, "Sorozat"], [s.maxStreak, "Legjobb"]]) {
      const d = document.createElement("div");
      d.innerHTML = `<div class="n"></div><div class="l"></div>`;
      d.firstChild.textContent = n;
      d.lastChild.textContent = l;
      container.appendChild(d);
    }
  }

  // Napi előadó: a győzelmeket a napi mentésekből számoljuk (a régi statisztika nem tárolta).
  function renderArtistStats() {
    let wins = 0;
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith(LS + "artistdle.")) continue;
        const st = JSON.parse(localStorage.getItem(k));
        if (st && st.done && !st.gaveUp) wins++;
      }
    } catch { /* nem elérhető */ }
    const today = dateKey();
    const live = adStats.lastWin === today || adStats.lastWin === shiftDate(today, -1);
    statCells($("statGridArtist"), { ...adStats, wins }, live ? adStats.streak : 0);
    $("statArtistNote").textContent = adStats.played
      ? `Átlagosan ${(adStats.guesses / adStats.played).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} tipp kell`
      : "Még nem játszottál.";
  }

  function renderDailyTable() {
    const box = el.statGridDaily;
    box.className = "diff-table";
    box.innerHTML = "";
    const head = document.createElement("div");
    head.className = "diff-row head";
    head.innerHTML = "<span></span><span>Játszott</span><span>Nyert</span><span>Sorozat</span><span>Legjobb</span>";
    box.appendChild(head);
    DIFFS.forEach((d, i) => {
      const s = dailyStats(d.id);
      const pct = s.played ? Math.round((s.wins / s.played) * 100) + "%" : "–";
      const row = document.createElement("div");
      row.className = "diff-row";
      row.style.animationDelay = i * 60 + "ms";
      for (const v of [`${d.icon} ${d.label}`, s.played, pct, dailyStreakNow(d.id), s.maxStreak]) {
        const c = document.createElement("span");
        c.textContent = v;
        row.appendChild(c);
      }
      box.appendChild(row);
    });
  }

  // Napi naptár: a hónap napjain, hány napi dalt találtál el (és megvolt-e az előadó).
  let calMonth = 0; // 0 = a mostani hónap, -1 = előző…
  function renderCalendar() {
    const box = $("cal");
    const today = dateKey();
    const [y, m] = today.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1 + calMonth, 1));
    const year = first.getUTCFullYear(), month = first.getUTCMonth();
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    $("calTitle").textContent = first.toLocaleDateString("hu-HU", { year: "numeric", month: "long", timeZone: "UTC" });
    $("calNext").disabled = calMonth >= 0;
    box.innerHTML = "";
    for (const d of ["H", "K", "Sze", "Cs", "P", "Szo", "V"]) {
      const h = document.createElement("span");
      h.className = "cal-head";
      h.textContent = d;
      box.appendChild(h);
    }
    // Hétfővel kezdődő hét.
    for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) box.appendChild(document.createElement("span"));
    for (let day = 1; day <= days; day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      let played = 0, won = 0;
      for (const d of DIFFS) {
        const r = load(dailyKey(key, d.id), null);
        if (r && r.done) { played++; if (r.won) won++; }
      }
      const art = load(adKey(key), null);
      const artWon = !!(art && art.done && !art.gaveUp);
      const c = document.createElement("span");
      c.className = "cal-day" + (key === today ? " today" : "") + (key > today ? " future" : "")
        + (played && !won ? " lost" : "") + (artWon ? " artist" : "");
      if (won) c.style.setProperty("--lvl", won / DIFFS.length);
      if (won) c.classList.add("won");
      c.textContent = day;
      c.title = played || art ? `${prettyDate(key)}: ${won}/${DIFFS.length} napi dal${artWon ? ", előadó megvolt 🎤" : ""}` : prettyDate(key);
      box.appendChild(c);
    }
  }
  $("calPrev").addEventListener("click", () => { calMonth--; renderCalendar(); });
  $("calNext").addEventListener("click", () => { if (calMonth < 0) { calMonth++; renderCalendar(); } });

  function renderStats() {
    el.statPoints.textContent = points.toLocaleString("hu-HU");
    statCells(el.statGrid, stats, stats.streak);
    renderDailyTable();
    calMonth = 0;
    renderCalendar();
    renderArtistStats();
    const s = mode === "daily" ? dailyStats() : stats;
    $("distTitle").textContent = `Hányadikra találtad el (${mode === "daily" ? "napi · " + diffById(dailyDiff).label : "végtelen"})`;
    const max = Math.max(1, ...s.dist);
    el.dist.innerHTML = "";
    s.dist.forEach((v, i) => {
      const row = document.createElement("div");
      row.className = "dist-row";
      const lab = document.createElement("span");
      lab.textContent = i < MAX_TRIES ? String(i + 1) : "✗";
      const bar = document.createElement("div");
      bar.className = "dist-bar";
      if (i === MAX_TRIES) bar.classList.add("loss");
      else if (round && round.done && round.won && round.attempts.length === i + 1) bar.classList.add("hl");
      bar.style.width = Math.max(8, (v / max) * 100) + "%";
      bar.style.animationDelay = i * 60 + "ms";
      bar.textContent = v;
      row.append(lab, bar);
      el.dist.appendChild(row);
    });
  }

  // ---------- Dal jelentése ----------
  const reportBtn = $("reportBtn"), reportDialog = $("reportDialog");

  function renderReportBtn() {
    if (!round) return;
    const on = isReported(round.track.id);
    reportBtn.classList.toggle("reported", on);
    reportBtn.lastElementChild.textContent = on ? "Jelentve · visszavonás" : "Jelentés";
  }

  function setReported(t, reason) {
    reported = reported.filter((r) => r.id !== t.id);
    if (reason) reported.push({ id: t.id, title: t.title, artist: artistLine(t), reason, ts: Date.now() });
    save("reported", reported);
  }

  reportBtn.addEventListener("click", () => {
    if (!round) return;
    const t = round.track;
    if (isReported(t.id)) {
      setReported(t, null);
      renderReportBtn();
      toast("Jelentés visszavonva.");
      return;
    }
    $("reportSong").textContent = trackLabel(t);
    reportDialog.returnValue = "";
    reportDialog.showModal();
    reportDialog.scrollTop = 0;
  });

  // A jelentést a háttérben elküldjük (worker/report.js), az a fejlesztő nevében nyit
  // GitHub-hibajegyet. A játékos ebből semmit nem lát; ha nincs beállítva, csak helyben marad.
  function sendReport(t, reason) {
    if (!CFG.REPORT_ENDPOINT) return;
    const modeText = round.mode === "daily" ? "napi dal"
      : `végtelen · ${(CFG.CATEGORIES.find((c) => c.id === category) || { label: category }).label}`;
    fetch(CFG.REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, title: t.title, artist: artistLine(t), album: t.album, reason, mode: modeText }),
      keepalive: true,
    }).catch((e) => console.warn("Jelentés küldése sikertelen:", e));
  }

  reportDialog.addEventListener("close", () => {
    const reason = reportDialog.returnValue;
    if (!reason || !round) return;
    setReported(round.track, reason);
    sendReport(round.track, reason);
    renderReportBtn();
    toast("Köszi a jelentést! ⚑");
  });

  // ---------- Dallista ----------
  const libDialog = $("libraryDialog"), libList = $("libList"), libSearch = $("libSearch"), libMeta = $("libMeta");
  const LIB_MAX_RESULTS = 300;

  function libTrackItem(t, q) {
    const li = document.createElement("li");
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    if (t.md5) img.src = coverUrl(t.md5, 120);
    const text = document.createElement("span");
    text.className = "t";
    const title = document.createElement("b");
    title.appendChild(highlighted(t.title, q));
    const sub = document.createElement("span");
    sub.appendChild(highlighted(t.artist !== t.src ? `${artistLine(t)} · ${t.album}`
      : t.feat.length ? `feat. ${t.feat.join(", ")} · ${t.album}` : t.album, q));
    text.append(title, sub);
    const play = document.createElement("span");
    play.className = "lib-play";
    play.setAttribute("aria-hidden", "true");
    li.append(img, text, play);
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `${t.title} – előnézet lejátszása`);
    li.addEventListener("click", () => libPlay(t, li));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); libPlay(t, li); } });
    if (isReported(t.id)) li.classList.add("is-blocked");
    if (t.id === libId) { li.classList.add("playing"); libLi = li; }
    return li;
  }

  // Dallista: koppintásra lejátssza a dal előnézetét (külön lejátszón, a játékot nem zavarja).
  let libSrcNode = null, libLi = null, libId = null, libToken = 0;

  function libStop() {
    libToken++;
    libAudio.pause();
    if (libLi) libLi.classList.remove("playing", "loading");
    libLi = null;
    libId = null;
  }

  async function libPlay(t, li) {
    if (libLi === li) return libStop();
    libStop();
    stopAudio();
    ensureAudioGraph();
    if (actx && !libSrcNode) {
      libSrcNode = actx.createMediaElementSource(libAudio);
      libSrcNode.connect(gainNode);
    }
    if (actx && actx.state === "suspended") actx.resume();
    applyVolume();
    const token = libToken;
    libLi = li;
    libId = t.id;
    li.classList.add("playing", "loading");
    try {
      // Friss előnézet-URL, mert a linkek lejárnak.
      const full = await Deezer.track(t.id);
      if (token !== libToken) return;
      if (!full.preview) throw new Error("Nincs előnézet");
      libAudio.src = full.preview;
      await libAudio.play();
      if (token !== libToken) return libAudio.pause();
      li.classList.remove("loading");
    } catch (e) {
      if (token !== libToken) return;
      console.warn(e);
      libStop();
      toast("Ezt a dalt most nem sikerült lejátszani.");
    }
  }
  libAudio.addEventListener("ended", libStop);

  // „Jelentett” nézet: a jelentett dalok listája visszaállítással és másolással.
  let libView = "all";
  const libTools = $("libTools"), libReportedBtn = $("libReportedBtn"), libCopyBtn = $("libCopyBtn");

  function renderLibTools() {
    libTools.hidden = !reported.length && libView === "all";
    libReportedBtn.textContent = `⚑ Jelentett (${reported.length})`;
    libReportedBtn.setAttribute("aria-pressed", String(libView === "reported"));
    libCopyBtn.hidden = libView !== "reported" || !reported.length;
  }

  function renderReported() {
    libMeta.textContent = `${reported.length} jelentett dal · ezek nálad nem jönnek ki`;
    libList.innerHTML = "";
    if (!reported.length) {
      const p = document.createElement("p");
      p.className = "lib-empty";
      p.textContent = "Nincs jelentett dal.";
      libList.appendChild(p);
      return;
    }
    const ul = document.createElement("ul");
    ul.className = "lib-tracks lib-reported";
    for (const r of [...reported].sort((a, b) => b.ts - a.ts)) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.className = "t";
      const title = document.createElement("b");
      title.textContent = r.title;
      const sub = document.createElement("span");
      sub.textContent = r.artist;
      const reason = document.createElement("span");
      reason.className = "reason";
      reason.textContent = "⚑ " + r.reason;
      text.append(title, sub, reason);
      const restore = document.createElement("button");
      restore.className = "lib-restore";
      restore.type = "button";
      restore.textContent = "Visszaállítás";
      restore.addEventListener("click", () => {
        setReported({ id: r.id }, null);
        if (round) renderReportBtn();
        renderLibrary();
      });
      li.append(text, restore);
      ul.appendChild(li);
    }
    libList.appendChild(ul);
  }

  libReportedBtn.addEventListener("click", () => {
    libView = libView === "reported" ? "all" : "reported";
    libSearch.value = "";
    renderLibrary();
    libList.scrollTop = 0;
  });

  // A config.js BLOCKED_TRACKS listájába bemásolható formátum.
  libCopyBtn.addEventListener("click", async () => {
    const lines = reported.map((r) => `    { id: ${r.id}, note: ${JSON.stringify(`${r.title} – ${r.artist}: ${r.reason}`)} },`);
    toast(await copyText(lines.join("\n")) ? "Lista vágólapra másolva!" : "Nem sikerült másolni.");
  });

  function renderLibrary() {
    renderLibTools();
    $("libSearch").parentElement.hidden = libView === "reported";
    if (libView === "reported") return renderReported();
    const q = libSearch.value;
    const tokens = norm(q).split(" ").filter(Boolean);
    const label = mode === "daily" ? "Mind" : CFG.CATEGORIES.find((c) => c.id === category).label;
    const groups = new Map();
    let shown = 0, matched = 0;
    for (const t of pool) {
      if (tokens.length && !tokens.every((tok) => t.hay.includes(tok))) continue;
      matched++;
      if (tokens.length && shown >= LIB_MAX_RESULTS) continue;
      shown++;
      const g = t.src || t.artist;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(t);
    }
    libMeta.textContent = tokens.length
      ? `${matched} találat · ${label}`
      : `${pool.length} dal · ${groups.size} előadó · ${label}`;
    libList.innerHTML = "";
    if (!groups.size) {
      const p = document.createElement("p");
      p.className = "lib-empty";
      p.textContent = pool.length ? "Nincs találat." : "A dalok még töltődnek…";
      libList.appendChild(p);
      return;
    }
    const names = [...groups.keys()].sort((a, b) => a.localeCompare(b, "hu"));
    for (const name of names) {
      const tracks = groups.get(name);
      const det = document.createElement("details");
      det.className = "lib-group";
      const sum = document.createElement("summary");
      const avatar = document.createElement("img");
      avatar.alt = "";
      avatar.loading = "lazy";
      const withCover = tracks.find((t) => t.md5);
      if (withCover) avatar.src = coverUrl(withCover.md5, 120);
      const nm = document.createElement("span");
      nm.className = "name";
      nm.appendChild(highlighted(name, q));
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = tracks.length;
      const chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = "›";
      sum.append(avatar, nm, count, chev);
      det.appendChild(sum);
      // A dalokat csak kinyitáskor rajzoljuk ki (több ezer elem is lehet).
      const fill = () => {
        if (det.querySelector(".lib-tracks")) return;
        const ul = document.createElement("ul");
        ul.className = "lib-tracks";
        for (const t of tracks) ul.appendChild(libTrackItem(t, q));
        det.appendChild(ul);
      };
      det.addEventListener("toggle", () => { if (det.open) fill(); });
      if (tokens.length) { det.open = true; fill(); }
      libList.appendChild(det);
    }
  }

  let libTimer = 0;
  libSearch.addEventListener("input", () => {
    clearTimeout(libTimer);
    libTimer = setTimeout(renderLibrary, 120);
  });
  $("libraryBtn").addEventListener("click", () => {
    libView = "all";
    libSearch.value = "";
    renderLibrary();
    libList.scrollTop = 0;
    libDialog.showModal();
  });
  libDialog.addEventListener("close", libStop);

  $("statsBtn").addEventListener("click", () => {
    renderStats();
    el.statsDialog.showModal();
    el.statsDialog.scrollTop = 0;
  });
  // A súgó mindig a tetején nyílik: a fókusz a címre kerül (nem a lenti „Kezdjük!” gombra),
  // és a görgetést is visszaállítjuk.
  function openHelp() {
    el.helpDialog.showModal();
    const top = () => { el.helpDialog.scrollTop = 0; el.helpDialog.querySelector("form").scrollTop = 0; };
    top();
    requestAnimationFrame(top);
  }
  $("helpBtn").addEventListener("click", openHelp);

  // ---------- Napi előadó ----------
  // Találós a Napi módban: minden tippnél megmutatjuk, mennyire hasonlít a tippelt
  // előadó a mai megfejtésre (zöld: egyezik, sárga: részben/közel, nyíl: merre).
  const AD_INFO = CFG.ARTIST_INFO || {};
  const adArtists = CFG.ARTISTS.filter((a) => a.id && AD_INFO[a.name]).map((a) => ({
    ...a, ...AD_INFO[a.name], n: norm([a.name, ...(a.aka || [])].join(" ")), genres: a.tags.filter((t) => t !== "all"),
  }));
  const AD_TYPE = { solo: "Szóló", duo: "Duó", band: "Zenekar" };
  const AD_GENDER = { m: "Férfi", f: "Nő", mixed: "Vegyes" };
  const AD_STATUS = { active: "Aktív", split: "Feloszlott", dead: "Elhunyt" };
  const AD_ESC = { esc: "Indult", adal: "A Dal", no: "Nem" };
  const AD_HINT_AFTER = 4;
  const AD_GIVEUP_AFTER = 5;
  const AD_POINTS = (n) => Math.max(20, 150 - (n - 1) * 20);
  // Címsúgó: egy ismert dal címe, ennyi pont levonással (legalább AD_MIN_POINTS marad).
  const AD_TITLE_COST = 40, AD_MIN_POINTS = 10;
  const adPointsFor = (n, st) => Math.max(AD_MIN_POINTS, AD_POINTS(n) - (st.titleHint ? AD_TITLE_COST : 0));
  const tagLabel = (id) => (CFG.CATEGORIES.find((c) => c.id === id) || { label: id }).label;
  const ad = {
    input: $("adInput"), sugg: $("adSuggestions"), list: $("adGuesses"), empty: $("adEmpty"),
    meta: $("adMeta"), win: $("adWin"), hint: $("adHintBtn"), giveUp: $("adGiveUpBtn"), search: $("adSearch"), help: $("adHelp"),
    titleBtn: $("adTitleBtn"), titleHint: $("adTitleHint"),
  };
  let adStats = load("artistStats", { played: 0, streak: 0, maxStreak: 0, lastWin: null, guesses: 0 });

  function adAnswer(date) {
    let best = null, bestH = -1;
    for (const a of adArtists) {
      const h = hashString(`songdle-hu:artist:${date}:${a.id}`);
      if (h > bestH) { bestH = h; best = a; }
    }
    return best;
  }
  const adKey = (date) => `artistdle.${date}`;
  const adState = () => load(adKey(dateKey()), { guesses: [], done: false, points: 0 });
  const adDone = () => adState().done;

  // Deezer-adat (kép) előadónként, egy napig tárolva.
  const adInfoCache = new Map();
  function adFetch(a) {
    if (adInfoCache.has(a.id)) return adInfoCache.get(a.id);
    const key = "artistInfo." + a.id;
    const cached = load(key, null);
    const p = cached && Date.now() - cached.ts < 24 * 3600e3
      ? Promise.resolve(cached)
      : withRetry(() => Deezer.artist(a.id)).then((d) => {
        const v = { ts: Date.now(), pic: d.picture_medium || "" };
        save(key, v);
        return v;
      }).catch(() => ({ pic: "" }));
    adInfoCache.set(a.id, p);
    return p;
  }

  const fmtFans = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M"
    : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);

  // Egy tipp összevetése a megfejtéssel: [osztály, szöveg] oszloponként.
  function adCompare(g, ans, gFans, aFans) {
    const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const arrow = (gv, av) => (av > gv ? " ▲" : av < gv ? " ▼" : "");
    const type = g.type === ans.type ? "hit" : g.type !== "solo" && ans.type !== "solo" ? "near" : "miss";
    const gender = g.gender === ans.gender ? "hit" : g.gender === "mixed" || ans.gender === "mixed" ? "near" : "miss";
    // Születési évet csak születési évvel, alakulási évet csak alakulásival vetünk össze:
    // szóló és csapat között az év sosem zöld vagy sárga, csak a nyíl segít.
    const sameKind = (g.type === "solo") === (ans.type === "solo");
    const dy = Math.abs(g.year - ans.year);
    const year = !sameKind ? "miss" : dy === 0 ? "hit" : dy <= 5 ? "near" : "miss";
    const genre = same(g.genres, ans.genres) ? "hit" : g.genres.some((x) => ans.genres.includes(x)) ? "near" : "miss";
    // Spotify havi hallgatók; ha valamelyiknél hiányzik, nincs összevetés.
    const known = gFans > 0 && aFans > 0;
    const ratio = known ? Math.max(gFans, aFans) / Math.min(gFans, aFans) : Infinity;
    const fans = g.id === ans.id ? "hit" : !known ? "miss" : ratio <= 1.15 ? "hit" : ratio <= 2 ? "near" : "miss";
    // Szólónál a születési, duónál és zenekarnál az alakulás éve számít.
    const born = g.type === "solo";
    const yearWord = born ? "született" : "alakult";
    const later = ans.year > g.year;
    const more = aFans > gFans;
    const genreText = g.genres.map(tagLabel).join(", ");
    // Első megjelenés éve: ±3 év közel.
    const dd = Math.abs(g.debut - ans.debut);
    const debut = dd === 0 ? "hit" : dd <= 3 ? "near" : "miss";
    // Státusz: a feloszlott és az elhunyt is „már nem aktív”, ezért egymáshoz közel.
    const status = g.status === ans.status ? "hit" : g.status !== "active" && ans.status !== "active" ? "near" : "miss";
    // Eurovízió: aki csak az A Dalban indult, az közel van egy eurovíziós indulóhoz.
    const gEsc = g.esc || "no", aEsc = ans.esc || "no";
    const esc = gEsc === aEsc ? "hit" : gEsc !== "no" && aEsc !== "no" ? "near" : "miss";
    // Két sor, soronként négy mező (telefonon így elfér).
    return [
      {
        label: "Típus", cls: type, text: AD_TYPE[g.type],
        why: type === "hit" ? `Típus: egyezik – a mai előadó is ${AD_TYPE[g.type].toLowerCase()}.`
          : type === "near" ? `Típus: közel – a mai előadó is csapat (duó vagy zenekar), de nem ${AD_TYPE[g.type].toLowerCase()}.`
          : `Típus: nem egyezik – a mai előadó nem ${AD_TYPE[g.type].toLowerCase()}.`,
      },
      {
        label: "Nem", cls: gender, text: AD_GENDER[g.gender],
        why: gender === "hit" ? `Nem: egyezik (${AD_GENDER[g.gender].toLowerCase()}).`
          : gender === "near" ? "Nem: részben egyezik – az egyikük vegyes (férfi és női tagok is), a másik nem."
          : "Nem: nem egyezik.",
      },
      {
        label: "Műfaj", cls: genre, text: genreText,
        why: genre === "hit" ? "Műfaj: pontosan ugyanazok a műfajok."
          : genre === "near" ? "Műfaj: van közös műfaj, de nem mind egyezik." : "Műfaj: nincs közös műfaj.",
      },
      {
        label: "Státusz", cls: status, text: AD_STATUS[g.status],
        why: status === "hit" ? `Státusz: egyezik (${AD_STATUS[g.status].toLowerCase()}).`
          : status === "near" ? "Státusz: közel – egyikük sem aktív már, de az egyik feloszlott, a másik elhunyt."
          : g.status === "active" ? "Státusz: a mai előadó már nem aktív (feloszlott vagy elhunyt)." : "Státusz: a mai előadó még aktív.",
      },
      {
        label: born ? "Született" : "Alakult", cls: year, text: g.year + (year === "hit" ? "" : arrow(g.year, ans.year)),
        why: `${g.name} ${g.year}-ben ${yearWord}. ` + (!sameKind ? `A mai előadó ${born ? "csapat, ezért ott az alakulás éve számít" : "szólóelőadó, ezért ott a születési év számít"} – ez nem vethető össze, ezért nem lehet zöld vagy sárga. A nyíl azért mutatja, hogy az ő éve ${later ? "későbbi (▲)" : ans.year < g.year ? "korábbi (▼)" : "ugyanez"}.` : year === "hit" ? "Pontosan egyezik a mai előadóval."
          : `A mai előadó ${later ? "később (▲)" : "korábban (▼)"} született vagy alakult` + (year === "near" ? ", legfeljebb 5 év a különbség." : ", több mint 5 év a különbség.")),
      },
      {
        label: "Debüt", cls: debut, text: g.debut + (debut === "hit" ? "" : arrow(g.debut, ans.debut)),
        why: `${g.name} első kiadványa ${g.debut}-ben jelent meg. ` + (debut === "hit" ? "Ugyanabban az évben, mint a mai előadóé."
          : `A mai előadó ${ans.debut > g.debut ? "később (▲)" : "korábban (▼)"} debütált` + (debut === "near" ? ", legfeljebb 3 év a különbség." : ", több mint 3 év a különbség.")),
      },
      {
        label: "Hallgató", cls: fans, text: !gFans ? "–" : fmtFans(gFans) + (fans === "hit" || !known ? "" : arrow(gFans, aFans)),
        why: !known ? "Hallgatók: ennél az előadónál nincs Spotify-adat."
          : `${g.name}: ${gFans.toLocaleString("hu-HU")} havi hallgató a Spotify-on. ` + (fans === "hit" ? "Nagyjából ugyanannyi, mint a mai előadónak."
          : `A mai előadónak ${more ? "több (▲)" : "kevesebb (▼)"} van` + (fans === "near" ? ", de legfeljebb kétszeres a különbség." : ", több mint kétszeres a különbség.")),
      },
      {
        label: "Eurovízió", cls: esc, text: AD_ESC[gEsc],
        why: (gEsc === "esc" ? `${g.name} indult az Eurovíziós Dalfesztiválon. ` : gEsc === "adal" ? `${g.name} versenyzett az A Dalban (magyar eurovíziós válogató), de nem jutott ki. ` : `${g.name} nem indult sem az Eurovízión, sem az A Dalban. `)
          + (esc === "hit" ? "Ebben egyezik a mai előadóval." : esc === "near" ? "A mai előadó is kötődik az Eurovízióhoz, de máshogy." : "A mai előadónál ez másképp van."),
      },
    ];
  }

  async function adRenderRow(g, ans, animate) {
    const gi = await adFetch(g);
    const li = document.createElement("li");
    li.className = "ad-row" + (g.id === ans.id ? " win" : "");
    const head = document.createElement("div");
    head.className = "ad-name";
    const img = document.createElement("img");
    img.alt = "";
    if (gi.pic) img.src = gi.pic;
    const name = document.createElement("b");
    name.textContent = g.name;
    head.append(img, name);
    const tiles = document.createElement("div");
    tiles.className = "ad-tiles";
    adCompare(g, ans, g.listeners, ans.listeners).forEach((c, i) => {
      // Koppintásra elmagyarázza, mit jelent a mező.
      const t = document.createElement("button");
      t.type = "button";
      t.className = "ad-tile " + c.cls;
      t.setAttribute("aria-label", c.why);
      t.title = c.why;
      const lab = document.createElement("small");
      lab.textContent = c.label;
      const v = document.createElement("span");
      v.textContent = c.text;
      t.append(lab, v);
      t.addEventListener("click", () => toast(c.why));
      if (animate) t.style.animationDelay = i * 0.08 + "s";
      else t.classList.add("still");
      tiles.appendChild(t);
    });
    li.append(head, tiles);
    return li;
  }

  async function adRender(animateLast) {
    const date = dateKey(), ans = adAnswer(date), st = adState();
    ad.meta.textContent = `${prettyDate(date)} · ${st.guesses.length} tipp`;
    const rows = await Promise.all(st.guesses.map((n, i) => {
      const g = adArtists.find((a) => a.name === n);
      return g ? adRenderRow(g, ans, animateLast && i === st.guesses.length - 1) : null;
    }));
    ad.list.innerHTML = "";
    // A legújabb tipp kerül felülre.
    rows.filter(Boolean).reverse().forEach((r) => ad.list.appendChild(r));
    ad.empty.hidden = st.guesses.length > 0;
    ad.search.hidden = st.done;
    const left = AD_HINT_AFTER - st.guesses.length;
    ad.hint.hidden = st.done;
    ad.hint.disabled = left > 0;
    ad.hint.textContent = left > 0 ? `🎧 Hallgass bele (még ${left} tipp)` : "🎧 Hallgass bele";
    ad.titleBtn.hidden = st.done || !!st.titleHint;
    ad.titleBtn.disabled = left > 0;
    ad.titleBtn.textContent = left > 0 ? "💡 Egy dala" : `💡 Egy dala (−${AD_TITLE_COST} pont)`;
    ad.titleHint.hidden = !st.titleHint;
    if (st.titleHint) {
      ad.titleHint.textContent = "";
      const b = document.createElement("b");
      b.textContent = `„${st.titleHint}”`;
      ad.titleHint.append("💡 Egyik ismert dala: ", b);
    }
    ad.giveUp.hidden = st.done || st.guesses.length < AD_GIVEUP_AFTER;
    adResetGiveUp();
    adRenderWin(st, ans);
  }

  function adRenderWin(st, ans) {
    ad.win.hidden = !st.done;
    if (!st.done) return;
    ad.win.innerHTML = "";
    const title = document.createElement("p");
    title.className = "ad-win-title";
    title.textContent = st.gaveUp ? `Feladva ${st.guesses.length} tipp után`
      : st.guesses.length === 1 ? "Elsőre! 🤯" : `Eltaláltad ${st.guesses.length} tippből! 🎉`;
    ad.win.classList.toggle("lost", !!st.gaveUp);
    const nameEl = document.createElement("p");
    nameEl.className = "ad-win-name";
    nameEl.textContent = ans.name;
    const pts = document.createElement("p");
    pts.className = "ad-win-points";
    pts.textContent = st.gaveUp ? "0 pont · a sorozat nullázódott" : `+${st.points} pont`;
    const next = document.createElement("p");
    next.className = "ad-win-next";
    const h = Math.floor(msToNextDay() / 3600e3), m = Math.floor(msToNextDay() / 60e3) % 60;
    next.textContent = `Új előadó ${h} óra ${m} perc múlva · sorozat: ${adStats.streak}`;
    const share = document.createElement("button");
    share.className = "btn btn-ghost";
    share.type = "button";
    share.textContent = "Megosztás";
    share.addEventListener("click", adShare);
    ad.win.append(title, nameEl, pts, next, share);
    // Feladás után megmutatjuk a megfejtés mind a 8 adatát.
    if (st.gaveUp) {
      const box = document.createElement("ol");
      box.className = "ad-guesses ad-answer";
      ad.win.insertBefore(box, pts);
      adRenderRow(ans, ans, false).then((li) => box.appendChild(li));
    }
  }

  async function adShare() {
    const date = dateKey(), ans = adAnswer(date), st = adState();
    const emoji = { hit: "🟩", near: "🟨", miss: "⬛" };
    const lines = [];
    for (const n of st.guesses) {
      const g = adArtists.find((a) => a.name === n);
      if (!g) continue;
      // Két négyes csoport, mint a két csempesor.
      const e = adCompare(g, ans, g.listeners, ans.listeners).map((c) => emoji[c.cls]);
      lines.push(e.slice(0, 4).join("") + " " + e.slice(4).join(""));
    }
    const text = `Songdle HU 🎤 Napi előadó · ${prettyDate(date)}\n${st.guesses.length} tipp${st.titleHint ? " · 💡" : ""}${st.gaveUp ? " · feladva 🏳️" : ""}\n${lines.join("\n")}\n${location.origin + location.pathname}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    toast((await copyText(text)) ? "Eredmény a vágólapon!" : "Nem sikerült másolni.");
  }

  function adGuess(a) {
    const date = dateKey(), ans = adAnswer(date), st = adState();
    if (st.done || st.guesses.includes(a.name)) return;
    st.guesses.push(a.name);
    ad.input.value = "";
    adHideSugg();
    if (a.id === ans.id) {
      st.done = true;
      st.points = adPointsFor(st.guesses.length, st);
      points += st.points;
      save("points", points);
      adStats.played++;
      adStats.guesses += st.guesses.length;
      adStats.streak = adStats.lastWin === shiftDate(date, -1) ? adStats.streak + 1 : 1;
      adStats.lastWin = date;
      adStats.maxStreak = Math.max(adStats.maxStreak, adStats.streak);
      save("artistStats", adStats);
      vibrate([30, 40, 30]);
      setTimeout(() => { confetti(); animatePoints(); }, 700);
    } else {
      vibrate(40);
    }
    save(adKey(date), st);
    adRender(true).then(() => { if (st.done) el.scroll.scrollTo({ top: 0, behavior: "smooth" }); });
    updateDailyBadge();
    renderRoundPoints();
  }

  // Keresés a játékban szereplő előadók között (a már tippelteket kihagyva).
  let adItems = [], adActive = -1;
  function adRenderSugg() {
    const q = norm(ad.input.value);
    const guessed = new Set(adState().guesses);
    adItems = q ? adArtists.filter((a) => !guessed.has(a.name) && a.n.includes(q))
      .sort((x, y) => x.n.indexOf(q) - y.n.indexOf(q) || x.name.localeCompare(y.name, "hu")).slice(0, 8) : [];
    ad.sugg.innerHTML = "";
    adActive = adItems.length ? 0 : -1;
    adItems.forEach((a, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      if (i === adActive) li.classList.add("active");
      const text = document.createElement("span");
      text.className = "s-text";
      const b = document.createElement("span");
      b.className = "s-title";
      b.appendChild(highlighted(a.name, ad.input.value));
      const sub = document.createElement("span");
      sub.className = "s-artist";
      sub.textContent = a.genres.map(tagLabel).join(", ");
      text.append(b, sub);
      li.appendChild(text);
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => adGuess(a));
      ad.sugg.appendChild(li);
    });
    ad.sugg.hidden = !adItems.length;
  }
  function adHideSugg() { ad.sugg.hidden = true; adItems = []; }
  ad.input.addEventListener("input", adRenderSugg);
  ad.input.addEventListener("blur", () => setTimeout(adHideSugg, 150));
  ad.input.addEventListener("keydown", (e) => {
    if (!adItems.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      adActive = (adActive + (e.key === "ArrowDown" ? 1 : -1) + adItems.length) % adItems.length;
      [...ad.sugg.children].forEach((li, i) => li.classList.toggle("active", i === adActive));
    } else if (e.key === "Enter" && adActive >= 0) {
      e.preventDefault();
      adGuess(adItems[adActive]);
    }
  });

  // Feladás: első koppintásra megerősítést kér, a másodikra felfedi a megfejtést.
  let adGiveUpTimer = 0;
  function adResetGiveUp() {
    clearTimeout(adGiveUpTimer);
    ad.giveUp.classList.remove("confirm");
    ad.giveUp.textContent = "🏳️ Feladom";
  }
  ad.giveUp.addEventListener("click", () => {
    if (!ad.giveUp.classList.contains("confirm")) {
      ad.giveUp.classList.add("confirm");
      ad.giveUp.textContent = "Biztos? Koppints újra";
      adGiveUpTimer = setTimeout(adResetGiveUp, 3500);
      return;
    }
    const date = dateKey(), st = adState();
    if (st.done) return;
    st.done = true;
    st.gaveUp = true;
    st.points = 0;
    adStats.played++;
    adStats.guesses += st.guesses.length;
    adStats.streak = 0;
    save("artistStats", adStats);
    save(adKey(date), st);
    vibrate(120);
    adRender(false).then(() => el.scroll.scrollTo({ top: 0, behavior: "smooth" }));
    updateDailyBadge();
    renderRoundPoints();
  });

  // Tipp: a megfejtés legnépszerűbb dalából 10 másodperc.
  let adHintTimer = 0;
  ad.hint.addEventListener("click", async () => {
    const ans = adAnswer(dateKey());
    clearTimeout(adHintTimer);
    ad.hint.classList.add("loading");
    try {
      const top = (await withRetry(() => Deezer.artistTop(ans.id, 5)))
        .filter((t) => t.preview && (t.artist.id === ans.id))
        .sort((x, y) => y.rank - x.rank)[0];
      if (!top) throw new Error("Nincs előnézet");
      const full = await Deezer.track(top.id);
      libStop();
      stopAudio();
      ensureAudioGraph();
      if (actx && !libSrcNode) { libSrcNode = actx.createMediaElementSource(libAudio); libSrcNode.connect(gainNode); }
      if (actx && actx.state === "suspended") actx.resume();
      applyVolume();
      libAudio.src = full.preview;
      await libAudio.play();
      adHintTimer = setTimeout(() => libAudio.pause(), 10000);
    } catch (e) {
      console.warn(e);
      toast("A tippet most nem sikerült lejátszani.");
    } finally {
      ad.hint.classList.remove("loading");
    }
  });

  // Címsúgó: a megfejtés legnépszerűbb (saját) dalának címe, pontlevonással.
  ad.titleBtn.addEventListener("click", async () => {
    const date = dateKey(), ans = adAnswer(date), st = adState();
    if (st.done || st.titleHint) return;
    ad.titleBtn.classList.add("loading");
    try {
      const top = (await withRetry(() => Deezer.artistTop(ans.id, 10)))
        .filter((t) => t.artist.id === ans.id && !configBlocked.has(t.id) && !excludeRe.test(t.title) && !isLive(t))
        .sort((x, y) => y.rank - x.rank)[0];
      if (!top) throw new Error("Nincs dal");
      st.titleHint = top.title.replace(/\s*[([].*?[)\]]/g, "").trim() || top.title;
      save(adKey(date), st);
      countEvent("artist-title-hint");
      adRender(false);
      renderRoundPoints();
    } catch (e) {
      console.warn(e);
      toast("A súgót most nem sikerült betölteni.");
    } finally {
      ad.titleBtn.classList.remove("loading");
    }
  });

  function openArtistGame() {
    ad.input.value = "";
    adHideSugg();
    adRender(false);
    // Első tipp előtt nyitva a magyarázat, később csak kérésre.
    ad.help.open = !adState().guesses.length;
    adFetch(adAnswer(dateKey()));
  }
  // Az oldal elhagyásakor a tipp-lejátszás leáll.
  function adLeave() {
    clearTimeout(adHintTimer);
    libStop();
  }

  // ---------- Indítás ----------
  applyVolume();
  renderMode();
  renderCategories();
  renderPoints();
  buildWave(false);
  renderAll();
  sizeViz();
  requestAnimationFrame(drawViz);
  // Kihívás-link (?k=dalok&p=pont&n=név) vagy párbaj-meghívó (?parbaj=KÓD).
  const params = new URLSearchParams(location.search);
  const challengeIds = (params.get("k") || "").split("-").map((s) => parseInt(s, 36)).filter((n) => n > 0).slice(0, 10);
  const battleCode = (params.get("parbaj") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (challengeIds.length || battleCode) history.replaceState(null, "", location.pathname);
  if (!load("seenHelp", false) && !challengeIds.length && !battleCode) {
    openHelp();
    save("seenHelp", true);
  }
  if (challengeIds.length) {
    const name = (params.get("n") || "").slice(0, 16) || "Egy barátod";
    startVersus("challenge", challengeIds, { name, score: Math.max(0, parseInt(params.get("p"), 10) || 0) });
    countEvent("challenge-opened");
  } else {
    enterMode();
    if (battleCode) openBattle(battleCode);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
})();
