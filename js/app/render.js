import {
  MAX_TRIES, MAX_LEN, SET_SIZE, diffById, WAVE_BARS, reducedMotion, el, num, fmt, shiftDate, mulberry32,
  retrigger,
} from "./core.js?v=59";
import {
  mode, lengthsOf, multOf, round, stats, dailyDiff, dailyStats, points, game, bestGame, gameScore, gameDone,
  shownPoints, versus, vsScore, dailyStreakNow, setShownPoints,
} from "./state.js?v=59";
import { usedTries, currentLength, scaleLength, scoreFor } from "./round.js?v=59";
import { renderVsBar, vsOppLine } from "./versus.js?v=59";
import { stream } from "./stream.js?v=59";
import { adPointsFor, adState } from "./artist.js?v=59";

// ---------- Megjelenítés ----------
export function renderAll(animate) {
  renderGuesses(animate);
  renderTries();
  renderRoundPoints();
  renderWaveState(0, true);
  renderClipInfo();
  renderStreak();
}

function renderGuesses(animateLast) {
  el.guesses.innerHTML = "";
  const attempts = round ? round.attempts : [];
  attempts.forEach((a, i) => {
    const li = document.createElement("li");
    li.className = a.type;
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = { right: "✓", wrong: "✗", near: "~", skip: "»" }[a.type];
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = a.type === "skip" ? `Kihagyva · ${lengthsOf(round)[i]} mp` : a.label;
    li.append(mark, label);
    if (a.type === "near") {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "jó előadó";
      li.appendChild(tag);
    }
    if (animateLast && i === attempts.length - 1) li.classList.add("new");
    el.guesses.appendChild(li);
  });
}

function renderTries() {
  el.tries.innerHTML = "";
  const attempts = round ? round.attempts : [];
  for (let i = 0; i < MAX_TRIES; i++) {
    const pill = document.createElement("i");
    if (attempts[i]) pill.className = attempts[i].type;
    else if (round && !round.done && i === attempts.length) pill.className = "current";
    el.tries.appendChild(pill);
  }
}

function renderClipInfo() {
  const total = scaleLength();
  el.timeMax.textContent = fmt(total);
  el.timeNow.textContent = fmt(0);
  el.clipLen.textContent = !round ? " " : round.done ? "Teljes előnézet" : `${currentLength()} mp`;
  if (round && !round.done && round.reverse) {
    // Nehéz mód: külön színnel, mert a színátmenetes szövegben az emoji is elszíneződne.
    const s = document.createElement("span");
    s.className = "clip-hard";
    s.textContent = "⏪ visszafelé";
    el.clipLen.append(" · ", s);
  }
  el.ringUnlocked.style.strokeDashoffset = round ? 100 - (currentLength() / total) * 100 : 100;
  el.ringProgress.style.strokeDashoffset = 100;
  if (round && !round.done) {
    const used = usedTries(round);
    const remaining = MAX_TRIES - used;
    const nextLen = lengthsOf(round)[used + 1];
    el.skipBtn.textContent = remaining === 1 ? "Feladom" : `Kihagyás +${nextLen - currentLength()} mp`;
  }
}

// Hullámforma: a dalhoz kötött, ál-véletlen oszlopok (a hangot nem kell előre letölteni).
let waveBars = [];
let waveUnlocked = -1;
export function buildWave(intro) {
  el.wave.innerHTML = "";
  el.wave.classList.toggle("intro", !!intro && !reducedMotion.matches);
  const rng = mulberry32(round ? round.track.id : 1);
  const raw = Array.from({ length: WAVE_BARS }, () => rng());
  const total = scaleLength();
  waveBars = raw.map((v, i) => {
    const smooth = (v + (raw[i - 1] ?? v) + (raw[i + 1] ?? v)) / 3;
    const t = ((i + 0.5) / WAVE_BARS) * total;
    const env = 0.45 + 0.55 * Math.min(1, t / 5);
    const h = Math.max(0.12, Math.min(1, (0.25 + smooth * 0.9) * env));
    const bar = document.createElement("i");
    bar.style.height = Math.round(h * 100) + "%";
    if (intro) bar.style.animationDelay = i * 8 + "ms";
    el.wave.appendChild(bar);
    return { node: bar, t };
  });
  waveUnlocked = -1;

  el.waveMarks.innerHTML = "";
  if (total === MAX_LEN) {
    for (const l of lengthsOf(round)) {
      const m = document.createElement("span");
      m.textContent = l + "s";
      m.style.left = Math.min(97, (l / total) * 100) + "%";
      el.waveMarks.appendChild(m);
    }
  }
}

export function renderWaveState(playedSec, sweep) {
  if (!waveBars.length) return;
  const unlockedSec = round ? currentLength() : 0;
  const newlyFrom = waveUnlocked;
  waveBars.forEach((b, i) => {
    const unlocked = b.t <= unlockedSec;
    const played = playedSec > 0 && b.t <= playedSec;
    if (sweep && unlocked && b.t > newlyFrom && newlyFrom >= 0) b.node.style.transitionDelay = (i * 14) % 500 + "ms";
    else b.node.style.transitionDelay = "";
    b.node.classList.toggle("unlocked", unlocked);
    b.node.classList.toggle("played", played);
  });
  if (sweep) waveUnlocked = unlockedSec;
  [...el.waveMarks.children].forEach((m, i) => m.classList.toggle("on", lengthsOf(round)[i] <= unlockedSec));
}

export function renderStreak() {
  const flame = '<span class="flame">🔥</span>';
  if (mode === "daily") {
    const st = dailyStreakNow(), s = dailyStats(), d = diffById(dailyDiff);
    el.streakLine.innerHTML = st > 0
      ? `${flame} ${d.label} sorozat: <b>${num(st)}</b> nap · legjobb: ${num(s.maxStreak)}`
      : s.played ? `${d.label} legjobb sorozat: ${num(s.maxStreak)} nap` : "Találd ki a mai dalt!";
  } else if (mode === "stream") {
    el.streakLine.textContent = "";
  } else if (mode === "versus") {
    el.streakLine.textContent = vsOppLine();
  } else {
    el.streakLine.innerHTML = stats.streak > 0
      ? `${flame} Sorozat: <b>${num(stats.streak)}</b> · legjobb: ${num(stats.maxStreak)}`
      : stats.played ? `Legjobb sorozat: ${num(stats.maxStreak)}` : "";
  }
}

// A kör pontja: játék közben a még megszerezhető pont, a végén a megszerzett.
export function renderRoundPoints() {
  renderSetBar();
  if (mode === "artist") {
    const st = adState();
    el.roundLabel.textContent = "ma";
    el.roundNum.textContent = st.done ? (st.gaveUp ? "0" : "+" + st.points) : adPointsFor(st.guesses.length + 1, st);
    el.roundPts.className = "round-pts" + (st.done ? (st.gaveUp ? " lost" : " won") : "");
    return;
  }
  if (mode === "stream") {
    el.roundNum.textContent = `${stream.me}:${stream.chat}`;
    el.roundLabel.textContent = `dal ${Math.min(stream.idx + 1, stream.len)}/${stream.len}`;
    el.roundPts.className = "round-pts";
    return;
  }
  if (mode === "versus") {
    el.roundNum.textContent = vsScore(versus.results);
    el.roundLabel.textContent = `dal ${Math.min(versus.idx + 1, versus.ids.length)}/${versus.ids.length}`;
    el.roundPts.className = "round-pts";
    return;
  }
  if (mode !== "daily") {
    const prevE = el.roundNum.textContent;
    el.roundNum.textContent = gameScore();
    el.roundLabel.textContent = `kör ${Math.min(game.results.length + (round && !round.done ? 1 : 0), SET_SIZE) || 1}/${SET_SIZE}`;
    el.roundPts.className = "round-pts" + (gameDone() && game.record ? " won" : "");
    if (prevE !== el.roundNum.textContent) retrigger(el.roundPts, "tick");
    return;
  }
  el.roundLabel.textContent = "dal";
  let n = null, state = "";
  if (round && round.done) {
    n = round.points ? round.points.total : 0;
    state = n ? "won" : "lost";
  } else if (round) {
    const daily = round.mode === "daily";
    const s = daily ? dailyStats(round.diff) : stats;
    const streakAfter = daily ? (s.lastWin === shiftDate(round.date, -1) ? s.streak + 1 : 1) : s.streak + 1;
    n = scoreFor(true, round.attempts.length + 1, streakAfter, multOf(round)).total;
  }
  const prev = el.roundNum.textContent;
  el.roundNum.textContent = n === null ? "–" : (state === "won" ? "+" : "") + n;
  el.roundPts.className = "round-pts " + state;
  if (prev !== el.roundNum.textContent && n !== null) retrigger(el.roundPts, "tick");
}

// Az 5 dalos kör állása: dalonként a megszerzett pont, az aktuálisnál a még elérhető.
function renderSetBar() {
  el.setBar.hidden = mode !== "endless";
  renderVsBar();
  if (mode !== "endless") return;
  el.setSlots.innerHTML = "";
  for (let i = 0; i < SET_SIZE; i++) {
    const r = game.results[i], slot = document.createElement("span");
    if (r) {
      slot.className = r.won ? "won" : "lost";
      slot.textContent = r.won ? r.pts : "✗";
    } else if (i === game.results.length && round && !round.done) {
      slot.className = "current";
      slot.textContent = scoreFor(true, round.attempts.length + 1, stats.streak + 1, multOf(round)).total;
    }
    el.setSlots.appendChild(slot);
  }
  el.setRecord.textContent = bestGame;
}

export function renderPoints() {
  el.pointsNum.textContent = shownPoints.toLocaleString("hu-HU");
}

export function animatePoints() {
  const from = shownPoints, to = points, start = performance.now(), dur = 1100;
  if (from === to) return;
  retrigger(el.pointsPill, "bump");
  if (!reducedMotion.matches) {
    for (let i = 0; i < 12; i++) {
      const sp = document.createElement("i");
      sp.className = "spark";
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4, d = 26 + Math.random() * 22;
      sp.style.setProperty("--sx", Math.cos(a) * d + "px");
      sp.style.setProperty("--sy", Math.sin(a) * d + "px");
      sp.style.animationDelay = Math.random() * 0.12 + "s";
      el.pointsPill.appendChild(sp);
      setTimeout(() => sp.remove(), 1100);
    }
  }
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - k, 3);
    setShownPoints(Math.round(from + (to - from) * eased));
    renderPoints();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function floatPoints(n) {
  if (!n) return;
  el.floatPoints.textContent = `+${n}`;
  retrigger(el.floatPoints, "go");
}

export function setControls(on) {
  el.input.disabled = !on;
  el.skipBtn.disabled = !on;
  el.playBtn.disabled = !on;
  if (!on) el.playBtn.classList.remove("pulse");
  updateSubmit();
}

export function updateSubmit() {
  el.submitBtn.disabled = el.input.disabled || !el.input.value.trim();
}
export function updateClear() {
  el.clearBtn.hidden = !el.input.value;
}

export function confetti() {
  if (reducedMotion.matches) return;
  const colors = ["#1ed760", "#19e3c0", "#ffc547", "#ff5470", "#2bb3ff", "#f4f4f8"];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement("i");
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.setProperty("--dx", (Math.random() - 0.5) * 240 + "px");
    c.style.setProperty("--rot", Math.random() * 900 + "deg");
    c.style.animationDuration = 1.4 + Math.random() * 1.4 + "s";
    c.style.animationDelay = Math.random() * 0.3 + "s";
    if (i % 3 === 0) { c.style.width = "10px"; c.style.height = "10px"; c.style.borderRadius = "50%"; }
    el.confetti.appendChild(c);
  }
  setTimeout(() => { el.confetti.innerHTML = ""; }, 3200);
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  // Hullám-effekt koppintáskor
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".btn, .chip, .segmented button");
    if (!btn || btn.disabled || reducedMotion.matches) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const rip = document.createElement("span");
    rip.className = "ripple";
    rip.style.width = rip.style.height = size + "px";
    rip.style.left = e.clientX - r.left - size / 2 + "px";
    rip.style.top = e.clientY - r.top - size / 2 + "px";
    btn.appendChild(rip);
    setTimeout(() => rip.remove(), 650);
  });
}
