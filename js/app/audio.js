import { reducedMotion, el, load, save, fmt } from "./core.js?v=61";
import { round, setStatus } from "./state.js?v=61";
import { persistRound, currentLength, scaleLength } from "./round.js?v=61";
import { renderWaveState } from "./render.js?v=61";
import { stream, streamControls } from "./stream.js?v=61";

// ---------- Hang (Web Audio: hangerő + vizualizáció) ----------
export let actx = null, gainNode = null, analyser = null, freq = null;

export function ensureAudioGraph() {
  if (actx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    // iOS: a némító kapcsoló ne némítsa el a játékot.
    if (navigator.audioSession) navigator.audioSession.type = "playback";
    actx = new Ctx();
    const src = actx.createMediaElementSource(el.audio);
    analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    freq = new Uint8Array(analyser.frequencyBinCount);
    gainNode = actx.createGain();
    src.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(actx.destination);
    applyVolume();
  } catch (e) {
    console.warn("Web Audio nem érhető el:", e);
    actx = null;
  }
}

// A Dallista előnézet-lejátszója (a hangerő-szabályzó is kezeli).
export const libAudio = new Audio();

let rafId = 0;
let playToken = 0; // minden megállítás érvényteleníti a még induló lejátszást

export function stopAudio() {
  playToken++;
  cancelAnimationFrame(rafId);
  el.audio.pause();
  if (revSource) {
    const s = revSource;
    revSource = null;
    try { s.stop(); } catch { /* már leállt */ }
    s.disconnect();
  }
  document.body.classList.remove("playing");
  el.playBtn.classList.remove("playing", "loading");
  el.playBtn.setAttribute("aria-label", "Lejátszás");
  el.ringProgress.style.strokeDashoffset = 100;
  el.timeNow.textContent = fmt(0);
  renderWaveState(0, false);
}

export async function playClip() {
  if (!round) return;
  if (el.playBtn.classList.contains("playing") || el.playBtn.classList.contains("loading")) return stopAudio();
  ensureAudioGraph();
  if (actx && actx.state === "suspended") actx.resume();
  el.playBtn.classList.remove("pulse");
  // Ha egyszer meghallgatta, a nehéz mód kapcsolása már csak a következő dalra hat.
  if (!round.done && !round.heard) { round.heard = true; persistRound(); }
  // Streamer mód: csak a már lejátszott részlet után lehet tippet lezárni.
  if (round.mode === "stream" && !round.done && stream.cur.heard !== stream.cur.stage) {
    stream.cur.heard = stream.cur.stage;
    streamControls();
  }
  const token = ++playToken;
  el.playBtn.classList.add("loading");
  // Nehéz mód: visszafelé (Web Audio nélkül marad a sima lejátszás). A megfejtés után előre szól.
  if (round.reverse && !round.done && actx) return playReversed(token);
  try {
    el.audio.currentTime = 0;
    await el.audio.play();
  } catch (e) {
    if (token !== playToken) return; // közben megállították (pl. kihagyás)
    console.warn(e);
    el.playBtn.classList.remove("loading");
    setStatus("Nem sikerült lejátszani. Próbáld újra!", true);
    return;
  }
  // Ha indulás közben kihagyott vagy tippelt, ez a lejátszás már elavult.
  if (token !== playToken) { el.audio.pause(); return; }
  startTicker(token, () => el.audio.currentTime, () => el.audio.ended);
}

// Lejátszás közben: gomb állapota, gyűrű, idő és hullámforma; a részlet végén megáll.
function startTicker(token, elapsed, ended) {
  // Egy korábbi sikertelen próbálkozás hibaüzenete ne maradjon kint, ha most már szól.
  if (el.status.classList.contains("error")) setStatus("");
  el.playBtn.classList.remove("loading");
  el.playBtn.classList.add("playing");
  document.body.classList.add("playing");
  el.playBtn.setAttribute("aria-label", "Megállítás");
  const total = scaleLength();
  const tick = () => {
    if (token !== playToken) return;
    const t = Math.max(0, elapsed());
    el.ringProgress.style.strokeDashoffset = 100 - Math.min(t / total, 1) * 100;
    el.timeNow.textContent = fmt(t);
    renderWaveState(t, false);
    if (t >= currentLength() || ended()) return stopAudio();
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// Nehéz mód: a hangmintákat megfordítjuk, és a dal első másodperceit visszafelé játsszuk.
let revSource = null;
let revCache = null; // { id, buf } – csak az aktuális dal
async function reversedBuffer(r) {
  if (revCache && revCache.id === r.track.id) return revCache.buf;
  // A visszafelé lejátszáshoz a hangot a memóriába töltjük (nem mentjük el).
  const get = async () => {
    const res = await fetch(r.preview);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.arrayBuffer();
  };
  let data;
  try { data = await get(); } catch {
    // Lejárt előnézet-link (sokáig nyitva hagyott dal): friss linket kérünk, és újra próbáljuk.
    const full = await Deezer.track(r.track.id);
    if (!full.preview) throw new Error("Nincs előnézet");
    r.preview = full.preview;
    data = await get();
  }
  const buf = await actx.decodeAudioData(data);
  for (let c = 0; c < buf.numberOfChannels; c++) buf.getChannelData(c).reverse();
  revCache = { id: r.track.id, buf };
  return buf;
}
async function playReversed(token) {
  let buf;
  try {
    buf = await reversedBuffer(round);
  } catch (e) {
    if (token !== playToken) return;
    console.warn(e);
    el.playBtn.classList.remove("loading");
    setStatus("Nem sikerült lejátszani. Próbáld újra!", true);
    return;
  }
  if (token !== playToken) return;
  const len = Math.min(currentLength(), buf.duration);
  const src = actx.createBufferSource();
  src.buffer = buf;
  src.connect(analyser);
  // A megfordított hangban az eredeti eleje a végén van: onnan indulunk, így a dal legelején ér véget.
  src.start(0, buf.duration - len, len);
  revSource = src;
  const startedAt = actx.currentTime;
  let done = false;
  src.onended = () => { done = true; };
  startTicker(token, () => actx.currentTime - startedAt, () => done);
}

// Kör alakú vizualizáció a lemez körül.
const vctx = el.viz.getContext("2d");
let vizSize = 0;
const VIZ_BARS = 72;
const vizLevels = new Float32Array(VIZ_BARS);
let accentColor = "#1ed760";

export function sizeViz() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = el.viz.getBoundingClientRect();
  vizSize = r.width;
  el.viz.width = Math.round(r.width * dpr);
  el.viz.height = Math.round(r.height * dpr);
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function drawViz(now) {
  requestAnimationFrame(drawViz);
  if (document.hidden || !vizSize) return;
  const playing = document.body.classList.contains("playing");
  const loading = el.stage.classList.contains("loading");
  if (playing && analyser) analyser.getByteFrequencyData(freq);
  const cx = vizSize / 2, cy = vizSize / 2;
  const discR = el.disc.getBoundingClientRect().width / 2;
  const inner = discR + 14;
  const maxLen = Math.max(10, cx - inner - 4);
  vctx.clearRect(0, 0, vizSize, vizSize);
  vctx.lineCap = "round";
  vctx.lineWidth = Math.max(2, (2 * Math.PI * inner) / VIZ_BARS * 0.45);
  for (let i = 0; i < VIZ_BARS; i++) {
    const half = i < VIZ_BARS / 2 ? i : VIZ_BARS - i;
    let target;
    if (playing && analyser) {
      const bin = Math.floor(2 + (half / (VIZ_BARS / 2)) * (freq.length * 0.55));
      target = freq[bin] / 255;
    } else if (playing) {
      target = 0.35 + 0.3 * Math.sin(now / 160 + i * 0.7);
    } else if (loading) {
      const pos = ((now / 900) * VIZ_BARS) % VIZ_BARS;
      const dist = Math.min(Math.abs(i - pos), VIZ_BARS - Math.abs(i - pos));
      target = Math.max(0, 0.5 - dist * 0.06);
    } else {
      target = reducedMotion.matches ? 0.06 : 0.05 + 0.04 * Math.sin(now / 700 + i * 0.35);
    }
    vizLevels[i] += (target - vizLevels[i]) * 0.25;
    const len = 3 + vizLevels[i] * maxLen;
    const a = (i / VIZ_BARS) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(a), sin = Math.sin(a);
    vctx.globalAlpha = 0.25 + vizLevels[i] * 0.75;
    vctx.strokeStyle = accentColor;
    vctx.beginPath();
    vctx.moveTo(cx + cos * inner, cy + sin * inner);
    vctx.lineTo(cx + cos * (inner + len), cy + sin * (inner + len));
    vctx.stroke();
  }
  vctx.globalAlpha = 1;
}

// ---------- Hangerő ----------
// Hibás (pl. kézzel átírt) mentésnél az alapérték marad, különben az indulás elakadna.
const savedVolume = load("volume", null) || {};
let volume = {
  level: Number.isFinite(savedVolume.level) ? Math.max(0, Math.min(100, savedVolume.level)) : 80,
  muted: savedVolume.muted === true,
};

export function applyVolume() {
  const level = Math.max(0, Math.min(1, volume.level / 100));
  const silent = volume.muted || volume.level === 0;
  if (gainNode) {
    gainNode.gain.setTargetAtTime(silent ? 0 : level, actx.currentTime, 0.03);
    el.audio.volume = 1;
    el.audio.muted = false;
    libAudio.volume = 1;
  } else {
    el.audio.volume = level;
    libAudio.volume = silent ? 0 : level;
    el.audio.muted = silent;
  }
  el.volumeRange.value = volume.level;
  el.volumeRange.style.setProperty("--fill", volume.level + "%");
  el.volumeVal.textContent = volume.muted ? "néma" : volume.level + "%";
  el.muteBtn.textContent = volume.muted ? "🔈" : "🔇";
  el.muteBtn.setAttribute("aria-label", volume.muted ? "Hang be" : "Némítás");
  el.volumeBtn.classList.toggle("muted", silent);
  el.volumeBtn.classList.toggle("low", !silent && volume.level < 50);
  save("volume", volume);
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  libAudio.crossOrigin = "anonymous";
  libAudio.preload = "none";

  el.audio.addEventListener("waiting", () => {
    if (el.playBtn.classList.contains("playing")) el.playBtn.classList.add("loading");
  });
  el.audio.addEventListener("playing", () => el.playBtn.classList.remove("loading"));
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

  // A vizualizáció színe a háttérárnyalatot követi.
  setInterval(() => {
    const c = getComputedStyle(document.documentElement).getPropertyValue("--t1").trim();
    if (c) accentColor = c;
  }, 400);

  // A vászon méretét a színpad méretváltozásához igazítjuk (billentyűzet, címsor, megfejtés):
  // különben a régi kép felnagyítva, elmosódva látszik.
  window.addEventListener("resize", sizeViz);
  if (window.ResizeObserver) new ResizeObserver(sizeViz).observe(el.viz);

  el.volumeRange.addEventListener("input", () => {
    volume.level = +el.volumeRange.value;
    volume.muted = false;
    applyVolume();
  });
  el.muteBtn.addEventListener("click", () => { volume.muted = !volume.muted; applyVolume(); });
  el.volumeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = el.volumePop.hidden;
    el.volumePop.hidden = !open;
    el.volumeBtn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("pointerdown", (e) => {
    if (!el.volumePop.hidden && !el.volumePop.contains(e.target) && !el.volumeBtn.contains(e.target)) {
      el.volumePop.hidden = true;
      el.volumeBtn.setAttribute("aria-expanded", "false");
    }
  });
}
