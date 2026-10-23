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
    modeEndless: $("modeEndless"), modeDaily: $("modeDaily"),
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

  async function loadArtist(artist) {
    const cacheKey = "artist2." + (artist.id || norm(artist.name));
    const cached = load(cacheKey, null);
    if (cached && Date.now() - cached.ts < CFG.POOL_CACHE_HOURS * 3600e3) return cached.tracks;

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
          results.push(...list.map((t) => ({ ...t, src: a.name })));
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
  const configBlocked = new Set((CFG.BLOCKED_TRACKS || []).map((b) => (typeof b === "object" ? b.id : b)));
  let reported = load("reported", []);
  const isReported = (id) => reported.some((r) => r.id === id);

  function buildPool(tracks) {
    const byKey = new Map();
    for (const t of tracks) {
      if (configBlocked.has(t.id)) continue;
      t.base = baseTitle(t.title);
      t.key = t.base + "|" + norm(t.artist);
      const prev = byKey.get(t.key);
      const better = !prev || (isLive(prev) && !isLive(t)) || (isLive(prev) === isLive(t) && t.rank > prev.rank);
      if (better) byKey.set(t.key, t);
    }
    const pool = [...byKey.values()];
    for (const t of pool) {
      t.feat = t.feat || [];
      t.nTitle = norm(t.title);
      t.nArtist = norm(t.artist);
      t.nArtists = [t.artist, ...t.feat].map(norm);
      t.hay = t.nTitle + " " + t.nArtists.join(" ");
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

  const artistsFor = (cat) => cat === "all" ? CFG.ARTISTS : CFG.ARTISTS.filter((a) => (a.tags || []).includes(cat));

  // A napi dal mindenkinek ugyanaz: a nehézség népszerűségi sávjából az a dal
  // nyer, amelyiknek a (dátum, nehézség, dal) hash-e a legnagyobb. Így ha két
  // játékos dallistája kicsit eltér, a nyertes akkor is ugyanaz marad.
  function pickDailyTrack(date, diff) {
    let best = null, bestScore = -1;
    for (const t of pool) {
      if (isLive(t) || isReported(t.id) || t.pct < diff.from || (t.pct >= diff.to && diff.to < 1)) continue;
      const score = hashString(`songdle-hu:${date}:${diff.id}:${t.id}`);
      if (score > bestScore) { best = t; bestScore = score; }
    }
    return best;
  }

  // ---------- Állapot ----------
  let mode = load("mode", "endless") === "daily" ? "daily" : "endless";
  let category = load("category", "all");
  if (!CFG.CATEGORIES.some((c) => c.id === category)) category = "all";
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
    el.toast.hidden = false;
    retrigger(el.toast, "show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200);
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
    el.dailyBanner.hidden = mode !== "daily";
    const d = diffById(dailyDiff);
    el.dailyBanner.innerHTML = `Mai dal · <b>${prettyDate(dateKey())}</b> · ${d.label} · <b>×${d.multiplier}</b> pont`;
    updateNextButton();
  }

  function updateNextButton() {
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
  }

  function renderCategories() {
    updateDailyBadge();
    el.categories.innerHTML = "";
    if (mode === "daily") return renderDifficulties();
    for (const c of CFG.CATEGORIES) {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = c.label;
      const active = c.id === category;
      b.setAttribute("aria-pressed", String(active));
      b.addEventListener("click", () => changeCategory(c.id));
      el.categories.appendChild(b);
      if (active) requestAnimationFrame(() => b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }));
    }
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
      b.addEventListener("click", () => changeDifficulty(d.id));
      el.categories.appendChild(b);
      if (active) requestAnimationFrame(() => b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }));
    }
    // Napi előadó-találós: külön ablakban nyílik.
    const b = document.createElement("button");
    b.className = "chip diff-chip artist-chip" + (adDone() ? " won" : "");
    b.innerHTML = `<span class="diff-dot" aria-hidden="true">🎤</span><span>Előadó</span>`
      + (adDone() ? `<span class="diff-state" aria-label="megfejtve">✓</span>` : `<span class="diff-mult">új</span>`);
    b.addEventListener("click", openArtistGame);
    el.categories.appendChild(b);
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
    round = null;
    stopCountdown();
    resetStage();
    setControls(false);
    showDone(false);
    renderAll();

    const poolCategory = mode === "daily" ? "all" : category;
    setLoading(true, 0);
    setStatus("Dalok betöltése…");
    const tracks = await loadArtists(artistsFor(poolCategory), (d, n) => {
      if (token !== loadToken) return;
      setLoading(true, d / n);
      el.status.textContent = `Dalok betöltése… ${d}/${n}`;
    });
    if (token !== loadToken) return;
    pool = buildPool(tracks);
    if (!pool.length) {
      setLoading(false);
      setStatus("Nem sikerült dalokat betölteni. Ellenőrizd az internetkapcsolatot, és frissítsd az oldalt.", true);
      return;
    }

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
  function pickTrack() {
    const recentSet = new Set(load("recent", []));
    const allowed = pool.filter((t) => !isReported(t.id));
    const fresh = allowed.filter((t) => !recentSet.has(t.id));
    return weightedPick(fresh.length ? fresh : allowed.length ? allowed : pool, Math.random);
  }

  async function startRound(track, saved) {
    const token = loadToken;
    const fixed = !!track;
    if (mode !== "daily" && !saved && gameDone()) {
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
      const t = track || pickTrack();
      if (!fixed) track = null;
      setStatus("Dal betöltése…");
      try {
        // Friss előnézet-URL, mert a linkek lejárnak.
        const full = await Deezer.track(t.id);
        if (token !== loadToken) return;
        if (!full.preview) throw new Error("Nincs előnézet");
        round = {
          mode, date: mode === "daily" ? dateKey() : null, diff: mode === "daily" ? dailyDiff : null, track: t,
          attempts: saved ? saved.attempts : [], done: !!(saved && saved.done), won: !!(saved && saved.won),
          points: saved && saved.points ? saved.points : null,
          preview: full.preview,
          md5: (full.album && full.album.md5_image) || t.md5,
          year: ((full.release_date || (full.album && full.album.release_date) || "").match(/^\d{4}/) || [""])[0],
        };
        if (!t.feat.length && full.contributors) {
          t.feat = [...new Set(full.contributors.map((c) => c.name))].filter((n) => n !== t.artist);
          t.nArtists = [t.artist, ...t.feat].map(norm);
          t.hay = t.nTitle + " " + t.nArtists.join(" ");
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

    el.audio.src = round.preview;
    el.audio.load();
    buildWave(true);
    renderAll();

    if (round.done) {
      // Már lejátszott napi dal: csak a megoldást mutatjuk.
      showReveal(false);
      return;
    }
    setControls(true);
    setStatus(round.attempts.length ? "Folytasd, ahol abbahagytad!" : "Nyomd meg a lemezt, és figyelj!");
    el.playBtn.classList.add("pulse");
  }

  function persistRound() {
    if (!round) return;
    if (round.mode === "daily") {
      save(dailyKey(round.date, round.diff), {
        trackId: round.track.id, attempts: round.attempts, done: round.done, won: round.won, points: round.points,
      });
    } else if (!round.done) {
      save("round", { category, trackId: round.track.id, attempts: round.attempts });
    } else {
      save("round", null);
    }
  }

  function currentLength() {
    if (!round) return LENGTHS[0];
    if (round.done) return FULL_PREVIEW;
    return LENGTHS[Math.min(round.attempts.length, MAX_TRIES - 1)];
  }
  const scaleLength = () => (round && round.done ? FULL_PREVIEW : MAX_LEN);

  function registerAttempt(attempt) {
    round.attempts.push(attempt);
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
    const base = POINTS[tries - 1] * multiplier;
    const bonus = Math.min(Math.max(streakAfter - 1, 0) * STREAK_BONUS, STREAK_BONUS_MAX);
    return { base, bonus, total: base + bonus };
  }

  function finishRound(won, silent) {
    round.done = true;
    round.won = won;
    const tries = round.attempts.length;

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

    const multiplier = round.mode === "daily" ? diffById(round.diff).multiplier : 1;
    round.points = scoreFor(won, tries, s.streak, multiplier);
    points += round.points.total;
    save("points", points);
    if (round.mode === "endless" && !silent && !gameDone()) {
      game.results.push({ won, pts: round.points.total });
      if (gameDone()) {
        const score = gameScore();
        game.record = score > bestGame && score > 0;
        game.prevBest = bestGame;
        if (game.record) { bestGame = score; save("bestGame", bestGame); }
      }
      save("game", game);
    }
    persistRound();
    if (silent) return;
    if (round.mode === "daily") renderCategories();

    stopAudio();
    buildWave(false);
    renderAll(true);
    if (won) {
      confetti();
      vibrate([30, 40, 30]);
      floatPoints(round.points.total);
      setTimeout(() => animatePoints(), 500);
    } else {
      vibrate(150);
    }
    showReveal(true);
  }

  function emojiRow(r) {
    const map = { right: "🟩", near: "🟨", wrong: "🟥", skip: "⬛" };
    let s = r.attempts.map((a) => map[a.type] || "⬛").join("");
    for (let i = r.attempts.length; i < MAX_TRIES; i++) s += "⬜";
    return s;
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
      ? (round.attempts.length === 1 ? "Elsőre! 🤯" : `Eltaláltad · ${round.attempts.length}. tipp`)
      : "Most nem jött össze";
    el.revealResult.classList.toggle("lost", !round.won);
    el.revealTitle.textContent = t.title;
    el.revealArtist.textContent = artistLine(t);
    el.revealAlbum.textContent = t.album;
    // A megjelenés éve a megoldásnál (nyerés és vesztés esetén is).
    if (round.year && round.year !== "0000") {
      const y = document.createElement("span");
      y.className = "reveal-year";
      y.textContent = round.year;
      el.revealAlbum.append(" ", y);
    }
    el.revealEmoji.textContent = emojiRow(round);
    const p = round.points;
    el.revealPoints.textContent = p && p.total
      ? `+${p.total} pont` + (p.bonus ? ` (🔥 +${p.bonus})` : "")
      : "";
    const setOver = round.mode === "endless" && gameDone();
    el.revealSet.hidden = !setOver;
    if (setOver) {
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
      label.textContent = a.type === "skip" ? `Kihagyva · ${LENGTHS[i]} mp` : a.label;
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
    el.ringUnlocked.style.strokeDashoffset = round ? 100 - (currentLength() / total) * 100 : 100;
    el.ringProgress.style.strokeDashoffset = 100;
    if (round && !round.done) {
      const remaining = MAX_TRIES - round.attempts.length;
      const nextLen = LENGTHS[round.attempts.length + 1];
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
      for (const l of LENGTHS) {
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
    [...el.waveMarks.children].forEach((m, i) => m.classList.toggle("on", LENGTHS[i] <= unlockedSec));
  }

  function renderStreak() {
    const flame = '<span class="flame">🔥</span>';
    if (mode === "daily") {
      const st = dailyStreakNow(), s = dailyStats(), d = diffById(dailyDiff);
      el.streakLine.innerHTML = st > 0
        ? `${flame} ${d.label} sorozat: <b>${st}</b> nap · legjobb: ${s.maxStreak}`
        : s.played ? `${d.label} legjobb sorozat: ${s.maxStreak} nap` : "Találd ki a mai dalt!";
    } else {
      el.streakLine.innerHTML = stats.streak > 0
        ? `${flame} Sorozat: <b>${stats.streak}</b> · legjobb: ${stats.maxStreak}`
        : stats.played ? `Legjobb sorozat: ${stats.maxStreak}` : "";
    }
  }

  // A kör pontja: játék közben a még megszerezhető pont, a végén a megszerzett.
  function renderRoundPoints() {
    renderSetBar();
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
      n = scoreFor(true, round.attempts.length + 1, streakAfter, daily ? diffById(round.diff).multiplier : 1).total;
    }
    const prev = el.roundNum.textContent;
    el.roundNum.textContent = n === null ? "–" : (state === "won" ? "+" : "") + n;
    el.roundPts.className = "round-pts " + state;
    if (prev !== el.roundNum.textContent && n !== null) retrigger(el.roundPts, "tick");
  }

  // Az 5 dalos kör állása: dalonként a megszerzett pont, az aktuálisnál a még elérhető.
  function renderSetBar() {
    el.setBar.hidden = mode === "daily";
    if (mode === "daily") return;
    el.setSlots.innerHTML = "";
    for (let i = 0; i < SET_SIZE; i++) {
      const r = game.results[i], slot = document.createElement("span");
      if (r) {
        slot.className = r.won ? "won" : "lost";
        slot.textContent = r.won ? r.pts : "✗";
      } else if (i === game.results.length && round && !round.done) {
        slot.className = "current";
        slot.textContent = scoreFor(true, round.attempts.length + 1, stats.streak + 1, 1).total;
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
    const token = ++playToken;
    el.playBtn.classList.add("loading");
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
    el.playBtn.classList.remove("loading");
    el.playBtn.classList.add("playing");
    document.body.classList.add("playing");
    el.playBtn.setAttribute("aria-label", "Megállítás");
    const total = scaleLength();
    const tick = () => {
      if (token !== playToken) return;
      const t = el.audio.currentTime;
      el.ringProgress.style.strokeDashoffset = 100 - Math.min(t / total, 1) * 100;
      el.timeNow.textContent = fmt(t);
      renderWaveState(t, false);
      if (t >= currentLength() || el.audio.ended) return stopAudio();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
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

  window.addEventListener("resize", sizeViz);

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
    return hits.slice(0, 12).map((h) => h.t);
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
    el.suggestions.style.maxHeight = Math.max(120, Math.min(420, space)) + "px";
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
    if (li) li.scrollIntoView({ block: "nearest" });
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
  async function share() {
    if (!round || !round.done) return;
    const url = location.origin + location.pathname;
    const head = round.mode === "daily"
      ? `Songdle HU 📅 ${round.date} · ${diffById(round.diff).icon} ${diffById(round.diff).label}`
      : `Songdle HU 🎵 ${CFG.CATEGORIES.find((c) => c.id === category).label}`;
    const streak = round.mode === "daily" ? dailyStreakNow(round.diff) : stats.streak;
    const lines = [head, emojiRow(round)];
    const extra = [];
    if (round.points && round.points.total) extra.push(`+${round.points.total} pont`);
    if (streak > 0) extra.push(`🔥 ${streak}`);
    if (extra.length) lines.push(extra.join(" · "));
    lines.push(url);
    const text = lines.join("\n");
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
    if (mode !== "daily") return startRound();
    const next = nextUnplayedDiff();
    if (next) changeDifficulty(next.id);
    else changeMode("endless");
  });
  el.shareBtn.addEventListener("click", share);
  el.modeEndless.addEventListener("click", () => changeMode("endless"));
  el.modeDaily.addEventListener("click", () => changeMode("daily"));

  document.addEventListener("keydown", (e) => {
    if (document.querySelector("dialog[open]") || e.target === el.input || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " && !el.playBtn.disabled) {
      e.preventDefault();
      playClip();
    } else if (e.key === "Enter" && round && round.done && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      el.nextBtn.click();
    }
  });

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

  function renderStats() {
    el.statPoints.textContent = points.toLocaleString("hu-HU");
    statCells(el.statGrid, stats, stats.streak);
    renderDailyTable();
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

  reportDialog.addEventListener("close", () => {
    const reason = reportDialog.returnValue;
    if (!reason || !round) return;
    setReported(round.track, reason);
    renderReportBtn();
    toast("Köszi! Ez a dal többé nem jön ki. ⚑");
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
  $("helpBtn").addEventListener("click", () => el.helpDialog.showModal());

  // ---------- Napi előadó ----------
  // Találós a Napi módban: minden tippnél megmutatjuk, mennyire hasonlít a tippelt
  // előadó a mai megfejtésre (zöld: egyezik, sárga: részben/közel, nyíl: merre).
  const AD_INFO = CFG.ARTIST_INFO || {};
  const adArtists = CFG.ARTISTS.filter((a) => a.id && AD_INFO[a.name]).map((a) => ({
    ...a, ...AD_INFO[a.name], n: norm(a.name), genres: a.tags.filter((t) => t !== "all"),
  }));
  const AD_TYPE = { solo: "Szóló", duo: "Duó", band: "Zenekar" };
  const AD_GENDER = { m: "Férfi", f: "Nő", mixed: "Vegyes" };
  const AD_HINT_AFTER = 4;
  const AD_POINTS = (n) => Math.max(20, 150 - (n - 1) * 20);
  const tagLabel = (id) => (CFG.CATEGORIES.find((c) => c.id === id) || { label: id }).label;
  const adDialog = $("artistDialog");
  const ad = {
    input: $("adInput"), sugg: $("adSuggestions"), list: $("adGuesses"), empty: $("adEmpty"),
    meta: $("adMeta"), win: $("adWin"), hint: $("adHintBtn"), search: $("adSearch"), cols: $("adCols"),
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

  // Deezer-adat (kép, rajongók) előadónként, egy napig tárolva.
  const adInfoCache = new Map();
  function adFetch(a) {
    if (adInfoCache.has(a.id)) return adInfoCache.get(a.id);
    const key = "artistInfo." + a.id;
    const cached = load(key, null);
    const p = cached && Date.now() - cached.ts < 24 * 3600e3
      ? Promise.resolve(cached)
      : withRetry(() => Deezer.artist(a.id)).then((d) => {
        const v = { ts: Date.now(), fans: d.nb_fan || 0, pic: d.picture_medium || "" };
        save(key, v);
        return v;
      }).catch(() => ({ fans: 0, pic: "" }));
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
    const dy = Math.abs(g.year - ans.year);
    const year = dy === 0 ? "hit" : dy <= 5 ? "near" : "miss";
    const genre = same(g.genres, ans.genres) ? "hit" : g.genres.some((x) => ans.genres.includes(x)) ? "near" : "miss";
    const ratio = Math.max(gFans, aFans) / Math.max(1, Math.min(gFans, aFans));
    const fans = g.id === ans.id || ratio <= 1.15 ? "hit" : ratio <= 2 ? "near" : "miss";
    return [
      [type, AD_TYPE[g.type]],
      [gender, AD_GENDER[g.gender]],
      [year, g.year + (year === "hit" ? "" : arrow(g.year, ans.year))],
      [genre, g.genres.map(tagLabel).join(", ")],
      [fans, fmtFans(gFans) + (fans === "hit" ? "" : arrow(gFans, aFans))],
    ];
  }

  async function adRenderRow(g, ans, animate) {
    const [gi, ai] = await Promise.all([adFetch(g), adFetch(ans)]);
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
    adCompare(g, ans, gi.fans, ai.fans).forEach(([cls, text], i) => {
      const t = document.createElement("span");
      t.className = "ad-tile " + cls;
      t.textContent = text;
      if (animate) t.style.animationDelay = i * 0.12 + "s";
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
    ad.cols.hidden = !st.guesses.length;
    ad.search.hidden = st.done;
    const left = AD_HINT_AFTER - st.guesses.length;
    ad.hint.hidden = st.done;
    ad.hint.disabled = left > 0;
    ad.hint.textContent = left > 0 ? `🎧 Hallgass bele (még ${left} tipp)` : "🎧 Hallgass bele";
    adRenderWin(st, ans);
  }

  function adRenderWin(st, ans) {
    ad.win.hidden = !st.done;
    if (!st.done) return;
    ad.win.innerHTML = "";
    const title = document.createElement("p");
    title.className = "ad-win-title";
    title.textContent = st.guesses.length === 1 ? "Elsőre! 🤯" : `Eltaláltad ${st.guesses.length} tippből! 🎉`;
    const nameEl = document.createElement("p");
    nameEl.className = "ad-win-name";
    nameEl.textContent = ans.name;
    const pts = document.createElement("p");
    pts.className = "ad-win-points";
    pts.textContent = `+${st.points} pont`;
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
  }

  async function adShare() {
    const date = dateKey(), ans = adAnswer(date), st = adState();
    const emoji = { hit: "🟩", near: "🟨", miss: "⬛" };
    const aInfo = await adFetch(ans);
    const lines = [];
    for (const n of st.guesses) {
      const g = adArtists.find((a) => a.name === n);
      if (!g) continue;
      const gi = await adFetch(g);
      lines.push(adCompare(g, ans, gi.fans, aInfo.fans).map(([c]) => emoji[c]).join(""));
    }
    const text = `Songdle HU 🎤 Napi előadó · ${prettyDate(date)}\n${st.guesses.length} tipp\n${lines.join("\n")}\n${location.origin + location.pathname}`;
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
      st.points = AD_POINTS(st.guesses.length);
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
    adRender(true).then(() => { if (st.done) ad.win.scrollIntoView({ block: "nearest" }); });
    renderCategories();
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

  function openArtistGame() {
    ad.input.value = "";
    adHideSugg();
    // A konfetti a dialógus fölött is látsszon.
    adDialog.appendChild(el.confetti);
    adRender(false);
    adFetch(adAnswer(dateKey()));
    adDialog.showModal();
    adDialog.querySelector(".ad-scroll").scrollTop = 0;
  }
  adDialog.addEventListener("close", () => {
    clearTimeout(adHintTimer);
    libStop();
    document.body.appendChild(el.confetti);
  });

  // ---------- Indítás ----------
  applyVolume();
  renderMode();
  renderCategories();
  renderPoints();
  buildWave(false);
  renderAll();
  sizeViz();
  requestAnimationFrame(drawViz);
  if (!load("seenHelp", false)) {
    el.helpDialog.showModal();
    save("seenHelp", true);
  }
  enterMode();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
})();
