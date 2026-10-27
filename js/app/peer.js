import { MAX_TRIES, POINTS, $, load, save, decId, toast } from "./core.js?v=60";
import {
  loadArtists, buildPool, assignWeights, decadeOf, allCats, catLabel, artistsFor, loadYears,
} from "./pool.js?v=60";
import { category, round, versus, VS_SONGS, vsOver } from "./state.js?v=60";
import { updateNextButton, fillCatPill, openCatSheet } from "./modes.js?v=60";
import { renderStreak } from "./render.js?v=60";
import { homeUrl, shareText } from "./controls.js?v=60";
import {
  pickSet, startVersus, vsWaitingFor, vsNext, renderVsBar, renderVsSummary, vr, renderVsResult, saveBattle,
  loadBattle,
} from "./versus.js?v=60";

// ----- Kapcsolat (PeerJS: ingyenes nyilvános közvetítő a kapcsolódáshoz, utána közvetlen) -----
const PEER_PREFIX = "songdlehu-";
// Saját tárhelyről (a unpkg-s 1.5.4 változatlan másolata), így egy feltört CDN nem futtathat kódot az oldalon.
const PEER_LIB = "js/vendor/peerjs-1.5.4.min.js";
const MAX_PLAYERS = 6;
export const BATTLE_LENGTHS = [5, 10, 15];
const HOST_ID = "host";
// Életjel: ennyi időnként üzenünk, és ennyi csend után bontottnak vesszük a kapcsolatot
// (a böngésző nem mindig veszi észre, ha a másik bezárta a lapot).
const PING_MS = 4000, PEER_TIMEOUT_MS = 16000;
export let peer = null, peerHost = false;
// A szobát nyitónál: vendégenként (játékos-azonosító szerint) { conn, name, seen }.
const guests = new Map();
// A vendégnél: a szobát nyitó kapcsolata és az utolsó tőle jött üzenet ideje.
export let hostConn = null, hostSeen = 0;
// { code, pid (saját játékos-azonosító), closed?, players?, cat?, len?, connect? }
export let room = null;
function loadPeerLib() {
  if (window.Peer) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PEER_LIB;
    s.onload = resolve;
    s.onerror = () => reject(new Error("PeerJS"));
    document.head.appendChild(s);
  });
}

const bt = {
  dialog: $("battleDialog"), nick: $("nickInput"), start: $("battleStart"), wait: $("battleWait"),
  code: $("battleCode"), codeShow: $("battleCodeShow"), status: $("battleStatus"),
  settings: $("battleSettings"), len: $("battleLen"), info: $("battleInfo"), players: $("battlePlayers"), go: $("battleGoBtn"),
};
const battleStatus = (msg, isError) => {
  bt.status.textContent = msg || "";
  bt.status.classList.toggle("error", !!isError);
};
const nick = () => (bt.nick.value.trim() || load("nick", "") || "Ismeretlen").slice(0, 16);
const cleanName = (s) => String(s || "").trim().slice(0, 16) || "Ismeretlen";

// A szobát nyitó választ kategóriát (műfaj vagy évtized) és hosszt; a többiek ugyanazokat a dalokat kapják.
const battleCatId = () => {
  const id = load("battleCat", category);
  return allCats.some((c) => c.id === id) ? id : "all";
};
const battleLen = () => (BATTLE_LENGTHS.includes(load("battleLen", VS_SONGS)) ? load("battleLen", VS_SONGS) : VS_SONGS);
const battleCatBtn = $("battleCatBtn");
function renderBattleSettings() {
  const c = fillCatPill(battleCatBtn, battleCatId(), "Mit játszotok?");
  battleCatBtn.setAttribute("aria-label", `Mit játszotok: ${c.label}. Váltás`);
  bt.len.innerHTML = "";
  for (const n of BATTLE_LENGTHS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = `${n} dal`;
    b.setAttribute("aria-pressed", String(n === battleLen()));
    b.addEventListener("click", () => { save("battleLen", n); renderBattleSettings(); broadcastLobby(); });
    bt.len.appendChild(b);
  }
}

export function openBattle(code) {
  if (bt.dialog.open) return;
  bt.nick.value = load("nick", "");
  bt.start.hidden = false;
  bt.wait.hidden = true;
  bt.code.value = typeof code === "string" ? code : "";
  battleStatus("");
  bt.dialog.showModal();
  if (typeof code === "string" && code) battleJoin();
}

function saveNick() {
  const n = bt.nick.value.trim().slice(0, 16);
  if (n) save("nick", n);
}

// Váróterem: a kód, a meghívó, a játékosok; a beállítások és az indítás csak a szobát nyitónál.
function renderLobby() {
  if (!room) return;
  bt.start.hidden = true;
  bt.wait.hidden = false;
  bt.codeShow.textContent = room.code;
  bt.settings.hidden = !peerHost;
  bt.go.hidden = !peerHost;
  const players = peerHost ? lobbyPlayers() : room.players || [];
  bt.players.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.textContent = p.name;
    if (p.id === HOST_ID) li.classList.add("host");
    if (p.id === room.pid) li.classList.add("me");
    bt.players.appendChild(li);
  }
  if (peerHost) {
    renderBattleSettings();
    bt.go.disabled = guests.size === 0;
    bt.info.textContent = `${players.length}/${MAX_PLAYERS} játékos`;
    battleStatus(guests.size ? "Indíthatod, vagy várj még másokra." : "Várakozás a többiekre… Küldd el nekik a kódot!");
  } else {
    const host = players.find((p) => p.id === HOST_ID);
    bt.info.textContent = room.cat ? `${room.cat} · ${room.len} dal` : "";
    battleStatus(`Várakozás, amíg ${host ? host.name : "a szobát nyitó"} elindítja…`);
  }
}
const lobbyPlayers = () => [{ id: HOST_ID, name: nick() }, ...[...guests].map(([id, g]) => ({ id, name: g.name }))];
function broadcastLobby() {
  if (!peerHost || !room || versus) return;
  broadcast({ type: "lobby", players: lobbyPlayers(), cat: catLabel(battleCatId()), len: battleLen() });
  if (bt.dialog.open && !bt.wait.hidden) renderLobby();
}

function send(c, m) {
  try { if (c && c.open) c.send(m); } catch { /* bontott kapcsolat */ }
}
function broadcast(m, except) {
  for (const [id, g] of guests) if (id !== except) send(g.conn, m);
}
// Saját üzenet: vendégként a szobát nyitónak, szobát nyitóként mindenkinek.
export function sendOut(m) {
  if (peerHost) broadcast({ ...m, from: HOST_ID });
  else send(hostConn, m);
}

export function peerClose() {
  for (const g of guests.values()) { try { g.conn.close(); } catch { /* már zárva */ } }
  guests.clear();
  try { if (hostConn) hostConn.close(); } catch { /* már zárva */ }
  hostConn = null;
  try { if (peer) peer.destroy(); } catch { /* már zárva */ }
  peer = null;
  clearTimeout(reconnectTimer);
}

const ROOM_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newRoomCode = () => Array.from({ length: 4 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join("");
const newPlayerId = () => Math.random().toString(36).slice(2, 10);
const battleLink = (code) => homeUrl() + "?parbaj=" + code;

// Ha a PeerJS közvetítője nem válaszol, ne pörögjön a végtelenségig.
function watchPeerOpen(p) {
  setTimeout(() => {
    if (peer === p && !p.open && !p.destroyed && !p.disconnected) {
      const msg = "A párosító szerver most nem válaszol. Próbáld újra kicsit később!";
      if (bt.dialog.open) battleStatus(msg, true);
      else toast(msg);
    }
  }, 12000);
}

const SOFT_PEER_ERRORS = ["network", "disconnected", "socket-error", "socket-closed", "server-error"];
function peerResume() {
  if (!peer || peer.destroyed || !peer.disconnected) return;
  try { peer.reconnect(); } catch { /* következő alkalommal újra */ }
}

// ----- Szobát nyitó (központ) -----
// resumeCode: újratöltés vagy visszatérés után ugyanazzal a kóddal nyitjuk újra.
async function battleHost(attempt = 0, resumeCode = null) {
  saveNick();
  if (!resumeCode) peerClose();
  if (bt.dialog.open) battleStatus(resumeCode ? "Újracsatlakozás…" : "Szoba nyitása…");
  try { await loadPeerLib(); } catch { return battleStatus("Nem sikerült betölteni a párbajt. Van internet?", true); }
  const code = resumeCode || newRoomCode();
  peerHost = true;
  room = { code, pid: HOST_ID, opened: !!resumeCode };
  const me = new window.Peer(PEER_PREFIX + code);
  peer = me;
  watchPeerOpen(me);
  let tries = 0;
  me.on("open", () => {
    tries = 0;
    room.opened = true;
    if (!versus) renderLobby();
  });
  me.on("connection", hostAccept);
  me.on("disconnected", () => { if (!document.hidden) setTimeout(peerResume, 1000); });
  me.on("error", (e) => {
    if (peer !== me) return;
    // Foglalt kód egy új szobánál: másik kódot sorsolunk.
    if (e.type === "unavailable-id" && !room.opened && attempt < 3) return setTimeout(() => battleHost(attempt + 1), 0);
    // Visszatéréskor a közvetítő még a régi kapcsolatunkhoz köthette a kódot: kicsit később újra próbáljuk.
    if (e.type === "unavailable-id" && tries++ < 15) {
      if (bt.dialog.open) battleStatus("Újracsatlakozás…");
      setTimeout(() => {
        if (peer !== me) return;
        if (me.destroyed) battleHost(attempt, code);
        else peerResume();
      }, 3000);
      return;
    }
    // Megosztáskor a böngésző a háttérbe kerül, és a telefon bontja a közvetítő kapcsolatot:
    // a szoba megmarad, visszatéréskor újracsatlakozunk ugyanazzal a kóddal.
    if (SOFT_PEER_ERRORS.includes(e.type) && !me.destroyed) {
      if (bt.dialog.open && !bt.wait.hidden) battleStatus("Újracsatlakozás…");
      return;
    }
    battleStatus("Hiba a kapcsolatban: " + (e.type || e.message), true);
  });
}

function hostAccept(c) {
  c.on("data", (m) => hostData(c, m));
  c.on("close", () => hostDrop(c));
}

function hostData(c, m) {
  if (!m || typeof m !== "object") return;
  if (m.type === "hello") return hostHello(c, m);
  const id = c.pid, g = id && guests.get(id);
  if (!g || g.conn !== c) return;
  g.seen = Date.now();
  if (m.type === "progress") {
    // Csak az ismert mezőket adjuk tovább, így egy vendég nem küldhet a többieknek akármekkora vagy idegen adatot.
    const tries = (v) => Math.max(0, Math.min(MAX_TRIES, Math.floor(+v) || 0));
    const p = { type: "progress", idx: Math.floor(+m.idx), attempts: tries(m.attempts), done: !!m.done, won: !!m.won, tries: tries(m.tries) };
    applyProgress(id, p);
    broadcast({ ...p, from: id }, id);
  } else if (m.type === "rematch") {
    broadcast({ type: "rematch", from: id }, id);
    applyRematch(id);
    hostMaybeRematch();
  } else if (m.type === "bye") {
    hostDrop(c);
  }
}

function hostHello(c, m) {
  const id = typeof m.pid === "string" && /^[a-z0-9]{4,12}$/.test(m.pid) && m.pid !== HOST_ID ? m.pid : null;
  if (!id) return c.close();
  const name = cleanName(m.name);
  const known = versus && versus.kind === "battle" ? versus.opps.find((o) => o.id === id) : null;
  const reject = (type) => { send(c, { type }); setTimeout(() => c.close(), 400); };
  if (versus && !known) return reject("running");
  if (!versus && !guests.has(id) && guests.size >= MAX_PLAYERS - 1) return reject("full");
  const old = guests.get(id);
  // A játékos-azonosítót mindenki látja (lobby, állás), ezért a visszatérőnek a csak neki küldött kulcsot
  // is tudnia kell: így más nem veheti át a helyét és az eredményeit.
  const owner = old || known;
  if (owner && owner.key && m.key !== owner.key) return reject("taken");
  if (old && old.conn !== c) { try { old.conn.close(); } catch { /* már zárva */ } }
  c.pid = id;
  const key = (owner && owner.key) || crypto.getRandomValues(new Uint32Array(2)).join("-");
  guests.set(id, { conn: c, name, seen: Date.now(), key });
  if (known) known.key = key;
  send(c, { type: "welcome", key });
  if (known) {
    // Visszatért játékos: a saját eredményei a mérvadók, majd mindenki megkapja a teljes állást.
    known.gone = false;
    if (Array.isArray(m.results)) known.results = cleanResults(m.results);
    broadcastSync();
    vsRefresh();
    toast(`${known.name} visszajött.`);
  } else {
    broadcastLobby();
  }
}

// Bontott vagy néma kapcsolat: a játékos kiesik (meccs közben visszatérhet).
function hostDrop(c) {
  const id = c.pid, g = id && guests.get(id);
  if (!g || g.conn !== c) return;
  guests.delete(id);
  try { c.close(); } catch { /* már zárva */ }
  if (versus && versus.kind === "battle") {
    const o = versus.opps.find((x) => x.id === id);
    if (o && !o.gone) {
      o.gone = true;
      broadcast({ type: "left", from: id });
      toast(`${o.name} kilépett a párbajból.`);
      vsRefresh();
      hostMaybeRematch();
    }
  } else broadcastLobby();
}

function broadcastSync() {
  if (!versus) return;
  broadcast({
    type: "sync", ids: versus.ids, cat: versus.cat,
    players: [
      { id: HOST_ID, name: nick(), results: versus.results, rematch: !!versus.rematchMe },
      ...versus.opps.map((o) => ({ id: o.id, name: o.name, results: o.results, gone: !!o.gone, rematch: !!o.rematch })),
    ],
  });
}

async function hostStartMatch() {
  if (!peerHost || hostStartMatch.busy) return;
  hostStartMatch.busy = true;
  try {
    battleStatus("Dalok sorsolása…");
    const catId = battleCatId(), len = battleLen();
    let list = buildPool(await loadArtists(artistsFor(catId), () => {}));
    const decade = decadeOf(catId);
    if (decade) {
      const years = await loadYears();
      list = list.filter((t) => years[t.id] >= decade.from && years[t.id] <= decade.to);
    }
    // Túl kevés dalnál (pl. hiányzó évadatok) a teljes listából sorsolunk.
    if (list.length < len) list = buildPool(await loadArtists(artistsFor("all"), () => {}));
    assignWeights(list);
    const ids = pickSet(list, len);
    const cat = catId === "all" ? "" : catLabel(catId);
    const players = lobbyPlayers();
    if (players.length < 2) return battleStatus("Nincs kivel játszani – várj, amíg valaki csatlakozik.", true);
    broadcast({ type: "start", ids, cat, players });
    if (bt.dialog.open) bt.dialog.close("started");
    // A kulcsok csak nálunk maradnak (a „start” üzenetben nincsenek benne).
    startVersus("battle", ids, players.filter((p) => p.id !== HOST_ID).map((p) => ({ ...p, key: guests.get(p.id) && guests.get(p.id).key })), cat);
  } finally {
    hostStartMatch.busy = false;
  }
}

// A visszavágó akkor indul, ha mindenki kérte, aki még bent van.
function hostMaybeRematch() {
  if (!peerHost || !versus || !versus.rematchMe) return;
  const active = versus.opps.filter((o) => !o.gone);
  if (active.length && active.every((o) => o.rematch)) hostStartMatch();
}

// ----- Vendég -----
async function battleJoin(resume = null) {
  const code = resume ? resume.code : bt.code.value.trim().toUpperCase();
  if (code.length !== 4) return battleStatus("Írd be a 4 betűs kódot!", true);
  saveNick();
  if (!resume) peerClose();
  battleStatus("Csatlakozás…");
  try { await loadPeerLib(); } catch { return battleStatus("Nem sikerült betölteni a párbajt. Van internet?", true); }
  peerHost = false;
  room = { code, pid: (resume && resume.pid) || newPlayerId(), key: resume && resume.key };
  const me = new window.Peer();
  peer = me;
  watchPeerOpen(me);
  room.connect = () => {
    if (peer !== me || hostConn || room.closed) return;
    if (!me.open) return peerResume();
    const c = me.connect(PEER_PREFIX + code, { reliable: true });
    hostConn = c;
    hostSeen = Date.now();
    c.on("open", () => {
      hostSeen = Date.now();
      send(c, { type: "hello", name: nick(), pid: room.pid, key: room.key, results: versus && versus.kind === "battle" ? versus.results : null });
    });
    c.on("data", (m) => {
      if (hostConn !== c) return;
      hostSeen = Date.now();
      reconnectTries = 0;
      guestData(m);
    });
    c.on("close", () => { if (hostConn === c) guestLost(); });
  };
  me.on("open", () => room.connect());
  me.on("disconnected", () => { if (!document.hidden) setTimeout(peerResume, 1000); });
  me.on("error", (e) => {
    if (peer !== me) return;
    // A szobát nyitó épp átválthatott a csevegőbe a link elküldéséhez, vagy újratölt: adunk neki időt.
    if (e.type === "peer-unavailable") {
      hostConn = null;
      return guestLost();
    }
    if (SOFT_PEER_ERRORS.includes(e.type) && !me.destroyed) return;
    battleStatus("Hiba a kapcsolatban: " + (e.type || e.message), true);
  });
}

// A szobát nyitó nem érhető el: egy darabig újra próbáljuk, utána feladjuk.
let reconnectTimer = 0, reconnectTries = 0;
function guestLost() {
  hostConn = null;
  if (!room || room.closed) return;
  clearTimeout(reconnectTimer);
  if (reconnectTries++ >= 20) {
    room.closed = true;
    if (versus && versus.kind === "battle") {
      versus.opps.forEach((o) => { o.gone = true; });
      toast("Megszakadt a kapcsolat a szobával.");
      vsRefresh();
    } else battleStatus("Nincs ilyen szoba (vagy már bezárt).", true);
    return;
  }
  if (bt.dialog.open) battleStatus(room.players ? "Újracsatlakozás…" : "Várakozás a szobára…");
  reconnectTimer = setTimeout(() => { if (room && room.connect) room.connect(); }, 3000);
}

function guestData(m) {
  if (!m || typeof m !== "object") return;
  if (m.type === "lobby" && Array.isArray(m.players)) {
    room.players = m.players.slice(0, MAX_PLAYERS).map((p) => ({ id: String(p.id), name: cleanName(p.name) }));
    room.cat = String(m.cat || "").slice(0, 30);
    room.len = +m.len || VS_SONGS;
    if (bt.dialog.open) renderLobby();
  } else if (m.type === "welcome") {
    room.key = String(m.key || "").slice(0, 40);
    saveBattle();
  } else if (m.type === "full" || m.type === "running" || m.type === "taken") {
    room.closed = true;
    battleStatus(m.type === "full" ? "Ez a szoba már tele van." : m.type === "taken" ? "Ezzel az azonosítóval már bent van valaki a szobában."
      : "Ebben a szobában már megy a meccs.", true);
  } else if ((m.type === "start" || m.type === "sync") && Array.isArray(m.ids) && Array.isArray(m.players)) {
    const ids = m.ids.map(Number).filter((n) => n > 0).slice(0, Math.max(...BATTLE_LENGTHS));
    const cat = String(m.cat || "").slice(0, 30);
    const players = m.players.slice(0, MAX_PLAYERS).filter((p) => p && String(p.id) !== room.pid)
      .map((p) => ({ id: String(p.id), name: cleanName(p.name), results: cleanResults(p.results), gone: !!p.gone, rematch: !!p.rematch }));
    const same = versus && versus.kind === "battle" && versus.ids.join() === ids.join();
    if (m.type === "start" || !same) {
      if (bt.dialog.open) bt.dialog.close("started");
      // Ha a mentett állásunk elveszett, a szobát nyitótól kapjuk vissza a saját eredményeinket.
      const own = m.type === "sync" && m.players.find((p) => p && String(p.id) === room.pid);
      const results = own ? cleanResults(own.results) : [];
      const resume = results.length ? { idx: Math.min(results.filter(Boolean).length, ids.length - 1), results } : null;
      startVersus("battle", ids, players.map((p) => ({ ...p, rematch: false })), cat, resume);
    } else {
      // Újracsatlakozás után: a többiek állása a szobát nyitótól jön.
      for (const p of players) {
        const o = versus.opps.find((x) => x.id === p.id);
        if (o) Object.assign(o, { results: p.results, gone: p.gone, rematch: p.rematch });
        else versus.opps.push({ ...p, live: {} });
      }
      vsRefresh();
    }
  } else if (m.type === "progress") {
    applyProgress(String(m.from), m);
  } else if (m.type === "rematch") {
    applyRematch(String(m.from));
  } else if (m.type === "left" && versus) {
    const o = versus.opps.find((x) => x.id === String(m.from));
    if (o && !o.gone) {
      o.gone = true;
      toast(`${o.name} kilépett a párbajból.`);
      vsRefresh();
    }
  } else if (m.type === "bye") {
    // A szobát nyitó kilépett: a többiekkel sem tudunk már beszélni.
    room.closed = true;
    if (versus && versus.kind === "battle") {
      versus.opps.forEach((o) => { o.gone = true; });
      toast("A szobát nyitó kilépett – a meccset egyedül fejezed be.");
      vsRefresh();
    } else battleStatus("A szobát nyitó kilépett.", true);
  }
}

// ----- Közös -----
function cleanResults(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, Math.max(...BATTLE_LENGTHS)).map((r) => (r && typeof r === "object"
    ? cleanResult(!!r.won, Math.max(0, Math.min(MAX_TRIES, Math.floor(+r.tries) || 0)))
    : null));
}

// A pontot a tippek számából számoljuk újra, így a küldött pontszám nem írható át.
const cleanResult = (won, tries) => (won && tries ? { won: true, pts: POINTS[tries - 1], tries } : { won: false, pts: 0, tries });

function applyProgress(from, m) {
  if (!versus || versus.kind !== "battle") return;
  const o = versus.opps.find((x) => x.id === from);
  const i = +m.idx;
  if (!o || !(i >= 0 && i < versus.ids.length)) return;
  o.live[i] = { attempts: +m.attempts || 0 };
  if (m.done) o.results[i] = cleanResults([m])[0];
  vsRefresh(true);
}

function applyRematch(from) {
  if (!versus || versus.kind !== "battle") return;
  const o = versus.opps.find((x) => x.id === from);
  if (!o || o.rematch) return;
  o.rematch = true;
  if (!versus.rematchMe) toast(`${o.name} visszavágót kér!`);
  vsRefresh();
}

// Visszavágó csak akkor indul, ha mindenki kérte; addig az eredményablak marad.
export function vsRematch() {
  if (!versus || versus.rematchMe) return;
  versus.rematchMe = true;
  sendOut({ type: "rematch" });
  hostMaybeRematch();
  renderVsResult();
}

export function vsSendProgress() {
  if (!versus || versus.kind !== "battle") return;
  const r = versus.results[versus.idx];
  sendOut({ type: "progress", idx: versus.idx, attempts: round.attempts.length, done: !!r, won: r && r.won, pts: r ? r.pts : 0, tries: r ? r.tries : 0 });
  saveBattle();
}

// Valakinek változott az állása: sáv, sor, eredmény frissítése; ha rá vártunk, jöhet a következő dal.
function vsRefresh(animate) {
  if (!versus) return;
  renderVsBar();
  renderStreak();
  if (round && round.done) {
    updateNextButton();
    if (vsOver()) renderVsSummary(!!animate);
  }
  if (vr.dialog.open) renderVsResult();
  if (versus.waiting && !vsWaitingFor().length) {
    versus.waiting = false;
    vsNext();
  }
  saveBattle();
}

// Újratöltés után a félbehagyott párbaj folytatódik (ugyanazzal a kóddal és játékos-azonosítóval).
export function resumeBattle() {
  const s = loadBattle();
  if (!s || !Array.isArray(s.ids) || !s.ids.length || typeof s.code !== "string") return false;
  peerHost = !!s.host;
  room = { code: s.code, pid: s.pid };
  startVersus("battle", s.ids.map(decId).filter(Boolean), (s.opps || []).map((o) => ({ ...o, results: cleanResults(o.results) })), s.cat || "", s);
  if (peerHost) {
    battleHost(0, s.code);
    // Akik fél percen belül nem jönnek vissza, kiesnek (különben örökké várnánk rájuk).
    setTimeout(() => {
      if (!versus || versus.kind !== "battle") return;
      versus.opps.forEach((o) => { if (!guests.has(o.id)) o.gone = true; });
      broadcastSync();
      vsRefresh();
    }, 30000);
  } else battleJoin({ code: s.code, pid: s.pid, key: s.key });
  return true;
}

// Más modulból csak ezeken keresztül írható (az importált változó csak olvasható).
export function setRoom(v) { return (room = v); }

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  battleCatBtn.addEventListener("click", () => openCatSheet({
    current: battleCatId(),
    title: "Mit játszotok?",
    withHard: false,
    onPick: (id) => { save("battleCat", id); renderBattleSettings(); broadcastLobby(); },
  }));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    peerResume();
    // Visszatéréskor a vendég azonnal újracsatlakozik a szobához, ha közben megszakadt.
    if (room && !peerHost && !hostConn && !room.closed && room.connect) room.connect();
  });
  window.addEventListener("online", peerResume);

  // Életjel mindkét irányba; a néma kapcsolatot bontjuk.
  setInterval(() => {
    if (!peer) return;
    const now = Date.now();
    if (peerHost) {
      for (const g of [...guests.values()]) {
        send(g.conn, { type: "ping" });
        if (now - g.seen > PEER_TIMEOUT_MS) hostDrop(g.conn);
      }
    } else if (hostConn && hostConn.open) {
      send(hostConn, { type: "ping" });
      if (now - hostSeen > PEER_TIMEOUT_MS) {
        try { hostConn.close(); } catch { /* már zárva */ }
        guestLost();
      }
    }
  }, PING_MS);

  $("battleHostBtn").addEventListener("click", () => battleHost());
  $("battleJoinBtn").addEventListener("click", () => battleJoin());
  bt.go.addEventListener("click", hostStartMatch);
  bt.code.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); battleJoin(); } });
  $("battleShareBtn").addEventListener("click", () => shareText(`Songdle HU ⚔️ Párbaj! Gyere, játsszunk: kód ${room ? room.code : ""}\n${battleLink(room ? room.code : "")}`));
  bt.dialog.addEventListener("close", () => {
    saveNick();
    // Ha meccs nélkül zárta be, a szobából is kilépünk.
    if (bt.dialog.returnValue !== "started" && !(versus && versus.kind === "battle")) {
      sendOut({ type: "bye" });
      peerClose();
      room = null;
    }
  });
}
