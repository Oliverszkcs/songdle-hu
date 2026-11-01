import { SET_SIZE, $, num, save, artistLine } from "./core.js?v=63";
import { mode, pool, round, game, bestGame, gameScore, gameDone } from "./state.js?v=63";
import { bonusEligible } from "./bonus.js?v=63";
import { startRound } from "./round.js?v=63";
import { shareRound } from "./controls.js?v=63";

// ---------- Kör vége (végtelen mód): az 5 dal összesítője ----------
const se = {
  dialog: $("setEndDialog"), verdict: $("seVerdict"), score: $("seScore"), list: $("seList"),
};
// A dal színe a tippek száma szerint (mint a párbaj megosztásában); ✗ = nem jött össze.
const TRY_MARK = ["", "🟩", "🟩", "🟨", "🟨", "🟧", "🟥"];

function renderSetEnd() {
  const score = gameScore();
  const won = game.results.filter((r) => r.won).length;
  se.verdict.textContent = game.record ? "🏆 Új rekord!" : won === SET_SIZE ? "🔥 Hibátlan kör!" : "🏁 Kör vége";
  se.verdict.classList.toggle("win", !!game.record || won === SET_SIZE);
  se.score.textContent = "";
  const b = document.createElement("b");
  b.textContent = num(score);
  se.score.append(b, ` pont · ${won}/${SET_SIZE} eltalálva`);
  if (!game.record) se.score.append(` · rekord: ${num(bestGame)}`);
  se.list.innerHTML = "";
  for (const r of game.results) {
    // A régebbi mentésekben nincs cím: a dallistából keressük ki.
    const t = r.title ? r : pool.find((x) => x.id === r.id);
    const li = document.createElement("li");
    li.className = r.won ? "" : "lost";
    const mark = document.createElement("span");
    mark.className = "place";
    mark.textContent = r.won ? TRY_MARK[r.tries] || "🟩" : "✗";
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = t ? t.title : "?";
    if (t) {
      const by = document.createElement("small");
      by.textContent = r.title ? r.artist : artistLine(t);
      nm.append(by);
    }
    const pts = document.createElement("b");
    pts.textContent = r.won ? `+${r.pts}` : "0";
    li.append(mark, nm, pts);
    se.list.appendChild(li);
  }
}

export function openSetEnd() {
  if (mode !== "endless" || !gameDone() || document.querySelector("dialog[open]")) return;
  renderSetEnd();
  se.dialog.showModal();
}

// A kör utolsó dala után egyszer magától feljön; ha bónuszkérdés jár, csak a válasz után
// (noBonus: ehhez a dalhoz nem lett kérdés).
export function maybeOpenSetEnd(r, noBonus) {
  if (r.mode !== "endless" || !gameDone() || game.endShown) return;
  if (!noBonus && bonusEligible(r) && !(r.bonus && r.bonus.picked)) return;
  game.endShown = true;
  save("game", game);
  setTimeout(() => { if (round === r) openSetEnd(); }, 1600);
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  $("seNextBtn").addEventListener("click", () => { se.dialog.close(); startRound(); });
  $("seShareBtn").addEventListener("click", shareRound);
  // A megfejtésnél lévő „Összesítő” gomb újra megnyitja.
  $("revealSet").addEventListener("click", (e) => { if (e.target.closest(".set-sum-btn")) openSetEnd(); });
}
