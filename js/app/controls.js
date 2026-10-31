import { SET_SIZE, diffById, el, load, encId, toast } from "./core.js?v=62";
import { catLabel } from "./pool.js?v=62";
import { mode, category, round, stats, game, gameDone, dailyStreakNow, nextUnplayedDiff } from "./state.js?v=62";
import { changeDifficulty, changeMode } from "./modes.js?v=62";
import { startRound, registerAttempt, emojiRow } from "./round.js?v=62";
import { playClip } from "./audio.js?v=62";
import { submit, copyText } from "./autocomplete.js?v=62";
import { vsNext, vsShare } from "./versus.js?v=62";
import { streamLock, streamNext } from "./stream.js?v=62";
import { countEvent } from "./analytics.js?v=62";

// ---------- Megosztás ----------
export const homeUrl = () => location.origin + location.pathname;
// Kihívás-link: a kör dalai (36-os számrendszerben), a pontszám és a név.
export function challengeUrl(ids, score) {
  const p = new URLSearchParams({ c: ids.map(encId).join("-"), p: score });
  const nick = load("nick", "");
  if (nick) p.set("n", nick);
  return homeUrl() + "?" + p;
}

export async function shareText(text) {
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

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
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
    // Fókuszban lévő gombon, linken vagy mezőn a Szóköz azt kezeli (különben billentyűzetről nem lehetne megnyomni).
    if (e.key === " " && !el.playBtn.disabled && !e.target.closest("button, a, input, select, textarea, [role=tab], [tabindex]")) {
      e.preventDefault();
      playClip();
    } else if (e.key === "Enter" && round && round.done && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      el.nextBtn.click();
    }
  });
}
