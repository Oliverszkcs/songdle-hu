import { POINTS, load, save, decId } from "./core.js?v=61";
import { renderMode, renderCategories, enterMode } from "./modes.js?v=61";
import { renderAll, buildWave, renderPoints } from "./render.js?v=61";
import { sizeViz, drawViz, applyVolume } from "./audio.js?v=61";
import { startVersus, clearBattle } from "./versus.js?v=61";
import { BATTLE_LENGTHS, openBattle, resumeBattle } from "./peer.js?v=61";
import { countEvent } from "./analytics.js?v=61";
import { openHelp } from "./library.js?v=61";
import { init as poolInit } from "./pool.js?v=61";
import { init as stateInit } from "./state.js?v=61";
import { init as modesInit } from "./modes.js?v=61";
import { init as renderInit } from "./render.js?v=61";
import { init as audioInit } from "./audio.js?v=61";
import { init as autocompleteInit } from "./autocomplete.js?v=61";
import { init as controlsInit } from "./controls.js?v=61";
import { init as versusInit } from "./versus.js?v=61";
import { init as peerInit } from "./peer.js?v=61";
import { init as streamInit } from "./stream.js?v=61";
import { init as guesswindowInit } from "./guesswindow.js?v=61";
import { init as twitchInit } from "./twitch.js?v=61";
import { init as analyticsInit } from "./analytics.js?v=61";
import { init as statsInit } from "./stats.js?v=61";
import { init as reportInit } from "./report.js?v=61";
import { init as libraryInit } from "./library.js?v=61";
import { init as artistInit } from "./artist.js?v=61";

// Ugyanaz a szám, mint az index.html data-v-je, a ?v= linkek (a modulok importjaiban is) és az sw.js
// CACHE-e: frissítéskor mindet emeld (node tools/bump-version.mjs).
const APP_V = "61";

// ---------- Indítás ----------
function start() {
  // Minden modul betöltéskori lépései, az eredeti sorrendben.
  poolInit();
  stateInit();
  modesInit();
  renderInit();
  audioInit();
  autocompleteInit();
  controlsInit();
  versusInit();
  peerInit();
  streamInit();
  guesswindowInit();
  twitchInit();
  analyticsInit();
  statsInit();
  reportInit();
  libraryInit();
  artistInit();

  applyVolume();
  renderMode();
  renderCategories();
  renderPoints();
  buildWave(false);
  renderAll();
  sizeViz();
  requestAnimationFrame(drawViz);
  // Kihívás-link (?c=dalok&p=pont&n=név, régen ?k=) vagy párbaj-meghívó (?parbaj=KÓD).
  const params = new URLSearchParams(location.search);
  // c: új (nem olvasható) formátum; k: a régi linkek (36-os számrendszerű azonosítók).
  const challengeIds = (params.get("c") ? params.get("c").split("-").map(decId) : (params.get("k") || "").split("-").map((s) => parseInt(s, 36)))
    .filter((n) => n > 0).slice(0, Math.max(...BATTLE_LENGTHS));
  const battleCode = (params.get("parbaj") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (challengeIds.length || battleCode) history.replaceState(null, "", location.pathname);
  if (!load("seenHelp", false) && !challengeIds.length && !battleCode) {
    openHelp();
    save("seenHelp", true);
  }
  if (challengeIds.length) {
    clearBattle();
    const name = (params.get("n") || "").slice(0, 16) || "Egy barátod";
    // Dalonként legfeljebb 100 pont szerezhető: a link átírt, lehetetlen pontszámát levágjuk.
    const score = Math.min(challengeIds.length * POINTS[0], Math.max(0, parseInt(params.get("p"), 10) || 0));
    startVersus("challenge", challengeIds, [{ id: "c", name, score }]);
    countEvent("challenge-opened");
  } else if (!battleCode && resumeBattle()) {
    // félbehagyott párbaj folytatása
  } else {
    enterMode();
    if (battleCode) openBattle(battleCode);
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  }
}

// Ha egy frissítés után a CDN régi oldalt adna új szkripttel (vagy fordítva), a kettő nem illik össze,
// és félbemaradna az indulás. Ilyenkor egyszer újratöltjük az oldalt.
if (document.documentElement.dataset.v !== APP_V) {
  let reloaded = false;
  try { reloaded = sessionStorage.getItem("songdle.vReload") === APP_V; sessionStorage.setItem("songdle.vReload", APP_V); } catch { /* nincs tároló */ }
  if (reloaded) start(); else location.reload();
} else start();
