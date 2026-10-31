import { DEFAULT_TINT, el, save, norm, dateKey, msToNextDay, encId, decId } from "./core.js?v=61";
import { mode, pool, round, points, vibrate, setPoints } from "./state.js?v=61";
import { setTint } from "./tint.js?v=61";
import { enterMode } from "./modes.js?v=61";
import { persistRound, originalYear, revealAlbum } from "./round.js?v=61";
import { animatePoints, floatPoints } from "./render.js?v=61";
import { countEvent } from "./analytics.js?v=61";

// ---------- Bónuszkérdés: a megfejtés után az év vagy az album, 4 lehetőségből ----------
export const BONUS_PTS = 25;
// A napi mentésben a helyes válasz nem olvasható ki ránézésre (csak a sorszáma, kódolva).
export const packBonus = (b) => b && { kind: b.kind, options: b.options, picked: b.picked || null, a: encId(b.options.indexOf(b.answer) + 1) };
export function unpackBonus(b) {
  if (!b || !Array.isArray(b.options)) return null;
  if (b.answer) return b; // régi mentés
  const answer = b.options[(decId(b.a) || 0) - 1];
  return answer ? { kind: b.kind, options: b.options, picked: b.picked || undefined, answer } : null;
}
export const bonusEligible = (r) => r.won && r.mode !== "versus";
export const shuffle = (a) => {
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

export async function prepareBonus(r) {
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
export async function makeBonus(r) {
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

export function renderBonus(r) {
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
    setPoints(points + BONUS_PTS);
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

export function renderRevealPoints(r) {
  const p = r.points;
  const quiz = r.bonus && r.bonus.picked === r.bonus.answer ? ` · 🎯 +${BONUS_PTS}` : "";
  el.revealPoints.textContent = p && p.total
    ? `+${p.total} pont` + (p.bonus ? ` (🔥 +${p.bonus})` : "") + quiz
    : "";
}

export function resetStage() {
  el.bonus.hidden = true;
  el.revealAlbum.hidden = false;
  el.disc.classList.remove("revealed");
  el.discCover.classList.remove("loaded");
  el.discCover.removeAttribute("src");
  el.reveal.hidden = true;
  setTint(DEFAULT_TINT);
}

export function showDone(on) {
  el.controls.hidden = on;
  el.doneButtons.hidden = !on;
  if (!on) el.reveal.hidden = true;
}

let countdownTimer = 0;
export function startCountdown() {
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
export function stopCountdown() { clearInterval(countdownTimer); }
