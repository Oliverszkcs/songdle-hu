import { SET_SIZE, $, num, save, artistLine, reducedMotion } from "./core.js?v=65";
import { mode, pool, round, game, bestGame, gameScore, gameDone, vibrate } from "./state.js?v=65";
import { bonusEligible } from "./bonus.js?v=65";
import { startRound } from "./round.js?v=65";
import { shareRound, setMark } from "./controls.js?v=65";
import { confetti } from "./render.js?v=65";

// ---------- Kör vége (végtelen mód): az 5 dal összesítője, jutalomképernyőként ----------
const se = {
  dialog: $("setEndDialog"), badge: $("seBadge"), stars: $("seStars"), title: $("seTitle"), sub: $("seSub"),
  score: $("seScore"), record: $("seRecord"), bar: $("seBar"), recordText: $("seRecordText"), list: $("seList"),
  share: $("seShareBtn"),
};
const SHARE_LABEL = se.share.textContent;

// A kör „érme” az eltalált dalok száma szerint; a csillagok: 1, 3 és 5 eltalált dalnál.
const TIERS = [
  { won: 5, badge: "🏆", tier: "gold", title: "Hibátlan kör!", sub: "Mind az 5 dalt felismerted." },
  { won: 4, badge: "🥇", tier: "gold", title: "Zenei zseni!", sub: "5-ből 4 dal megvolt." },
  { won: 3, badge: "🥈", tier: "silver", title: "Szép kör!", sub: "5-ből 3 dal megvolt." },
  { won: 2, badge: "🥉", tier: "bronze", title: "Nem rossz!", sub: "5-ből 2 dal megvolt." },
  { won: 1, badge: "🎧", tier: "plain", title: "Ez most nehéz volt", sub: "5-ből 1 dal megvolt." },
  { won: 0, badge: "🎧", tier: "plain", title: "Majd a következő!", sub: "Most egy dal sem jött össze." },
];
const starCount = (won) => (won >= 5 ? 3 : won >= 3 ? 2 : won >= 1 ? 1 : 0);

let countRaf = 0;
function countUp(node, to, ms) {
  cancelAnimationFrame(countRaf);
  if (reducedMotion.matches || to <= 0) { node.textContent = num(to); return; }
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / ms);
    node.textContent = num(Math.round(to * (1 - (1 - p) ** 3)));
    if (p < 1) countRaf = requestAnimationFrame(step);
  };
  node.textContent = "0";
  countRaf = requestAnimationFrame(step);
}

function renderSetEnd() {
  const score = gameScore();
  const won = game.results.filter((r) => r.won).length;
  const t = TIERS.find((x) => won >= x.won);
  se.dialog.dataset.tier = game.record ? "record" : t.tier;
  se.badge.textContent = t.badge;
  se.title.textContent = game.record ? "Új rekord!" : t.title;
  se.sub.textContent = t.sub;

  const stars = starCount(won);
  se.stars.textContent = "";
  se.stars.setAttribute("aria-label", `${stars} csillag a 3-ból`);
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("span");
    s.className = i < stars ? "on" : "";
    s.style.setProperty("--i", i);
    s.textContent = "★";
    s.setAttribute("aria-hidden", "true");
    se.stars.appendChild(s);
  }

  countUp(se.score, score, 1100);
  // Rekord-sáv: új rekordnál tele (az előzővel), különben hol tart a kör a rekordhoz képest.
  const prev = game.prevBest ?? bestGame;
  const target = game.record ? score : Math.max(bestGame, 1);
  se.record.classList.toggle("rec", !!game.record);
  se.bar.style.setProperty("--w", Math.min(1, score / target).toFixed(3));
  se.recordText.textContent = game.record
    ? (prev > 0 ? `🏆 Megdöntötted a rekordod: ${num(prev)} → ${num(score)}` : "🏆 Ez az első rekordod!")
    : score === bestGame ? `Pont a rekordod: ${num(bestGame)}` : `Rekord: ${num(bestGame)} · még ${num(bestGame - score)} pont hiányzott`;

  se.list.innerHTML = "";
  game.results.forEach((r, i) => {
    // A régebbi mentésekben nincs cím: a dallistából keressük ki.
    const tr = r.title ? r : pool.find((x) => x.id === r.id);
    const li = document.createElement("li");
    li.className = r.won ? "" : "lost";
    li.style.setProperty("--i", i);
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = setMark(r);
    mark.title = r.won ? `${r.tries}. tippre` : "Nem jött össze";
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = tr ? tr.title : "?";
    if (tr) {
      const by = document.createElement("small");
      by.textContent = r.title ? r.artist : artistLine(tr);
      nm.append(by);
    }
    const pts = document.createElement("b");
    pts.textContent = r.won ? `+${r.pts}` : "0";
    li.append(mark, nm, pts);
    se.list.appendChild(li);
  });
  se.share.textContent = SHARE_LABEL;
  se.share.disabled = false;
}

// celebrate: a kör végén magától nyílik (konfetti, rezgés); az „Összesítő” gombbal csendben.
export function openSetEnd(celebrate) {
  if (mode !== "endless" || !gameDone() || document.querySelector("dialog[open]")) return;
  renderSetEnd();
  se.dialog.classList.remove("play");
  void se.dialog.offsetWidth;
  se.dialog.classList.add("play");
  se.dialog.showModal();
  const won = game.results.filter((r) => r.won).length;
  if (celebrate && (game.record || won >= 3)) {
    setTimeout(confetti, 350);
    vibrate([30, 40, 30, 40, 60]);
  }
}

// A kör utolsó dala után egyszer magától feljön; ha bónuszkérdés jár, csak a válasz után
// (noBonus: ehhez a dalhoz nem lett kérdés).
export function maybeOpenSetEnd(r, noBonus) {
  if (r.mode !== "endless" || !gameDone() || game.endShown) return;
  if (!noBonus && bonusEligible(r) && !(r.bonus && r.bonus.picked)) return;
  game.endShown = true;
  save("game", game);
  setTimeout(() => { if (round === r) openSetEnd(true); }, 1600);
}

// A megosztás eredménye a gombon látszik (a párbeszédablak alatt a játék többi része takarásban van).
const SHARE_RESULT = { copied: "✓ Link másolva!", shared: "✓ Elküldve", failed: "Nem sikerült" };
let shareTimer = 0;
async function shareFromDialog() {
  se.share.disabled = true;
  const res = await shareRound();
  se.share.disabled = false;
  if (!SHARE_RESULT[res]) return;
  se.share.textContent = SHARE_RESULT[res];
  se.share.classList.toggle("done", res !== "failed");
  clearTimeout(shareTimer);
  shareTimer = setTimeout(() => { se.share.textContent = SHARE_LABEL; se.share.classList.remove("done"); }, 3000);
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  $("seNextBtn").addEventListener("click", () => { se.dialog.close(); startRound(); });
  se.share.addEventListener("click", shareFromDialog);
  // A megfejtésnél lévő „Összesítő” gomb újra megnyitja.
  $("revealSet").addEventListener("click", (e) => { if (e.target.closest(".set-sum-btn")) openSetEnd(false); });
}
