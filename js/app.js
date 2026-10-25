(function () {
  "use strict";

  // Ugyanaz a szám, mint az index.html data-v-je, a ?v= linkek és az sw.js CACHE-e: frissítéskor mindet emeld.
  // Ha egy frissítés után a CDN régi oldalt adna új szkripttel (vagy fordítva), a kettő nem illik össze,
  // és félbemaradna az indulás. Ilyenkor egyszer újratöltjük az oldalt.
  const APP_V = "52";
  if (document.documentElement.dataset.v !== APP_V) {
    let reloaded = false;
    try { reloaded = sessionStorage.getItem("songdle.vReload") === APP_V; sessionStorage.setItem("songdle.vReload", APP_V); } catch { /* nincs tároló */ }
    if (!reloaded) { location.reload(); return; }
  }

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
  const DEFAULT_TINT = ["#1ed760", "#2bb3ff", "#8b5cf6"];
  const LS = "songdle.";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const $ = (id) => document.getElementById(id);
  const el = {
    categories: $("categories"), categoriesWrap: $("categoriesWrap"), dailyBanner: $("dailyBanner"),
    segmented: $("segmented"), streakLine: $("streakLine"), guesses: $("guesses"), tries: $("tries"),
    status: $("status"), reveal: $("reveal"),
    revealResult: $("revealResult"), revealTitle: $("revealTitle"), revealArtist: $("revealArtist"),
    revealAlbum: $("revealAlbum"), revealEmoji: $("revealEmoji"), revealPoints: $("revealPoints"),
    bonus: $("bonus"), bonusQ: $("bonusQ"), bonusOpts: $("bonusOpts"),
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
    try { localStorage.setItem(LS + key, JSON.stringify(value)); } catch (e) {
      // Betelt tárhely: egyszer szólunk, különben a sorozat és a napi eredmény csendben elveszne.
      if (e && e.name === "QuotaExceededError" && !save.warned) {
        save.warned = true;
        setTimeout(() => toast("A böngésző tárhelye megtelt, az eredményeid most nem mentődnek."), 0);
      }
    }
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
  // Budapest eltérése az UTC-től az adott pillanatban (ms), nyári időszámítással együtt.
  const tzFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
  });
  function tzOffset(t) {
    const p = Object.fromEntries(tzFmt.formatToParts(new Date(t)).map((x) => [x.type, +x.value || 0]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
  }
  // A következő budapesti éjfélig hátralévő idő. Az óraátállítás napján az a nap 23 vagy 25 órás,
  // ezért az éjfél pillanatát a holnapi eltéréssel számoljuk, nem a mai órából.
  function msToNextDay() {
    const now = Date.now();
    const [y, m, d] = shiftDate(dateKey(), 1).split("-").map(Number);
    const local = Date.UTC(y, m - 1, d);
    let t = local - tzOffset(now);
    t = local - tzOffset(t);
    return t - now;
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

  // A dal azonosítója mentésben, gyorsítótárban és kihívás-linkben nem olvasható ki ránézésre.
  // Ez csak a kíváncsi szemnek nehezíti a csalást: a böngésző hálózati forgalmából
  // egy elszánt játékos így is megtudhatja a dalt (szerver nélkül ez nem védhető ki).
  const ID_MUL = 7919, ID_ADD = 1234567;
  const encId = (id) => [...((id + ID_ADD) * ID_MUL).toString(36)].reverse().join("");
  function decId(v) {
    if (typeof v === "number") return v; // régi mentés
    const n = parseInt([...String(v || "")].reverse().join(""), 36) / ID_MUL - ID_ADD;
    return Number.isInteger(n) && n > 0 ? n : null;
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

  // Az előadók dallistái a Cache tárban vannak (a localStorage ~5 MB-os keretébe nem férne el
  // biztonságosan mind); a régi, localStorage-ban tárolt listákat egyszer átköltöztetjük.
  const POOL_CACHE = "songdle-pool-v1";
  const poolUrl = (key) => new URL(`__pool/${key}`, location.href).href;
  async function readPool(key) {
    const legacy = load(key, null);
    if (legacy) {
      if (await writePool(key, legacy)) {
        try { localStorage.removeItem(LS + key); } catch { /* nem elérhető */ }
      }
      return legacy;
    }
    try {
      const res = await (await caches.open(POOL_CACHE)).match(poolUrl(key));
      return res ? await res.json() : null;
    } catch { return null; }
  }
  async function writePool(key, value) {
    try {
      await (await caches.open(POOL_CACHE)).put(poolUrl(key), new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }));
      return true;
    } catch {
      save(key, value); // nincs Cache API (pl. nem biztonságos oldal): marad a régi tár
      return false;
    }
  }

  // Az összes régi listát egyszerre átköltöztetjük (nem csak a most betöltött előadókét),
  // A dalok eredeti megjelenési éve is a listában van (firstYear), ezért a régi, külön
  // évkulcsokat (year.*) töröljük.
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(LS + "artist3.")) readPool(k.slice(LS.length));
      else if (k.startsWith(LS + "year.")) localStorage.removeItem(k);
    }
  } catch { /* nem elérhető */ }

  const poolKey = (artist) => "artist3." + (artist.id || norm(artist.name));
  async function loadArtist(artist) {
    const cacheKey = poolKey(artist);
    const cached = await readPool(cacheKey);
    if (cached && Date.now() - cached.ts < CFG.POOL_CACHE_HOURS * 3600e3) return cached.tracks;
    // Offline (vagy ha a Deezer nem válaszol) a régebbi lista is jó.
    if (cached && !navigator.onLine) return cached.tracks;
    try { return await fetchArtist(artist, cacheKey, cached); } catch (e) {
      if (cached) return cached.tracks;
      throw e;
    }
  }

  // Egy dal már kiderített eredeti évét a dallistájába írjuk (előadónként egymás után, hogy
  // két egyszerre érkező év ne írja felül egymást).
  const yearWrites = new Map();
  function storeFirstYear(t, year) {
    const artist = CFG.ARTISTS.find((a) => a.name === t.src);
    if (!artist) return; // a meccshez külön betöltött dal: csak a memóriában marad
    const key = poolKey(artist);
    const job = (yearWrites.get(key) || Promise.resolve()).then(async () => {
      const data = await readPool(key);
      const hit = data && data.tracks.find((x) => x.id === t.id);
      if (!hit || hit.firstYear === year) return;
      hit.firstYear = year;
      await writePool(key, data);
    }).catch(() => {});
    yearWrites.set(key, job);
  }

  async function fetchArtist(artist, cacheKey, old) {
    let id = artist.id;
    if (!id) id = await withRetry(() => Deezer.findArtistId(artist.name));
    let tracks = [];
    if (id) {
      const raw = await withRetry(() => Deezer.artistTop(id, CFG.TRACKS_PER_ARTIST));
      // Csak olyan dal, amelyen az előadó tényleg szerepel (fő előadó vagy közreműködő).
      const features = (t) => t.artist.id === id || (t.contributors || []).some((c) => c.id === id);
      tracks = raw.filter((t) => t.readable !== false && t.preview && !excludeRe.test(t.title) && features(t)).map(slimTrack);
      // A frissített listában is megmaradnak a már kiderített évek.
      const years = new Map(((old && old.tracks) || []).filter((t) => t.firstYear).map((t) => [t.id, t.firstYear]));
      for (const t of tracks) if (years.has(t.id)) t.firstYear = years.get(t.id);
    }
    await writePool(cacheKey, { ts: Date.now(), tracks });
    return tracks;
  }

  // A hangot csak streameljük a Deezerről, nem tároljuk. A korábbi verzió a legutóbbi dalok
  // hangját a böngészőben tartotta (songdle-clips-v1): azt egyszer kitöröljük.
  try { caches.delete("songdle-clips-v1").catch(() => {}); } catch { /* nincs Cache API */ }

  // Egy dal adatai (előnézet-link, borító, év) a Deezerről; a kör eleji és az előtöltés közös kérése.
  const clipRequests = new Map();
  function loadClip(t) {
    if (!clipRequests.has(t.id)) {
      clipRequests.set(t.id, fetchClip(t).finally(() => setTimeout(() => clipRequests.delete(t.id), 60e3)));
    }
    return clipRequests.get(t.id);
  }
  async function fetchClip(t) {
    const full = await Deezer.track(t.id);
    if (!full.preview) throw new Error("Nincs előnézet");
    return {
      preview: full.preview,
      md5: (full.album && full.album.md5_image) || t.md5,
      year: ((full.release_date || (full.album && full.album.release_date) || "").match(/^\d{4}/) || [""])[0],
      feat: full.contributors ? [...new Set(full.contributors.map((c) => c.name))] : null,
    };
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

  // keepBlocked: párbajban és kihívásban a meccs dala akkor is kell, ha azóta kitiltottuk.
  function buildPool(tracks, keepBlocked) {
    const byKey = new Map();
    for (const t of tracks) {
      if (configBlocked.has(t.id) && !keepBlocked) continue;
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
  // Párbaj (élő, 2–6 játékos) és kihívás (link egy barát 5 dalos körével):
  // { kind: "battle" | "challenge", ids, idx, results: [{won, pts, tries}], cur?,
  //   opps: [{ id, name, score?, results: [], live: {}, gone?, rematch? }], waiting, rematchMe? }
  let versus = null;
  const VS_SONGS = CFG.VERSUS_SONGS || 5;
  const vsScore = (results) => (results || []).reduce((a, r) => a + (r ? r.pts : 0), 0);
  const oppScore = (o) => (o.score != null ? o.score : vsScore(o.results));
  const oppFinished = (o) => o.gone || o.score != null || o.results.filter(Boolean).length >= versus.ids.length;
  const vsOver = () => versus && versus.results.filter(Boolean).length >= versus.ids.length;
  const vsOppOver = () => versus && versus.opps.every(oppFinished);

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
    el.input.placeholder = mode === "stream" ? "Dalcím – rejtve, a chat nem látja…" : "Dal címe vagy előadó…";
    // Ahol a CSS-es maszk nem működik, jelszómezővel rejtjük el a streamer tippjét.
    const cssMask = window.CSS && CSS.supports && CSS.supports("-webkit-text-security", "disc");
    el.input.type = mode === "stream" && !cssMask ? "password" : "text";
    el.dailyBanner.hidden = mode !== "daily" && mode !== "versus" && mode !== "stream";
    if (mode === "stream") {
      el.dailyBanner.textContent = "";
      const b = document.createElement("b");
      b.textContent = "#" + stream.channel;
      el.dailyBanner.append("📺 Streamer vs Chat · ", b, `${stream.catLabel ? " · " + stream.catLabel : ""} · ${stream.len} dal`);
    } else if (mode === "versus") {
      el.dailyBanner.textContent = "";
      const b = document.createElement("b");
      const one = versus.opps.length === 1;
      b.textContent = one ? versus.opps[0].name : `${versus.opps.length + 1} játékos`;
      el.dailyBanner.append(versus.kind === "battle" ? (one ? "⚔️ Párbaj · Te vs " : "⚔️ Párbaj · ") : "🎯 Kihívás · ", b,
        versus.kind === "battle" ? `${versus.cat ? " · " + versus.cat : ""} · ${versus.ids.length} dal` : ` · ${versus.opps[0].score} pont – győzd le!`);
    } else {
      const d = diffById(dailyDiff);
      el.dailyBanner.innerHTML = `Mai dal · <b>${prettyDate(dateKey())}</b> · ${d.label} · <b>×${d.multiplier}</b> pont`;
    }
    updateNextButton();
  }

  function updateNextButton() {
    el.nextBtn.disabled = false;
    if (mode === "stream") {
      el.nextBtn.textContent = stream.idx + 1 < stream.len ? "Következő dal →" : "🏁 Eredmény";
      // A bónuszkérdés (és a chat szavazása) alatt még nem lehet továbblépni.
      el.nextBtn.disabled = !stream.cur || stream.cur.phase !== "done";
      return;
    }
    if (mode === "versus") {
      if (!vsOver()) {
        const waiting = versus.waiting;
        el.nextBtn.textContent = waiting ? "Várakozás…" : "Következő dal →";
        el.nextBtn.disabled = waiting;
      } else if (!vsOppOver()) {
        // Az utolsó dal után is megvárjuk az ellenfelet, csak utána jön az eredmény.
        el.nextBtn.textContent = "Várakozás…";
        el.nextBtn.disabled = true;
      } else el.nextBtn.textContent = "🏁 Eredmény";
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
    if (mode === "stream") {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = "✕ Kilépés";
      b.addEventListener("click", () => leaveStream());
      const conn = document.createElement("span");
      conn.className = "chip tw-conn";
      conn.id = "twConn";
      el.categories.append(b, conn);
      renderTwConn();
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

    const streamBtn = document.createElement("button");
    streamBtn.className = "chip battle-chip stream-chip";
    streamBtn.textContent = "📺 Stream";
    streamBtn.setAttribute("aria-label", "Streamer vs Chat mód (Twitch)");
    streamBtn.addEventListener("click", openStreamSetup);
    el.categories.appendChild(streamBtn);
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
    if (mode === "stream") closeStream();
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

    const poolCategory = mode === "endless" ? category : mode === "stream" ? stream.cat : "all";
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
    if (mode === "stream") return streamStartSong();

    if (mode === "daily") {
      const date = dateKey();
      const saved = load(dailyKey(date, dailyDiff), null);
      // Ha ma már elkezdte, ugyanaz a dal marad akkor is, ha közben frissült a dallista.
      const track = (saved && pool.find((p) => p.id === decId(saved.trackId))) || pickDailyTrack(date, diffById(dailyDiff));
      if (!track) {
        setLoading(false);
        return setStatus("Nem sikerült betölteni a mai dalt. Próbáld újra később.", true);
      }
      return startRound(track, saved && decId(saved.trackId) === track.id ? saved : null);
    }

    const saved = load("round", null);
    if (saved && saved.category === category) {
      const t = pool.find((p) => p.id === decId(saved.trackId));
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
      // Ha a dal nem töltődik be, a következő próbálkozás másik dalt sorsol.
      const t = track || takePrefetched() || pickTrack();
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
          bonus: unpackBonus(saved && saved.bonus),
          preview: clip.preview,
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
    setStatus(round.attempts.length ? "Folytasd, ahol abbahagytad!" : "Nyomd meg a lemezt, és figyelj!");
    el.playBtn.classList.add("pulse");
    if (round.mode === "stream") streamSongReady();
  }

  // A hang a Deezer előnézet-linkjéről szól (streamelve).
  function setAudioSource() {
    el.audio.src = round.preview;
    el.audio.load();
  }

  // A következő dal előre: sorsolás és az adatai (előnézet-link), amíg ezt játssza.
  let prefetched = null;
  function prefetchNext() {
    let t = null;
    if (round.mode === "versus" || round.mode === "stream") {
      const m = round.mode === "versus" ? versus : stream;
      const id = m.ids[m.idx + 1];
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

  function persistRound() {
    if (!round || round.mode === "stream") return; // a streamer meccs nem mentődik
    if (round.mode === "versus") {
      // A párbaj az újratöltést is túléli: az épp játszott dal tippjei is megmaradnak.
      if (versus) {
        versus.cur = { idx: versus.idx, attempts: round.attempts, heard: round.heard, done: round.done, won: round.won, points: round.points };
        saveBattle();
      }
      return;
    }
    if (round.mode === "daily") {
      save(dailyKey(round.date, round.diff), {
        trackId: encId(round.track.id), attempts: round.attempts, done: round.done, won: round.won, points: round.points,
        bonus: packBonus(round.bonus),
      });
    } else if (!round.done) {
      save("round", { category, trackId: encId(round.track.id), attempts: round.attempts, reverse: round.reverse, heard: round.heard });
    } else {
      save("round", null);
    }
  }

  // Hányadik részletnél tart a kör. Streamer módban a két fél együtt halad (közös kör).
  const usedTries = (r) => (r.mode !== "stream" ? r.attempts.length : stream && stream.cur ? stream.cur.stage : 0);
  function currentLength() {
    if (!round) return LENGTHS[0];
    if (round.done) return FULL_PREVIEW;
    // Streamer módban a két fél együtt halad: a részlet hossza a közös körtől függ.
    const n = usedTries(round);
    return lengthsOf(round)[Math.min(n, MAX_TRIES - 1)];
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
        ? `Jó előadó, de nem ez a dal! Most már ${len} mp.`
        : `Nem ez az. Most már ${len} mp-et hallhatsz.`);
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
      persistRound();
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
    // Hány napi dalt fejeznek be naponta (szintenként, nyert vagy nem).
    if (round.mode === "daily") countEvent(`daily-${round.diff}-${won ? "won" : "lost"}`);

    round.points = scoreFor(won, tries, s.streak, multOf(round));
    points += round.points.total;
    save("points", points);
    if (round.mode === "endless" && !silent && !gameDone()) {
      // A dal azonosítója a kihíváshoz kell (a kör 5 dala megosztható).
      // base: a kihívásban is elérhető pont (sorozatbónusz és nehéz-szorzó nélkül), hogy a meccs igazságos legyen.
      game.results.push({ won, pts: round.points.total, base: scoreFor(won, tries, 0, 1).total, id: round.track.id });
      if (gameDone()) {
        const score = gameScore();
        game.record = score > bestGame && score > 0;
        game.prevBest = bestGame;
        if (game.record) { bestGame = score; save("bestGame", bestGame); }
        countEvent("endless-round-done");
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
    if (t.firstYear) return Promise.resolve(t.firstYear);
    if (!yearRequests.has(t.id)) {
      yearRequests.set(t.id, lookupYear(t, deezerYear).finally(() => yearRequests.delete(t.id)));
    }
    return yearRequests.get(t.id);
  }
  async function lookupYear(t, deezerYear) {
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
      // A dallistában tároljuk (a memóriában és a gyorsítótárban is), nem külön kulcson.
      if (result) {
        t.firstYear = result;
        storeFirstYear(t, result);
      }
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

    el.revealResult.textContent = round.won
      ? (round.attempts.length === 1 ? "Elsőre! 🤯" : `Eltaláltad · ${round.attempts.length}. tipp`)
      : "Most nem jött össze";
    el.revealResult.classList.toggle("lost", !round.won);
    el.revealTitle.textContent = t.title;
    el.revealArtist.textContent = artistLine(t);
    // Nyerés után bónuszkérdés jöhet (év vagy album): addig az album, az év és a borító rejtve marad.
    if (bonusEligible(round) && !(round.bonus && round.bonus.picked)) {
      hideAlbum();
      prepareBonus(round);
    } else {
      el.bonus.hidden = true;
      if (round.bonus) renderBonus(round);
      revealAlbum(round);
    }
    el.revealEmoji.textContent = emojiRow(round);
    renderRevealPoints(round);
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
    else if (round.mode === "versus" && versus.waiting) setStatus(`Várakozás: ${names(vsWaitingFor())} még ezen a dalon dolgozik…`);
    else setStatus("Koppints a lemezre a teljes előnézethez.");
    if (autoplay) playClip();
    el.nextBtn.focus({ preventScroll: true });
  }

  // A borító, az album és az év a megfejtésnél (a bónuszkérdés után).
  function revealAlbum(r) {
    const t = r.track;
    el.bonus.classList.remove("pending");
    el.revealAlbum.hidden = false;
    el.discCover.classList.remove("loaded");
    el.discCover.onload = () => {
      el.discCover.classList.add("loaded");
      setTint(coverColors(el.discCover));
    };
    el.discCover.src = coverUrl(r.md5, 500);
    el.discCover.alt = `${t.album} borítója`;
    el.disc.classList.add("revealed");
    el.revealAlbum.textContent = t.album;
    // A megjelenés éve (nyerés és vesztés esetén is). Előbb a Deezer-évet mutatjuk, majd a
    // MusicBrainz szerinti eredeti évre cseréljük, ha az korábbi. Ha az évre kérdeztünk, az marad.
    const y = document.createElement("span");
    y.className = "reveal-year";
    const asked = r.bonus && r.bonus.kind === "year" ? r.bonus.answer : null;
    const first = asked || (r.year && r.year !== "0000" ? r.year : "");
    if (first) {
      y.textContent = first;
      el.revealAlbum.append(" ", y);
    }
    if (asked) return;
    originalYear(t, r.year).then((v) => {
      if (round !== r || !v || v === y.textContent) return;
      y.textContent = v;
      if (!y.isConnected) el.revealAlbum.append(" ", y);
      retrigger(y, "bump");
    });
  }
  function hideAlbum() {
    el.revealAlbum.hidden = true;
    el.disc.classList.remove("revealed");
    el.discCover.removeAttribute("src");
  }

  // ---------- Bónuszkérdés: a megfejtés után az év vagy az album, 4 lehetőségből ----------
  const BONUS_PTS = 25;
  // A napi mentésben a helyes válasz nem olvasható ki ránézésre (csak a sorszáma, kódolva).
  const packBonus = (b) => b && { kind: b.kind, options: b.options, picked: b.picked || null, a: encId(b.options.indexOf(b.answer) + 1) };
  function unpackBonus(b) {
    if (!b || !Array.isArray(b.options)) return null;
    if (b.answer) return b; // régi mentés
    const answer = b.options[(decId(b.a) || 0) - 1];
    return answer ? { kind: b.kind, options: b.options, picked: b.picked || undefined, answer } : null;
  }
  const bonusEligible = (r) => r.won && r.mode !== "versus";
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  function yearChoices(y) {
    const now = new Date().getFullYear(), out = [y];
    for (const o of shuffle([-8, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 8])) {
      const v = y + o;
      if (v >= 1950 && v <= now && !out.includes(v)) out.push(v);
      if (out.length === 4) break;
    }
    return out.length === 4 ? out.sort((a, b) => a - b).map(String) : null;
  }
  // Az előadó más albumai közül. Kislemeznél (az album neve a dal címe) túl könnyű, válogatásnál
  // (a Deezer gyakran oda sorolja a dalt) pedig csak szerencse lenne, ezért ilyenkor nem kérdezünk.
  const COMPILATION_RE = /v[aá]logat|legszebb|legjobb|legnagyobb|sl[aá]ger|[oö]sszes|gy[uű]jtem|best of|greatest|hits|collection|anthology|antol[oó]gi|essential|remaster|\blive\b|[eé]l[oő]ben|koncert|deluxe|jubileum/i;
  const isCompilation = (album) => COMPILATION_RE.test(album);
  function albumChoices(t) {
    const own = norm(t.album);
    if (!own || own.startsWith(t.base) || isCompilation(t.album)) return null;
    const seen = new Set([own]), others = [];
    for (const p of pool) {
      if ((p.src || p.artist) !== (t.src || t.artist)) continue;
      const k = norm(p.album);
      if (!k || seen.has(k) || k.startsWith(p.base) || isCompilation(p.album)) continue;
      seen.add(k);
      others.push(p.album);
    }
    return others.length >= 3 ? shuffle([t.album, ...shuffle(others).slice(0, 3)]) : null;
  }

  async function prepareBonus(r) {
    el.bonus.hidden = false;
    el.bonus.classList.add("pending");
    el.bonusQ.textContent = "🎯 Bónuszkérdés…";
    el.bonusOpts.innerHTML = "";
    if (!r.bonus) {
      const b = await makeBonus(r);
      if (round !== r) return;
      if (!b) {
        el.bonus.hidden = true;
        return revealAlbum(r);
      }
      r.bonus = b;
      persistRound();
    }
    renderBonus(r);
  }

  // A kérdés: az év vagy az album, ha van hozzá 4 értelmes lehetőség (különben null).
  async function makeBonus(r) {
    // Az év a MusicBrainzről jön (a kör elején már elindult); legfeljebb pár másodpercet várunk rá.
    const yr = await Promise.race([originalYear(r.track, r.year), new Promise((res) => setTimeout(() => res(null), 2500))]);
    const y = parseInt(yr || (r.year !== "0000" ? r.year : ""), 10);
    const kinds = [];
    const years = y > 1900 ? yearChoices(y) : null;
    if (years) kinds.push({ kind: "year", answer: String(y), options: years });
    const albums = albumChoices(r.track);
    if (albums) kinds.push({ kind: "album", answer: r.track.album, options: albums });
    return kinds.length ? kinds[Math.floor(Math.random() * kinds.length)] : null;
  }

  function renderBonus(r) {
    const b = r.bonus;
    el.bonus.hidden = false;
    el.bonusQ.textContent = b.picked
      ? (b.picked === b.answer ? `🎯 Bónusz: eltaláltad! +${BONUS_PTS} pont` : "🎯 Bónusz: most nem talált")
      : `🎯 Bónuszkérdés (+${BONUS_PTS} pont): ${b.kind === "year" ? "melyik évben jelent meg?" : "melyik albumon van?"}`;
    el.bonusOpts.innerHTML = "";
    el.bonusOpts.classList.toggle("albums", b.kind === "album");
    for (const o of b.options) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = o;
      if (b.picked) {
        btn.disabled = true;
        if (o === b.answer) btn.classList.add("right");
        else if (o === b.picked) btn.classList.add("wrong");
      } else btn.addEventListener("click", () => answerBonus(r, o));
      el.bonusOpts.appendChild(btn);
    }
  }

  function answerBonus(r, pick) {
    if (round !== r || r.bonus.picked) return;
    r.bonus.picked = pick;
    const right = pick === r.bonus.answer;
    if (right) {
      points += BONUS_PTS;
      save("points", points);
      floatPoints(BONUS_PTS);
      animatePoints();
      vibrate([20, 30, 20]);
    } else vibrate(80);
    countEvent(right ? "bonus-right" : "bonus-wrong");
    persistRound();
    renderBonus(r);
    renderRevealPoints(r);
    revealAlbum(r);
  }

  function renderRevealPoints(r) {
    const p = r.points;
    const quiz = r.bonus && r.bonus.picked === r.bonus.answer ? ` · 🎯 +${BONUS_PTS}` : "";
    el.revealPoints.textContent = p && p.total
      ? `+${p.total} pont` + (p.bonus ? ` (🔥 +${p.bonus})` : "") + quiz
      : "";
  }

  function resetStage() {
    el.bonus.hidden = true;
    el.revealAlbum.hidden = false;
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
      const used = usedTries(round);
      const remaining = MAX_TRIES - used;
      const nextLen = lengthsOf(round)[used + 1];
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
    } else if (mode === "stream") {
      el.streakLine.textContent = "";
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
    if (mode === "stream") {
      el.roundNum.textContent = `${stream.me}:${stream.chat}`;
      el.roundLabel.textContent = `dal ${Math.min(stream.idx + 1, stream.len)}/${stream.len}`;
      el.roundPts.className = "round-pts";
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
    const colors = ["#1ed760", "#19e3c0", "#ffc547", "#ff5470", "#2bb3ff", "#f4f4f8"];
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
    // Streamer mód: csak a már lejátszott részlet után lehet tippet lezárni.
    if (round.mode === "stream" && !round.done && stream.cur.heard !== stream.cur.stage) {
      stream.cur.heard = stream.cur.stage;
      streamControls();
    }
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
    // A visszafelé lejátszáshoz a hangot a memóriába töltjük (nem mentjük el).
    const get = async () => {
      const res = await fetch(r.preview);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.arrayBuffer();
    };
    let data;
    try { data = await get(); } catch {
      // Lejárt előnézet-link (sokáig nyitva hagyott dal): friss linket kérünk, és újra próbáljuk.
      const full = await Deezer.track(r.track.id);
      if (!full.preview) throw new Error("Nincs előnézet");
      r.preview = full.preview;
      data = await get();
    }
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
    if (!round || !el.audio.getAttribute("src")) return;
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
  // all: a már tippelt dalokat is visszaadja (a chat szavazatainál).
  function search(q, all) {
    const nq = norm(q);
    if (!nq) return [];
    const tokens = nq.split(" ");
    const guessed = all ? new Set() : guessedKeys();
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
    if (mode === "stream") return hideSuggestions();
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
    // Streamer módban a beírt szöveg rejtett, és ugyanúgy illesztjük, mint a chat tippjeit
    // (a képernyőn a chat is látja, ezért nincs javaslatlista).
    if (round.mode === "stream") guess = chatMatch(el.input.value);
    else if (!guess || el.input.value !== trackLabel(guess)) {
      guess = search(el.input.value)[0] || null;
    }
    if (!guess) {
      retrigger(el.input, "shake");
      setStatus(round.mode === "stream" ? "Nincs ilyen dal a listában – írd be másképp!" : "Válassz egy dalt a listából!", true);
      return;
    }
    selected = null;
    el.input.value = "";
    hideSuggestions();
    updateSubmit();
    updateClear();
    const attempt = { type: judge(guess, round.track), label: trackLabel(guess), key: guess.key };
    // Streamer mód: a tipp rejtve lezárul, az eredmény csak a chat szavazása után derül ki.
    if (round.mode === "stream") return streamLock(attempt);
    registerAttempt(attempt);
  }

  // Azonos cím csak közös előadónál számít találatnak (pl. „feat.” nélküli változat);
  // egy másik előadó azonos című dala nem.
  function judge(guess, answer) {
    const sharesArtist = guess.nArtists.some((a) => answer.nArtists.includes(a));
    if (guess.key === answer.key || (guess.base === answer.base && sharesArtist)) return "right";
    return sharesArtist ? "near" : "wrong";
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
    const p = new URLSearchParams({ c: ids.map(encId).join("-"), p: score });
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
      // A kihívás a bónusz nélküli pontokkal megy, mert a barát is csak ennyit szerezhet.
      const base = game.results.reduce((a, r) => a + (r.base ?? r.pts), 0);
      lines.push(`🎯 Kör: ${base} pont – meg tudod verni?`, challengeUrl(ids, base));
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
    if (round && !round.done && round.mode === "stream") streamLock({ type: "skip" });
    else if (round && !round.done) registerAttempt({ type: "skip" });
    el.input.blur();
  });
  el.nextBtn.addEventListener("click", () => {
    if (mode === "stream") return streamNext();
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
  // Közös meccs-motor: mindenki ugyanazokat a dalokat kapja, dalonként a tippek száma
  // szerinti pontért (sorozatbónusz nélkül). A párbajban a szobát nyitó gép a központ:
  // a vendégek csak vele beszélnek (WebRTC, PeerJS), ő továbbítja az állást mindenkinek.
  // A következő dal akkor jön, ha mindenki végzett az előzővel.
  const PEER_PREFIX = "songdlehu-";
  const PEER_LIB = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
  const MAX_PLAYERS = 6;
  const BATTLE_LENGTHS = [5, 10, 15];
  const HOST_ID = "host";
  // Életjel: ennyi időnként üzenünk, és ennyi csend után bontottnak vesszük a kapcsolatot
  // (a böngésző nem mindig veszi észre, ha a másik bezárta a lapot).
  const PING_MS = 4000, PEER_TIMEOUT_MS = 16000;
  let peer = null, peerHost = false;
  // A szobát nyitónál: vendégenként (játékos-azonosító szerint) { conn, name, seen }.
  const guests = new Map();
  // A vendégnél: a szobát nyitó kapcsolata és az utolsó tőle jött üzenet ideje.
  let hostConn = null, hostSeen = 0;
  // { code, pid (saját játékos-azonosító), closed?, players?, cat?, len?, connect? }
  let room = null;

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

  // opps: [{ id, name, score? }] – kihívásnál egy ellenfél a kész pontszámmal.
  // resume: újratöltés utáni folytatás (idx, results, cur).
  function startVersus(kind, ids, opps, cat = "", resume = null) {
    stopAudio();
    if (vr.dialog.open) vr.dialog.close();
    el.toast.hidden = true;
    versus = {
      kind, ids, cat, idx: 0, results: [], waiting: false,
      opps: opps.map((o) => ({ results: [], live: {}, ...o })),
    };
    if (resume) {
      versus.idx = Math.min(resume.idx || 0, ids.length - 1);
      versus.results = resume.results || [];
      versus.cur = resume.cur || null;
    }
    mode = "versus";
    renderMode();
    renderCategories();
    enterMode();
    saveBattle();
    if (!resume) countEvent(kind + "-start");
  }

  // A meccs dalai a teljes dallistából jönnek; ha egy dal nincs meg (más a dallista), a Deezerről pótoljuk.
  async function vsStartSong() {
    const id = versus.ids[versus.idx];
    let t = pool.find((p) => p.id === id);
    if (!t) {
      try {
        const full = await withRetry(() => Deezer.track(id));
        t = buildPool([slimTrack(full)], true)[0];
        pool.push(t);
      } catch { /* alább kezeljük */ }
    }
    if (!t) return setStatus("Ezt a dalt nem sikerült betölteni.", true);
    // Újratöltés után az épp játszott dal tippjei megmaradnak.
    const cur = versus.cur && versus.cur.idx === versus.idx ? versus.cur : null;
    startRound(t, cur);
  }

  const vsWaitingFor = () => versus.kind === "battle" ? versus.opps.filter((o) => !o.gone && !o.results[versus.idx]) : [];

  function vsNext() {
    if (vsOver()) {
      if (vsOppOver()) openVsResult();
      return;
    }
    // Párbajban megvárjuk, hogy mindenki végezzen ezzel a dallal.
    const wait = vsWaitingFor();
    if (wait.length) {
      versus.waiting = true;
      updateNextButton();
      setStatus(`Várakozás: ${names(wait)} még ezen a dalon dolgozik…`);
      return;
    }
    versus.waiting = false;
    versus.idx++;
    versus.cur = null;
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
    sendOut({ type: "bye" });
    peerClose();
    clearBattle();
    room = null;
    versus = null;
  }

  const names = (list) => list.map((o) => o.name).join(", ");

  function renderVsBar() {
    const bar = $("vsBar");
    bar.hidden = mode !== "versus" || !versus;
    if (bar.hidden) return;
    const challenge = versus.kind === "challenge";
    bar.innerHTML = "";
    bar.style.setProperty("--n", versus.ids.length);
    bar.classList.toggle("many", versus.opps.length > 2);
    bar.classList.toggle("long", versus.ids.length > 5);
    bar.classList.toggle("xlong", versus.ids.length > 10);
    const row = (name, results, live, current, score, cls) => {
      const r = document.createElement("div");
      r.className = "vs-row" + cls;
      const n = document.createElement("b");
      n.className = "vs-name";
      n.textContent = name;
      const slots = document.createElement("div");
      slots.className = "set-slots";
      versus.ids.forEach((_, i) => {
        const res = results[i], slot = document.createElement("span");
        if (res) {
          slot.className = res.won ? "won" : "lost";
          slot.textContent = res.won ? res.pts : "✗";
        } else if (i === current) {
          slot.className = "current";
          // Az ellenfélnél: hányadik tippnél tart.
          slot.textContent = live && live[i] ? `${live[i].attempts + 1}.` : "…";
        }
        slots.appendChild(slot);
      });
      const s = document.createElement("b");
      s.className = "vs-score";
      s.textContent = score;
      r.append(n, slots, s);
      bar.appendChild(r);
    };
    row("Te", versus.results, null, versus.idx, vsScore(versus.results), "");
    // Kihívásnál a kihívó dalonkénti eredményét csak a végén mutatjuk.
    for (const o of versus.opps) {
      row(o.name, challenge && !vsOver() ? [] : o.results, o.live, challenge ? -1 : versus.idx, oppScore(o), " opp" + (o.gone ? " gone" : ""));
    }
  }

  function vsOppLine() {
    if (!versus) return "";
    if (versus.kind === "challenge") {
      const o = versus.opps[0];
      return `🎯 ${o.name}: ${o.score} pont ezen az ${versus.ids.length} dalon`;
    }
    const active = versus.opps.filter((o) => !o.gone);
    if (!active.length) return versus.opps.length === 1
      ? `⚠️ ${versus.opps[0].name} kilépett – a meccset egyedül fejezed be.`
      : "⚠️ Mindenki kilépett – a meccset egyedül fejezed be.";
    if (versus.opps.length === 1) {
      const o = versus.opps[0], done = o.results[versus.idx], live = o.live[versus.idx];
      if (done) return done.won ? `✓ ${o.name} kitalálta (${done.tries}. tippre, +${done.pts})` : `✗ ${o.name} nem találta ki`;
      if (live && live.attempts) return `⚔️ ${o.name}: ${live.attempts + 1}. tipp…`;
      return `⚔️ ${o.name} is hallgatja…`;
    }
    const left = active.filter((o) => !o.results[versus.idx]);
    if (!left.length) return "✓ Mindenki végzett ezzel a dallal";
    return `⚔️ ${active.length - left.length}/${active.length} végzett · még játszik: ${names(left)}`;
  }

  // Állás: mindenki pontszám szerint, holtversenyben azonos helyezéssel.
  function vsStandings() {
    const list = [
      { name: "Te", score: vsScore(versus.results), me: true },
      ...versus.opps.map((o) => ({ name: o.name, score: oppScore(o), gone: o.gone })),
    ].sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));
    list.forEach((p, i) => { p.place = i && p.score === list[i - 1].score ? list[i - 1].place : i + 1; });
    return list;
  }

  function vsResultText() {
    const st = vsStandings();
    const me = st.find((p) => p.me);
    const opp = versus.opps.length === 1 ? oppScore(versus.opps[0]) : null;
    if (!vsOppOver()) {
      const wait = versus.opps.filter((o) => !oppFinished(o));
      return { me: me.score, opp, st, place: me.place, verdict: `Várakozás: ${names(wait)} még játszik…`, win: null };
    }
    const leaders = st.filter((p) => p.place === 1);
    const win = me.place === 1 ? (leaders.length === 1 ? true : null) : false;
    const verdict = win ? "🏆 Nyertél!"
      : win === null ? (st.length === 2 ? "🤝 Döntetlen" : "🤝 Holtverseny az élen")
      : `${names(leaders)} nyert`;
    return { me: me.score, opp, st, place: me.place, win, verdict };
  }

  function renderVsSummary(animate) {
    const r = vsResultText();
    el.revealSet.hidden = false;
    el.revealSet.textContent = "";
    const b = (s) => { const e = document.createElement("b"); e.textContent = s; return e; };
    if (r.opp !== null) el.revealSet.append("🏁 Te ", b(String(r.me)), ` – ${r.opp} ${versus.opps[0].name} · `);
    else el.revealSet.append("🏁 Te ", b(String(r.me)), ` pont · ${r.place}. hely · `);
    const v = document.createElement("span");
    v.className = r.win ? "rec" : "";
    v.textContent = r.verdict;
    el.revealSet.append(v);
    if (r.win && animate) setTimeout(confetti, 700);
    if (vsOppOver() && !versus.counted) {
      versus.counted = true;
      countEvent(`${versus.kind}-${r.win ? "won" : r.win === false ? "lost" : "draw"}`);
    }
    updateNextButton();
    // Ha mindenki végzett, egyszer magától feljön az eredmény.
    if (vsOppOver() && !versus.resultShown) {
      versus.resultShown = true;
      setTimeout(openVsResult, animate ? 1600 : 400);
    }
  }

  // ----- Eredményablak: helyezések, visszavágó (csak ha mindenki kéri) -----
  const vr = {
    dialog: $("vsResultDialog"), verdict: $("vsResVerdict"), rank: $("vsResRank"),
    status: $("vsResStatus"), rematch: $("vsRematchBtn"),
  };

  function renderVsResult() {
    if (!versus) return;
    const r = vsResultText();
    vr.verdict.textContent = r.verdict;
    vr.verdict.classList.toggle("win", !!r.win);
    vr.rank.innerHTML = "";
    for (const p of r.st) {
      const li = document.createElement("li");
      li.className = (p.me ? "me" : "") + (p.gone ? " gone" : "");
      const place = document.createElement("span");
      place.className = "place";
      place.textContent = p.place === 1 ? "🏆" : `${p.place}.`;
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = p.name + (p.gone ? " (kilépett)" : "");
      const sc = document.createElement("b");
      sc.textContent = p.score;
      li.append(place, nm, sc);
      vr.rank.appendChild(li);
    }
    const others = versus.opps.filter((o) => !o.gone);
    const live = versus.kind === "battle" && others.length > 0 && (peerHost || !!hostConn);
    const asked = others.filter((o) => o.rematch), missing = others.filter((o) => !o.rematch);
    vr.rematch.hidden = !live;
    vr.rematch.disabled = !!versus.rematchMe;
    vr.rematch.textContent = versus.rematchMe ? "Várakozás…" : asked.length ? "🔁 Benne vagyok a visszavágóban" : "🔁 Visszavágó";
    vr.status.textContent = versus.kind !== "battle" ? ""
      : !live ? (versus.opps.length === 1 ? `${versus.opps[0].name} kilépett.` : "A többiek kiléptek.")
      : versus.rematchMe && missing.length ? `Várakozás: ${names(missing)} is kéri a visszavágót?`
      : asked.length ? `Visszavágót kér: ${names(asked)}` : "";
  }

  function openVsResult() {
    if (!versus || !vsOver() || !vsOppOver() || document.querySelector("dialog[open]")) return;
    renderVsResult();
    vr.dialog.showModal();
  }

  vr.rematch.addEventListener("click", vsRematch);
  $("vsResShareBtn").addEventListener("click", vsShare);
  $("vsResLeaveBtn").addEventListener("click", () => { vr.dialog.close(); leaveVersus(); });

  async function vsShare() {
    const r = vsResultText();
    const rows = versus.results.map((x) => (x && x.won ? ["", "🟩", "🟩", "🟨", "🟨", "🟧", "🟥"][x.tries] || "🟩" : "⬛")).join("");
    const one = versus.opps.length === 1;
    const head = versus.kind === "challenge" ? `Songdle HU 🎯 Kihívás vs ${versus.opps[0].name}`
      : one ? `Songdle HU ⚔️ Párbaj vs ${versus.opps[0].name}` : `Songdle HU ⚔️ Párbaj · ${versus.opps.length + 1} játékos`;
    const lines = [head, one ? `${rows}  ${r.me} – ${r.opp}` : `${rows}  ${r.me} pont · ${r.place}. hely`, r.verdict];
    // A kihívást tovább is lehet küldeni a saját pontszámmal.
    if (vsOver()) lines.push(challengeUrl(versus.ids, r.me));
    else lines.push(homeUrl());
    return shareText(lines.join("\n"));
  }

  // ----- Folytatás újratöltés után (a lap bezárásáig, sessionStorage) -----
  const BATTLE_KEY = LS + "battle";
  function saveBattle() {
    if (!versus || versus.kind !== "battle" || !room) return;
    try {
      sessionStorage.setItem(BATTLE_KEY, JSON.stringify({
        code: room.code, pid: room.pid, host: peerHost, ids: versus.ids.map(encId), cat: versus.cat,
        idx: versus.idx, results: versus.results, cur: versus.cur || null,
        opps: versus.opps.map((o) => ({ id: o.id, name: o.name, results: o.results, gone: !!o.gone })),
      }));
    } catch { /* nem elérhető */ }
  }
  function loadBattle() {
    try { return JSON.parse(sessionStorage.getItem(BATTLE_KEY) || "null"); } catch { return null; }
  }
  function clearBattle() {
    try { sessionStorage.removeItem(BATTLE_KEY); } catch { /* nem elérhető */ }
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
    settings: $("battleSettings"), len: $("battleLen"), info: $("battleInfo"), players: $("battlePlayers"), go: $("battleGoBtn"),
  };
  const battleStatus = (msg, isError) => {
    bt.status.textContent = msg || "";
    bt.status.classList.toggle("error", !!isError);
  };
  const nick = () => (bt.nick.value.trim() || load("nick", "") || "Ismeretlen").slice(0, 16);
  const cleanName = (s) => String(s || "").trim().slice(0, 16) || "Ismeretlen";

  // A szobát nyitó választ kategóriát (műfaj vagy évtized) és hosszt; a többiek ugyanazokat a dalokat kapják.
  const battleCatId = () => {
    const id = load("battleCat", category);
    return allCats.some((c) => c.id === id) ? id : "all";
  };
  const battleLen = () => (BATTLE_LENGTHS.includes(load("battleLen", VS_SONGS)) ? load("battleLen", VS_SONGS) : VS_SONGS);
  const battleCatBtn = $("battleCatBtn");
  function renderBattleSettings() {
    const c = fillCatPill(battleCatBtn, battleCatId(), "Mit játszotok?");
    battleCatBtn.setAttribute("aria-label", `Mit játszotok: ${c.label}. Váltás`);
    bt.len.innerHTML = "";
    for (const n of BATTLE_LENGTHS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = `${n} dal`;
      b.setAttribute("aria-pressed", String(n === battleLen()));
      b.addEventListener("click", () => { save("battleLen", n); renderBattleSettings(); broadcastLobby(); });
      bt.len.appendChild(b);
    }
  }
  battleCatBtn.addEventListener("click", () => openCatSheet({
    current: battleCatId(),
    title: "Mit játszotok?",
    withHard: false,
    onPick: (id) => { save("battleCat", id); renderBattleSettings(); broadcastLobby(); },
  }));

  function openBattle(code) {
    if (bt.dialog.open) return;
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

  // Váróterem: a kód, a meghívó, a játékosok; a beállítások és az indítás csak a szobát nyitónál.
  function renderLobby() {
    if (!room) return;
    bt.start.hidden = true;
    bt.wait.hidden = false;
    bt.codeShow.textContent = room.code;
    bt.settings.hidden = !peerHost;
    bt.go.hidden = !peerHost;
    const players = peerHost ? lobbyPlayers() : room.players || [];
    bt.players.innerHTML = "";
    for (const p of players) {
      const li = document.createElement("li");
      li.textContent = p.name;
      if (p.id === HOST_ID) li.classList.add("host");
      if (p.id === room.pid) li.classList.add("me");
      bt.players.appendChild(li);
    }
    if (peerHost) {
      renderBattleSettings();
      bt.go.disabled = guests.size === 0;
      bt.info.textContent = `${players.length}/${MAX_PLAYERS} játékos`;
      battleStatus(guests.size ? "Indíthatod, vagy várj még másokra." : "Várakozás a többiekre… Küldd el nekik a kódot!");
    } else {
      const host = players.find((p) => p.id === HOST_ID);
      bt.info.textContent = room.cat ? `${room.cat} · ${room.len} dal` : "";
      battleStatus(`Várakozás, amíg ${host ? host.name : "a szobát nyitó"} elindítja…`);
    }
  }
  const lobbyPlayers = () => [{ id: HOST_ID, name: nick() }, ...[...guests].map(([id, g]) => ({ id, name: g.name }))];
  function broadcastLobby() {
    if (!peerHost || !room || versus) return;
    broadcast({ type: "lobby", players: lobbyPlayers(), cat: catLabel(battleCatId()), len: battleLen() });
    if (bt.dialog.open && !bt.wait.hidden) renderLobby();
  }

  function send(c, m) {
    try { if (c && c.open) c.send(m); } catch { /* bontott kapcsolat */ }
  }
  function broadcast(m, except) {
    for (const [id, g] of guests) if (id !== except) send(g.conn, m);
  }
  // Saját üzenet: vendégként a szobát nyitónak, szobát nyitóként mindenkinek.
  function sendOut(m) {
    if (peerHost) broadcast({ ...m, from: HOST_ID });
    else send(hostConn, m);
  }

  function peerClose() {
    for (const g of guests.values()) { try { g.conn.close(); } catch { /* már zárva */ } }
    guests.clear();
    try { if (hostConn) hostConn.close(); } catch { /* már zárva */ }
    hostConn = null;
    try { if (peer) peer.destroy(); } catch { /* már zárva */ }
    peer = null;
    clearTimeout(reconnectTimer);
  }

  const ROOM_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const newRoomCode = () => Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");
  const newPlayerId = () => Math.random().toString(36).slice(2, 10);
  const battleLink = (code) => homeUrl() + "?parbaj=" + code;

  // Ha a PeerJS közvetítője nem válaszol, ne pörögjön a végtelenségig.
  function watchPeerOpen(p) {
    setTimeout(() => {
      if (peer === p && !p.open && !p.destroyed && !p.disconnected) {
        const msg = "A párosító szerver most nem válaszol. Próbáld újra kicsit később!";
        if (bt.dialog.open) battleStatus(msg, true);
        else toast(msg);
      }
    }, 12000);
  }

  const SOFT_PEER_ERRORS = ["network", "disconnected", "socket-error", "socket-closed", "server-error"];
  function peerResume() {
    if (!peer || peer.destroyed || !peer.disconnected) return;
    try { peer.reconnect(); } catch { /* következő alkalommal újra */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    peerResume();
    // Visszatéréskor a vendég azonnal újracsatlakozik a szobához, ha közben megszakadt.
    if (room && !peerHost && !hostConn && !room.closed && room.connect) room.connect();
  });
  window.addEventListener("online", peerResume);

  // ----- Szobát nyitó (központ) -----
  // resumeCode: újratöltés vagy visszatérés után ugyanazzal a kóddal nyitjuk újra.
  async function battleHost(attempt = 0, resumeCode = null) {
    saveNick();
    if (!resumeCode) peerClose();
    if (bt.dialog.open) battleStatus(resumeCode ? "Újracsatlakozás…" : "Szoba nyitása…");
    try { await loadPeerLib(); } catch { return battleStatus("Nem sikerült betölteni a párbajt. Van internet?", true); }
    const code = resumeCode || newRoomCode();
    peerHost = true;
    room = { code, pid: HOST_ID, opened: !!resumeCode };
    const me = new window.Peer(PEER_PREFIX + code);
    peer = me;
    watchPeerOpen(me);
    let tries = 0;
    me.on("open", () => {
      tries = 0;
      room.opened = true;
      if (!versus) renderLobby();
    });
    me.on("connection", hostAccept);
    me.on("disconnected", () => { if (!document.hidden) setTimeout(peerResume, 1000); });
    me.on("error", (e) => {
      if (peer !== me) return;
      // Foglalt kód egy új szobánál: másik kódot sorsolunk.
      if (e.type === "unavailable-id" && !room.opened && attempt < 3) return setTimeout(() => battleHost(attempt + 1), 0);
      // Visszatéréskor a közvetítő még a régi kapcsolatunkhoz köthette a kódot: kicsit később újra próbáljuk.
      if (e.type === "unavailable-id" && tries++ < 15) {
        if (bt.dialog.open) battleStatus("Újracsatlakozás…");
        setTimeout(() => {
          if (peer !== me) return;
          if (me.destroyed) battleHost(attempt, code);
          else peerResume();
        }, 3000);
        return;
      }
      // Megosztáskor a böngésző a háttérbe kerül, és a telefon bontja a közvetítő kapcsolatot:
      // a szoba megmarad, visszatéréskor újracsatlakozunk ugyanazzal a kóddal.
      if (SOFT_PEER_ERRORS.includes(e.type) && !me.destroyed) {
        if (bt.dialog.open && !bt.wait.hidden) battleStatus("Újracsatlakozás…");
        return;
      }
      battleStatus("Hiba a kapcsolatban: " + (e.type || e.message), true);
    });
  }

  function hostAccept(c) {
    c.on("data", (m) => hostData(c, m));
    c.on("close", () => hostDrop(c));
  }

  function hostData(c, m) {
    if (!m || typeof m !== "object") return;
    if (m.type === "hello") return hostHello(c, m);
    const id = c.pid, g = id && guests.get(id);
    if (!g || g.conn !== c) return;
    g.seen = Date.now();
    if (m.type === "progress") {
      applyProgress(id, m);
      broadcast({ ...m, from: id }, id);
    } else if (m.type === "rematch") {
      broadcast({ type: "rematch", from: id }, id);
      applyRematch(id);
      hostMaybeRematch();
    } else if (m.type === "bye") {
      hostDrop(c);
    }
  }

  function hostHello(c, m) {
    const id = typeof m.pid === "string" && /^[a-z0-9]{4,12}$/.test(m.pid) && m.pid !== HOST_ID ? m.pid : null;
    if (!id) return c.close();
    const name = cleanName(m.name);
    const known = versus && versus.kind === "battle" ? versus.opps.find((o) => o.id === id) : null;
    const reject = (type) => { send(c, { type }); setTimeout(() => c.close(), 400); };
    if (versus && !known) return reject("running");
    if (!versus && !guests.has(id) && guests.size >= MAX_PLAYERS - 1) return reject("full");
    const old = guests.get(id);
    if (old && old.conn !== c) { try { old.conn.close(); } catch { /* már zárva */ } }
    c.pid = id;
    guests.set(id, { conn: c, name, seen: Date.now() });
    if (known) {
      // Visszatért játékos: a saját eredményei a mérvadók, majd mindenki megkapja a teljes állást.
      known.gone = false;
      if (Array.isArray(m.results)) known.results = cleanResults(m.results);
      broadcastSync();
      vsRefresh();
      toast(`${known.name} visszajött.`);
    } else {
      broadcastLobby();
    }
  }

  // Bontott vagy néma kapcsolat: a játékos kiesik (meccs közben visszatérhet).
  function hostDrop(c) {
    const id = c.pid, g = id && guests.get(id);
    if (!g || g.conn !== c) return;
    guests.delete(id);
    try { c.close(); } catch { /* már zárva */ }
    if (versus && versus.kind === "battle") {
      const o = versus.opps.find((x) => x.id === id);
      if (o && !o.gone) {
        o.gone = true;
        broadcast({ type: "left", from: id });
        toast(`${o.name} kilépett a párbajból.`);
        vsRefresh();
        hostMaybeRematch();
      }
    } else broadcastLobby();
  }

  function broadcastSync() {
    if (!versus) return;
    broadcast({
      type: "sync", ids: versus.ids, cat: versus.cat,
      players: [
        { id: HOST_ID, name: nick(), results: versus.results, rematch: !!versus.rematchMe },
        ...versus.opps.map((o) => ({ id: o.id, name: o.name, results: o.results, gone: !!o.gone, rematch: !!o.rematch })),
      ],
    });
  }

  async function hostStartMatch() {
    if (!peerHost || hostStartMatch.busy) return;
    hostStartMatch.busy = true;
    try {
      battleStatus("Dalok sorsolása…");
      const catId = battleCatId(), len = battleLen();
      let list = buildPool(await loadArtists(artistsFor(catId), () => {}));
      const decade = decadeOf(catId);
      if (decade) {
        const years = await loadYears();
        list = list.filter((t) => years[t.id] >= decade.from && years[t.id] <= decade.to);
      }
      // Túl kevés dalnál (pl. hiányzó évadatok) a teljes listából sorsolunk.
      if (list.length < len) list = buildPool(await loadArtists(artistsFor("all"), () => {}));
      assignWeights(list);
      const ids = pickSet(list, len);
      const cat = catId === "all" ? "" : catLabel(catId);
      const players = lobbyPlayers();
      if (players.length < 2) return battleStatus("Nincs kivel játszani – várj, amíg valaki csatlakozik.", true);
      broadcast({ type: "start", ids, cat, players });
      if (bt.dialog.open) bt.dialog.close("started");
      startVersus("battle", ids, players.filter((p) => p.id !== HOST_ID), cat);
    } finally {
      hostStartMatch.busy = false;
    }
  }

  // A visszavágó akkor indul, ha mindenki kérte, aki még bent van.
  function hostMaybeRematch() {
    if (!peerHost || !versus || !versus.rematchMe) return;
    const active = versus.opps.filter((o) => !o.gone);
    if (active.length && active.every((o) => o.rematch)) hostStartMatch();
  }

  // ----- Vendég -----
  async function battleJoin(resume = null) {
    const code = resume ? resume.code : bt.code.value.trim().toUpperCase();
    if (code.length !== 4) return battleStatus("Írd be a 4 betűs kódot!", true);
    saveNick();
    if (!resume) peerClose();
    battleStatus("Csatlakozás…");
    try { await loadPeerLib(); } catch { return battleStatus("Nem sikerült betölteni a párbajt. Van internet?", true); }
    peerHost = false;
    room = { code, pid: (resume && resume.pid) || newPlayerId() };
    const me = new window.Peer();
    peer = me;
    watchPeerOpen(me);
    room.connect = () => {
      if (peer !== me || hostConn || room.closed) return;
      if (!me.open) return peerResume();
      const c = me.connect(PEER_PREFIX + code, { reliable: true });
      hostConn = c;
      hostSeen = Date.now();
      c.on("open", () => {
        hostSeen = Date.now();
        send(c, { type: "hello", name: nick(), pid: room.pid, results: versus && versus.kind === "battle" ? versus.results : null });
      });
      c.on("data", (m) => {
        if (hostConn !== c) return;
        hostSeen = Date.now();
        reconnectTries = 0;
        guestData(m);
      });
      c.on("close", () => { if (hostConn === c) guestLost(); });
    };
    me.on("open", () => room.connect());
    me.on("disconnected", () => { if (!document.hidden) setTimeout(peerResume, 1000); });
    me.on("error", (e) => {
      if (peer !== me) return;
      // A szobát nyitó épp átválthatott a csevegőbe a link elküldéséhez, vagy újratölt: adunk neki időt.
      if (e.type === "peer-unavailable") {
        hostConn = null;
        return guestLost();
      }
      if (SOFT_PEER_ERRORS.includes(e.type) && !me.destroyed) return;
      battleStatus("Hiba a kapcsolatban: " + (e.type || e.message), true);
    });
  }

  // A szobát nyitó nem érhető el: egy darabig újra próbáljuk, utána feladjuk.
  let reconnectTimer = 0, reconnectTries = 0;
  function guestLost() {
    hostConn = null;
    if (!room || room.closed) return;
    clearTimeout(reconnectTimer);
    if (reconnectTries++ >= 20) {
      room.closed = true;
      if (versus && versus.kind === "battle") {
        versus.opps.forEach((o) => { o.gone = true; });
        toast("Megszakadt a kapcsolat a szobával.");
        vsRefresh();
      } else battleStatus("Nincs ilyen szoba (vagy már bezárt).", true);
      return;
    }
    if (bt.dialog.open) battleStatus(room.players ? "Újracsatlakozás…" : "Várakozás a szobára…");
    reconnectTimer = setTimeout(() => { if (room && room.connect) room.connect(); }, 3000);
  }

  function guestData(m) {
    if (!m || typeof m !== "object") return;
    if (m.type === "lobby" && Array.isArray(m.players)) {
      room.players = m.players.slice(0, MAX_PLAYERS).map((p) => ({ id: String(p.id), name: cleanName(p.name) }));
      room.cat = String(m.cat || "").slice(0, 30);
      room.len = +m.len || VS_SONGS;
      if (bt.dialog.open) renderLobby();
    } else if (m.type === "full" || m.type === "running") {
      room.closed = true;
      battleStatus(m.type === "full" ? "Ez a szoba már tele van." : "Ebben a szobában már megy a meccs.", true);
    } else if ((m.type === "start" || m.type === "sync") && Array.isArray(m.ids) && Array.isArray(m.players)) {
      const ids = m.ids.map(Number).filter((n) => n > 0).slice(0, Math.max(...BATTLE_LENGTHS));
      const cat = String(m.cat || "").slice(0, 30);
      const players = m.players.slice(0, MAX_PLAYERS).filter((p) => p && String(p.id) !== room.pid)
        .map((p) => ({ id: String(p.id), name: cleanName(p.name), results: cleanResults(p.results), gone: !!p.gone, rematch: !!p.rematch }));
      const same = versus && versus.kind === "battle" && versus.ids.join() === ids.join();
      if (m.type === "start" || !same) {
        if (bt.dialog.open) bt.dialog.close("started");
        // Ha a mentett állásunk elveszett, a szobát nyitótól kapjuk vissza a saját eredményeinket.
        const own = m.type === "sync" && m.players.find((p) => p && String(p.id) === room.pid);
        const results = own ? cleanResults(own.results) : [];
        const resume = results.length ? { idx: Math.min(results.filter(Boolean).length, ids.length - 1), results } : null;
        startVersus("battle", ids, players.map((p) => ({ ...p, rematch: false })), cat, resume);
      } else {
        // Újracsatlakozás után: a többiek állása a szobát nyitótól jön.
        for (const p of players) {
          const o = versus.opps.find((x) => x.id === p.id);
          if (o) Object.assign(o, { results: p.results, gone: p.gone, rematch: p.rematch });
          else versus.opps.push({ ...p, live: {} });
        }
        vsRefresh();
      }
    } else if (m.type === "progress") {
      applyProgress(String(m.from), m);
    } else if (m.type === "rematch") {
      applyRematch(String(m.from));
    } else if (m.type === "left" && versus) {
      const o = versus.opps.find((x) => x.id === String(m.from));
      if (o && !o.gone) {
        o.gone = true;
        toast(`${o.name} kilépett a párbajból.`);
        vsRefresh();
      }
    } else if (m.type === "bye") {
      // A szobát nyitó kilépett: a többiekkel sem tudunk már beszélni.
      room.closed = true;
      if (versus && versus.kind === "battle") {
        versus.opps.forEach((o) => { o.gone = true; });
        toast("A szobát nyitó kilépett – a meccset egyedül fejezed be.");
        vsRefresh();
      } else battleStatus("A szobát nyitó kilépett.", true);
    }
  }

  // ----- Közös -----
  function cleanResults(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, Math.max(...BATTLE_LENGTHS)).map((r) => (r && typeof r === "object"
      ? cleanResult(!!r.won, Math.max(0, Math.min(MAX_TRIES, Math.floor(+r.tries) || 0)))
      : null));
  }

  // A pontot a tippek számából számoljuk újra, így a küldött pontszám nem írható át.
  const cleanResult = (won, tries) => (won && tries ? { won: true, pts: POINTS[tries - 1], tries } : { won: false, pts: 0, tries });

  function applyProgress(from, m) {
    if (!versus || versus.kind !== "battle") return;
    const o = versus.opps.find((x) => x.id === from);
    const i = +m.idx;
    if (!o || !(i >= 0 && i < versus.ids.length)) return;
    o.live[i] = { attempts: +m.attempts || 0 };
    if (m.done) o.results[i] = cleanResults([m])[0];
    vsRefresh(true);
  }

  function applyRematch(from) {
    if (!versus || versus.kind !== "battle") return;
    const o = versus.opps.find((x) => x.id === from);
    if (!o || o.rematch) return;
    o.rematch = true;
    if (!versus.rematchMe) toast(`${o.name} visszavágót kér!`);
    vsRefresh();
  }

  // Visszavágó csak akkor indul, ha mindenki kérte; addig az eredményablak marad.
  function vsRematch() {
    if (!versus || versus.rematchMe) return;
    versus.rematchMe = true;
    sendOut({ type: "rematch" });
    hostMaybeRematch();
    renderVsResult();
  }

  function vsSendProgress() {
    if (!versus || versus.kind !== "battle") return;
    const r = versus.results[versus.idx];
    sendOut({ type: "progress", idx: versus.idx, attempts: round.attempts.length, done: !!r, won: r && r.won, pts: r ? r.pts : 0, tries: r ? r.tries : 0 });
    saveBattle();
  }

  // Valakinek változott az állása: sáv, sor, eredmény frissítése; ha rá vártunk, jöhet a következő dal.
  function vsRefresh(animate) {
    if (!versus) return;
    renderVsBar();
    renderStreak();
    if (round && round.done) {
      updateNextButton();
      if (vsOver()) renderVsSummary(!!animate);
    }
    if (vr.dialog.open) renderVsResult();
    if (versus.waiting && !vsWaitingFor().length) {
      versus.waiting = false;
      vsNext();
    }
    saveBattle();
  }

  // Életjel mindkét irányba; a néma kapcsolatot bontjuk.
  setInterval(() => {
    if (!peer) return;
    const now = Date.now();
    if (peerHost) {
      for (const g of [...guests.values()]) {
        send(g.conn, { type: "ping" });
        if (now - g.seen > PEER_TIMEOUT_MS) hostDrop(g.conn);
      }
    } else if (hostConn && hostConn.open) {
      send(hostConn, { type: "ping" });
      if (now - hostSeen > PEER_TIMEOUT_MS) {
        try { hostConn.close(); } catch { /* már zárva */ }
        guestLost();
      }
    }
  }, PING_MS);

  $("battleHostBtn").addEventListener("click", () => battleHost());
  $("battleJoinBtn").addEventListener("click", () => battleJoin());
  bt.go.addEventListener("click", hostStartMatch);
  bt.code.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); battleJoin(); } });
  $("battleShareBtn").addEventListener("click", () => shareText(`Songdle HU ⚔️ Párbaj! Gyere, játsszunk: kód ${room ? room.code : ""}\n${battleLink(room ? room.code : "")}`));
  bt.dialog.addEventListener("close", () => {
    saveNick();
    // Ha meccs nélkül zárta be, a szobából is kilépünk.
    if (bt.dialog.returnValue !== "started" && !(versus && versus.kind === "battle")) {
      sendOut({ type: "bye" });
      peerClose();
      room = null;
    }
  });

  // Újratöltés után a félbehagyott párbaj folytatódik (ugyanazzal a kóddal és játékos-azonosítóval).
  function resumeBattle() {
    const s = loadBattle();
    if (!s || !Array.isArray(s.ids) || !s.ids.length || typeof s.code !== "string") return false;
    peerHost = !!s.host;
    room = { code: s.code, pid: s.pid };
    startVersus("battle", s.ids.map(decId).filter(Boolean), (s.opps || []).map((o) => ({ ...o, results: cleanResults(o.results) })), s.cat || "", s);
    if (peerHost) {
      battleHost(0, s.code);
      // Akik fél percen belül nem jönnek vissza, kiesnek (különben örökké várnánk rájuk).
      setTimeout(() => {
        if (!versus || versus.kind !== "battle") return;
        versus.opps.forEach((o) => { if (!guests.has(o.id)) o.gone = true; });
        broadcastSync();
        vsRefresh();
      }, 30000);
    } else battleJoin({ code: s.code, pid: s.pid });
    return true;
  }

  // ---------- Streamer vs Chat (Twitch) ----------
  // A streamer és a chat (egy játékosként) ugyanazt a dalt játssza, közös részlethosszal.
  // Körönként a streamer rejtve lezárja a tippjét, utána a chat 20–30 másodpercig szavaz
  // (!tipp dalcím / !skip); a legtöbb szavazatot kapott tipp a chaté. A pont a tippek számától
  // függ, mint a játékban. Bárki szavazhat a chatből, nézőnként egy szavazat (az utolsó számít).
  const STREAM_WINDOWS = [20, 25, 30];
  // Tippelés módja: „type” = beírós (a streamer külön tipp-ablakban ír, javaslatokkal),
  // „choice” = választós (6 lehetőség, a streamer a számbillentyűvel választ, a chat a számot írja).
  const STREAM_STYLES = ["type", "choice"];
  const CHOICE_N = 6;
  const STREAM_BOTS = new Set(["nightbot", "streamelements", "moobot", "fossabot", "streamlabs", "wizebot", "sery_bot", "soundalerts", "botrixoficial", "kofistreambot"]);
  // { channel, cat, catLabel, len, win, ids, idx, me, chat, cur, mvp: Map(néző → { name, pts, hits }), calls: [név], timer }
  // cur (az aktuális dal): { stage, heard, phase: "play" | "vote" | "bonus" | "bvote" | "done", pending,
  //   me / chat: { attempts, done, won }, votes: Map(néző → szavazat), lastTally, calledIt, rewarded, bonus, mePts, chatPts }
  let stream = null;

  const sd = {
    dialog: $("streamDialog"), channel: $("streamChannel"), catBtn: $("streamCatBtn"),
    len: $("streamLen"), win: $("streamWin"), style: $("streamStyle"), styleNote: $("streamStyleNote"),
    status: $("streamStatus"), go: $("streamGoBtn"),
  };
  const st = {
    me: $("stMe"), chat: $("stChat"), vote: $("stVote"), voteTitle: $("stVoteTitle"), voteHelp: $("stVoteHelp"),
    voteTime: $("stVoteTime"), voteCount: $("stVoteCount"), closeVote: $("stCloseVote"), hint: $("stHint"),
    meList: $("stMeList"), chatList: $("stChatList"), bars: $("stBars"), mvp: $("stMvp"), openVote: $("stOpenVote"),
    popBtn: $("stPopBtn"), choices: $("stChoices"),
  };
  const sdStatus = (msg, isError) => {
    sd.status.textContent = msg || "";
    sd.status.classList.toggle("error", !!isError);
  };

  // ----- Beállítás -----
  const streamCatId = () => {
    const id = load("streamCat", "all");
    return allCats.some((c) => c.id === id) ? id : "all";
  };
  const streamLen = () => (BATTLE_LENGTHS.includes(load("streamLen", 10)) ? load("streamLen", 10) : 10);
  const streamWin = () => (STREAM_WINDOWS.includes(load("streamWin", 25)) ? load("streamWin", 25) : 25);
  const streamStyle = () => (STREAM_STYLES.includes(load("streamStyle", "type")) ? load("streamStyle", "type") : "type");

  function settingChips(box, list, current, label, key) {
    box.innerHTML = "";
    for (const n of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = label(n);
      b.setAttribute("aria-pressed", String(n === current));
      b.addEventListener("click", () => { save(key, n); renderStreamSetup(); });
      box.appendChild(b);
    }
  }
  function renderStreamSetup() {
    const c = fillCatPill(sd.catBtn, streamCatId(), "Mit játszunk?");
    sd.catBtn.setAttribute("aria-label", `Mit játszunk: ${c.label}. Váltás`);
    settingChips(sd.len, BATTLE_LENGTHS, streamLen(), (n) => `${n} dal`, "streamLen");
    settingChips(sd.win, STREAM_WINDOWS, streamWin(), (n) => `${n} mp`, "streamWin");
    settingChips(sd.style, STREAM_STYLES, streamStyle(), (k) => (k === "type" ? "🪟 Beírós" : "🔢 Választós"), "streamStyle");
    sd.styleNote.textContent = streamStyle() === "type"
      ? "Külön tipp-ablakban írod be a címet, javaslatokkal. Azt az ablakot ne mutasd a streamen (OBS: csak a játék ablakát vedd fel)."
      : `${CHOICE_N} lehetőség látszik. Te a számbillentyűvel választasz (nem látszik, melyiket), a chat a számot írja (1–${CHOICE_N}).`;
  }
  function openStreamSetup() {
    sd.channel.value = load("streamChannel", "");
    renderStreamSetup();
    resetStreamGo();
    sdStatus("");
    sd.dialog.showModal();
  }
  sd.catBtn.addEventListener("click", () => openCatSheet({
    current: streamCatId(),
    title: "Mit játszunk?",
    withHard: false,
    onPick: (id) => { save("streamCat", id); renderStreamSetup(); },
  }));
  // Élő-e most a csatorna (decapi.me, nyilvános). true / false, vagy null, ha nem derül ki.
  async function twitchLive(channel) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(`https://decapi.me/twitch/uptime/${channel}`, { signal: ctrl.signal });
      const text = (await r.text()).toLowerCase();
      if (!r.ok) return null;
      if (text.includes("offline")) return false;
      return /\d+\s*(second|minute|hour|day)/.test(text) ? true : null;
    } catch {
      return null;
    }
  }

  let sdOffline = ""; // ennek a csatornának már szóltunk, hogy offline: a második kattintás elindítja
  function resetStreamGo() {
    sdOffline = "";
    sd.go.disabled = false;
    sd.go.textContent = "Indítás";
  }
  async function streamGo() {
    if (sd.go.disabled) return;
    // A csatorna neve vagy a teljes link (twitch.tv/nev) is jó.
    const m = sd.channel.value.trim().toLowerCase().match(/^(?:https?:\/\/)?(?:www\.)?(?:twitch\.tv\/)?#?([a-z0-9_]{3,25})\/?$/);
    if (!m) return sdStatus("Add meg a Twitch-csatornád nevét (pl. csatornanev vagy twitch.tv/csatornanev)!", true);
    const channel = m[1];
    save("streamChannel", channel);
    if (sdOffline === channel && tw && tw.channel === channel && tw.state === "ok") return streamLaunch(channel);
    resetStreamGo();
    sd.go.disabled = true;
    sd.go.textContent = "Csatlakozás…";
    sdStatus(`🟠 Csatlakozás a #${channel} chathez…`);
    const live = twitchLive(channel);
    if (!tw || tw.channel !== channel || tw.state !== "ok") twConnect(channel);
    const state = await twWait(tw, TW_JOIN_MS + 4000);
    // Közben bezárta az ablakot vagy másik csatornát írt be.
    if (!sd.dialog.open || !tw || tw.channel !== channel) return;
    resetStreamGo();
    if (state === "missing") {
      twClose();
      return sdStatus(`❌ Nincs ilyen Twitch-csatorna: #${channel}. Ellenőrizd a nevet!`, true);
    }
    if (state !== "ok") {
      twClose();
      return sdStatus("❌ Nem sikerült elérni a Twitch chatet. Ellenőrizd a netet, és próbáld újra!", true);
    }
    if ((await live) === false) {
      if (!sd.dialog.open) return;
      sdOffline = channel;
      sd.go.textContent = "Indítás így is";
      return sdStatus(`🟢 Megvan a #${channel} chat, de a csatorna most nem élő. A chat csak adás közben tud szavazni.`);
    }
    streamLaunch(channel);
  }
  function streamLaunch(channel) {
    sd.dialog.close();
    startStream(channel);
    toast(`🟢 Csatlakozva a #${channel} chathez!`);
  }
  sd.go.addEventListener("click", streamGo);
  sd.channel.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); streamGo(); } });
  sd.channel.addEventListener("input", () => { if (!sd.go.disabled) { resetStreamGo(); sdStatus(""); } });
  // Útmutató: a beállításból és a súgóból is nyílik (a másik ablak fölött).
  const guideDialog = $("streamGuideDialog");
  for (const b of document.querySelectorAll("[data-stream-guide]")) {
    b.addEventListener("click", () => {
      guideDialog.showModal();
      guideDialog.querySelector("form").scrollTop = 0;
      countEvent("stream-guide");
    });
  }
  $("streamCopyRules").addEventListener("click", async () => {
    const text = "🎵 Songdle – a chat a streamer ellen játszik! Szavazáskor írd: !tipp dalcím (választósnál csak a számot: 1–6), kihagyás: !skip, "
      + "bónusznál: 1, 2, 3 vagy 4. A legtöbb szavazatot kapott tipp a chaté. Aki a jó dalra szavaz, MVP-pontot kap! songdle.hu";
    toast(await copyText(text) ? "Másolva – illeszd be a chatbe! 📋" : "Nem sikerült másolni.");
  });

  // Mégse: ha nem indult meccs, a félbehagyott chatkapcsolatot is bontjuk.
  // (A close esemény később fut le: ha közben újra megnyitották, már nem bontunk.)
  sd.dialog.addEventListener("close", () => {
    if (sd.dialog.open) return;
    if (!stream) twClose();
    resetStreamGo();
  });

  function startStream(channel) {
    if (mode === "versus") closeVersus();
    if (stream) clearInterval(stream.timer);
    const cat = streamCatId();
    stream = {
      channel, cat, catLabel: cat === "all" ? "" : catLabel(cat), len: streamLen(), win: streamWin(), style: streamStyle(),
      ids: null, idx: 0, me: 0, chat: 0, cur: null, mvp: new Map(), calls: [], timer: 0,
    };
    if (!tw || tw.channel !== channel) twConnect(channel);
    document.body.dataset.streamStyle = stream.style;
    if (stream.style !== "type") closeGuessWindow();
    mode = "stream";
    renderMode();
    renderCategories();
    enterMode();
    countEvent("stream-start");
  }

  function leaveStream() {
    closeStream();
    mode = load("mode", "endless");
    renderMode();
    renderCategories();
    enterMode();
  }
  function closeStream() {
    if (stream) clearInterval(stream.timer);
    if (sr.dialog.open) sr.dialog.close();
    twClose();
    closeGuessWindow();
    delete document.body.dataset.streamStyle;
    stream = null;
  }

  // ----- Dalok -----
  function streamStartSong() {
    if (!stream.ids) {
      stream.ids = pickSet(pool, stream.len);
      // Kis kategóriában kevesebb dal is lehet.
      if (stream.ids.length < stream.len) { stream.len = stream.ids.length; renderMode(); }
    }
    const t = pool.find((p) => p.id === stream.ids[stream.idx]);
    if (!t) return setStatus("Ebben a kategóriában most nincs elég dal. Válassz másikat!", true);
    const side = () => ({ attempts: [], done: false, won: false });
    stream.cur = {
      stage: 0, heard: -1, phase: "play", pending: null, me: side(), chat: side(),
      votes: new Map(), lastTally: null, calledIt: null, rewarded: new Set(), bonus: null, mePts: 0, chatPts: 0,
      options: stream.style === "choice" ? makeChoices(t) : null, marks: [],
    };
    renderStream();
    startRound(t);
  }

  function streamSongReady() {
    streamControls();
    renderStream();
    setStatus(stream.style === "choice"
      ? `Játszd le a részletet, aztán nyomd meg a számot (1–${CHOICE_N}), vagy hagyd ki!`
      : "Játszd le a részletet, aztán zárd le a tipped (vagy hagyd ki)!");
  }

  // Választós mód: a jó dal mellé legfeljebb 2 dal ugyanattól az előadótól (hogy ne legyen túl könnyű),
  // a többi más előadóktól. Minden cím különböző, a sorrend véletlen.
  function makeChoices(t) {
    const who = (p) => norm(p.src || p.artist);
    const titles = new Set([t.base]);
    const pick = (list, n) => {
      const out = [];
      for (const p of shuffle(list.slice())) {
        if (out.length >= n) break;
        if (titles.has(p.base)) continue;
        titles.add(p.base);
        out.push(p);
      }
      return out;
    };
    const same = pick(pool.filter((p) => p !== t && who(p) === who(t)), 2);
    const rest = pick(pool.filter((p) => who(p) !== who(t)), CHOICE_N - 1 - same.length);
    return shuffle([t, ...same, ...rest]);
  }

  // A streamer választása: a gomb nem jelöli meg, melyiket nyomta (a chat nem láthatja).
  function streamPickChoice(i) {
    const c = stream && stream.cur;
    if (!c || !c.options || !c.options[i] || c.phase !== "play" || c.me.done || c.pending || round.done) return;
    const o = c.options[i];
    streamLock({ type: judge(o, round.track), label: `${i + 1}. ${trackLabel(o)}`, key: o.key, opt: i });
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  // Számbillentyűk: választós módban a lehetőség, a bónusznál a válasz.
  document.addEventListener("keydown", (e) => {
    if (mode !== "stream" || !stream || !stream.cur || document.querySelector("dialog[open]")) return;
    if (e.target === el.input || e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const c = stream.cur, i = +e.key - 1;
    if (c.phase === "bonus" && c.bonus && i < c.bonus.options.length) { e.preventDefault(); streamPickBonus(i); }
    else if (c.phase === "play" && c.options && i < c.options.length) { e.preventDefault(); streamPickChoice(i); }
  });

  // A beviteli mező és a gombok állapota: tippelni csak a részlet meghallgatása után lehet.
  function streamControls() {
    if (!stream || !stream.cur || !round || round.mode !== "stream") return;
    const c = stream.cur;
    const canLock = c.phase === "play" && !c.me.done && !c.pending && !round.done;
    const heard = c.heard === c.stage;
    el.controls.hidden = c.me.done || round.done;
    el.input.disabled = !canLock;
    el.skipBtn.disabled = !canLock || !heard;
    el.playBtn.disabled = false;
    updateSubmit();
    st.openVote.hidden = !(c.phase === "play" && c.me.done && !c.chat.done && !round.done);
    st.openVote.disabled = !heard;
    renderGuessWindow();
  }

  // A streamer tippje rejtve lezárul; ezután a chat szavaz (ha még játszik).
  function streamLock(attempt) {
    const c = stream.cur;
    if (c.phase !== "play" || c.me.done || c.pending) return;
    if (c.heard !== c.stage) {
      retrigger(el.input, "shake");
      return setStatus("Előbb játszd le a részletet, hogy a chat is hallja!", true);
    }
    c.pending = attempt;
    el.input.blur();
    if (c.chat.done) return resolveStage(null);
    openVote("song");
  }
  st.openVote.addEventListener("click", () => {
    const c = stream && stream.cur;
    if (c && c.phase === "play" && c.me.done && !c.chat.done && c.heard === c.stage) openVote("song");
  });

  // ----- Szavazás -----
  function openVote(kind) {
    const c = stream.cur;
    c.phase = kind === "song" ? "vote" : "bvote";
    c.votes = new Map();
    c.voteEnd = Date.now() + stream.win * 1000;
    clearInterval(stream.timer);
    stream.timer = setInterval(voteTick, 250);
    streamControls();
    renderStream();
    voteTick();
    setStatus(kind === "song" ? "🔒 Lezártad a tipped. Most a chat szavaz!" : "🔒 Lezártad. Most a chat válaszol!");
  }
  function voteTick() {
    const c = stream && stream.cur;
    if (!c || (c.phase !== "vote" && c.phase !== "bvote")) return;
    const left = Math.max(0, Math.ceil((c.voteEnd - Date.now()) / 1000));
    st.voteTime.textContent = left;
    st.voteCount.textContent = `${c.votes.size} szavazat`;
    if (left <= 0) closeVote();
  }
  function closeVote() {
    const c = stream.cur;
    clearInterval(stream.timer);
    if (c.phase === "vote") resolveStage(tallyVotes((v) => (v.skip ? "skip" : v.track.key)));
    else if (c.phase === "bvote") resolveBonus(tallyVotes((v) => v.opt));
  }
  st.closeVote.addEventListener("click", () => { if (stream && stream.cur) closeVote(); });

  // Szavazatok csoportosítva, a legtöbbtől; egyenlőségnél az nyer, akire előbb szavaztak.
  function tallyVotes(keyOf) {
    const groups = new Map();
    for (const [uid, v] of stream.cur.votes) {
      const k = keyOf(v);
      if (!groups.has(k)) groups.set(k, { k, v, n: 0, first: v.ts, users: [] });
      const g = groups.get(k);
      g.n++;
      g.first = Math.min(g.first, v.ts);
      g.users.push(uid);
    }
    return { list: [...groups.values()].sort((a, b) => b.n - a.n || a.first - b.first), total: stream.cur.votes.size };
  }

  // Egy chatüzenet: szavazat a dalra (!tipp …, röviden !t; !skip) vagy a bónuszkérdésre (1–4).
  function streamChat(user, text) {
    const c = stream && stream.cur;
    if (!c || STREAM_BOTS.has(user.login) || user.login === stream.channel) return;
    const msg = text.trim();
    let vote = null, m;
    if (c.phase === "vote") {
      if (/^!(skip|kihagy|passz)\b/i.test(msg)) vote = { skip: true };
      else if (c.options) {
        // Választós: a szám (3, !3, !tipp 3), vagy a lehetőségek egyikének címe.
        let i = -1;
        if ((m = msg.match(/^!?(?:(?:t|tipp|g|guess)\s*)?([1-9])$/i))) i = +m[1] - 1;
        else if ((m = msg.match(/^!(?:t|tipp|g|guess)\s+(.{2,100})$/i))) {
          const t = chatMatch(m[1]);
          i = t ? c.options.indexOf(t) : -1;
        }
        if (!c.options[i]) return;
        vote = { track: c.options[i] };
        if (!c.calledIt && judge(vote.track, round.track) === "right") c.calledIt = user.name;
      } else if ((m = msg.match(/^!(?:t|tipp|g|guess)\s+(.{2,100})$/i))) {
        const t = chatMatch(m[1]);
        if (!t) return;
        vote = { track: t };
        // Az első néző, aki eltalálta (akkor is, ha a többség mást választott).
        if (!c.calledIt && judge(t, round.track) === "right") c.calledIt = user.name;
      } else return;
    } else if (c.phase === "bvote") {
      if (!(m = msg.match(/^!?([1-4])$/))) return;
      vote = { opt: +m[1] - 1 };
    } else return;
    vote.ts = Date.now();
    vote.name = user.name;
    c.votes.set(user.id, vote);
    voteTick();
  }

  // A chat szövege a dallistában: a játék keresője, elírásnál a címhez legközelebbi dal.
  function chatMatch(text) {
    const q = norm(text);
    const hits = search(text, true);
    // A pontosan így hívott dal előnyt kap („Képzeld el” ne a „Képzeld el és megkapod!” legyen).
    const isExact = (t) => t.nTitle === q || norm(t.base) === q;
    const exact = hits.find(isExact) || pool.find(isExact);
    if (exact || hits[0]) return exact || hits[0];
    if (q.length < 4) return null;
    let best = null, bestD = Math.floor(q.length / 6) + 2;
    for (const t of pool) {
      if (Math.abs(t.nTitle.length - q.length) >= bestD) continue;
      const d = editDistance(q, t.nTitle, bestD);
      if (d < bestD) { best = t; bestD = d; }
    }
    return best;
  }
  function editDistance(a, b, cap) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        rowMin = Math.min(rowMin, cur[j]);
      }
      if (rowMin >= cap) return cap;
      prev = cur;
    }
    return prev[b.length];
  }

  // ----- Kör vége: mindkét fél tippje kiderül -----
  const sideDone = (s, a) => {
    if (a.type === "right") { s.done = true; s.won = true; } else if (s.attempts.length >= MAX_TRIES) s.done = true;
  };
  function resolveStage(tally) {
    const c = stream.cur, ans = round.track;
    // Választósnál a rossz tippek a lehetőségeken is látszanak (a jót csak a dal végén mutatjuk).
    const mark = (a, side) => { if (a.opt !== undefined && a.type !== "right") c.marks.push({ i: a.opt, side }); };
    if (c.pending && !c.me.done) {
      c.me.attempts.push(c.pending);
      sideDone(c.me, c.pending);
      mark(c.pending, "me");
    }
    c.pending = null;
    if (tally) {
      const top = tally.list[0];
      const opt = top && top.v.track && c.options ? c.options.indexOf(top.v.track) : -1;
      const a = !top || top.k === "skip" ? { type: "skip" }
        : { type: judge(top.v.track, ans), label: (opt >= 0 ? `${opt + 1}. ` : "") + trackLabel(top.v.track), key: top.v.track.key };
      if (opt >= 0) a.opt = opt;
      mark(a, "chat");
      a.share = top ? Math.round((top.n / tally.total) * 100) : 0;
      a.votes = tally.total;
      c.chat.attempts.push(a);
      sideDone(c.chat, a);
      c.lastTally = { stage: c.stage, ...tally };
      // MVP: aki a helyes dalra szavazott, dalonként egyszer megkapja a kör pontját (korábban több).
      for (const g of tally.list) {
        if (!g.v.track || judge(g.v.track, ans) !== "right") continue;
        for (const uid of g.users) {
          if (c.rewarded.has(uid)) continue;
          c.rewarded.add(uid);
          const p = stream.mvp.get(uid) || { name: c.votes.get(uid).name, pts: 0, hits: 0 };
          p.pts += POINTS[c.stage];
          p.hits++;
          stream.mvp.set(uid, p);
        }
      }
    }
    if (c.me.done && c.chat.done) return streamEndSong();
    c.stage++;
    c.phase = "play";
    stopAudio();
    renderAll(true);
    retrigger(el.clipLen, "bump");
    el.playBtn.classList.add("pulse");
    streamControls();
    renderStream();
    setStatus(`Most már ${currentLength()} mp-et hallhattok. Játszd le újra!`);
  }

  async function streamEndSong() {
    const c = stream.cur, r = round;
    c.phase = "bonus";
    r.done = true;
    r.won = c.me.won;
    const pts = (s) => (s.won ? POINTS[s.attempts.length - 1] : 0);
    c.mePts = pts(c.me);
    c.chatPts = pts(c.chat);
    stream.me += c.mePts;
    stream.chat += c.chatPts;
    if (c.calledIt) stream.calls.push(c.calledIt);
    stopAudio();
    buildWave(false);
    renderAll(true);
    showDone(true);
    hideAlbum();
    renderStreamReveal();
    renderStream();
    streamControls();
    updateNextButton();
    if (c.mePts || c.chatPts) confetti();
    setStatus("Koppints a lemezre a teljes előnézethez.");
    // Bónuszkérdés: a dalt eltaláló fél(ek) +25 pontért; a streamer itt is előbb zár le.
    const b = c.me.won || c.chat.won ? await makeBonus(r) : null;
    if (!stream || stream.cur !== c) return;
    if (!b) return streamDone();
    c.bonus = { ...b, me: null, chat: null, resolved: false };
    if (c.me.won) {
      renderStreamBonus();
      setStatus("🎯 Bónusz: válaszolj, utána a chat jön!");
    } else openVote("bonus");
    renderStreamBonus();
  }

  function streamPickBonus(i) {
    const c = stream.cur;
    if (!c.bonus || c.bonus.resolved || c.bonus.me !== null || c.phase !== "bonus") return;
    c.bonus.me = i;
    if (c.chat.won) openVote("bonus");
    else resolveBonus(null);
    renderStreamBonus();
  }

  function resolveBonus(tally) {
    const c = stream.cur, b = c.bonus, right = b.options.indexOf(b.answer);
    if (tally) {
      b.chat = tally.list.length ? tally.list[0].k : null;
      b.tally = tally;
    }
    b.resolved = true;
    if (c.me.won && b.me === right) { c.mePts += BONUS_PTS; stream.me += BONUS_PTS; }
    if (c.chat.won && b.chat === right) { c.chatPts += BONUS_PTS; stream.chat += BONUS_PTS; }
    renderStreamBonus();
    streamDone();
  }

  function streamDone() {
    const c = stream.cur;
    c.phase = "done";
    clearInterval(stream.timer);
    revealAlbum(round);
    renderStreamReveal();
    renderStream();
    renderRoundPoints();
    streamControls();
    updateNextButton();
    setStatus(stream.idx + 1 < stream.ids.length ? "Jöhet a következő dal!" : "Vége a meccsnek – nézzük az eredményt!");
  }

  function streamNext() {
    const c = stream && stream.cur;
    if (!c || c.phase !== "done") return;
    if (stream.idx + 1 >= stream.ids.length) return openStreamResult();
    stream.idx++;
    streamStartSong();
  }

  // ----- Megjelenítés -----
  const sideText = (s, won) => (won ? `${s.attempts.length}. tippre` : "nem találta");
  function renderStreamReveal() {
    const c = stream.cur, t = round.track;
    el.revealResult.textContent = `🎬 Streamer: ${sideText(c.me, c.me.won)} · 💬 Chat: ${sideText(c.chat, c.chat.won)}`;
    el.revealResult.classList.toggle("lost", !c.me.won && !c.chat.won);
    el.revealTitle.textContent = t.title;
    el.revealArtist.textContent = artistLine(t);
    el.revealEmoji.textContent = `🎬 ${emojiRow(c.me)}  💬 ${emojiRow(c.chat)}`;
    el.revealPoints.textContent = `🎬 +${c.mePts} · 💬 +${c.chatPts}`;
    el.revealSet.hidden = !c.calledIt;
    el.revealSet.textContent = c.calledIt ? `🎯 Elsőként eltalálta: ${c.calledIt}` : "";
    el.reveal.hidden = false;
    retrigger(el.reveal, "in");
    renderReportBtn();
  }

  function renderStreamBonus() {
    const c = stream.cur, b = c.bonus;
    if (!b) return;
    el.bonus.hidden = false;
    el.bonus.classList.remove("pending");
    const right = b.options.indexOf(b.answer);
    const q = b.kind === "year" ? "melyik évben jelent meg?" : "melyik albumon van?";
    if (b.resolved) {
      const res = (won, pick) => (!won ? "–" : pick === right ? `✓ +${BONUS_PTS}` : "✗");
      el.bonusQ.textContent = `🎯 Bónusz · 🎬 ${res(c.me.won, b.me)} · 💬 ${res(c.chat.won, b.chat)}`;
    } else {
      el.bonusQ.textContent = `🎯 Bónuszkérdés (+${BONUS_PTS} pont): ${q}`
        + (c.phase === "bonus" && c.me.won && b.me === null ? " – a streamer válaszol" : c.phase === "bvote" ? " – a chat szavaz (1–4)" : "");
    }
    el.bonusOpts.innerHTML = "";
    el.bonusOpts.classList.toggle("albums", b.kind === "album");
    b.options.forEach((o, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = `${i + 1}. ${o}`;
      const open = c.phase === "bonus" && c.me.won && b.me === null;
      btn.disabled = !open;
      if (open) btn.addEventListener("click", () => streamPickBonus(i));
      if (b.resolved) {
        if (i === right) btn.classList.add("right");
        else if (i === b.me || i === b.chat) btn.classList.add("wrong");
        const tags = [b.me === i && "🎬", b.chat === i && "💬"].filter(Boolean).join("");
        if (tags) btn.textContent += " " + tags;
      }
      el.bonusOpts.appendChild(btn);
    });
    renderStream();
  }

  // A tábla: a két fél tippjei körönként. A helyes tipp a dal végéig rejtve marad.
  function renderStream() {
    if (!stream) return;
    const c = stream.cur;
    st.me.textContent = stream.me;
    st.chat.textContent = stream.chat;
    renderRoundPoints();
    if (!c) return;
    const over = c.phase === "bonus" || c.phase === "bvote" || c.phase === "done";
    const fill = (list, side, isMe) => {
      list.innerHTML = "";
      for (let i = 0; i <= Math.min(c.stage, MAX_TRIES - 1); i++) {
        const a = side.attempts[i];
        if (!a && (side.done || over)) break;
        const li = document.createElement("li");
        const mark = document.createElement("span");
        mark.className = "mark";
        const label = document.createElement("span");
        label.className = "label";
        if (a) {
          li.className = a.type;
          mark.textContent = { right: "✓", wrong: "✗", near: "~", skip: "»" }[a.type];
          if (a.type === "right" && !over) label.textContent = "Megvan! (titok a dal végéig)";
          else if (a.type === "skip") label.textContent = isMe ? "Kihagyva" : a.votes ? `Kihagyás · ${a.share}%` : "Nem szavazott senki";
          else label.textContent = a.label + (isMe ? "" : ` · ${a.share}%`);
        } else {
          li.className = "pending";
          mark.textContent = "…";
          label.textContent = isMe
            ? (c.pending ? "🔒 Lezárva" : "Gondolkodik…")
            : (c.phase === "vote" ? "🗳️ Szavaz…" : "Vár a streamerre…");
        }
        label.title = label.textContent;
        li.append(mark, label);
        list.appendChild(li);
      }
    };
    fill(st.meList, c.me, true);
    fill(st.chatList, c.chat, false);
    // Az előbb végző fél oszlopát üres sorokkal pótoljuk, hogy a körök egy vonalban maradjanak.
    const rows = Math.max(st.meList.children.length, st.chatList.children.length);
    for (const list of [st.meList, st.chatList]) {
      while (list.children.length < rows) {
        const li = document.createElement("li");
        li.className = "blank";
        li.setAttribute("aria-hidden", "true");
        list.appendChild(li);
      }
    }

    // Szavazás közben csak a szavazatok száma látszik, a tippek nem.
    const voting = c.phase === "vote" || c.phase === "bvote";
    st.vote.hidden = !voting;
    if (voting) {
      st.voteTitle.textContent = c.phase === "vote" ? "💬 Chat, szavazz!" : "💬 Chat, bónusz!";
      st.voteHelp.innerHTML = c.phase === "bvote" ? "Írd a chatbe: <b>1</b>, <b>2</b>, <b>3</b> vagy <b>4</b>"
        : c.options ? `Írd a chatbe a számot: <b>1–${c.options.length}</b> · kihagyás: <b>!skip</b>`
        : "Írd a chatbe: <b>!tipp dalcím</b> · kihagyás: <b>!skip</b>";
    }
    const myTurn = c.phase === "play" && !c.me.done && !c.pending;
    const gwOpen = !!(gw && !gw.win.closed);
    st.hint.hidden = !myTurn;
    st.hint.textContent = c.options ? `🙈 Ne nézd a chatet! Nyomd meg a számot (1–${c.options.length}) a billentyűzeten – nem látszik, melyiket választottad.`
      : gwOpen ? "🙈 Ne nézd a chatet! Tippelj a tipp-ablakban – azt ne mutasd a streamen."
      : "🙈 Ne nézd a chatet! Nyisd meg a tipp-ablakot (javaslatokkal), vagy írd be lent – a cím rejtve marad.";
    st.popBtn.hidden = stream.style !== "type" || !round || round.done;
    st.popBtn.textContent = gwOpen ? "🪟 Tipp-ablak nyitva – előtérbe hozás" : "🪟 Tipp-ablak megnyitása";
    document.body.classList.toggle("gw-open", gwOpen && stream.style === "type");
    renderStreamChoices();
    renderGuessWindow();

    renderStreamBars();
    renderStreamMvp();
  }

  // Az utolsó szavazás 3 legnépszerűbb tippje. A dal közben a helyes tipp neve rejtve marad.
  function renderStreamBars() {
    const c = stream.cur;
    const b = c.bonus;
    const bonusTally = b && b.resolved && b.tally;
    const t = bonusTally || c.lastTally;
    st.bars.hidden = !t || !t.total;
    if (st.bars.hidden) return;
    const over = c.phase === "bonus" || c.phase === "bvote" || c.phase === "done";
    // Választósnál a dal közben nem mutatjuk a szavazás megoszlását: a lehetőségek közül kikövetkeztethető lenne a jó.
    if (c.options && !over && !bonusTally) { st.bars.hidden = true; return; }
    st.bars.innerHTML = "";
    const head = document.createElement("p");
    head.className = "st-bars-head";
    const top = t.list[0];
    head.textContent = bonusTally
      ? `Bónusz szavazás · ${t.total} szavazat`
      : `Chat szavazás (${t.stage + 1}. kör) · ${t.total} szavazat · egyetértés ${Math.round((top.n / t.total) * 100)}%`;
    st.bars.appendChild(head);
    for (const g of t.list.slice(0, 3)) {
      const pct = Math.round((g.n / t.total) * 100);
      const row = document.createElement("div");
      row.className = "st-bar";
      const fillEl = document.createElement("i");
      fillEl.style.width = pct + "%";
      const label = document.createElement("span");
      const opt = c.options && g.v.track ? c.options.indexOf(g.v.track) : -1;
      if (bonusTally) label.textContent = `${g.k + 1}. ${b.options[g.k]}`;
      else if (g.k === "skip") label.textContent = "⏭ Kihagyás";
      else if (opt >= 0 && over) label.textContent = `${opt + 1}. ${trackLabel(g.v.track)}`;
      else if (!over && judge(g.v.track, round.track) === "right") label.textContent = "??? (titok a dal végéig)";
      else label.textContent = trackLabel(g.v.track);
      const n = document.createElement("b");
      n.textContent = `${pct}%`;
      row.append(fillEl, label, n);
      st.bars.appendChild(row);
    }
  }

  // Választós mód: a lehetőségek. A streamer választása nem látszik; a rossz tippek a kör után,
  // a jó válasz a dal végén kerül rájuk.
  function renderStreamChoices() {
    const c = stream.cur;
    st.choices.hidden = !c.options;
    if (!c.options) return;
    const over = c.phase === "bonus" || c.phase === "bvote" || c.phase === "done";
    const open = c.phase === "play" && !c.me.done && !c.pending && !!round && !round.done;
    st.choices.innerHTML = "";
    c.options.forEach((o, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "st-choice";
      b.disabled = !open;
      const n = document.createElement("b");
      n.textContent = i + 1;
      const label = document.createElement("span");
      label.textContent = trackLabel(o);
      label.title = label.textContent;
      const tags = document.createElement("small");
      tags.textContent = c.marks.filter((m) => m.i === i).map((m) => (m.side === "me" ? "🎬✗" : "💬✗")).join(" ");
      b.append(n, label, tags);
      if (over && round && judge(o, round.track) === "right") b.classList.add("right");
      else if (c.marks.some((m) => m.i === i)) b.classList.add("wrong");
      b.addEventListener("click", () => streamPickChoice(i));
      st.choices.appendChild(b);
    });
  }

  // ----- Tipp-ablak (beírós mód) -----
  // Külön böngészőablak a streamer tippjéhez, rendes javaslatlistával. Az OBS csak a játék ablakát veszi fel,
  // így ez nem kerül a streamre. Az ablakot innen építjük fel és innen kezeljük (azonos eredet).
  let gw = null; // { win, input, sugg, status, play, skip, lock, list, items, idx, sel }
  function openGuessWindow() {
    if (gw && !gw.win.closed) return gw.win.focus();
    const win = window.open("", "songdle-tipp", "popup=yes,width=460,height=640");
    if (!win) return toast("A böngésző letiltotta a felugró ablakot. Engedélyezd, vagy írd be a tipped lent (rejtve).");
    const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => `<link rel="stylesheet" href="${l.href}">`).join("");
    const d = win.document;
    d.open();
    d.write(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>🔒 Songdle – tipp-ablak</title>${css}</head><body class="gw-body"><main class="gw">
      <p class="gw-warn">🔒 Tipp-ablak – <b>ezt ne mutasd a streamen!</b></p>
      <p class="gw-status" id="gwStatus"></p>
      <button type="button" class="btn btn-ghost" id="gwPlay">▶ Részlet lejátszása</button>
      <div class="guess-box gw-box">
        <input id="gwInput" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Dal címe vagy előadó…" aria-label="Tipp">
        <ul class="suggestions glass" id="gwSugg" role="listbox" hidden></ul>
      </div>
      <div class="buttons"><button type="button" class="btn btn-ghost" id="gwSkip">Kihagyás</button><button type="button" class="btn btn-primary" id="gwLock">🔒 Lezárás</button></div>
      <ol class="guesses st-list gw-list" id="gwList"></ol>
      </main></body></html>`);
    d.close();
    const $w = (id) => d.getElementById(id);
    gw = { win, input: $w("gwInput"), sugg: $w("gwSugg"), status: $w("gwStatus"), play: $w("gwPlay"), skip: $w("gwSkip"),
      lock: $w("gwLock"), list: $w("gwList"), items: [], idx: -1, sel: null, msg: "" };
    const g = gw;
    g.input.addEventListener("input", () => { g.sel = null; g.msg = ""; gwSuggest(); });
    g.input.addEventListener("keydown", (e) => {
      const n = g.items.length;
      if (e.key === "ArrowDown" && n) { e.preventDefault(); g.idx = (g.idx + 1) % n; gwRenderSugg(); }
      else if (e.key === "ArrowUp" && n) { e.preventDefault(); g.idx = (g.idx - 1 + n) % n; gwRenderSugg(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (!g.sel && g.items[g.idx]) gwChoose(g.items[g.idx]);
        else gwLock();
      } else if (e.key === "Escape") { g.items = []; gwRenderSugg(); }
    });
    g.play.addEventListener("click", () => { if (!el.playBtn.disabled) playClip(); });
    g.skip.addEventListener("click", () => gwSubmit({ type: "skip" }));
    g.lock.addEventListener("click", gwLock);
    win.addEventListener("pagehide", () => { if (gw === g) setTimeout(renderStream, 0); });
    renderStream();
    streamControls();
    win.focus();
  }
  function closeGuessWindow() {
    if (gw && !gw.win.closed) gw.win.close();
    gw = null;
    document.body.classList.remove("gw-open");
  }
  // A főablak újratöltésekor a tipp-ablak is bezárul (a kezelői a főablakban élnek).
  window.addEventListener("pagehide", () => { if (gw && !gw.win.closed) gw.win.close(); });
  // Ha a streamer bezárja a tipp-ablakot, visszajön a lenti (rejtett) beviteli mező.
  setInterval(() => {
    if (gw && gw.win.closed) { gw = null; if (stream && stream.cur) { renderStream(); streamControls(); } else document.body.classList.remove("gw-open"); }
  }, 700);
  st.popBtn.addEventListener("click", openGuessWindow);

  function gwSuggest() {
    const q = gw.input.value;
    gw.items = q.trim() ? search(q, true).slice(0, 8) : [];
    gw.idx = gw.items.length ? 0 : -1;
    gwRenderSugg();
  }
  function gwRenderSugg() {
    const g = gw, d = g.win.document;
    g.sugg.innerHTML = "";
    g.sugg.hidden = !g.items.length;
    g.items.forEach((t, i) => {
      const li = d.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === g.idx));
      const img = d.createElement("img");
      img.className = "s-cover";
      img.alt = "";
      if (t.md5) img.src = coverUrl(t.md5, 120);
      const text = d.createElement("span");
      text.className = "s-text";
      const title = d.createElement("span");
      title.className = "s-title";
      title.textContent = t.title;
      const artist = d.createElement("span");
      artist.className = "s-artist";
      artist.textContent = artistLine(t);
      text.append(title, artist);
      li.append(img, text);
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => gwChoose(t));
      g.sugg.appendChild(li);
    });
  }
  function gwChoose(t) {
    gw.sel = t;
    gw.input.value = trackLabel(t);
    gw.items = [];
    gwRenderSugg();
    gw.input.focus();
  }
  function gwLock() {
    const t = gw.sel && gw.input.value === trackLabel(gw.sel) ? gw.sel : chatMatch(gw.input.value);
    if (!t) {
      gw.msg = "Nincs ilyen dal a listában – válassz a javaslatokból!";
      return renderGuessWindow();
    }
    gwSubmit({ type: judge(t, round.track), label: trackLabel(t), key: t.key });
  }
  function gwSubmit(attempt) {
    const c = stream && stream.cur;
    if (!c || c.phase !== "play" || c.me.done || c.pending || round.done) return;
    if (c.heard !== c.stage) {
      gw.msg = "Előbb játszd le a részletet, hogy a chat is hallja!";
      return renderGuessWindow();
    }
    gw.msg = "";
    gw.sel = null;
    gw.input.value = "";
    gw.items = [];
    gwRenderSugg();
    streamLock(attempt);
  }

  function renderGuessWindow() {
    if (!gw || gw.win.closed) return;
    const g = gw, c = stream && stream.cur, d = g.win.document;
    const ready = !!c && !!round && round.mode === "stream";
    const over = ready && (round.done || c.phase === "bonus" || c.phase === "bvote" || c.phase === "done");
    const canLock = ready && c.phase === "play" && !c.me.done && !c.pending && !round.done;
    const heard = !!c && c.heard === c.stage;
    let msg;
    if (!ready) msg = "Dal betöltése…";
    else if (over) msg = `Dal vége: ${trackLabel(round.track)}. A következő dalt a főablakban indítod.`;
    else if (c.pending) msg = `🔒 Lezártad: ${c.pending.type === "skip" ? "kihagyás" : c.pending.label}. Most a chat szavaz…`;
    else if (c.me.done) msg = "✓ Ezzel a dallal végeztél – a chat még tippel.";
    else msg = `Dal ${stream.idx + 1}/${stream.len} · ${c.stage + 1}. tipp · ${currentLength()} mp. `
      + (heard ? "Írd be a tipped, és zárd le!" : "Előbb játszd le a részletet.");
    g.status.textContent = g.msg || msg;
    g.status.classList.toggle("error", !!g.msg);
    g.input.disabled = !canLock;
    g.lock.disabled = !canLock;
    g.skip.disabled = !canLock || !heard;
    g.play.disabled = !ready || el.playBtn.disabled;
    // A saját tippjeid csak itt látszanak, a jó is (a főablakban a dal végéig rejtve).
    g.list.innerHTML = "";
    const mine = c ? [...c.me.attempts, ...(c.pending ? [c.pending] : [])] : [];
    mine.forEach((a, i) => {
      const li = d.createElement("li");
      const locked = c.pending && i === mine.length - 1;
      li.className = locked ? "pending" : a.type;
      const mark = d.createElement("span");
      mark.className = "mark";
      mark.textContent = locked ? "🔒" : { right: "✓", wrong: "✗", near: "~", skip: "»" }[a.type];
      const label = d.createElement("span");
      label.className = "label";
      label.textContent = a.type === "skip" ? "Kihagyva" : a.label;
      li.append(mark, label);
      g.list.appendChild(li);
    });
  }

  const mvpList = () => [...stream.mvp.values()].sort((a, b) => b.pts - a.pts || b.hits - a.hits);
  function renderStreamMvp() {
    const top = mvpList().slice(0, 3);
    st.mvp.hidden = !top.length;
    st.mvp.textContent = top.length ? "🏅 " + top.map((p) => `${p.name} ${p.pts}`).join(" · ") : "";
  }

  // ----- Eredmény -----
  const sr = {
    dialog: $("streamResultDialog"), verdict: $("srVerdict"), score: $("srScore"), mvp: $("srMvp"), calls: $("srCalls"),
  };
  function openStreamResult() {
    if (document.querySelector("dialog[open]")) return;
    const win = stream.me > stream.chat ? "me" : stream.chat > stream.me ? "chat" : null;
    sr.verdict.textContent = win === "me" ? "🏆 A streamer nyert!" : win === "chat" ? "🏆 A chat nyert!" : "🤝 Döntetlen";
    sr.verdict.classList.toggle("win", !!win);
    sr.score.textContent = `🎬 Streamer ${stream.me} – ${stream.chat} Chat 💬`;
    sr.mvp.innerHTML = "";
    const list = mvpList().slice(0, 5);
    list.forEach((p, i) => {
      const li = document.createElement("li");
      const place = document.createElement("span");
      place.className = "place";
      place.textContent = i === 0 ? "🏅" : `${i + 1}.`;
      const nm = document.createElement("span");
      nm.className = "nm";
      nm.textContent = `${p.name} · ${p.hits} találat`;
      const sc = document.createElement("b");
      sc.textContent = p.pts;
      li.append(place, nm, sc);
      sr.mvp.appendChild(li);
    });
    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "Ebben a meccsben senki sem találta el a dalt a chatből.";
      sr.mvp.appendChild(li);
    }
    // Ki volt a leggyakrabban elsőként helyes („called it”).
    const calls = new Map();
    for (const n of stream.calls) calls.set(n, (calls.get(n) || 0) + 1);
    const best = [...calls].sort((a, b) => b[1] - a[1]).slice(0, 3);
    sr.calls.textContent = best.length ? "🎯 Elsőként találta el: " + best.map(([n, k]) => `${n} ×${k}`).join(", ") : "";
    sr.dialog.showModal();
    if (win) setTimeout(confetti, 300);
    countEvent(`stream-done-${win || "draw"}`);
  }
  $("srAgainBtn").addEventListener("click", () => {
    sr.dialog.close();
    const channel = stream.channel;
    if (tw && tw.channel === channel && tw.state === "ok") return startStream(channel);
    // Megszakadt a chat: csak újra-csatlakozás (és visszaigazolás) után indulhat a meccs.
    leaveStream();
    openStreamSetup();
    sdStatus("🔴 Megszakadt a kapcsolat a chattel – nyomd meg az Indítást az újracsatlakozáshoz.", true);
  });
  $("srLeaveBtn").addEventListener("click", () => { sr.dialog.close(); leaveStream(); });

  // ----- Twitch chat (névtelen olvasás, bejelentkezés nélkül) -----
  // state: "connecting" | "ok" (a Twitch visszaigazolta a csatornát) | "down" (nincs kapcsolat) | "missing" (nincs ilyen csatorna)
  let tw = null; // { channel, ws, state, retry, timer, joinTimer, waiters }
  const TW_JOIN_MS = 7000;
  function twConnect(channel) {
    twClose();
    tw = { channel, ws: null, state: "connecting", retry: 0, timer: 0, joinTimer: 0, waiters: [] };
    twOpen(tw);
    renderTwConn();
  }
  function twSetState(me, state) {
    me.state = state;
    if (state !== "connecting") {
      for (const w of me.waiters.splice(0)) w(state);
    }
    renderTwConn();
  }
  // Megvárja, hogy kiderüljön, él-e a kapcsolat (vagy hogy nincs ilyen csatorna).
  function twWait(me, ms) {
    if (me.state === "ok" || me.state === "missing") return Promise.resolve(me.state);
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve(me.state === "connecting" ? "down" : me.state), ms);
      me.waiters.push((state) => { clearTimeout(t); resolve(state); });
    });
  }
  function twOpen(me) {
    let ws;
    try { ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443"); } catch { return twRetry(me); }
    me.ws = ws;
    ws.onopen = () => {
      // A twitch.tv/commands miatt létező csatornánál ROOMSTATE jön; ha nem jön, nincs ilyen csatorna.
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send("NICK justinfan" + (10000 + Math.floor(Math.random() * 80000)));
      ws.send("JOIN #" + me.channel);
      clearTimeout(me.joinTimer);
      me.joinTimer = setTimeout(() => {
        if (tw !== me || me.state === "ok") return;
        // Egyszer már megvolt a csatorna: csak lassú az újracsatlakozás, újrapróbáljuk.
        if (me.seen) ws.close();
        else { twSetState(me, "missing"); twStop(me); }
      }, TW_JOIN_MS);
    };
    ws.onmessage = (e) => {
      if (tw !== me) return;
      for (const line of String(e.data).split("\r\n")) if (line) twLine(me, line);
    };
    ws.onclose = () => {
      if (tw !== me || me.state === "missing") return;
      clearTimeout(me.joinTimer);
      twSetState(me, "down");
      twRetry(me);
    };
  }
  function twRetry(me) {
    clearTimeout(me.timer);
    me.timer = setTimeout(() => { if (tw === me) twOpen(me); }, Math.min(30000, 2000 * 2 ** me.retry++));
  }
  function twLine(me, line) {
    if (line.startsWith("PING")) return me.ws.send("PONG" + line.slice(4));
    const tags = {};
    let rest = line;
    if (rest[0] === "@") {
      const i = rest.indexOf(" ");
      for (const kv of rest.slice(1, i).split(";")) {
        const j = kv.indexOf("=");
        tags[kv.slice(0, j)] = kv.slice(j + 1);
      }
      rest = rest.slice(i + 1);
    }
    const m = rest.match(/^:([^! ]+)\S* ([A-Z0-9]+) ?(.*)$/);
    if (!m) return;
    const [, prefix, cmd, params] = m;
    if (cmd === "ROOMSTATE") {
      clearTimeout(me.joinTimer);
      me.retry = 0;
      me.seen = true;
      if (me.state !== "ok") twSetState(me, "ok");
    } else if (cmd === "NOTICE" && /suspended|banned/.test(tags["msg-id"] || "")) {
      twSetState(me, "missing");
      twStop(me);
    } else if (cmd === "RECONNECT") {
      me.ws.close();
    } else if (cmd === "PRIVMSG") {
      const i = params.indexOf(" :");
      if (i < 0) return;
      const text = params.slice(i + 2);
      if (text.startsWith("\u0001")) return; // /me üzenet
      const login = prefix.toLowerCase();
      const name = (tags["display-name"] || "").replace(/\\s/g, " ").trim() || login;
      streamChat({ id: tags["user-id"] || login, login, name }, text);
    }
  }
  function twStop(me) {
    clearTimeout(me.timer);
    clearTimeout(me.joinTimer);
    try { if (me.ws) me.ws.close(); } catch { /* már zárva */ }
  }
  function twClose() {
    if (!tw) return;
    const me = tw;
    tw = null;
    twStop(me);
    for (const w of me.waiters.splice(0)) w("down");
  }
  function renderTwConn() {
    const c = $("twConn");
    if (!c || !tw) return;
    c.textContent = tw.state === "ok" ? `🟢 #${tw.channel}` : tw.state === "connecting" ? "🟠 Csatlakozás a chathez…"
      : tw.state === "missing" ? `🔴 Nincs ilyen csatorna: #${tw.channel}` : "🔴 A chat nem elérhető – újracsatlakozás…";
    c.classList.toggle("down", tw.state === "down" || tw.state === "missing");
  }

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
    const modeText = round.mode === "daily" ? "napi dal" : round.mode === "versus" ? versus.kind
      : round.mode === "stream" ? "streamer vs chat"
      : `végtelen · ${catLabel(category)}`;
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
    // Csak a végtelen mód használ kategóriát; a többi mód a teljes listából játszik.
    const label = mode === "endless" ? catLabel(category) : catLabel("all");
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

  function adPick(date, avoid) {
    let best = null, bestH = -1;
    for (const a of adArtists) {
      if (avoid && avoid.has(a.id)) continue;
      const h = hashString(`songdle-hu:artist:${date}:${a.id}`);
      if (h > bestH) { bestH = h; best = a; }
    }
    return best;
  }
  // AD_RULE_FROM-tól az előző AD_NO_REPEAT nap megfejtése nem jöhet újra. A korábbi napok
  // megfejtése változatlan, hogy a már lejátszott napok (naptár, statisztika) ne változzanak.
  // A szabály kezdete óta napról napra haladunk, és megjegyezzük az eredményt.
  const AD_NO_REPEAT = 30, AD_RULE_FROM = "2026-10-25";
  const adAnswerCache = new Map();
  function adAnswer(date) {
    if (date < AD_RULE_FROM) return adPick(date);
    if (!adAnswerCache.has(date)) {
      const todo = [];
      for (let d = date; d >= AD_RULE_FROM && !adAnswerCache.has(d); d = shiftDate(d, -1)) todo.push(d);
      for (const day of todo.reverse()) {
        const avoid = new Set();
        for (let k = 1; k <= AD_NO_REPEAT; k++) {
          const p = shiftDate(day, -k);
          avoid.add((p < AD_RULE_FROM ? adPick(p) : adAnswerCache.get(p)).id);
        }
        adAnswerCache.set(day, adPick(day, avoid));
      }
    }
    return adAnswerCache.get(date);
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
    return shareText(`Songdle HU 🎤 Napi előadó · ${prettyDate(date)}\n${st.guesses.length} tipp${st.titleHint ? " · 💡" : ""}${st.gaveUp ? " · feladva 🏳️" : ""}\n${lines.join("\n")}\n${homeUrl()}`);
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
      countEvent("artist-won");
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
    countEvent("artist-gaveup");
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
  // Kihívás-link (?c=dalok&p=pont&n=név, régen ?k=) vagy párbaj-meghívó (?parbaj=KÓD).
  const params = new URLSearchParams(location.search);
  // c: új (nem olvasható) formátum; k: a régi linkek (36-os számrendszerű azonosítók).
  const challengeIds = (params.get("c") ? params.get("c").split("-").map(decId) : (params.get("k") || "").split("-").map((s) => parseInt(s, 36)))
    .filter((n) => n > 0).slice(0, Math.max(...BATTLE_LENGTHS));
  const battleCode = (params.get("parbaj") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (challengeIds.length || battleCode) history.replaceState(null, "", location.pathname);
  if (!load("seenHelp", false) && !challengeIds.length && !battleCode) {
    openHelp();
    save("seenHelp", true);
  }
  if (challengeIds.length) {
    clearBattle();
    const name = (params.get("n") || "").slice(0, 16) || "Egy barátod";
    // Dalonként legfeljebb 100 pont szerezhető: a link átírt, lehetetlen pontszámát levágjuk.
    const score = Math.min(challengeIds.length * POINTS[0], Math.max(0, parseInt(params.get("p"), 10) || 0));
    startVersus("challenge", challengeIds, [{ id: "c", name, score }]);
    countEvent("challenge-opened");
  } else if (!battleCode && resumeBattle()) {
    // félbehagyott párbaj folytatása
  } else {
    enterMode();
    if (battleCode) openBattle(battleCode);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
})();
