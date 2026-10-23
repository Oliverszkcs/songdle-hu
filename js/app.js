(function () {
  "use strict";

  const CFG = window.SONGDLE_CONFIG;
  const LENGTHS = CFG.CLIP_LENGTHS;
  const MAX_TRIES = LENGTHS.length;
  const MAX_LEN = LENGTHS[MAX_TRIES - 1];
  const FULL_PREVIEW = 30;
  const POINTS = [100, 80, 60, 40, 25, 10];
  const STREAK_BONUS = 5, STREAK_BONUS_MAX = 50, DAILY_MULTIPLIER = 2;
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
    toast: $("toast"), confetti: $("confetti"), pointsPill: $("pointsPill"), pointsNum: $("pointsNum"),
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
          results.push(...(await loadArtist(a)).map((t) => ({ ...t, src: a.name })));
        } catch (e) { console.warn("Nem sikerült:", a.name, e); }
        onProgress(++done, artists.length);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return results;
  }

  const isLive = (t) => /\blive\b|\bél[őo]\b|koncert/i.test(t.title);

  function buildPool(tracks) {
    const byKey = new Map();
    for (const t of tracks) {
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
    return pool;
  }

  const artistsFor = (cat) => cat === "all" ? CFG.ARTISTS : CFG.ARTISTS.filter((a) => (a.tags || []).includes(cat));

  // A napi dal mindenkinek ugyanaz: a dátumból számolt seed választ előadót,
  // majd az előadó (azonosító szerint rendezett) dalai közül egyet.
  async function pickDailyTrack(date) {
    const rng = mulberry32(hashString("songdle-hu:" + date));
    const candidates = CFG.ARTISTS.filter((a) => a.id);
    for (let i = 0; i < 8; i++) {
      const artist = candidates[Math.floor(rng() * candidates.length)];
      const r = rng();
      let tracks;
      try { tracks = await loadArtist(artist); } catch { continue; }
      const studio = tracks.filter((t) => !isLive(t)).sort((a, b) => a.id - b.id);
      if (studio.length) return studio[Math.floor(r * studio.length)];
    }
    return null;
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
  let dailyStats = Object.assign(defaultStats(), { lastWin: null }, load("dailyStats", {}));
  let points = load("points", 0);
  let shownPoints = points;

  function dailyStreakNow() {
    const today = dateKey();
    return dailyStats.lastWin === today || dailyStats.lastWin === shiftDate(today, -1) ? dailyStats.streak : 0;
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
    el.categoriesWrap.hidden = mode !== "endless";
    el.dailyBanner.hidden = mode !== "daily";
    el.dailyBanner.innerHTML = `Mai dal · <b>${prettyDate(dateKey())}</b> · dupla pont`;
    el.nextBtn.textContent = mode === "daily" ? "Végtelen mód →" : "Következő dal →";
  }

  function renderCategories() {
    el.categories.innerHTML = "";
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

  async function changeCategory(id) {
    if (id === category) return;
    if (round && round.mode === "endless" && !round.done && round.attempts.length > 0) {
      if (!(await confirmDialog())) return;
      finishRound(false, true);
    }
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
      const track = await pickDailyTrack(date);
      if (token !== loadToken) return;
      if (!track) {
        setLoading(false);
        return setStatus("Nem sikerült betölteni a mai dalt. Próbáld újra később.", true);
      }
      const resolved = pool.find((p) => p.id === track.id) || buildPool([track])[0];
      const saved = load("daily." + date, null);
      return startRound(resolved, saved && saved.trackId === track.id ? saved : null);
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
    const fresh = pool.filter((t) => !recentSet.has(t.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  async function startRound(track, saved) {
    const token = loadToken;
    const fixed = !!track;
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
          mode, date: mode === "daily" ? dateKey() : null, track: t,
          attempts: saved ? saved.attempts : [], done: !!(saved && saved.done), won: !!(saved && saved.won),
          points: saved && saved.points ? saved.points : null,
          preview: full.preview,
          md5: (full.album && full.album.md5_image) || t.md5,
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
      save("daily." + round.date, {
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

  function scoreFor(won, tries, streakAfter, isDaily) {
    if (!won) return { base: 0, bonus: 0, total: 0 };
    let base = POINTS[tries - 1];
    if (isDaily) base *= DAILY_MULTIPLIER;
    const bonus = Math.min(Math.max(streakAfter - 1, 0) * STREAK_BONUS, STREAK_BONUS_MAX);
    return { base, bonus, total: base + bonus };
  }

  function finishRound(won, silent) {
    round.done = true;
    round.won = won;
    const tries = round.attempts.length;

    let s;
    if (round.mode === "daily") {
      s = dailyStats;
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
    save(round.mode === "daily" ? "dailyStats" : "stats", s);

    round.points = scoreFor(won, tries, s.streak, round.mode === "daily");
    points += round.points.total;
    save("points", points);
    persistRound();
    if (silent) return;

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
    el.revealEmoji.textContent = emojiRow(round);
    const p = round.points;
    el.revealPoints.textContent = p && p.total
      ? `+${p.total} pont` + (p.bonus ? ` (🔥 +${p.bonus})` : "")
      : "";
    el.reveal.hidden = false;
    retrigger(el.reveal, "in");
    $("scroll").scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });

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
      const st = dailyStreakNow();
      el.streakLine.innerHTML = st > 0
        ? `${flame} Napi sorozat: <b>${st}</b> · legjobb: ${dailyStats.maxStreak}`
        : dailyStats.played ? `Napi legjobb sorozat: ${dailyStats.maxStreak}` : "Találd ki a mai dalt!";
    } else {
      el.streakLine.innerHTML = stats.streak > 0
        ? `${flame} Sorozat: <b>${stats.streak}</b> · legjobb: ${stats.maxStreak}`
        : stats.played ? `Legjobb sorozat: ${stats.maxStreak}` : "";
    }
  }

  function renderPoints() {
    el.pointsNum.textContent = shownPoints.toLocaleString("hu-HU");
  }

  function animatePoints() {
    const from = shownPoints, to = points, start = performance.now(), dur = 1100;
    if (from === to) return;
    retrigger(el.pointsPill, "bump");
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

  let rafId = 0;
  let stopAt = 0;

  function stopAudio() {
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
    stopAt = currentLength();
    const total = scaleLength();
    el.playBtn.classList.add("loading");
    try {
      el.audio.currentTime = 0;
      await el.audio.play();
    } catch (e) {
      console.warn(e);
      el.playBtn.classList.remove("loading");
      setStatus("Nem sikerült lejátszani. Próbáld újra!", true);
      return;
    }
    el.playBtn.classList.remove("loading");
    el.playBtn.classList.add("playing");
    document.body.classList.add("playing");
    el.playBtn.setAttribute("aria-label", "Megállítás");
    const tick = () => {
      const t = el.audio.currentTime;
      el.ringProgress.style.strokeDashoffset = 100 - Math.min(t / total, 1) * 100;
      el.timeNow.textContent = fmt(t);
      renderWaveState(t, false);
      if (t >= stopAt || el.audio.ended) return stopAudio();
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
    } else {
      el.audio.volume = level;
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
      // pointerdown, hogy a mobil billentyűzet bezáródása előtt fusson le
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); choose(t); });
      el.suggestions.appendChild(li);
    });
    const wasHidden = el.suggestions.hidden;
    el.suggestions.hidden = false;
    if (wasHidden) retrigger(el.suggestions, "open");
    el.suggestions.scrollTop = 0;
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

  // ---------- Megosztás ----------
  async function share() {
    if (!round || !round.done) return;
    const url = location.origin + location.pathname;
    const head = round.mode === "daily"
      ? `Songdle HU 📅 ${round.date}`
      : `Songdle HU 🎵 ${CFG.CATEGORIES.find((c) => c.id === category).label}`;
    const streak = round.mode === "daily" ? dailyStreakNow() : stats.streak;
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
      await navigator.clipboard.writeText(text);
      toast("Vágólapra másolva! ✨");
    } catch (e) {
      if (e && e.name !== "AbortError") toast("Nem sikerült megosztani.");
    }
  }

  // ---------- Gombok és billentyűk ----------
  el.playBtn.addEventListener("click", playClip);
  el.disc.addEventListener("click", () => { if (!el.playBtn.disabled) playClip(); });
  el.submitBtn.addEventListener("click", submit);
  el.skipBtn.addEventListener("click", () => {
    if (round && !round.done) registerAttempt({ type: "skip" });
  });
  el.nextBtn.addEventListener("click", () => {
    if (mode === "daily") changeMode("endless");
    else startRound();
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

  function renderStats() {
    el.statPoints.textContent = points.toLocaleString("hu-HU");
    statCells(el.statGrid, stats, stats.streak);
    statCells(el.statGridDaily, dailyStats, dailyStreakNow());
    const s = mode === "daily" ? dailyStats : stats;
    $("distTitle").textContent = `Hányadikra találtad el (${mode === "daily" ? "napi" : "végtelen"})`;
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
    li.append(img, text);
    return li;
  }

  function renderLibrary() {
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
    libSearch.value = "";
    renderLibrary();
    libList.scrollTop = 0;
    libDialog.showModal();
  });

  $("statsBtn").addEventListener("click", () => { renderStats(); el.statsDialog.showModal(); });
  $("helpBtn").addEventListener("click", () => el.helpDialog.showModal());

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
