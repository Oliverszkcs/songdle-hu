(function () {
  "use strict";

  const CFG = window.SONGDLE_CONFIG;
  const LENGTHS = CFG.CLIP_LENGTHS;
  const MAX_TRIES = LENGTHS.length;
  const MAX_LEN = LENGTHS[MAX_TRIES - 1];
  const FULL_PREVIEW = 30;
  const POINTS = [100, 80, 60, 40, 25, 10];
  const STREAK_BONUS = 5, STREAK_BONUS_MAX = 50, DAILY_MULTIPLIER = 2;
  const LS = "songdle.";

  const $ = (id) => document.getElementById(id);
  const el = {
    categories: $("categories"), categoriesWrap: $("categoriesWrap"), dailyBanner: $("dailyBanner"),
    streakLine: $("streakLine"), guesses: $("guesses"), scroll: $("scroll"),
    status: $("status"), reveal: $("reveal"), revealCover: $("revealCover"),
    revealResult: $("revealResult"), revealTitle: $("revealTitle"), revealArtist: $("revealArtist"),
    revealAlbum: $("revealAlbum"), revealEmoji: $("revealEmoji"), revealPoints: $("revealPoints"),
    timeline: $("timeline"),
    timelineUnlocked: $("timelineUnlocked"), timelineFill: $("timelineFill"), timeNow: $("timeNow"),
    timeMax: $("timeMax"), clipLen: $("clipLen"), playBtn: $("playBtn"), controls: $("controls"),
    input: $("guessInput"), clearBtn: $("clearBtn"), suggestions: $("suggestions"),
    skipBtn: $("skipBtn"), submitBtn: $("submitBtn"), doneButtons: $("doneButtons"),
    shareBtn: $("shareBtn"), nextBtn: $("nextBtn"), audio: $("audio"),
    statsDialog: $("statsDialog"), statGrid: $("statGrid"), statGridDaily: $("statGridDaily"),
    statPoints: $("statPoints"), dist: $("dist"), helpDialog: $("helpDialog"), confirmDialog: $("confirmDialog"),
    toast: $("toast"), confetti: $("confetti"), pointsPill: $("pointsPill"),
    modeEndless: $("modeEndless"), modeDaily: $("modeDaily"),
    volumeBtn: $("volumeBtn"), volumePop: $("volumePop"), volumeRange: $("volumeRange"),
    volumeVal: $("volumeVal"), muteBtn: $("muteBtn"), volumeNote: $("volumeNote"),
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
    const cacheKey = "artist." + (artist.id || norm(artist.name));
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

  // Egyszerre néhány kérés, hogy ne fussunk bele a Deezer limitjébe (50 kérés / 5 mp).
  async function loadArtists(artists, onProgress) {
    const results = [];
    let next = 0, done = 0;
    async function worker() {
      while (next < artists.length) {
        const a = artists[next++];
        try { results.push(...(await loadArtist(a))); } catch (e) { console.warn("Nem sikerült:", a.name, e); }
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
      t.nTitle = norm(t.title);
      t.nArtist = norm(t.artist);
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
  // round: { mode, date?, track, attempts: [{type, label}], done, won, points, preview, md5, link }
  let round = null;
  let selected = null;
  let loadToken = 0;

  const defaultStats = () => ({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0, 0] });
  let stats = Object.assign(defaultStats(), load("stats", {}));
  let dailyStats = Object.assign(defaultStats(), { lastWin: null }, load("dailyStats", {}));
  let points = load("points", 0);

  function dailyStreakNow() {
    const today = dateKey();
    return dailyStats.lastWin === today || dailyStats.lastWin === shiftDate(today, -1) ? dailyStats.streak : 0;
  }

  function setStatus(msg, isError) {
    el.status.textContent = msg || "";
    el.status.classList.toggle("error", !!isError);
  }

  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
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

  // ---------- Mód és kategória ----------
  function renderMode() {
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
      if (active) requestAnimationFrame(() => b.scrollIntoView({ inline: "center", block: "nearest" }));
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
    enterMode();
  }

  async function enterMode() {
    const token = ++loadToken;
    stopAudio();
    round = null;
    stopCountdown();
    setControls(false);
    showDone(false);
    renderGuesses(true);
    renderTimeline();
    renderStreak();

    const poolCategory = mode === "daily" ? "all" : category;
    setStatus("Dalok betöltése…");
    const tracks = await loadArtists(artistsFor(poolCategory), (d, n) => {
      if (token === loadToken) setStatus(`Dalok betöltése… ${d}/${n}`);
    });
    if (token !== loadToken) return;
    pool = buildPool(tracks);
    if (!pool.length) {
      renderGuesses();
      setStatus("Nem sikerült dalokat betölteni. Ellenőrizd az internetkapcsolatot, és frissítsd az oldalt.", true);
      return;
    }

    if (mode === "daily") {
      const date = dateKey();
      const track = await pickDailyTrack(date);
      if (token !== loadToken) return;
      if (!track) {
        renderGuesses();
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

    for (let tries = 0; tries < 5 && !round; tries++) {
      const t = track || pickTrack();
      if (!fixed) track = null;
      setStatus("Dal betöltése…");
      try {
        // Friss előnézet-URL, mert a Deezer linkjei lejárnak.
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
      } catch (e) {
        console.warn("Dal betöltése sikertelen:", t.title, e);
        saved = null;
        if (fixed) await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (token !== loadToken) return;
    if (!round) {
      renderGuesses();
      return setStatus("Nem sikerült dalt betölteni. Próbáld újra később.", true);
    }

    if (round.mode === "endless") {
      const recent = load("recent", []).filter((id) => id !== round.track.id);
      recent.unshift(round.track.id);
      save("recent", recent.slice(0, CFG.RECENT_MEMORY));
    }
    persistRound();

    el.audio.src = round.preview;
    el.audio.load();
    renderGuesses();
    renderTimeline();
    renderStreak();

    if (round.done) {
      // Már lejátszott napi dal: csak a megoldást mutatjuk.
      showReveal(false);
      return;
    }
    setControls(true);
    setStatus(round.attempts.length ? "Folytasd, ahol abbahagytad!" : "Nyomd meg a ▶ gombot!");
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

  function registerAttempt(attempt) {
    round.attempts.push(attempt);
    if (attempt.type === "right") return finishRound(true);
    if (round.attempts.length >= MAX_TRIES) return finishRound(false);
    persistRound();
    stopAudio();
    renderGuesses(false, true);
    renderTimeline();
    el.playBtn.classList.add("pulse");
    const len = currentLength();
    if (attempt.type === "skip") setStatus(`Most már ${len} mp-et hallhatsz.`);
    else {
      vibrate(60);
      shake(el.input);
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
    renderGuesses(false, true);
    renderTimeline();
    renderStreak();
    renderPoints(round.points.total > 0);
    if (won) { confetti(); vibrate([30, 40, 30]); }
    else vibrate(150);
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
    el.revealCover.src = coverUrl(round.md5, 500);
    el.revealCover.alt = `${t.album} borítója`;
    el.revealResult.textContent = round.won
      ? (round.attempts.length === 1 ? "Elsőre eltaláltad! 🤯" : `Eltaláltad ${round.attempts.length}. próbálkozásra!`)
      : "Most nem jött össze. A dal:";
    el.revealResult.classList.toggle("lost", !round.won);
    el.revealTitle.textContent = t.title;
    el.revealArtist.textContent = t.artist;
    el.revealAlbum.textContent = t.album;
    el.revealEmoji.textContent = emojiRow(round);
    const p = round.points;
    el.revealPoints.textContent = p && p.total
      ? `+${p.total} pont` + (p.bonus ? ` (${p.base} + ${p.bonus} sorozat-bónusz)` : "")
      : "";
    el.reveal.hidden = false;
    requestAnimationFrame(() => el.reveal.scrollIntoView({ behavior: "smooth", block: "nearest" }));

    if (round.mode === "daily") startCountdown();
    else setStatus("A ▶ gombbal meghallgathatod a teljes előnézetet.");
    if (autoplay) playClip();
    el.nextBtn.focus({ preventScroll: true });
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
      if (ms <= 0 || dateKey() !== round.date) { stopCountdown(); if (mode === "daily") enterMode(); return; }
      const h = Math.floor(ms / 3600e3), m = Math.floor(ms / 60e3) % 60, s = Math.floor(ms / 1e3) % 60;
      setStatus(`Új napi dal: ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopCountdown() { clearInterval(countdownTimer); }

  // ---------- Megjelenítés ----------
  function renderGuesses(skeleton, animateLast) {
    el.guesses.innerHTML = "";
    const attempts = round ? round.attempts : [];
    for (let i = 0; i < MAX_TRIES; i++) {
      const li = document.createElement("li");
      const a = attempts[i];
      const mark = document.createElement("span");
      mark.className = "mark";
      const label = document.createElement("span");
      label.className = "label";
      li.append(mark, label);
      if (skeleton) li.className = "skeleton";
      else if (a) {
        li.className = a.type;
        mark.textContent = { right: "✓", wrong: "✗", near: "~", skip: "»" }[a.type];
        label.textContent = a.type === "skip" ? "Kihagyva" : a.label;
        if (a.type === "near") {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = "jó előadó";
          li.appendChild(tag);
        }
        if (animateLast && i === attempts.length - 1) li.classList.add("new");
      } else if (round && !round.done && i === attempts.length) {
        li.className = "current";
        label.textContent = `${i + 1}. tipp`;
        label.style.color = "var(--muted)";
      }
      el.guesses.appendChild(li);
    }
  }

  function renderTimeline() {
    const full = round && round.done;
    const total = full ? FULL_PREVIEW : MAX_LEN;
    el.timeline.querySelectorAll(".tick").forEach((n) => n.remove());
    if (!full) {
      for (const l of LENGTHS.slice(0, -1)) {
        const tick = document.createElement("div");
        tick.className = "tick";
        tick.style.left = (l / total) * 100 + "%";
        el.timeline.appendChild(tick);
      }
    }
    el.timelineUnlocked.style.width = (round ? (currentLength() / total) * 100 : 0) + "%";
    el.timelineFill.style.width = "0";
    el.timeNow.textContent = fmt(0);
    el.timeMax.textContent = fmt(total);
    el.clipLen.textContent = !round ? "" : full ? "teljes előnézet" : `${currentLength()} mp`;
    if (round && !round.done) {
      const remaining = MAX_TRIES - round.attempts.length;
      const nextLen = LENGTHS[round.attempts.length + 1];
      el.skipBtn.textContent = remaining === 1 ? "Feladom" : `Kihagyás (+${nextLen - currentLength()} mp)`;
    }
  }

  function renderStreak() {
    if (mode === "daily") {
      const st = dailyStreakNow();
      el.streakLine.innerHTML = st > 0
        ? `📅 Napi sorozat: <b>${st}</b> · legjobb: ${dailyStats.maxStreak}`
        : dailyStats.played ? `Napi legjobb sorozat: ${dailyStats.maxStreak}` : "Találd ki a mai dalt!";
    } else {
      el.streakLine.innerHTML = stats.streak > 0
        ? `🔥 Sorozat: <b>${stats.streak}</b> · legjobb: ${stats.maxStreak}`
        : stats.played ? `Legjobb sorozat: ${stats.maxStreak}` : "";
    }
  }

  function renderPoints(bump) {
    el.pointsPill.textContent = `⭐ ${points.toLocaleString("hu-HU")}`;
    if (bump) {
      el.pointsPill.classList.remove("bump");
      void el.pointsPill.offsetWidth;
      el.pointsPill.classList.add("bump");
    }
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

  function shake(node) {
    node.classList.remove("shake");
    void node.offsetWidth;
    node.classList.add("shake");
  }

  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#1ed760", "#f5c542", "#ef4f5f", "#4fa3ef", "#f2f2f5"];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement("i");
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.setProperty("--dx", (Math.random() - 0.5) * 200 + "px");
      c.style.setProperty("--rot", Math.random() * 720 + "deg");
      c.style.animationDuration = 1.4 + Math.random() * 1.2 + "s";
      c.style.animationDelay = Math.random() * 0.25 + "s";
      el.confetti.appendChild(c);
    }
    setTimeout(() => { el.confetti.innerHTML = ""; }, 3000);
  }

  // ---------- Hang ----------
  let rafId = 0;
  let stopAt = 0;

  function stopAudio() {
    cancelAnimationFrame(rafId);
    el.audio.pause();
    el.playBtn.classList.remove("playing", "loading");
    el.playBtn.setAttribute("aria-label", "Lejátszás");
    el.timelineFill.style.width = "0";
    el.timeNow.textContent = fmt(0);
  }

  async function playClip() {
    if (!round) return;
    if (el.playBtn.classList.contains("playing") || el.playBtn.classList.contains("loading")) return stopAudio();
    el.playBtn.classList.remove("pulse");
    stopAt = currentLength();
    const total = round.done ? FULL_PREVIEW : MAX_LEN;
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
    el.playBtn.setAttribute("aria-label", "Megállítás");
    const tick = () => {
      const t = el.audio.currentTime;
      el.timelineFill.style.width = Math.min(t / total, 1) * 100 + "%";
      el.timeNow.textContent = fmt(t);
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

  // ---------- Hangerő ----------
  // iOS-en a weboldal nem állíthatja a hangerőt (a volume mindig 1), csak némítani lehet.
  const volumeSupported = (() => {
    const a = document.createElement("audio");
    a.volume = 0.5;
    return a.volume === 0.5;
  })();
  let volume = load("volume", { level: 80, muted: false });

  function applyVolume() {
    el.audio.volume = Math.max(0, Math.min(1, volume.level / 100));
    el.audio.muted = volume.muted || volume.level === 0;
    el.volumeRange.value = volume.level;
    el.volumeVal.textContent = volume.muted ? "néma" : volume.level + "%";
    el.muteBtn.textContent = volume.muted ? "🔈" : "🔇";
    el.muteBtn.setAttribute("aria-label", volume.muted ? "Hang be" : "Némítás");
    const silent = volume.muted || volume.level === 0;
    el.volumeBtn.classList.toggle("muted", silent);
    el.volumeBtn.classList.toggle("low", !silent && volume.level < 50);
    save("volume", volume);
  }

  el.volumeRange.hidden = !volumeSupported;
  el.volumeNote.hidden = volumeSupported;
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

  function search(q) {
    const nq = norm(q);
    if (!nq) return [];
    const starts = [], contains = [];
    for (const t of pool) {
      if (t.nTitle.startsWith(nq)) starts.push(t);
      else if (t.nTitle.includes(nq) || t.nArtist.includes(nq) || (t.nArtist + " " + t.nTitle).includes(nq)) contains.push(t);
    }
    return starts.concat(contains).slice(0, 12);
  }

  // A beírt szöveget kiemeli a találatban (ékezetektől függetlenül).
  function highlighted(text, q) {
    const span = document.createDocumentFragment();
    const fq = fold(q.trim());
    const idx = fq ? fold(text).indexOf(fq) : -1;
    if (idx < 0 || fold(text).length !== text.length) {
      span.append(text);
      return span;
    }
    const mark = document.createElement("mark");
    mark.textContent = text.slice(idx, idx + fq.length);
    span.append(text.slice(0, idx), mark, text.slice(idx + fq.length));
    return span;
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
      text.append(title, artist);
      li.append(img, text);
      // pointerdown, hogy a mobil billentyűzet bezáródása előtt fusson le
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); choose(t); });
      el.suggestions.appendChild(li);
    });
    el.suggestions.hidden = false;
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
    el.input.value = `${t.title} – ${t.artist}`;
    hideSuggestions();
    updateSubmit();
    updateClear();
  }

  function submit() {
    if (!round || round.done) return;
    let guess = selected;
    if (!guess || el.input.value !== `${guess.title} – ${guess.artist}`) {
      guess = search(el.input.value)[0] || null;
    }
    if (!guess) {
      shake(el.input);
      setStatus("Válassz egy dalt a listából!", true);
      return;
    }
    const answer = round.track;
    const right = guess.key === answer.key || guess.base === answer.base;
    const near = !right && guess.nArtist === answer.nArtist;
    selected = null;
    el.input.value = "";
    hideSuggestions();
    updateSubmit();
    updateClear();
    registerAttempt({ type: right ? "right" : near ? "near" : "wrong", label: `${guess.title} – ${guess.artist}` });
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
      toast("Vágólapra másolva!");
    } catch (e) {
      if (e && e.name !== "AbortError") toast("Nem sikerült megosztani.");
    }
  }

  // ---------- Gombok és billentyűk ----------
  el.playBtn.addEventListener("click", playClip);
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
    el.statPoints.textContent = `⭐ ${points.toLocaleString("hu-HU")} pont`;
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
      bar.textContent = v;
      row.append(lab, bar);
      el.dist.appendChild(row);
    });
  }

  $("statsBtn").addEventListener("click", () => { renderStats(); el.statsDialog.showModal(); });
  $("helpBtn").addEventListener("click", () => el.helpDialog.showModal());

  // ---------- Indítás ----------
  applyVolume();
  renderMode();
  renderCategories();
  renderPoints();
  renderStreak();
  if (!load("seenHelp", false)) {
    el.helpDialog.showModal();
    save("seenHelp", true);
  }
  enterMode();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
})();
