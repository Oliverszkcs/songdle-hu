import {
  CFG, LENGTHS, MAX_TRIES, MAX_LEN, FULL_PREVIEW, POINTS, STREAK_BONUS, STREAK_BONUS_MAX, reducedMotion, $, el,
  num, load, save, norm, coverUrl, artistLine, dateKey, shiftDate, encId, retrigger,
} from "./core.js?v=60";
import { storeFirstYear, loadClip, shownName, isReported, weightedPick } from "./pool.js?v=60";
import {
  mode, category, hard, lengthsOf, multOf, pool, round, loadToken, stats, dailyDiff, dailyStatsAll, dailyStats,
  points, game, bestGame, gameScore, gameDone, versus, vsOver, dailyKey, setStatus, vibrate, setLoading,
  setGame, setRound, setSelected, setPoints, setBestGame,
} from "./state.js?v=60";
import { setTint, coverColors } from "./tint.js?v=60";
import { updateNextButton, renderCategories } from "./modes.js?v=60";
import {
  packBonus, unpackBonus, bonusEligible, prepareBonus, renderBonus, renderRevealPoints, resetStage, showDone,
  startCountdown, stopCountdown,
} from "./bonus.js?v=60";
import {
  renderAll, buildWave, animatePoints, floatPoints, setControls, updateClear, confetti,
} from "./render.js?v=60";
import { stopAudio, playClip } from "./audio.js?v=60";
import { hideSuggestions } from "./autocomplete.js?v=60";
import { vsWaitingFor, names, renderVsSummary, saveBattle } from "./versus.js?v=60";
import { vsSendProgress } from "./peer.js?v=60";
import { stream, streamSongReady } from "./stream.js?v=60";
import { countEvent } from "./analytics.js?v=60";
import { renderReportBtn } from "./report.js?v=60";

// ---------- Kör ----------
// Előadó-rotáció: előbb előadót sorsolunk (a sokdalos előadók ne nyomják el a
// kevésdalosakat), és kihagyjuk azt, aki az utolsó ARTIST_GAP körben szerepelt.
export const artistsOf = (t) => [t.src || t.artist, ...(t.nArtists || [norm(t.artist)])].map(norm);

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

export async function startRound(track, saved) {
  const token = loadToken;
  const fixed = !!track;
  if (mode === "endless" && !saved && gameDone()) {
    setGame({ results: [] });
    save("game", game);
  }
  stopAudio();
  stopCountdown();
  setRound(null);
  setSelected(null);
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
      setRound({
        mode, date: mode === "daily" ? dateKey() : null, diff: mode === "daily" ? dailyDiff : null, track: t,
        attempts: saved ? saved.attempts : [], done: !!(saved && saved.done), won: !!(saved && saved.won),
        points: saved && saved.points ? saved.points : null,
        // Nehéz mód: visszafelé szól; a mentett körnél a régi beállítás marad.
        reverse: saved ? !!saved.reverse : mode === "endless" && hard,
        heard: !!(saved && saved.heard),
        bonus: unpackBonus(saved && saved.bonus),
        preview: clip.preview,
        md5: clip.md5 || t.md5, year: clip.year || "",
      });
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

export function persistRound() {
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
export const usedTries = (r) => (r.mode !== "stream" ? r.attempts.length : stream && stream.cur ? stream.cur.stage : 0);
export function currentLength() {
  if (!round) return LENGTHS[0];
  if (round.done) return FULL_PREVIEW;
  // Streamer módban a két fél együtt halad: a részlet hossza a közös körtől függ.
  const n = usedTries(round);
  return lengthsOf(round)[Math.min(n, MAX_TRIES - 1)];
}
export const scaleLength = () => (round && round.done ? FULL_PREVIEW : MAX_LEN);

export function registerAttempt(attempt) {
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

export function scoreFor(won, tries, streakAfter, multiplier) {
  if (!won) return { base: 0, bonus: 0, total: 0 };
  const base = Math.round(POINTS[tries - 1] * multiplier);
  const bonus = Math.min(Math.max(streakAfter - 1, 0) * STREAK_BONUS, STREAK_BONUS_MAX);
  return { base, bonus, total: base + bonus };
}

export function finishRound(won, silent) {
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
  setPoints(points + round.points.total);
  save("points", points);
  if (round.mode === "endless" && !silent && !gameDone()) {
    // A dal azonosítója a kihíváshoz kell (a kör 5 dala megosztható).
    // base: a kihívásban is elérhető pont (sorozatbónusz és nehéz-szorzó nélkül), hogy a meccs igazságos legyen.
    game.results.push({ won, pts: round.points.total, base: scoreFor(won, tries, 0, 1).total, id: round.track.id });
    if (gameDone()) {
      const score = gameScore();
      game.record = score > bestGame && score > 0;
      game.prevBest = bestGame;
      if (game.record) { setBestGame(score); save("bestGame", bestGame); }
      countEvent("endless-round-done");
    }
    save("game", game);
  }
  persistRound();
}

export function emojiRow(r) {
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
export function originalYear(t, deezerYear) {
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

// A hangminta forrása (Deezer): a felfedés alatt a dal Deezer-oldalára mutat.
export function setDeezerLink(t) {
  const a = $("dzLink");
  a.href = `https://www.deezer.com/track/${Number(t.id) || ""}`;
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
  setDeezerLink(t);
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
      ? `🏁 Kör vége: <b>${num(score)}</b> pont · <span class="rec">🏆 Új rekord!</span>`
      : `🏁 Kör vége: <b>${num(score)}</b> pont · rekord: ${num(bestGame)}`;
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
export function revealAlbum(r) {
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
export function hideAlbum() {
  el.revealAlbum.hidden = true;
  el.disc.classList.remove("revealed");
  el.discCover.removeAttribute("src");
}
