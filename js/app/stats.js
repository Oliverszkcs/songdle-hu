import { MAX_TRIES, DIFFS, diffById, LS, $, el, load, dateKey, shiftDate, prettyDate } from "./core.js?v=60";
import { mode, round, stats, dailyDiff, dailyStats, points, dailyStreakNow, dailyKey } from "./state.js?v=60";
import { adStats, adKey } from "./artist.js?v=60";

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

// Napi előadó: a győzelmeket a napi mentésekből számoljuk (a régi statisztika nem tárolta).
function renderArtistStats() {
  let wins = 0;
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(LS + "artistdle.")) continue;
      const st = JSON.parse(localStorage.getItem(k));
      if (st && st.done && !st.gaveUp) wins++;
    }
  } catch { /* nem elérhető */ }
  const today = dateKey();
  const live = adStats.lastWin === today || adStats.lastWin === shiftDate(today, -1);
  statCells($("statGridArtist"), { ...adStats, wins }, live ? adStats.streak : 0);
  $("statArtistNote").textContent = adStats.played
    ? `Átlagosan ${(adStats.guesses / adStats.played).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} tipp kell`
    : "Még nem játszottál.";
}

function renderDailyTable() {
  const box = el.statGridDaily;
  box.className = "diff-table";
  box.innerHTML = "";
  const head = document.createElement("div");
  head.className = "diff-row head";
  head.innerHTML = "<span></span><span>Játszott</span><span>Nyert</span><span>Sorozat</span><span>Legjobb</span>";
  box.appendChild(head);
  DIFFS.forEach((d, i) => {
    const s = dailyStats(d.id);
    const pct = s.played ? Math.round((s.wins / s.played) * 100) + "%" : "–";
    const row = document.createElement("div");
    row.className = "diff-row";
    row.style.animationDelay = i * 60 + "ms";
    for (const v of [`${d.icon} ${d.label}`, s.played, pct, dailyStreakNow(d.id), s.maxStreak]) {
      const c = document.createElement("span");
      c.textContent = v;
      row.appendChild(c);
    }
    box.appendChild(row);
  });
}

// Napi naptár: a hónap napjain, hány napi dalt találtál el (és megvolt-e az előadó).
let calMonth = 0; // 0 = a mostani hónap, -1 = előző…
function renderCalendar() {
  const box = $("cal");
  const today = dateKey();
  const [y, m] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + calMonth, 1));
  const year = first.getUTCFullYear(), month = first.getUTCMonth();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  $("calTitle").textContent = first.toLocaleDateString("hu-HU", { year: "numeric", month: "long", timeZone: "UTC" });
  $("calNext").disabled = calMonth >= 0;
  box.innerHTML = "";
  for (const d of ["H", "K", "Sze", "Cs", "P", "Szo", "V"]) {
    const h = document.createElement("span");
    h.className = "cal-head";
    h.textContent = d;
    box.appendChild(h);
  }
  // Hétfővel kezdődő hét.
  for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) box.appendChild(document.createElement("span"));
  for (let day = 1; day <= days; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    let played = 0, won = 0;
    for (const d of DIFFS) {
      const r = load(dailyKey(key, d.id), null);
      if (r && r.done) { played++; if (r.won) won++; }
    }
    const art = load(adKey(key), null);
    const artWon = !!(art && art.done && !art.gaveUp);
    const c = document.createElement("span");
    c.className = "cal-day" + (key === today ? " today" : "") + (key > today ? " future" : "")
      + (played && !won ? " lost" : "") + (artWon ? " artist" : "");
    if (won) c.style.setProperty("--lvl", won / DIFFS.length);
    if (won) c.classList.add("won");
    c.textContent = day;
    c.title = played || art ? `${prettyDate(key)}: ${won}/${DIFFS.length} napi dal${artWon ? ", előadó megvolt 🎤" : ""}` : prettyDate(key);
    box.appendChild(c);
  }
}

export function renderStats() {
  el.statPoints.textContent = points.toLocaleString("hu-HU");
  statCells(el.statGrid, stats, stats.streak);
  renderDailyTable();
  calMonth = 0;
  renderCalendar();
  renderArtistStats();
  const s = mode === "daily" ? dailyStats() : stats;
  $("distTitle").textContent = `Hányadikra találtad el (${mode === "daily" ? "napi · " + diffById(dailyDiff).label : "végtelen"})`;
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

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  $("calPrev").addEventListener("click", () => { calMonth--; renderCalendar(); });
  $("calNext").addEventListener("click", () => { if (calMonth < 0) { calMonth++; renderCalendar(); } });
}
