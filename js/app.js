(function () {
  "use strict";

  const CFG = window.SONGDLE_CONFIG;
  const LENGTHS = CFG.CLIP_LENGTHS;
  const MAX_TRIES = LENGTHS.length;
  const MAX_LEN = LENGTHS[MAX_TRIES - 1];
  const FULL_PREVIEW = 30;
  const LS = "songdle.";

  const $ = (id) => document.getElementById(id);
  const el = {
    categories: $("categories"), streakLine: $("streakLine"), guesses: $("guesses"),
    status: $("status"), reveal: $("reveal"), revealCover: $("revealCover"),
    revealResult: $("revealResult"), revealTitle: $("revealTitle"), revealArtist: $("revealArtist"),
    revealAlbum: $("revealAlbum"), revealLink: $("revealLink"), timeline: $("timeline"),
    timelineUnlocked: $("timelineUnlocked"), timelineFill: $("timelineFill"), timeNow: $("timeNow"),
    timeMax: $("timeMax"), playBtn: $("playBtn"), controls: $("controls"), input: $("guessInput"),
    suggestions: $("suggestions"), skipBtn: $("skipBtn"), submitBtn: $("submitBtn"), nextBtn: $("nextBtn"),
    audio: $("audio"), statsDialog: $("statsDialog"), statGrid: $("statGrid"), dist: $("dist"),
    helpDialog: $("helpDialog"),
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
  function norm(s) {
    return s.toLocaleLowerCase("hu").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function baseTitle(t) {
    const stripped = t.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "");
    return norm(stripped) || norm(t);
  }
  const fmt = (s) => `0:${String(Math.floor(s)).padStart(2, "0")}`;
  const coverUrl = (md5, size) =>
    md5 ? `https://cdn-images.dzcdn.net/images/cover/${md5}/${size}x${size}-000000-80-0-0.jpg` : "";

  // ---------- Dalkészlet ----------
  const excludeRe = new RegExp(CFG.EXCLUDE_TITLE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

  function slimTrack(t) {
    return {
      id: t.id, title: t.title, artist: t.artist.name, album: t.album ? t.album.title : "",
      md5: t.md5_image || (t.album && t.album.md5_image) || "", rank: t.rank || 0,
    };
  }

  async function withRetry(fn) {
    try { return await fn(); } catch (e) {
      await new Promise((r) => setTimeout(r, 1500));
      return fn();
    }
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

  function buildPool(tracks) {
    const byKey = new Map();
    const isLive = (t) => /\blive\b|\bél[őo]\b|koncert/i.test(t.title);
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

  // ---------- Állapot ----------
  let category = load("category", "all");
  if (!CFG.CATEGORIES.some((c) => c.id === category)) category = "all";
  let pool = [];
  let round = null; // { track, attempts: [{type, label}], done, won, preview, cover }
  let selected = null;
  let loadToken = 0;

  const defaultStats = () => ({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0, 0] });
  let stats = Object.assign(defaultStats(), load("stats", {}));

  function setStatus(msg, isError) {
    el.status.textContent = msg || "";
    el.status.classList.toggle("error", !!isError);
  }

  // ---------- Kategóriák ----------
  function renderCategories() {
    el.categories.innerHTML = "";
    for (const c of CFG.CATEGORIES) {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = c.label;
      b.setAttribute("aria-pressed", String(c.id === category));
      b.addEventListener("click", () => changeCategory(c.id));
      el.categories.appendChild(b);
    }
  }

  async function changeCategory(id) {
    if (id === category) return;
    if (round && !round.done && round.attempts.length > 0) {
      if (!confirm("Kategóriaváltáskor a mostani kör vesztesnek számít. Folytatod?")) return;
      finishRound(false, true);
    }
    category = id;
    save("category", category);
    save("round", null);
    renderCategories();
    await loadPoolAndStart();
  }

  async function loadPoolAndStart() {
    const token = ++loadToken;
    stopAudio();
    round = null;
    setControls(false);
    el.reveal.hidden = true;
    el.nextBtn.hidden = true;
    renderGuesses();
    renderTimeline();

    const artists = category === "all" ? CFG.ARTISTS : CFG.ARTISTS.filter((a) => (a.tags || []).includes(category));
    setStatus("Dalok betöltése…");
    const tracks = await loadArtists(artists, (d, n) => {
      if (token === loadToken) setStatus(`Dalok betöltése… ${d}/${n}`);
    });
    if (token !== loadToken) return;
    pool = buildPool(tracks);
    if (!pool.length) {
      setStatus("Nem sikerült dalokat betölteni. Ellenőrizd az internetkapcsolatot, és frissítsd az oldalt.", true);
      return;
    }
    const saved = load("round", null);
    if (saved && saved.category === category) {
      const t = pool.find((p) => p.id === saved.trackId);
      if (t) return startRound(t, saved.attempts);
    }
    startRound();
  }

  // ---------- Kör ----------
  function pickTrack() {
    const recent = load("recent", []);
    const recentSet = new Set(recent);
    const fresh = pool.filter((t) => !recentSet.has(t.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

  async function startRound(track, attempts) {
    const token = loadToken;
    stopAudio();
    round = null;
    selected = null;
    el.input.value = "";
    hideSuggestions();
    el.reveal.hidden = true;
    el.nextBtn.hidden = true;
    el.controls.hidden = false;
    setControls(false);

    for (let tries = 0; tries < 5; tries++) {
      const t = track || pickTrack();
      track = null;
      setStatus("Dal betöltése…");
      try {
        // Friss előnézet-URL, mert a Deezer linkjei lejárnak.
        const full = await Deezer.track(t.id);
        if (token !== loadToken) return;
        if (!full.preview) throw new Error("Nincs előnézet");
        round = {
          track: t, attempts: attempts || [], done: false, won: false,
          preview: full.preview,
          md5: (full.album && full.album.md5_image) || t.md5,
          link: full.link || `https://www.deezer.com/track/${t.id}`,
        };
        break;
      } catch (e) {
        console.warn("Dal kihagyva:", t.title, e);
        attempts = null;
      }
    }
    if (!round || round.done || token !== loadToken) {
      if (token === loadToken) setStatus("Nem sikerült dalt betölteni. Próbáld újra később.", true);
      return;
    }

    const recent = load("recent", []).filter((id) => id !== round.track.id);
    recent.unshift(round.track.id);
    save("recent", recent.slice(0, CFG.RECENT_MEMORY));
    persistRound();

    el.audio.src = round.preview;
    el.audio.load();
    setStatus("Nyomd meg a ▶ gombot!");
    setControls(true);
    renderGuesses();
    renderTimeline();
    renderStreak();
  }

  function persistRound() {
    if (round && !round.done) save("round", { category, trackId: round.track.id, attempts: round.attempts });
    else save("round", null);
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
    renderGuesses();
    renderTimeline();
    const len = currentLength();
    setStatus(attempt.type === "skip" ? `Most már ${len} mp-et hallhatsz.` : `Nem ez az. Most már ${len} mp-et hallhatsz.`);
  }

  function finishRound(won, silent) {
    round.done = true;
    round.won = won;
    stats.played++;
    if (won) {
      stats.wins++;
      stats.streak++;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      stats.dist[round.attempts.length - 1]++;
    } else {
      stats.streak = 0;
      stats.dist[MAX_TRIES]++;
    }
    save("stats", stats);
    persistRound();
    if (silent) return;

    stopAudio();
    renderGuesses();
    renderTimeline();
    renderStreak();
    showReveal();
  }

  function showReveal() {
    const t = round.track;
    setControls(false);
    el.controls.hidden = true;
    el.playBtn.disabled = false;
    el.revealCover.src = coverUrl(round.md5, 500);
    el.revealCover.alt = `${t.album} borítója`;
    el.revealResult.textContent = round.won
      ? `Eltaláltad ${round.attempts.length}. próbálkozásra!`
      : "Most nem jött össze. A dal:";
    el.revealResult.classList.toggle("lost", !round.won);
    el.revealTitle.textContent = t.title;
    el.revealArtist.textContent = t.artist;
    el.revealAlbum.textContent = t.album;
    el.revealLink.href = round.link;
    el.reveal.hidden = false;
    el.nextBtn.hidden = false;
    setStatus("A ▶ gombbal meghallgathatod a teljes előnézetet.");
    el.nextBtn.focus({ preventScroll: true });
  }

  // ---------- Megjelenítés ----------
  function renderGuesses() {
    el.guesses.innerHTML = "";
    const attempts = round ? round.attempts : [];
    for (let i = 0; i < MAX_TRIES; i++) {
      const li = document.createElement("li");
      const a = attempts[i];
      const mark = document.createElement("span");
      mark.className = "mark";
      const label = document.createElement("span");
      label.className = "label";
      if (a) {
        li.className = a.type;
        mark.textContent = a.type === "right" ? "✓" : a.type === "wrong" ? "✗" : "»";
        label.textContent = a.type === "skip" ? "Kihagyva" : a.label;
      } else if (round && !round.done && i === attempts.length) {
        li.className = "current";
      }
      li.append(mark, label);
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
    el.timelineUnlocked.style.width = (currentLength() / total) * 100 + "%";
    el.timelineFill.style.width = "0";
    el.timeNow.textContent = fmt(0);
    el.timeMax.textContent = fmt(total);
    const remaining = round ? MAX_TRIES - round.attempts.length : MAX_TRIES;
    if (round && !round.done) {
      const nextLen = LENGTHS[round.attempts.length + 1];
      el.skipBtn.textContent = remaining === 1 ? "Feladom" : `Kihagyás (+${nextLen - currentLength()} mp)`;
    }
  }

  function renderStreak() {
    el.streakLine.textContent = stats.streak > 0 ? `🔥 Sorozat: ${stats.streak}` : stats.played ? `Legjobb sorozat: ${stats.maxStreak}` : "";
  }

  function setControls(on) {
    el.input.disabled = !on;
    el.skipBtn.disabled = !on;
    el.playBtn.disabled = !on;
    updateSubmit();
  }

  function updateSubmit() {
    el.submitBtn.disabled = el.input.disabled || !el.input.value.trim();
  }

  // ---------- Hang ----------
  let rafId = 0;
  let stopAt = 0;

  function stopAudio() {
    cancelAnimationFrame(rafId);
    el.audio.pause();
    el.playBtn.classList.remove("playing");
    el.playBtn.setAttribute("aria-label", "Lejátszás");
    el.timelineFill.style.width = "0";
    el.timeNow.textContent = fmt(0);
  }

  async function playClip() {
    if (!round) return;
    if (el.playBtn.classList.contains("playing")) return stopAudio();
    stopAt = currentLength();
    const total = round.done ? FULL_PREVIEW : MAX_LEN;
    try {
      el.audio.currentTime = 0;
      await el.audio.play();
    } catch (e) {
      console.warn(e);
      setStatus("Nem sikerült lejátszani. Próbáld újra!", true);
      return;
    }
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
      if (starts.length >= 10) break;
    }
    return starts.concat(contains).slice(0, 10);
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
      const title = document.createElement("span");
      title.className = "s-title";
      title.textContent = t.title;
      const artist = document.createElement("span");
      artist.className = "s-artist";
      artist.textContent = t.artist;
      li.append(title, artist);
      // pointerdown, hogy a mobil billentyűzet bezáródása előtt fusson le
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); choose(t); });
      el.suggestions.appendChild(li);
    });
    el.suggestions.hidden = false;
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
  }

  function submit() {
    if (!round || round.done) return;
    let guess = selected;
    if (!guess || el.input.value !== `${guess.title} – ${guess.artist}`) {
      const list = search(el.input.value);
      guess = list[0] || null;
    }
    if (!guess) {
      el.input.classList.remove("shake");
      void el.input.offsetWidth;
      el.input.classList.add("shake");
      setStatus("Válassz egy dalt a listából!", true);
      return;
    }
    const answer = round.track;
    const right = guess.key === answer.key || guess.base === answer.base;
    selected = null;
    el.input.value = "";
    hideSuggestions();
    updateSubmit();
    registerAttempt({ type: right ? "right" : "wrong", label: `${guess.title} – ${guess.artist}` });
  }

  el.input.addEventListener("input", () => { selected = null; renderSuggestions(); updateSubmit(); });
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

  // ---------- Gombok ----------
  el.playBtn.addEventListener("click", playClip);
  el.submitBtn.addEventListener("click", submit);
  el.skipBtn.addEventListener("click", () => {
    if (round && !round.done) registerAttempt({ type: "skip" });
  });
  el.nextBtn.addEventListener("click", () => startRound());

  // ---------- Statisztika ----------
  function renderStats() {
    const pct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
    el.statGrid.innerHTML = "";
    for (const [n, l] of [[stats.played, "Játszott"], [pct + "%", "Nyert"], [stats.streak, "Sorozat"], [stats.maxStreak, "Legjobb"]]) {
      const d = document.createElement("div");
      d.innerHTML = `<div class="n"></div><div class="l"></div>`;
      d.firstChild.textContent = n;
      d.lastChild.textContent = l;
      el.statGrid.appendChild(d);
    }
    const max = Math.max(1, ...stats.dist);
    el.dist.innerHTML = "";
    stats.dist.forEach((v, i) => {
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
  renderCategories();
  renderStreak();
  if (!load("seenHelp", false)) {
    el.helpDialog.showModal();
    save("seenHelp", true);
  }
  loadPoolAndStart();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
})();
