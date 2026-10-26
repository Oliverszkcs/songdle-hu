import { LS, $, el, load, encId } from "./core.js?v=59";
import { slimTrack, withRetry, isLive, isReported, buildPool, weightedPick } from "./pool.js?v=59";
import {
  mode, pool, versus, vsScore, oppScore, oppFinished, vsOver, vsOppOver, setStatus, setMode, setVersus,
} from "./state.js?v=59";
import { renderMode, updateNextButton, renderCategories, enterMode } from "./modes.js?v=59";
import { artistsOf, startRound } from "./round.js?v=59";
import { confetti } from "./render.js?v=59";
import { stopAudio } from "./audio.js?v=59";
import { homeUrl, challengeUrl, shareText } from "./controls.js?v=59";
import { peerHost, hostConn, room, sendOut, peerClose, vsRematch, setRoom } from "./peer.js?v=59";
import { countEvent } from "./analytics.js?v=59";

// ---------- Párbaj és kihívás ----------
// Közös meccs-motor: mindenki ugyanazokat a dalokat kapja, dalonként a tippek száma
// szerinti pontért (sorozatbónusz nélkül). A párbajban a szobát nyitó gép a központ:
// a vendégek csak vele beszélnek (WebRTC, PeerJS), ő továbbítja az állást mindenkinek.
// A következő dal akkor jön, ha mindenki végzett az előzővel.

// Egy sorozat összeállítása: különböző előadóktól, a népszerűbb dalok felé húzva.
export function pickSet(list, n) {
  const out = [], used = new Set();
  const cands = list.filter((t) => !isLive(t) && !isReported(t.id));
  while (out.length < n) {
    const left = cands.filter((t) => !out.includes(t) && !artistsOf(t).some((a) => used.has(a)));
    const from = left.length ? left : cands.filter((t) => !out.includes(t));
    if (!from.length) break;
    const t = weightedPick(from, Math.random);
    out.push(t);
    artistsOf(t).forEach((a) => used.add(a));
  }
  return out.map((t) => t.id);
}

// opps: [{ id, name, score? }] – kihívásnál egy ellenfél a kész pontszámmal.
// resume: újratöltés utáni folytatás (idx, results, cur).
export function startVersus(kind, ids, opps, cat = "", resume = null) {
  stopAudio();
  if (vr.dialog.open) vr.dialog.close();
  el.toast.hidden = true;
  setVersus({
    kind, ids, cat, idx: 0, results: [], waiting: false,
    opps: opps.map((o) => ({ results: [], live: {}, ...o })),
  });
  if (resume) {
    versus.idx = Math.min(resume.idx || 0, ids.length - 1);
    versus.results = resume.results || [];
    versus.cur = resume.cur || null;
  }
  setMode("versus");
  renderMode();
  renderCategories();
  enterMode();
  saveBattle();
  if (!resume) countEvent(kind + "-start");
}

// A meccs dalai a teljes dallistából jönnek; ha egy dal nincs meg (más a dallista), a Deezerről pótoljuk.
export async function vsStartSong() {
  const id = versus.ids[versus.idx];
  let t = pool.find((p) => p.id === id);
  if (!t) {
    try {
      const full = await withRetry(() => Deezer.track(id));
      t = buildPool([slimTrack(full)], true)[0];
      pool.push(t);
    } catch { /* alább kezeljük */ }
  }
  if (!t) return setStatus("Ezt a dalt nem sikerült betölteni.", true);
  // Újratöltés után az épp játszott dal tippjei megmaradnak.
  const cur = versus.cur && versus.cur.idx === versus.idx ? versus.cur : null;
  startRound(t, cur);
}

export const vsWaitingFor = () => versus.kind === "battle" ? versus.opps.filter((o) => !o.gone && !o.results[versus.idx]) : [];

export function vsNext() {
  if (vsOver()) {
    if (vsOppOver()) openVsResult();
    return;
  }
  // Párbajban megvárjuk, hogy mindenki végezzen ezzel a dallal.
  const wait = vsWaitingFor();
  if (wait.length) {
    versus.waiting = true;
    updateNextButton();
    setStatus(`Várakozás: ${names(wait)} még ezen a dalon dolgozik…`);
    return;
  }
  versus.waiting = false;
  versus.idx++;
  versus.cur = null;
  vsStartSong();
}

export function leaveVersus() {
  closeVersus();
  setMode(load("mode", "endless"));
  renderMode();
  renderCategories();
  enterMode();
}

export function closeVersus() {
  sendOut({ type: "bye" });
  peerClose();
  clearBattle();
  setRoom(null);
  setVersus(null);
}

export const names = (list) => list.map((o) => o.name).join(", ");

export function renderVsBar() {
  const bar = $("vsBar");
  bar.hidden = mode !== "versus" || !versus;
  if (bar.hidden) return;
  const challenge = versus.kind === "challenge";
  bar.innerHTML = "";
  bar.style.setProperty("--n", versus.ids.length);
  bar.classList.toggle("many", versus.opps.length > 2);
  bar.classList.toggle("long", versus.ids.length > 5);
  bar.classList.toggle("xlong", versus.ids.length > 10);
  const row = (name, results, live, current, score, cls) => {
    const r = document.createElement("div");
    r.className = "vs-row" + cls;
    const n = document.createElement("b");
    n.className = "vs-name";
    n.textContent = name;
    const slots = document.createElement("div");
    slots.className = "set-slots";
    versus.ids.forEach((_, i) => {
      const res = results[i], slot = document.createElement("span");
      if (res) {
        slot.className = res.won ? "won" : "lost";
        slot.textContent = res.won ? res.pts : "✗";
      } else if (i === current) {
        slot.className = "current";
        // Az ellenfélnél: hányadik tippnél tart.
        slot.textContent = live && live[i] ? `${live[i].attempts + 1}.` : "…";
      }
      slots.appendChild(slot);
    });
    const s = document.createElement("b");
    s.className = "vs-score";
    s.textContent = score;
    r.append(n, slots, s);
    bar.appendChild(r);
  };
  row("Te", versus.results, null, versus.idx, vsScore(versus.results), "");
  // Kihívásnál a kihívó dalonkénti eredményét csak a végén mutatjuk.
  for (const o of versus.opps) {
    row(o.name, challenge && !vsOver() ? [] : o.results, o.live, challenge ? -1 : versus.idx, oppScore(o), " opp" + (o.gone ? " gone" : ""));
  }
}

export function vsOppLine() {
  if (!versus) return "";
  if (versus.kind === "challenge") {
    const o = versus.opps[0];
    return `🎯 ${o.name}: ${o.score} pont ezen az ${versus.ids.length} dalon`;
  }
  const active = versus.opps.filter((o) => !o.gone);
  if (!active.length) return versus.opps.length === 1
    ? `⚠️ ${versus.opps[0].name} kilépett – a meccset egyedül fejezed be.`
    : "⚠️ Mindenki kilépett – a meccset egyedül fejezed be.";
  if (versus.opps.length === 1) {
    const o = versus.opps[0], done = o.results[versus.idx], live = o.live[versus.idx];
    if (done) return done.won ? `✓ ${o.name} kitalálta (${done.tries}. tippre, +${done.pts})` : `✗ ${o.name} nem találta ki`;
    if (live && live.attempts) return `⚔️ ${o.name}: ${live.attempts + 1}. tipp…`;
    return `⚔️ ${o.name} is hallgatja…`;
  }
  const left = active.filter((o) => !o.results[versus.idx]);
  if (!left.length) return "✓ Mindenki végzett ezzel a dallal";
  return `⚔️ ${active.length - left.length}/${active.length} végzett · még játszik: ${names(left)}`;
}

// Állás: mindenki pontszám szerint, holtversenyben azonos helyezéssel.
function vsStandings() {
  const list = [
    { name: "Te", score: vsScore(versus.results), me: true },
    ...versus.opps.map((o) => ({ name: o.name, score: oppScore(o), gone: o.gone })),
  ].sort((a, b) => b.score - a.score || (b.me ? 1 : 0) - (a.me ? 1 : 0));
  list.forEach((p, i) => { p.place = i && p.score === list[i - 1].score ? list[i - 1].place : i + 1; });
  return list;
}

function vsResultText() {
  const st = vsStandings();
  const me = st.find((p) => p.me);
  const opp = versus.opps.length === 1 ? oppScore(versus.opps[0]) : null;
  if (!vsOppOver()) {
    const wait = versus.opps.filter((o) => !oppFinished(o));
    return { me: me.score, opp, st, place: me.place, verdict: `Várakozás: ${names(wait)} még játszik…`, win: null };
  }
  const leaders = st.filter((p) => p.place === 1);
  const win = me.place === 1 ? (leaders.length === 1 ? true : null) : false;
  const verdict = win ? "🏆 Nyertél!"
    : win === null ? (st.length === 2 ? "🤝 Döntetlen" : "🤝 Holtverseny az élen")
    : `${names(leaders)} nyert`;
  return { me: me.score, opp, st, place: me.place, win, verdict };
}

export function renderVsSummary(animate) {
  const r = vsResultText();
  el.revealSet.hidden = false;
  el.revealSet.textContent = "";
  const b = (s) => { const e = document.createElement("b"); e.textContent = s; return e; };
  if (r.opp !== null) el.revealSet.append("🏁 Te ", b(String(r.me)), ` – ${r.opp} ${versus.opps[0].name} · `);
  else el.revealSet.append("🏁 Te ", b(String(r.me)), ` pont · ${r.place}. hely · `);
  const v = document.createElement("span");
  v.className = r.win ? "rec" : "";
  v.textContent = r.verdict;
  el.revealSet.append(v);
  if (r.win && animate) setTimeout(confetti, 700);
  if (vsOppOver() && !versus.counted) {
    versus.counted = true;
    countEvent(`${versus.kind}-${r.win ? "won" : r.win === false ? "lost" : "draw"}`);
  }
  updateNextButton();
  // Ha mindenki végzett, egyszer magától feljön az eredmény.
  if (vsOppOver() && !versus.resultShown) {
    versus.resultShown = true;
    setTimeout(openVsResult, animate ? 1600 : 400);
  }
}

// ----- Eredményablak: helyezések, visszavágó (csak ha mindenki kéri) -----
export const vr = {
  dialog: $("vsResultDialog"), verdict: $("vsResVerdict"), rank: $("vsResRank"),
  status: $("vsResStatus"), rematch: $("vsRematchBtn"),
};

export function renderVsResult() {
  if (!versus) return;
  const r = vsResultText();
  vr.verdict.textContent = r.verdict;
  vr.verdict.classList.toggle("win", !!r.win);
  vr.rank.innerHTML = "";
  for (const p of r.st) {
    const li = document.createElement("li");
    li.className = (p.me ? "me" : "") + (p.gone ? " gone" : "");
    const place = document.createElement("span");
    place.className = "place";
    place.textContent = p.place === 1 ? "🏆" : `${p.place}.`;
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = p.name + (p.gone ? " (kilépett)" : "");
    const sc = document.createElement("b");
    sc.textContent = p.score;
    li.append(place, nm, sc);
    vr.rank.appendChild(li);
  }
  const others = versus.opps.filter((o) => !o.gone);
  const live = versus.kind === "battle" && others.length > 0 && (peerHost || !!hostConn);
  const asked = others.filter((o) => o.rematch), missing = others.filter((o) => !o.rematch);
  vr.rematch.hidden = !live;
  vr.rematch.disabled = !!versus.rematchMe;
  vr.rematch.textContent = versus.rematchMe ? "Várakozás…" : asked.length ? "🔁 Benne vagyok a visszavágóban" : "🔁 Visszavágó";
  vr.status.textContent = versus.kind !== "battle" ? ""
    : !live ? (versus.opps.length === 1 ? `${versus.opps[0].name} kilépett.` : "A többiek kiléptek.")
    : versus.rematchMe && missing.length ? `Várakozás: ${names(missing)} is kéri a visszavágót?`
    : asked.length ? `Visszavágót kér: ${names(asked)}` : "";
}

function openVsResult() {
  if (!versus || !vsOver() || !vsOppOver() || document.querySelector("dialog[open]")) return;
  renderVsResult();
  vr.dialog.showModal();
}

export async function vsShare() {
  const r = vsResultText();
  const rows = versus.results.map((x) => (x && x.won ? ["", "🟩", "🟩", "🟨", "🟨", "🟧", "🟥"][x.tries] || "🟩" : "⬛")).join("");
  const one = versus.opps.length === 1;
  const head = versus.kind === "challenge" ? `Songdle HU 🎯 Kihívás vs ${versus.opps[0].name}`
    : one ? `Songdle HU ⚔️ Párbaj vs ${versus.opps[0].name}` : `Songdle HU ⚔️ Párbaj · ${versus.opps.length + 1} játékos`;
  const lines = [head, one ? `${rows}  ${r.me} – ${r.opp}` : `${rows}  ${r.me} pont · ${r.place}. hely`, r.verdict];
  // A kihívást tovább is lehet küldeni a saját pontszámmal.
  if (vsOver()) lines.push(challengeUrl(versus.ids, r.me));
  else lines.push(homeUrl());
  return shareText(lines.join("\n"));
}

// ----- Folytatás újratöltés után (a lap bezárásáig, sessionStorage) -----
const BATTLE_KEY = LS + "battle";
export function saveBattle() {
  if (!versus || versus.kind !== "battle" || !room) return;
  try {
    sessionStorage.setItem(BATTLE_KEY, JSON.stringify({
      code: room.code, pid: room.pid, key: room.key, host: peerHost, ids: versus.ids.map(encId), cat: versus.cat,
      idx: versus.idx, results: versus.results, cur: versus.cur || null,
      opps: versus.opps.map((o) => ({ id: o.id, name: o.name, results: o.results, gone: !!o.gone, key: o.key })),
    }));
  } catch { /* nem elérhető */ }
}
export function loadBattle() {
  try { return JSON.parse(sessionStorage.getItem(BATTLE_KEY) || "null"); } catch { return null; }
}
export function clearBattle() {
  try { sessionStorage.removeItem(BATTLE_KEY); } catch { /* nem elérhető */ }
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  vr.rematch.addEventListener("click", vsRematch);
  $("vsResShareBtn").addEventListener("click", vsShare);
  $("vsResLeaveBtn").addEventListener("click", () => { vr.dialog.close(); leaveVersus(); });
}
