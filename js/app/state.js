import {
  CFG, LENGTHS, MAX_TRIES, SET_SIZE, DIFFS, diffById, el, load, dateKey, shiftDate, retrigger,
} from "./core.js?v=60";
import { allCats } from "./pool.js?v=60";

// ---------- Állapot ----------
// A „versus” (párbaj, kihívás) módot nem mentjük: újratöltés után a mentett fülre térünk vissza.
export let mode = ["daily", "artist"].includes(load("mode", "endless")) ? load("mode", "endless") : "endless";
export let category = load("category", "all");
// Nehéz mód (végtelen): a dal eleje visszafelé szól, hosszabb részletekkel, több pontért.
export let hard = load("hard", false);
const HARD_MULT = CFG.HARD_MULTIPLIER || 1.5;
export const HARD_MULT_TEXT = String(HARD_MULT).replace(".", ",");
const HARD_LENGTHS = (CFG.HARD_CLIP_LENGTHS || []).length === MAX_TRIES ? CFG.HARD_CLIP_LENGTHS : LENGTHS;
export const lengthsOf = (r) => (r && r.reverse ? HARD_LENGTHS : LENGTHS);
export const multOf = (r) => r.mode === "daily" ? diffById(r.diff).multiplier : r.reverse ? HARD_MULT : 1;
export let pool = [];
// round: { mode, date?, track, attempts: [{type, label, key?}], done, won, points, preview, md5 }
export let round = null;
export let selected = null;
export let loadToken = 0;

const defaultStats = () => ({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0, 0] });
export let stats = Object.assign(defaultStats(), load("stats", {}));
export let dailyDiff = diffById(load("dailyDiff", DIFFS[0].id)).id;
// Nehézségenként külön napi statisztika. A régi (egyetlen) napi statisztika a Közepesbe kerül.
export const dailyStatsAll = (() => {
  const saved = load("dailyStats2", null);
  const legacy = saved ? null : load("dailyStats", null);
  const all = {};
  for (const d of DIFFS) {
    all[d.id] = Object.assign(defaultStats(), { lastWin: null },
      saved ? saved[d.id] : legacy && d.id === "medium" ? legacy : {});
  }
  return all;
})();
export const dailyStats = (id = dailyDiff) => dailyStatsAll[id];
export let points = load("points", 0);
// Végtelen mód: 5 dalos kör (dalonkénti eredmény) és a legjobb kör pontszáma.
export let game = load("game", null);
// Hibás mentésnél (pl. null) új kör indul, különben az indulás elakadna.
if (!game || !Array.isArray(game.results)) game = { results: [] };
export let bestGame = load("bestGame", 0);
export const gameScore = () => game.results.reduce((a, r) => a + r.pts, 0);
export const gameDone = () => game.results.length >= SET_SIZE;
export let shownPoints = points;
// Párbaj (élő, 2–6 játékos) és kihívás (link egy barát 5 dalos körével):
// { kind: "battle" | "challenge", ids, idx, results: [{won, pts, tries}], cur?,
//   opps: [{ id, name, score?, results: [], live: {}, gone?, rematch? }], waiting, rematchMe? }
export let versus = null;
export const VS_SONGS = CFG.VERSUS_SONGS || 5;
export const vsScore = (results) => (results || []).reduce((a, r) => a + (r ? r.pts : 0), 0);
export const oppScore = (o) => (o.score != null ? o.score : vsScore(o.results));
export const oppFinished = (o) => o.gone || o.score != null || o.results.filter(Boolean).length >= versus.ids.length;
export const vsOver = () => versus && versus.results.filter(Boolean).length >= versus.ids.length;
export const vsOppOver = () => versus && versus.opps.every(oppFinished);

export function dailyStreakNow(id = dailyDiff) {
  const s = dailyStats(id), today = dateKey();
  return s.lastWin === today || s.lastWin === shiftDate(today, -1) ? s.streak : 0;
}

export const dailyKey = (date, id) => `daily.${date}.${id}`;
export const dailyResult = (id) => load(dailyKey(dateKey(), id), null);
export function nextUnplayedDiff() {
  const start = DIFFS.findIndex((d) => d.id === dailyDiff);
  for (let k = 1; k < DIFFS.length; k++) {
    const d = DIFFS[(start + k) % DIFFS.length];
    const r = dailyResult(d.id);
    if (!r || !r.done) return d;
  }
  return null;
}

export function setStatus(msg, isError) {
  if (el.status.textContent === (msg || "")) return;
  el.status.textContent = msg || "";
  el.status.classList.toggle("error", !!isError);
  retrigger(el.status, "flash");
}



export const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* nem támogatott */ } };

export function confirmDialog() {
  return new Promise((resolve) => {
    el.confirmDialog.returnValue = "";
    el.confirmDialog.addEventListener("close", () => resolve(el.confirmDialog.returnValue === "ok"), { once: true });
    el.confirmDialog.showModal();
  });
}

export function setLoading(on, fraction) {
  el.stage.classList.toggle("loading", on);
  el.loadBar.hidden = !on;
  if (on) el.loadFill.style.width = Math.round((fraction || 0) * 100) + "%";
}

// Más modulból csak ezeken keresztül írható (az importált változó csak olvasható).
export function setHard(v) { return (hard = v); }
export function setDailyDiff(v) { return (dailyDiff = v); }
export function setGame(v) { return (game = v); }
export function setCategory(v) { return (category = v); }
export function setMode(v) { return (mode = v); }
export function setLoadToken(v) { return (loadToken = v); }
export function setRound(v) { return (round = v); }
export function setPool(v) { return (pool = v); }
export function setSelected(v) { return (selected = v); }
export function setPoints(v) { return (points = v); }
export function setBestGame(v) { return (bestGame = v); }
export function setShownPoints(v) { return (shownPoints = v); }
export function setVersus(v) { return (versus = v); }

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  if (!allCats.some((c) => c.id === category)) category = "all";
}
