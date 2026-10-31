import { $ } from "./core.js?v=61";
import { confetti } from "./render.js?v=61";
import { stream, sdStatus, openStreamSetup, startStream, leaveStream, streamChat } from "./stream.js?v=61";
import { mvpList } from "./guesswindow.js?v=61";
import { countEvent } from "./analytics.js?v=61";

// ----- Eredmény -----
export const sr = {
  dialog: $("streamResultDialog"), verdict: $("srVerdict"), score: $("srScore"), mvp: $("srMvp"), calls: $("srCalls"),
};
export function openStreamResult() {
  if (document.querySelector("dialog[open]")) return;
  const win = stream.me > stream.chat ? "me" : stream.chat > stream.me ? "chat" : null;
  sr.verdict.textContent = win === "me" ? "🏆 A streamer nyert!" : win === "chat" ? "🏆 A chat nyert!" : "🤝 Döntetlen";
  sr.verdict.classList.toggle("win", !!win);
  sr.score.textContent = `🎬 Streamer ${stream.me} – ${stream.chat} Chat 💬`;
  sr.mvp.innerHTML = "";
  const list = mvpList().slice(0, 5);
  list.forEach((p, i) => {
    const li = document.createElement("li");
    const place = document.createElement("span");
    place.className = "place";
    place.textContent = i === 0 ? "🏅" : `${i + 1}.`;
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = `${p.name} · ${p.hits} találat`;
    const sc = document.createElement("b");
    sc.textContent = p.pts;
    li.append(place, nm, sc);
    sr.mvp.appendChild(li);
  });
  if (!list.length) {
    const li = document.createElement("li");
    li.textContent = "Ebben a meccsben senki sem találta el a dalt a chatből.";
    sr.mvp.appendChild(li);
  }
  // Ki volt a leggyakrabban elsőként helyes („called it”).
  const calls = new Map();
  for (const n of stream.calls) calls.set(n, (calls.get(n) || 0) + 1);
  const best = [...calls].sort((a, b) => b[1] - a[1]).slice(0, 3);
  sr.calls.textContent = best.length ? "🎯 Elsőként találta el: " + best.map(([n, k]) => `${n} ×${k}`).join(", ") : "";
  sr.dialog.showModal();
  if (win) setTimeout(confetti, 300);
  countEvent(`stream-done-${win || "draw"}`);
}

// ----- Twitch chat (névtelen olvasás, bejelentkezés nélkül) -----
// state: "connecting" | "ok" (a Twitch visszaigazolta a csatornát) | "down" (nincs kapcsolat) | "missing" (nincs ilyen csatorna)
export let tw = null; // { channel, ws, state, retry, timer, joinTimer, waiters }
export const TW_JOIN_MS = 7000;
export function twConnect(channel) {
  twClose();
  tw = { channel, ws: null, state: "connecting", retry: 0, timer: 0, joinTimer: 0, waiters: [] };
  twOpen(tw);
  renderTwConn();
}
function twSetState(me, state) {
  me.state = state;
  if (state !== "connecting") {
    for (const w of me.waiters.splice(0)) w(state);
  }
  renderTwConn();
}
// Megvárja, hogy kiderüljön, él-e a kapcsolat (vagy hogy nincs ilyen csatorna).
export function twWait(me, ms) {
  if (me.state === "ok" || me.state === "missing") return Promise.resolve(me.state);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(me.state === "connecting" ? "down" : me.state), ms);
    me.waiters.push((state) => { clearTimeout(t); resolve(state); });
  });
}
function twOpen(me) {
  let ws;
  try { ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443"); } catch { return twRetry(me); }
  me.ws = ws;
  ws.onopen = () => {
    // A twitch.tv/commands miatt létező csatornánál ROOMSTATE jön; ha nem jön, nincs ilyen csatorna.
    ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    ws.send("PASS SCHMOOPIIE");
    ws.send("NICK justinfan" + (10000 + Math.floor(Math.random() * 80000)));
    ws.send("JOIN #" + me.channel);
    clearTimeout(me.joinTimer);
    me.joinTimer = setTimeout(() => {
      if (tw !== me || me.state === "ok") return;
      // Egyszer már megvolt a csatorna: csak lassú az újracsatlakozás, újrapróbáljuk.
      if (me.seen) ws.close();
      else { twSetState(me, "missing"); twStop(me); }
    }, TW_JOIN_MS);
  };
  ws.onmessage = (e) => {
    if (tw !== me) return;
    for (const line of String(e.data).split("\r\n")) if (line) twLine(me, line);
  };
  ws.onclose = () => {
    if (tw !== me || me.state === "missing") return;
    clearTimeout(me.joinTimer);
    twSetState(me, "down");
    twRetry(me);
  };
}
function twRetry(me) {
  clearTimeout(me.timer);
  me.timer = setTimeout(() => { if (tw === me) twOpen(me); }, Math.min(30000, 2000 * 2 ** me.retry++));
}
function twLine(me, line) {
  if (line.startsWith("PING")) return me.ws.send("PONG" + line.slice(4));
  const tags = {};
  let rest = line;
  if (rest[0] === "@") {
    const i = rest.indexOf(" ");
    for (const kv of rest.slice(1, i).split(";")) {
      const j = kv.indexOf("=");
      tags[kv.slice(0, j)] = kv.slice(j + 1);
    }
    rest = rest.slice(i + 1);
  }
  const m = rest.match(/^:([^! ]+)\S* ([A-Z0-9]+) ?(.*)$/);
  if (!m) return;
  const [, prefix, cmd, params] = m;
  if (cmd === "ROOMSTATE") {
    clearTimeout(me.joinTimer);
    me.retry = 0;
    me.seen = true;
    if (me.state !== "ok") twSetState(me, "ok");
  } else if (cmd === "NOTICE" && /suspended|banned/.test(tags["msg-id"] || "")) {
    twSetState(me, "missing");
    twStop(me);
  } else if (cmd === "RECONNECT") {
    me.ws.close();
  } else if (cmd === "PRIVMSG") {
    const i = params.indexOf(" :");
    if (i < 0) return;
    const text = params.slice(i + 2);
    if (text.startsWith("\u0001")) return; // /me üzenet
    const login = prefix.toLowerCase();
    // IRC-címke kódolása: \s szóköz, \: pontosvessző, \\ visszaper, \r \n sortörés (itt szóköz).
    const unescape = (v) => v.replace(/\\(.?)/g, (_, c) => ({ s: " ", ":": ";", "\\": "\\", r: " ", n: " " })[c] ?? c);
    const name = unescape(tags["display-name"] || "").trim() || login;
    streamChat({ id: tags["user-id"] || login, login, name }, text);
  }
}
function twStop(me) {
  clearTimeout(me.timer);
  clearTimeout(me.joinTimer);
  try { if (me.ws) me.ws.close(); } catch { /* már zárva */ }
}
export function twClose() {
  if (!tw) return;
  const me = tw;
  tw = null;
  twStop(me);
  for (const w of me.waiters.splice(0)) w("down");
}
export function renderTwConn() {
  const c = $("twConn");
  if (!c || !tw) return;
  c.textContent = tw.state === "ok" ? `🟢 #${tw.channel}` : tw.state === "connecting" ? "🟠 Csatlakozás a chathez…"
    : tw.state === "missing" ? `🔴 Nincs ilyen csatorna: #${tw.channel}` : "🔴 A chat nem elérhető – újracsatlakozás…";
  c.classList.toggle("down", tw.state === "down" || tw.state === "missing");
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  $("srAgainBtn").addEventListener("click", () => {
    sr.dialog.close();
    const channel = stream.channel;
    if (tw && tw.channel === channel && tw.state === "ok") return startStream(channel);
    // Megszakadt a chat: csak újra-csatlakozás (és visszaigazolás) után indulhat a meccs.
    leaveStream();
    openStreamSetup();
    sdStatus("🔴 Megszakadt a kapcsolat a chattel – nyomd meg az Indítást az újracsatlakozáshoz.", true);
  });
  $("srLeaveBtn").addEventListener("click", () => { sr.dialog.close(); leaveStream(); });
}
