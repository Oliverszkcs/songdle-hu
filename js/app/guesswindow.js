import { el, coverUrl, artistLine, trackLabel, toast } from "./core.js?v=61";
import { round } from "./state.js?v=61";
import { currentLength } from "./round.js?v=61";
import { playClip } from "./audio.js?v=61";
import { search, comboSync, judge } from "./autocomplete.js?v=61";
import { stream, st, streamControls, streamLock, chatMatch, renderStream } from "./stream.js?v=61";

// ----- Tipp-ablak (beírós mód) -----
// Külön böngészőablak a streamer tippjéhez, rendes javaslatlistával. Az OBS csak a játék ablakát veszi fel,
// így ez nem kerül a streamre. Az ablakot innen építjük fel és innen kezeljük (azonos eredet).
export let gw = null; // { win, input, sugg, status, play, skip, lock, list, items, idx, sel }
function openGuessWindow() {
  if (gw && !gw.win.closed) return gw.win.focus();
  const win = window.open("", "songdle-tipp", "popup=yes,width=460,height=640");
  if (!win) return toast("A böngésző letiltotta a felugró ablakot. Engedélyezd, vagy írd be a tipped lent (rejtve).");
  const css = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => `<link rel="stylesheet" href="${l.href}">`).join("");
  const d = win.document;
  d.open();
  d.write(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>🔒 Songdle – tipp-ablak</title>${css}</head><body class="gw-body"><main class="gw">
    <p class="gw-warn">🔒 Tipp-ablak – <b>ezt ne mutasd a streamen!</b></p>
    <p class="gw-status" id="gwStatus"></p>
    <button type="button" class="btn btn-ghost" id="gwPlay">▶ Részlet lejátszása</button>
    <div class="guess-box gw-box">
      <input id="gwInput" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Dal címe vagy előadó…" aria-label="Tipp" role="combobox" aria-autocomplete="list" aria-controls="gwSugg" aria-expanded="false">
      <ul class="suggestions glass" id="gwSugg" role="listbox" hidden></ul>
    </div>
    <div class="buttons"><button type="button" class="btn btn-ghost" id="gwSkip">Kihagyás</button><button type="button" class="btn btn-primary" id="gwLock">🔒 Lezárás</button></div>
    <ol class="guesses st-list gw-list" id="gwList"></ol>
    </main></body></html>`);
  d.close();
  const $w = (id) => d.getElementById(id);
  gw = { win, input: $w("gwInput"), sugg: $w("gwSugg"), status: $w("gwStatus"), play: $w("gwPlay"), skip: $w("gwSkip"),
    lock: $w("gwLock"), list: $w("gwList"), items: [], idx: -1, sel: null, msg: "" };
  const g = gw;
  g.input.addEventListener("input", () => { g.sel = null; g.msg = ""; gwSuggest(); });
  g.input.addEventListener("keydown", (e) => {
    const n = g.items.length;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); g.idx = (g.idx + 1) % n; gwRenderSugg(); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); g.idx = (g.idx - 1 + n) % n; gwRenderSugg(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (!g.sel && g.items[g.idx]) gwChoose(g.items[g.idx]);
      else gwLock();
    } else if (e.key === "Escape") { g.items = []; gwRenderSugg(); }
  });
  g.play.addEventListener("click", () => { if (!el.playBtn.disabled) playClip(); });
  g.skip.addEventListener("click", () => gwSubmit({ type: "skip" }));
  g.lock.addEventListener("click", gwLock);
  win.addEventListener("pagehide", () => { if (gw === g) setTimeout(renderStream, 0); });
  renderStream();
  streamControls();
  win.focus();
}
export function closeGuessWindow() {
  if (gw && !gw.win.closed) gw.win.close();
  gw = null;
  document.body.classList.remove("gw-open");
}

function gwSuggest() {
  const q = gw.input.value;
  gw.items = q.trim() ? search(q, true).slice(0, 8) : [];
  gw.idx = gw.items.length ? 0 : -1;
  gwRenderSugg();
}
function gwRenderSugg() {
  const g = gw, d = g.win.document;
  g.sugg.innerHTML = "";
  g.sugg.hidden = !g.items.length;
  g.items.forEach((t, i) => {
    const li = d.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === g.idx));
    const img = d.createElement("img");
    img.className = "s-cover";
    img.alt = "";
    if (t.md5) img.src = coverUrl(t.md5, 120);
    const text = d.createElement("span");
    text.className = "s-text";
    const title = d.createElement("span");
    title.className = "s-title";
    title.textContent = t.title;
    const artist = d.createElement("span");
    artist.className = "s-artist";
    artist.textContent = artistLine(t);
    text.append(title, artist);
    li.append(img, text);
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", () => gwChoose(t));
    g.sugg.appendChild(li);
  });
  comboSync(g.input, g.sugg, g.idx);
}
function gwChoose(t) {
  gw.sel = t;
  gw.input.value = trackLabel(t);
  gw.items = [];
  gwRenderSugg();
  gw.input.focus();
}
function gwLock() {
  const t = gw.sel && gw.input.value === trackLabel(gw.sel) ? gw.sel : chatMatch(gw.input.value);
  if (!t) {
    gw.msg = "Nincs ilyen dal a listában – válassz a javaslatokból!";
    return renderGuessWindow();
  }
  gwSubmit({ type: judge(t, round.track), label: trackLabel(t), key: t.key });
}
function gwSubmit(attempt) {
  const c = stream && stream.cur;
  if (!c || c.phase !== "play" || c.me.done || c.pending || round.done) return;
  if (c.heard !== c.stage) {
    gw.msg = "Előbb játszd le a részletet, hogy a chat is hallja!";
    return renderGuessWindow();
  }
  gw.msg = "";
  gw.sel = null;
  gw.input.value = "";
  gw.items = [];
  gwRenderSugg();
  streamLock(attempt);
}

export function renderGuessWindow() {
  if (!gw || gw.win.closed) return;
  const g = gw, c = stream && stream.cur, d = g.win.document;
  const ready = !!c && !!round && round.mode === "stream";
  const over = ready && (round.done || c.phase === "bonus" || c.phase === "bvote" || c.phase === "done");
  const canLock = ready && c.phase === "play" && !c.me.done && !c.pending && !round.done;
  const heard = !!c && c.heard === c.stage;
  let msg;
  if (!ready) msg = "Dal betöltése…";
  else if (over) msg = `Dal vége: ${trackLabel(round.track)}. A következő dalt a főablakban indítod.`;
  else if (c.pending) msg = `🔒 Lezártad: ${c.pending.type === "skip" ? "kihagyás" : c.pending.label}. Most a chat szavaz…`;
  else if (c.me.done) msg = "✓ Ezzel a dallal végeztél – a chat még tippel.";
  else msg = `Dal ${stream.idx + 1}/${stream.len} · ${c.stage + 1}. tipp · ${currentLength()} mp. `
    + (heard ? "Írd be a tipped, és zárd le!" : "Előbb játszd le a részletet.");
  g.status.textContent = g.msg || msg;
  g.status.classList.toggle("error", !!g.msg);
  g.input.disabled = !canLock;
  g.lock.disabled = !canLock;
  g.skip.disabled = !canLock || !heard;
  g.play.disabled = !ready || el.playBtn.disabled;
  // A saját tippjeid csak itt látszanak, a jó is (a főablakban a dal végéig rejtve).
  g.list.innerHTML = "";
  const mine = c ? [...c.me.attempts, ...(c.pending ? [c.pending] : [])] : [];
  mine.forEach((a, i) => {
    const li = d.createElement("li");
    const locked = c.pending && i === mine.length - 1;
    li.className = locked ? "pending" : a.type;
    const mark = d.createElement("span");
    mark.className = "mark";
    mark.textContent = locked ? "🔒" : { right: "✓", wrong: "✗", near: "~", skip: "»" }[a.type];
    const label = d.createElement("span");
    label.className = "label";
    label.textContent = a.type === "skip" ? "Kihagyva" : a.label;
    li.append(mark, label);
    g.list.appendChild(li);
  });
}

export const mvpList = () => [...stream.mvp.values()].sort((a, b) => b.pts - a.pts || b.hits - a.hits);
export function renderStreamMvp() {
  const top = mvpList().slice(0, 3);
  st.mvp.hidden = !top.length;
  st.mvp.textContent = top.length ? "🏅 " + top.map((p) => `${p.name} ${p.pts}`).join(" · ") : "";
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  // A főablak újratöltésekor a tipp-ablak is bezárul (a kezelői a főablakban élnek).
  window.addEventListener("pagehide", () => { if (gw && !gw.win.closed) gw.win.close(); });
  // Ha a streamer bezárja a tipp-ablakot, visszajön a lenti (rejtett) beviteli mező.
  setInterval(() => {
    if (gw && gw.win.closed) { gw = null; if (stream && stream.cur) { renderStream(); streamControls(); } else document.body.classList.remove("gw-open"); }
  }, 700);
  st.popBtn.addEventListener("click", openGuessWindow);
}
