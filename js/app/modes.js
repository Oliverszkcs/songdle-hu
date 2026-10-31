import {
  CFG, SET_SIZE, DIFFS, diffById, reducedMotion, $, el, load, save, dateKey, prettyDate, decId, toast,
} from "./core.js?v=62";
import {
  loadArtists, buildPool, assignWeights, DECADES, decadeOf, allCats, artistsFor, loadYears, trackYear, pickDailyTrack,
} from "./pool.js?v=62";
import {
  mode, category, hard, HARD_MULT_TEXT, pool, round, loadToken, dailyDiff, game, gameScore, gameDone, versus,
  vsOver, vsOppOver, dailyKey, dailyResult, nextUnplayedDiff, setStatus, confirmDialog, setLoading, setHard,
  setDailyDiff, setGame, setCategory, setMode, setLoadToken, setRound, setPool,
} from "./state.js?v=62";
import { startRound, persistRound, finishRound } from "./round.js?v=62";
import { resetStage, showDone, stopCountdown } from "./bonus.js?v=62";
import { renderAll, buildWave, setControls } from "./render.js?v=62";
import { stopAudio } from "./audio.js?v=62";
import { vsStartSong, leaveVersus, closeVersus } from "./versus.js?v=62";
import { openBattle } from "./peer.js?v=62";
import { stream, openStreamSetup, leaveStream, closeStream, streamStartSong } from "./stream.js?v=62";
import { renderTwConn } from "./twitch.js?v=62";
import { adDone, openArtistGame, adLeave } from "./artist.js?v=62";

// ---------- Mód és kategória ----------
export function renderMode() {
  el.segmented.dataset.mode = mode;
  el.modeEndless.setAttribute("aria-selected", String(mode === "endless"));
  el.modeDaily.setAttribute("aria-selected", String(mode === "daily"));
  el.modeArtist.setAttribute("aria-selected", String(mode === "artist"));
  document.body.dataset.mode = mode;
  el.input.placeholder = mode === "stream" ? "Dalcím – rejtve, a chat nem látja…" : "Dal címe vagy előadó…";
  // Ahol a CSS-es maszk nem működik, jelszómezővel rejtjük el a streamer tippjét.
  const cssMask = window.CSS && CSS.supports && CSS.supports("-webkit-text-security", "disc");
  el.input.type = mode === "stream" && !cssMask ? "password" : "text";
  el.dailyBanner.hidden = mode !== "daily" && mode !== "versus" && mode !== "stream";
  if (mode === "stream") {
    el.dailyBanner.textContent = "";
    const b = document.createElement("b");
    b.textContent = "#" + stream.channel;
    el.dailyBanner.append("📺 Streamer vs Chat · ", b, `${stream.catLabel ? " · " + stream.catLabel : ""} · ${stream.len} dal`);
  } else if (mode === "versus") {
    el.dailyBanner.textContent = "";
    const b = document.createElement("b");
    const one = versus.opps.length === 1;
    b.textContent = one ? versus.opps[0].name : `${versus.opps.length + 1} játékos`;
    el.dailyBanner.append(versus.kind === "battle" ? (one ? "⚔️ Párbaj · Te vs " : "⚔️ Párbaj · ") : "🎯 Kihívás · ", b,
      versus.kind === "battle" ? `${versus.cat ? " · " + versus.cat : ""} · ${versus.ids.length} dal` : ` · ${versus.opps[0].score} pont – győzd le!`);
  } else {
    const d = diffById(dailyDiff);
    el.dailyBanner.innerHTML = `Mai dal · <b>${prettyDate(dateKey())}</b> · ${d.label} · <b>×${d.multiplier}</b> pont`;
  }
  updateNextButton();
}

export function updateNextButton() {
  el.nextBtn.disabled = false;
  if (mode === "stream") {
    el.nextBtn.textContent = stream.idx + 1 < stream.len ? "Következő dal →" : "🏁 Eredmény";
    // A bónuszkérdés (és a chat szavazása) alatt még nem lehet továbblépni.
    el.nextBtn.disabled = !stream.cur || stream.cur.phase !== "done";
    return;
  }
  if (mode === "versus") {
    if (!vsOver()) {
      const waiting = versus.waiting;
      el.nextBtn.textContent = waiting ? "Várakozás…" : "Következő dal →";
      el.nextBtn.disabled = waiting;
    } else if (!vsOppOver()) {
      // Az utolsó dal után is megvárjuk az ellenfelet, csak utána jön az eredmény.
      el.nextBtn.textContent = "Várakozás…";
      el.nextBtn.disabled = true;
    } else el.nextBtn.textContent = "🏁 Eredmény";
    return;
  }
  if (mode !== "daily") { el.nextBtn.textContent = gameDone() ? "Új kör →" : "Következő dal →"; return; }
  const next = nextUnplayedDiff();
  el.nextBtn.textContent = next ? `${next.icon} ${next.label} →` : "Végtelen mód →";
}

// A „Napi” fülön jelzi, hány mai dal van még hátra.
export function updateDailyBadge() {
  const left = DIFFS.filter((d) => { const r = dailyResult(d.id); return !r || !r.done; }).length;
  const badge = $("dailyBadge");
  badge.hidden = left === 0;
  badge.textContent = left;
  badge.title = `${left} napi dal van hátra`;
  const ab = $("artistBadge");
  ab.hidden = adDone();
  ab.textContent = "1";
  ab.title = "A mai előadó még nincs meg";
}

// Csak a chip-sort görgetjük, és csak ha a kiválasztott chip kilóg. A scrollIntoView
// mobilon az egész oldalt is elcsúsztathatja oldalra.
function revealChip(b) {
  const row = b.parentElement, r = row.getBoundingClientRect(), c = b.getBoundingClientRect();
  if (c.left >= r.left + 12 && c.right <= r.right - 28) return;
  // Betöltéskor azonnal ugrik, csak koppintásra animál (különben oldalra csúszik a sor).
  const smooth = !reducedMotion.matches && navigator.userActivation && navigator.userActivation.isActive;
  row.scrollTo({ left: row.scrollLeft + c.left - r.left - (r.width - c.width) / 2, behavior: smooth ? "smooth" : "auto" });
}

export function renderCategories() {
  updateDailyBadge();
  el.categories.innerHTML = "";
  el.categories.classList.toggle("cat-bar", mode === "endless");
  if (mode === "daily") return renderDifficulties();
  if (mode === "versus") {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = versus.kind === "battle" ? "✕ Kilépés a párbajból" : "✕ Kilépés a kihívásból";
    b.addEventListener("click", () => leaveVersus());
    el.categories.appendChild(b);
    return;
  }
  if (mode === "stream") {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = "✕ Kilépés";
    b.addEventListener("click", () => leaveStream());
    const conn = document.createElement("span");
    conn.className = "chip tw-conn";
    conn.id = "twConn";
    el.categories.append(b, conn);
    renderTwConn();
    return;
  }
  // Végtelen módban egyetlen sáv: a választott kategória (koppintásra lap nyílik) és a párbaj.
  const pick = document.createElement("button");
  pick.className = "cat-pill";
  pick.setAttribute("aria-haspopup", "dialog");
  const c = fillCatPill(pick, category, decadeOf(category) ? "Évtized" : "Kategória");
  if (hard) pick.querySelector(".cat-chev").insertAdjacentHTML("beforebegin", `<span class="cat-hard">🔥 ×${HARD_MULT_TEXT}</span>`);
  pick.setAttribute("aria-label", `Kategória: ${c.label}${hard ? ", nehéz mód" : ""}. Váltás`);
  pick.addEventListener("click", () => openCatSheet({ current: category, onPick: changeCategory }));
  el.categories.appendChild(pick);

  const battle = document.createElement("button");
  battle.className = "chip battle-chip";
  battle.textContent = "⚔️ Párbaj";
  battle.addEventListener("click", openBattle);
  el.categories.appendChild(battle);

  const streamBtn = document.createElement("button");
  streamBtn.className = "chip battle-chip stream-chip";
  streamBtn.textContent = "📺 Stream";
  streamBtn.setAttribute("aria-label", "Streamer vs Chat mód (Twitch)");
  streamBtn.addEventListener("click", openStreamSetup);
  el.categories.appendChild(streamBtn);
}

// Kategóriaválasztó lap: műfajok, évtizedek és a nehéz mód kapcsolója egy helyen.
// Kategória-gomb tartalma (ikon, felirat, név, nyíl) – a végtelen módban és a párbajnál is.
export function fillCatPill(btn, id, caption) {
  const c = allCats.find((x) => x.id === id) || CFG.CATEGORIES[0];
  btn.innerHTML = `<span class="cat-ico" aria-hidden="true"></span><span class="cat-text"><small></small><b></b></span>`
    + `<svg class="cat-chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  btn.querySelector(".cat-ico").textContent = decadeOf(c.id) ? "📅" : c.icon || "🎵";
  btn.querySelector("small").textContent = caption;
  btn.querySelector("b").textContent = c.label;
  return c;
}

const catSheet = $("catSheet"), hardSwitch = $("hardSwitch");
// opts: current (kiválasztott id), onPick(id), title, withHard (nehéz mód kapcsoló látszik-e)
export function openCatSheet({ current, onPick, title = "Mit játszunk?", withHard = true }) {
  const tiles = (box, list, decades) => {
    box.innerHTML = "";
    for (const c of list) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cat-tile";
      b.setAttribute("aria-pressed", String(c.id === current));
      if (decades) {
        b.textContent = c.short || c.label;
        b.setAttribute("aria-label", c.label);
      } else {
        b.innerHTML = `<span aria-hidden="true"></span><span></span>`;
        b.children[0].textContent = c.icon || "🎵";
        b.children[1].textContent = c.label;
      }
      b.addEventListener("click", () => {
        catSheet.close();
        onPick(c.id);
      });
      box.appendChild(b);
    }
  };
  tiles($("catGenres"), CFG.CATEGORIES, false);
  tiles($("catDecades"), DECADES, true);
  $("catSheetTitle").textContent = title;
  $("hardRow").hidden = !withHard;
  hardSwitch.checked = hard;
  catSheet.showModal();
}

function toggleHard() {
  setHard(!hard);
  save("hard", hard);
  renderCategories();
  // Ha a dalt még el sem kezdte, rögtön erre a dalra is érvényes.
  // Csak a még meg sem hallgatott dalra érvényes azonnal (különben előre lehetne hallgatni sima módban).
  const fresh = round && round.mode === "endless" && !round.done && !round.attempts.length && !round.heard;
  if (fresh) {
    round.reverse = hard;
    persistRound();
    buildWave(false);
    renderAll();
  }
  toast(hard
    ? `🔥 Nehéz mód: a dal visszafelé szól, hosszabb részletekkel, ×${HARD_MULT_TEXT} pont${fresh ? "" : " (a következő daltól)"}.`
    : `Nehéz mód kikapcsolva${fresh ? "" : " (a következő daltól)"}.`);
}

function renderDifficulties() {
  for (const d of DIFFS) {
    const b = document.createElement("button");
    b.className = "chip diff-chip";
    b.dataset.diff = d.id;
    const active = d.id === dailyDiff;
    b.setAttribute("aria-pressed", String(active));
    const r = dailyResult(d.id);
    const state = r && r.done ? (r.won ? "won" : "lost") : "";
    if (state) b.classList.add(state);
    b.innerHTML = `<span class="diff-dot" aria-hidden="true">${d.icon}</span><span></span><span class="diff-mult">×${d.multiplier}</span>`
      + (state ? `<span class="diff-state" aria-label="${state === "won" ? "megfejtve" : "nem sikerült"}">${state === "won" ? "✓" : "✗"}</span>` : "");
    b.children[1].textContent = d.label;
    // Telefonon a nem kiválasztott szintnél csak a pötty látszik, ezért a név a felolvasónak is kell.
    b.setAttribute("aria-label", `${d.label} ×${d.multiplier}${state === "won" ? ", megfejtve" : state === "lost" ? ", nem sikerült" : ""}`);
    b.addEventListener("click", () => changeDifficulty(d.id));
    el.categories.appendChild(b);
    if (active) requestAnimationFrame(() => revealChip(b));
  }
}

export function changeDifficulty(id) {
  if (id === dailyDiff) return;
  // A félbehagyott napi kör el van mentve, később folytatható.
  setDailyDiff(id);
  save("dailyDiff", id);
  renderMode();
  renderCategories();
  enterMode();
}

async function changeCategory(id) {
  if (id === category) return;
  // Kategóriaváltáskor az 5 dalos kör újraindul.
  const midSong = round && round.mode === "endless" && !round.done && round.attempts.length > 0;
  const inSet = game.results.length > 0 && !gameDone();
  if (midSong || inSet) {
    el.confirmText.textContent = midSong
      ? "A mostani dal vesztesnek számít, a sorozatod nullázódik, és az 5 dalos kör újraindul. Folytatod?"
      : `Az 5 dalos kör újraindul (eddig ${gameScore()} pont, ${game.results.length}/${SET_SIZE} dal). Folytatod?`;
    if (!(await confirmDialog())) return;
    if (midSong) finishRound(false, true);
  }
  setGame({ results: [] });
  save("game", game);
  setCategory(id);
  save("category", category);
  save("round", null);
  renderCategories();
  enterMode();
}

export function changeMode(m) {
  if (m === mode) return;
  if (mode === "versus") closeVersus();
  if (mode === "stream") closeStream();
  // A félbehagyott végtelen kör megmarad, visszaváltáskor folytatható.
  setMode(m);
  save("mode", mode);
  renderMode();
  renderCategories();
  enterMode();
}

export async function enterMode() {
  const token = setLoadToken(loadToken + 1);
  stopAudio();
  adLeave();
  setRound(null);
  stopCountdown();
  resetStage();
  setControls(false);
  showDone(false);
  renderAll();
  el.artistView.hidden = mode !== "artist";
  el.game.hidden = mode === "artist";
  if (mode === "artist") {
    setLoading(false);
    el.scroll.scrollTop = 0;
    return openArtistGame();
  }

  const poolCategory = mode === "endless" ? category : mode === "stream" ? stream.cat : "all";
  setLoading(true, 0);
  setStatus("Dalok betöltése…");
  const tracks = await loadArtists(artistsFor(poolCategory), (d, n) => {
    if (token !== loadToken) return;
    setLoading(true, d / n);
    el.status.textContent = `Dalok betöltése… ${d}/${n}`;
  });
  if (token !== loadToken) return;
  setPool(buildPool(tracks));
  const decade = decadeOf(poolCategory);
  if (decade) {
    const years = await loadYears();
    if (token !== loadToken) return;
    setPool(pool.filter((t) => { const y = trackYear(t, years); return y >= decade.from && y <= decade.to; }));
    assignWeights(pool);
  }
  if (!pool.length) {
    setLoading(false);
    setStatus(decade ? "Ebben az évtizedben most nincs dal. Válassz másikat!"
      : "Nem sikerült dalokat betölteni. Ellenőrizd az internetkapcsolatot, és frissítsd az oldalt.", true);
    return;
  }
  if (mode === "versus") return vsStartSong();
  if (mode === "stream") return streamStartSong();

  if (mode === "daily") {
    const date = dateKey();
    const saved = load(dailyKey(date, dailyDiff), null);
    // Ha ma már elkezdte, ugyanaz a dal marad akkor is, ha közben frissült a dallista.
    const track = (saved && pool.find((p) => p.id === decId(saved.trackId))) || pickDailyTrack(date, diffById(dailyDiff));
    if (!track) {
      setLoading(false);
      return setStatus("Nem sikerült betölteni a mai dalt. Próbáld újra később.", true);
    }
    return startRound(track, saved && decId(saved.trackId) === track.id ? saved : null);
  }

  const saved = load("round", null);
  if (saved && saved.category === category) {
    const t = pool.find((p) => p.id === decId(saved.trackId));
    if (t) return startRound(t, saved);
  }
  startRound();
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  hardSwitch.addEventListener("change", () => { if (hardSwitch.checked !== hard) toggleHard(); });
  // A háttérre koppintva is bezárul.
  catSheet.addEventListener("click", (e) => { if (e.target === catSheet) catSheet.close(); });
}
