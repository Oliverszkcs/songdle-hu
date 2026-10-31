import { $, el, norm, coverUrl, artistLine, toast } from "./core.js?v=62";
import { reported, isReported, catLabel, setReported } from "./pool.js?v=62";
import { mode, category, pool, round } from "./state.js?v=62";
import { actx, gainNode, ensureAudioGraph, libAudio, stopAudio, applyVolume } from "./audio.js?v=62";
import { highlighted, copyText } from "./autocomplete.js?v=62";
import { renderStats } from "./stats.js?v=62";
import { renderReportBtn } from "./report.js?v=62";

// ---------- Dallista ----------
const libDialog = $("libraryDialog"), libList = $("libList"), libSearch = $("libSearch"), libMeta = $("libMeta");
const LIB_MAX_RESULTS = 300;

function libTrackItem(t, q) {
  const li = document.createElement("li");
  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  if (t.md5) img.src = coverUrl(t.md5, 120);
  const text = document.createElement("span");
  text.className = "t";
  const title = document.createElement("b");
  title.appendChild(highlighted(t.title, q));
  const sub = document.createElement("span");
  sub.appendChild(highlighted(t.artist !== t.src ? `${artistLine(t)} · ${t.album}`
    : t.feat.length ? `feat. ${t.feat.join(", ")} · ${t.album}` : t.album, q));
  text.append(title, sub);
  const play = document.createElement("span");
  play.className = "lib-play";
  play.setAttribute("aria-hidden", "true");
  li.append(img, text, play);
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.setAttribute("aria-label", `${t.title} – előnézet lejátszása`);
  li.addEventListener("click", () => libPlay(t, li));
  li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); libPlay(t, li); } });
  if (isReported(t.id)) li.classList.add("is-blocked");
  if (t.id === libId) { li.classList.add("playing"); libLi = li; }
  return li;
}

// Dallista: koppintásra lejátssza a dal előnézetét (külön lejátszón, a játékot nem zavarja).
export let libSrcNode = null, libLi = null, libId = null, libToken = 0;

export function libStop() {
  libToken++;
  libAudio.pause();
  if (libLi) libLi.classList.remove("playing", "loading");
  libLi = null;
  libId = null;
}

async function libPlay(t, li) {
  if (libLi === li) return libStop();
  libStop();
  stopAudio();
  ensureAudioGraph();
  if (actx && !libSrcNode) {
    libSrcNode = actx.createMediaElementSource(libAudio);
    libSrcNode.connect(gainNode);
  }
  if (actx && actx.state === "suspended") actx.resume();
  applyVolume();
  const token = libToken;
  libLi = li;
  libId = t.id;
  li.classList.add("playing", "loading");
  try {
    // Friss előnézet-URL, mert a linkek lejárnak.
    const full = await Deezer.track(t.id);
    if (token !== libToken) return;
    if (!full.preview) throw new Error("Nincs előnézet");
    libAudio.src = full.preview;
    await libAudio.play();
    if (token !== libToken) return libAudio.pause();
    li.classList.remove("loading");
  } catch (e) {
    if (token !== libToken) return;
    console.warn(e);
    libStop();
    toast("Ezt a dalt most nem sikerült lejátszani.");
  }
}

// „Jelentett” nézet: a jelentett dalok listája visszaállítással és másolással.
let libView = "all";
const libTools = $("libTools"), libReportedBtn = $("libReportedBtn"), libCopyBtn = $("libCopyBtn");

function renderLibTools() {
  libTools.hidden = !reported.length && libView === "all";
  libReportedBtn.textContent = `⚑ Jelentett (${reported.length})`;
  libReportedBtn.setAttribute("aria-pressed", String(libView === "reported"));
  libCopyBtn.hidden = libView !== "reported" || !reported.length;
}

function renderReported() {
  libMeta.textContent = `${reported.length} jelentett dal · ezek nálad nem jönnek ki`;
  libList.innerHTML = "";
  if (!reported.length) {
    const p = document.createElement("p");
    p.className = "lib-empty";
    p.textContent = "Nincs jelentett dal.";
    libList.appendChild(p);
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "lib-tracks lib-reported";
  for (const r of [...reported].sort((a, b) => b.ts - a.ts)) {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.className = "t";
    const title = document.createElement("b");
    title.textContent = r.title;
    const sub = document.createElement("span");
    sub.textContent = r.artist;
    const reason = document.createElement("span");
    reason.className = "reason";
    reason.textContent = "⚑ " + r.reason;
    text.append(title, sub, reason);
    const restore = document.createElement("button");
    restore.className = "lib-restore";
    restore.type = "button";
    restore.textContent = "Visszaállítás";
    restore.addEventListener("click", () => {
      setReported({ id: r.id }, null);
      if (round) renderReportBtn();
      renderLibrary();
    });
    li.append(text, restore);
    ul.appendChild(li);
  }
  libList.appendChild(ul);
}

function renderLibrary() {
  renderLibTools();
  $("libSearch").parentElement.hidden = libView === "reported";
  if (libView === "reported") return renderReported();
  const q = libSearch.value;
  const tokens = norm(q).split(" ").filter(Boolean);
  // Csak a végtelen mód használ kategóriát; a többi mód a teljes listából játszik.
  const label = mode === "endless" ? catLabel(category) : catLabel("all");
  const groups = new Map();
  let shown = 0, matched = 0;
  for (const t of pool) {
    if (tokens.length && !tokens.every((tok) => t.hay.includes(tok))) continue;
    matched++;
    if (tokens.length && shown >= LIB_MAX_RESULTS) continue;
    shown++;
    const g = t.src || t.artist;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  libMeta.textContent = tokens.length
    ? `${matched} találat · ${label}`
    : `${pool.length} dal · ${groups.size} előadó · ${label}`;
  libList.innerHTML = "";
  if (!groups.size) {
    const p = document.createElement("p");
    p.className = "lib-empty";
    p.textContent = pool.length ? "Nincs találat." : "A dalok még töltődnek…";
    libList.appendChild(p);
    return;
  }
  const names = [...groups.keys()].sort((a, b) => a.localeCompare(b, "hu"));
  for (const name of names) {
    const tracks = groups.get(name);
    const det = document.createElement("details");
    det.className = "lib-group";
    const sum = document.createElement("summary");
    const avatar = document.createElement("img");
    avatar.alt = "";
    avatar.loading = "lazy";
    const withCover = tracks.find((t) => t.md5);
    if (withCover) avatar.src = coverUrl(withCover.md5, 120);
    const nm = document.createElement("span");
    nm.className = "name";
    nm.appendChild(highlighted(name, q));
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = tracks.length;
    const chev = document.createElement("span");
    chev.className = "chev";
    chev.textContent = "›";
    sum.append(avatar, nm, count, chev);
    det.appendChild(sum);
    // A dalokat csak kinyitáskor rajzoljuk ki (több ezer elem is lehet).
    const fill = () => {
      if (det.querySelector(".lib-tracks")) return;
      const ul = document.createElement("ul");
      ul.className = "lib-tracks";
      for (const t of tracks) ul.appendChild(libTrackItem(t, q));
      det.appendChild(ul);
    };
    det.addEventListener("toggle", () => { if (det.open) fill(); });
    if (tokens.length) { det.open = true; fill(); }
    libList.appendChild(det);
  }
}

let libTimer = 0;
// A súgó mindig a tetején nyílik: a fókusz a címre kerül (nem a lenti „Kezdjük!” gombra),
// és a görgetést is visszaállítjuk.
export function openHelp() {
  el.helpDialog.showModal();
  const top = () => { el.helpDialog.scrollTop = 0; el.helpDialog.querySelector("form").scrollTop = 0; };
  top();
  requestAnimationFrame(top);
}

// Más modulból csak ezeken keresztül írható (az importált változó csak olvasható).
export function setLibSrcNode(v) { return (libSrcNode = v); }

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  libAudio.addEventListener("ended", libStop);

  libReportedBtn.addEventListener("click", () => {
    libView = libView === "reported" ? "all" : "reported";
    libSearch.value = "";
    renderLibrary();
    libList.scrollTop = 0;
  });

  // A config.js BLOCKED_TRACKS listájába bemásolható formátum.
  libCopyBtn.addEventListener("click", async () => {
    const lines = reported.map((r) => `    { id: ${r.id}, note: ${JSON.stringify(`${r.title} – ${r.artist}: ${r.reason}`)} },`);
    toast(await copyText(lines.join("\n")) ? "Lista vágólapra másolva!" : "Nem sikerült másolni.");
  });
  libSearch.addEventListener("input", () => {
    clearTimeout(libTimer);
    libTimer = setTimeout(renderLibrary, 120);
  });
  $("libraryBtn").addEventListener("click", () => {
    libView = "all";
    libSearch.value = "";
    renderLibrary();
    libList.scrollTop = 0;
    libDialog.showModal();
  });
  libDialog.addEventListener("close", libStop);

  $("statsBtn").addEventListener("click", () => {
    renderStats();
    el.statsDialog.showModal();
    el.statsDialog.scrollTop = 0;
  });
  $("helpBtn").addEventListener("click", openHelp);
}
