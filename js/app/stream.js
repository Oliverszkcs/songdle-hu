import { MAX_TRIES, POINTS, $, el, load, save, norm, artistLine, trackLabel, retrigger, toast } from "./core.js?v=62";
import { allCats, catLabel } from "./pool.js?v=62";
import { mode, pool, round, setStatus, setMode } from "./state.js?v=62";
import {
  renderMode, updateNextButton, renderCategories, fillCatPill, openCatSheet, enterMode,
} from "./modes.js?v=62";
import { startRound, currentLength, emojiRow, setDeezerLink, revealAlbum, hideAlbum } from "./round.js?v=62";
import { BONUS_PTS, shuffle, makeBonus, showDone } from "./bonus.js?v=62";
import { renderAll, buildWave, renderRoundPoints, updateSubmit, confetti } from "./render.js?v=62";
import { stopAudio } from "./audio.js?v=62";
import { search, judge, copyText } from "./autocomplete.js?v=62";
import { pickSet, closeVersus } from "./versus.js?v=62";
import { BATTLE_LENGTHS } from "./peer.js?v=62";
import { gw, closeGuessWindow, renderGuessWindow, renderStreamMvp } from "./guesswindow.js?v=62";
import { sr, openStreamResult, tw, TW_JOIN_MS, twConnect, twWait, twClose } from "./twitch.js?v=62";
import { countEvent } from "./analytics.js?v=62";
import { renderReportBtn } from "./report.js?v=62";

// ---------- Streamer vs Chat (Twitch) ----------
// A streamer és a chat (egy játékosként) ugyanazt a dalt játssza, közös részlethosszal.
// Körönként a streamer rejtve lezárja a tippjét, utána a chat 20–30 másodpercig szavaz
// (!tipp dalcím / !skip); a legtöbb szavazatot kapott tipp a chaté. A pont a tippek számától
// függ, mint a játékban. Bárki szavazhat a chatből, nézőnként egy szavazat (az utolsó számít).
const STREAM_WINDOWS = [20, 25, 30];
// Tippelés módja: „type” = beírós (a streamer külön tipp-ablakban ír, javaslatokkal),
// „choice” = választós (6 lehetőség, a streamer a számbillentyűvel választ, a chat a számot írja).
const STREAM_STYLES = ["type", "choice"];
const CHOICE_N = 6;
const STREAM_BOTS = new Set(["nightbot", "streamelements", "moobot", "fossabot", "streamlabs", "wizebot", "sery_bot", "soundalerts", "botrixoficial", "kofistreambot"]);
// { channel, cat, catLabel, len, win, ids, idx, me, chat, cur, mvp: Map(néző → { name, pts, hits }), calls: [név], timer }
// cur (az aktuális dal): { stage, heard, phase: "play" | "vote" | "bonus" | "bvote" | "done", pending,
//   me / chat: { attempts, done, won }, votes: Map(néző → szavazat), lastTally, calledIt, rewarded, bonus, mePts, chatPts }
export let stream = null;

const sd = {
  dialog: $("streamDialog"), channel: $("streamChannel"), catBtn: $("streamCatBtn"),
  len: $("streamLen"), win: $("streamWin"), style: $("streamStyle"), styleNote: $("streamStyleNote"),
  status: $("streamStatus"), go: $("streamGoBtn"),
};
export const st = {
  me: $("stMe"), chat: $("stChat"), vote: $("stVote"), voteTitle: $("stVoteTitle"), voteHelp: $("stVoteHelp"),
  voteTime: $("stVoteTime"), voteCount: $("stVoteCount"), closeVote: $("stCloseVote"), hint: $("stHint"),
  meList: $("stMeList"), chatList: $("stChatList"), bars: $("stBars"), mvp: $("stMvp"), openVote: $("stOpenVote"),
  popBtn: $("stPopBtn"), choices: $("stChoices"),
};
export const sdStatus = (msg, isError) => {
  sd.status.textContent = msg || "";
  sd.status.classList.toggle("error", !!isError);
};

// ----- Beállítás -----
const streamCatId = () => {
  const id = load("streamCat", "all");
  return allCats.some((c) => c.id === id) ? id : "all";
};
const streamLen = () => (BATTLE_LENGTHS.includes(load("streamLen", 10)) ? load("streamLen", 10) : 10);
const streamWin = () => (STREAM_WINDOWS.includes(load("streamWin", 25)) ? load("streamWin", 25) : 25);
const streamStyle = () => (STREAM_STYLES.includes(load("streamStyle", "type")) ? load("streamStyle", "type") : "type");

function settingChips(box, list, current, label, key) {
  box.innerHTML = "";
  for (const n of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = label(n);
    b.setAttribute("aria-pressed", String(n === current));
    b.addEventListener("click", () => { save(key, n); renderStreamSetup(); });
    box.appendChild(b);
  }
}
function renderStreamSetup() {
  const c = fillCatPill(sd.catBtn, streamCatId(), "Mit játszunk?");
  sd.catBtn.setAttribute("aria-label", `Mit játszunk: ${c.label}. Váltás`);
  settingChips(sd.len, BATTLE_LENGTHS, streamLen(), (n) => `${n} dal`, "streamLen");
  settingChips(sd.win, STREAM_WINDOWS, streamWin(), (n) => `${n} mp`, "streamWin");
  settingChips(sd.style, STREAM_STYLES, streamStyle(), (k) => (k === "type" ? "🪟 Beírós" : "🔢 Választós"), "streamStyle");
  sd.styleNote.textContent = streamStyle() === "type"
    ? "Külön tipp-ablakban írod be a címet, javaslatokkal. Azt az ablakot ne mutasd a streamen (OBS: csak a játék ablakát vedd fel)."
    : `${CHOICE_N} lehetőség látszik. Te a számbillentyűvel választasz (nem látszik, melyiket), a chat a számot írja (1–${CHOICE_N}).`;
}
export function openStreamSetup() {
  sd.channel.value = load("streamChannel", "");
  renderStreamSetup();
  resetStreamGo();
  sdStatus("");
  sd.dialog.showModal();
}
// Élő-e most a csatorna (decapi.me, nyilvános). true / false, vagy null, ha nem derül ki.
async function twitchLive(channel) {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(`https://decapi.me/twitch/uptime/${channel}`, { signal: ctrl.signal });
    const text = (await r.text()).toLowerCase();
    if (!r.ok) return null;
    if (text.includes("offline")) return false;
    return /\d+\s*(second|minute|hour|day)/.test(text) ? true : null;
  } catch {
    return null;
  }
}

let sdOffline = ""; // ennek a csatornának már szóltunk, hogy offline: a második kattintás elindítja
function resetStreamGo() {
  sdOffline = "";
  sd.go.disabled = false;
  sd.go.textContent = "Indítás";
}
async function streamGo() {
  if (sd.go.disabled) return;
  // A csatorna neve vagy a teljes link (twitch.tv/nev) is jó.
  const m = sd.channel.value.trim().toLowerCase().match(/^(?:https?:\/\/)?(?:www\.)?(?:twitch\.tv\/)?#?([a-z0-9_]{3,25})\/?$/);
  if (!m) return sdStatus("Add meg a Twitch-csatornád nevét (pl. csatornanev vagy twitch.tv/csatornanev)!", true);
  const channel = m[1];
  save("streamChannel", channel);
  if (sdOffline === channel && tw && tw.channel === channel && tw.state === "ok") return streamLaunch(channel);
  resetStreamGo();
  sd.go.disabled = true;
  sd.go.textContent = "Csatlakozás…";
  sdStatus(`🟠 Csatlakozás a #${channel} chathez…`);
  const live = twitchLive(channel);
  if (!tw || tw.channel !== channel || tw.state !== "ok") twConnect(channel);
  const state = await twWait(tw, TW_JOIN_MS + 4000);
  // Közben bezárta az ablakot vagy másik csatornát írt be.
  if (!sd.dialog.open || !tw || tw.channel !== channel) return;
  resetStreamGo();
  if (state === "missing") {
    twClose();
    return sdStatus(`❌ Nincs ilyen Twitch-csatorna: #${channel}. Ellenőrizd a nevet!`, true);
  }
  if (state !== "ok") {
    twClose();
    return sdStatus("❌ Nem sikerült elérni a Twitch chatet. Ellenőrizd a netet, és próbáld újra!", true);
  }
  if ((await live) === false) {
    if (!sd.dialog.open) return;
    sdOffline = channel;
    sd.go.textContent = "Indítás így is";
    return sdStatus(`🟢 Megvan a #${channel} chat, de a csatorna most nem élő. A chat csak adás közben tud szavazni.`);
  }
  streamLaunch(channel);
}
function streamLaunch(channel) {
  sd.dialog.close();
  startStream(channel);
  toast(`🟢 Csatlakozva a #${channel} chathez!`);
}
// Útmutató: a beállításból és a súgóból is nyílik (a másik ablak fölött).
const guideDialog = $("streamGuideDialog");
// Adatvédelem: a súgóból és a párbajból is nyílik (a másik ablak fölött).
const privacyDialog = $("privacyDialog");

export function startStream(channel) {
  if (mode === "versus") closeVersus();
  if (stream) clearInterval(stream.timer);
  const cat = streamCatId();
  stream = {
    channel, cat, catLabel: cat === "all" ? "" : catLabel(cat), len: streamLen(), win: streamWin(), style: streamStyle(),
    ids: null, idx: 0, me: 0, chat: 0, cur: null, mvp: new Map(), calls: [], timer: 0,
  };
  if (!tw || tw.channel !== channel) twConnect(channel);
  document.body.dataset.streamStyle = stream.style;
  if (stream.style !== "type") closeGuessWindow();
  setMode("stream");
  renderMode();
  renderCategories();
  enterMode();
  countEvent("stream-start");
}

export function leaveStream() {
  closeStream();
  setMode(load("mode", "endless"));
  renderMode();
  renderCategories();
  enterMode();
}
export function closeStream() {
  if (stream) clearInterval(stream.timer);
  if (sr.dialog.open) sr.dialog.close();
  twClose();
  closeGuessWindow();
  delete document.body.dataset.streamStyle;
  stream = null;
}

// ----- Dalok -----
export function streamStartSong() {
  if (!stream.ids) {
    stream.ids = pickSet(pool, stream.len);
    // Kis kategóriában kevesebb dal is lehet.
    if (stream.ids.length < stream.len) { stream.len = stream.ids.length; renderMode(); }
  }
  const t = pool.find((p) => p.id === stream.ids[stream.idx]);
  if (!t) return setStatus("Ebben a kategóriában most nincs elég dal. Válassz másikat!", true);
  const side = () => ({ attempts: [], done: false, won: false });
  stream.cur = {
    stage: 0, heard: -1, phase: "play", pending: null, me: side(), chat: side(),
    votes: new Map(), lastTally: null, calledIt: null, rewarded: new Set(), bonus: null, mePts: 0, chatPts: 0,
    options: stream.style === "choice" ? makeChoices(t) : null, marks: [],
  };
  renderStream();
  startRound(t);
}

export function streamSongReady() {
  streamControls();
  renderStream();
  setStatus(stream.style === "choice"
    ? `Játszd le a részletet, aztán nyomd meg a számot (1–${CHOICE_N}), vagy hagyd ki!`
    : "Játszd le a részletet, aztán zárd le a tipped (vagy hagyd ki)!");
}

// Választós mód: a jó dal mellé legfeljebb 2 dal ugyanattól az előadótól (hogy ne legyen túl könnyű),
// a többi más előadóktól. Minden cím különböző, a sorrend véletlen.
function makeChoices(t) {
  const who = (p) => norm(p.src || p.artist);
  const titles = new Set([t.base]);
  const pick = (list, n) => {
    const out = [];
    for (const p of shuffle(list.slice())) {
      if (out.length >= n) break;
      if (titles.has(p.base)) continue;
      titles.add(p.base);
      out.push(p);
    }
    return out;
  };
  const same = pick(pool.filter((p) => p !== t && who(p) === who(t)), 2);
  const rest = pick(pool.filter((p) => who(p) !== who(t)), CHOICE_N - 1 - same.length);
  return shuffle([t, ...same, ...rest]);
}

// A streamer választása: a gomb nem jelöli meg, melyiket nyomta (a chat nem láthatja).
function streamPickChoice(i) {
  const c = stream && stream.cur;
  if (!c || !c.options || !c.options[i] || c.phase !== "play" || c.me.done || c.pending || round.done) return;
  const o = c.options[i];
  streamLock({ type: judge(o, round.track), label: `${i + 1}. ${trackLabel(o)}`, key: o.key, opt: i });
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

// A beviteli mező és a gombok állapota: tippelni csak a részlet meghallgatása után lehet.
export function streamControls() {
  if (!stream || !stream.cur || !round || round.mode !== "stream") return;
  const c = stream.cur;
  const canLock = c.phase === "play" && !c.me.done && !c.pending && !round.done;
  const heard = c.heard === c.stage;
  el.controls.hidden = c.me.done || round.done;
  el.input.disabled = !canLock;
  el.skipBtn.disabled = !canLock || !heard;
  el.playBtn.disabled = false;
  updateSubmit();
  st.openVote.hidden = !(c.phase === "play" && c.me.done && !c.chat.done && !round.done);
  st.openVote.disabled = !heard;
  renderGuessWindow();
}

// A streamer tippje rejtve lezárul; ezután a chat szavaz (ha még játszik).
export function streamLock(attempt) {
  const c = stream.cur;
  if (c.phase !== "play" || c.me.done || c.pending) return;
  if (c.heard !== c.stage) {
    retrigger(el.input, "shake");
    return setStatus("Előbb játszd le a részletet, hogy a chat is hallja!", true);
  }
  c.pending = attempt;
  el.input.blur();
  if (c.chat.done) return resolveStage(null);
  openVote("song");
}

// ----- Szavazás -----
function openVote(kind) {
  const c = stream.cur;
  c.phase = kind === "song" ? "vote" : "bvote";
  c.votes = new Map();
  c.voteEnd = Date.now() + stream.win * 1000;
  clearInterval(stream.timer);
  stream.timer = setInterval(voteTick, 250);
  streamControls();
  renderStream();
  voteTick();
  setStatus(kind === "song" ? "🔒 Lezártad a tipped. Most a chat szavaz!" : "🔒 Lezártad. Most a chat válaszol!");
}
function voteTick() {
  const c = stream && stream.cur;
  if (!c || (c.phase !== "vote" && c.phase !== "bvote")) return;
  const left = Math.max(0, Math.ceil((c.voteEnd - Date.now()) / 1000));
  st.voteTime.textContent = left;
  st.voteCount.textContent = `${c.votes.size} szavazat`;
  if (left <= 0) closeVote();
}
function closeVote() {
  const c = stream.cur;
  clearInterval(stream.timer);
  if (c.phase === "vote") resolveStage(tallyVotes((v) => (v.skip ? "skip" : v.track.key)));
  else if (c.phase === "bvote") resolveBonus(tallyVotes((v) => v.opt));
}

// Szavazatok csoportosítva, a legtöbbtől; egyenlőségnél az nyer, akire előbb szavaztak.
function tallyVotes(keyOf) {
  const groups = new Map();
  for (const [uid, v] of stream.cur.votes) {
    const k = keyOf(v);
    if (!groups.has(k)) groups.set(k, { k, v, n: 0, first: v.ts, users: [] });
    const g = groups.get(k);
    g.n++;
    g.first = Math.min(g.first, v.ts);
    g.users.push(uid);
  }
  return { list: [...groups.values()].sort((a, b) => b.n - a.n || a.first - b.first), total: stream.cur.votes.size };
}

// Egy chatüzenet: szavazat a dalra (!tipp …, röviden !t; !skip) vagy a bónuszkérdésre (1–4).
export function streamChat(user, text) {
  const c = stream && stream.cur;
  if (!c || STREAM_BOTS.has(user.login) || user.login === stream.channel) return;
  const msg = text.trim();
  let vote = null, m;
  if (c.phase === "vote") {
    if (/^!(skip|kihagy|passz)\b/i.test(msg)) vote = { skip: true };
    else if (c.options) {
      // Választós: a szám (3, !3, !tipp 3), vagy a lehetőségek egyikének címe.
      let i = -1;
      if ((m = msg.match(/^!?(?:(?:t|tipp|g|guess)\s*)?([1-9])$/i))) i = +m[1] - 1;
      else if ((m = msg.match(/^!(?:t|tipp|g|guess)\s+(.{1,100})$/i))) {
        const t = chatMatch(m[1]);
        i = t ? c.options.indexOf(t) : -1;
      }
      if (!c.options[i]) return;
      vote = { track: c.options[i] };
      if (!c.calledIt && judge(vote.track, round.track) === "right") c.calledIt = user.name;
    } else if ((m = msg.match(/^!(?:t|tipp|g|guess)\s+(.{1,100})$/i))) {
      const t = chatMatch(m[1]);
      if (!t) return;
      vote = { track: t };
      // Az első néző, aki eltalálta (akkor is, ha a többség mást választott).
      if (!c.calledIt && judge(t, round.track) === "right") c.calledIt = user.name;
    } else return;
  } else if (c.phase === "bvote") {
    if (!(m = msg.match(/^!?([1-4])$/))) return;
    vote = { opt: +m[1] - 1 };
  } else return;
  vote.ts = Date.now();
  vote.name = user.name;
  c.votes.set(user.id, vote);
  voteTick();
}

// A chat szövege a dallistában: a játék keresője, elírásnál a címhez legközelebbi dal.
export function chatMatch(text) {
  const q = norm(text);
  // Csak írásjelből álló cím (pl. „?”): csak a pontosan így írt tipp illik rá, a „??” vagy a „...” nem.
  if (!q) return pool.find((t) => t.title === text.trim()) || null;
  const hits = search(text, true);
  // A pontosan így hívott dal előnyt kap („Képzeld el” ne a „Képzeld el és megkapod!” legyen).
  const isExact = (t) => t.nTitle === q || norm(t.base) === q;
  const exact = hits.find(isExact) || pool.find(isExact);
  if (exact || hits[0]) return exact || hits[0];
  if (q.length < 4) return null;
  let best = null, bestD = Math.floor(q.length / 6) + 2;
  for (const t of pool) {
    if (Math.abs(t.nTitle.length - q.length) >= bestD) continue;
    const d = editDistance(q, t.nTitle, bestD);
    if (d < bestD) { best = t; bestD = d; }
  }
  return best;
}
function editDistance(a, b, cap) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin >= cap) return cap;
    prev = cur;
  }
  return prev[b.length];
}

// ----- Kör vége: mindkét fél tippje kiderül -----
const sideDone = (s, a) => {
  if (a.type === "right") { s.done = true; s.won = true; } else if (s.attempts.length >= MAX_TRIES) s.done = true;
};
function resolveStage(tally) {
  const c = stream.cur, ans = round.track;
  // Választósnál a rossz tippek a lehetőségeken is látszanak (a jót csak a dal végén mutatjuk).
  const mark = (a, side) => { if (a.opt !== undefined && a.type !== "right") c.marks.push({ i: a.opt, side }); };
  if (c.pending && !c.me.done) {
    c.me.attempts.push(c.pending);
    sideDone(c.me, c.pending);
    mark(c.pending, "me");
  }
  c.pending = null;
  if (tally) {
    const top = tally.list[0];
    const opt = top && top.v.track && c.options ? c.options.indexOf(top.v.track) : -1;
    const a = !top || top.k === "skip" ? { type: "skip" }
      : { type: judge(top.v.track, ans), label: (opt >= 0 ? `${opt + 1}. ` : "") + trackLabel(top.v.track), key: top.v.track.key };
    if (opt >= 0) a.opt = opt;
    mark(a, "chat");
    a.share = top ? Math.round((top.n / tally.total) * 100) : 0;
    a.votes = tally.total;
    c.chat.attempts.push(a);
    sideDone(c.chat, a);
    c.lastTally = { stage: c.stage, ...tally };
    // MVP: aki a helyes dalra szavazott, dalonként egyszer megkapja a kör pontját (korábban több).
    for (const g of tally.list) {
      if (!g.v.track || judge(g.v.track, ans) !== "right") continue;
      for (const uid of g.users) {
        if (c.rewarded.has(uid)) continue;
        c.rewarded.add(uid);
        const p = stream.mvp.get(uid) || { name: c.votes.get(uid).name, pts: 0, hits: 0 };
        p.pts += POINTS[c.stage];
        p.hits++;
        stream.mvp.set(uid, p);
      }
    }
  }
  if (c.me.done && c.chat.done) return streamEndSong();
  c.stage++;
  c.phase = "play";
  stopAudio();
  renderAll(true);
  retrigger(el.clipLen, "bump");
  el.playBtn.classList.add("pulse");
  streamControls();
  renderStream();
  setStatus(`Most már ${currentLength()} mp-et hallhattok. Játszd le újra!`);
}

async function streamEndSong() {
  const c = stream.cur, r = round;
  c.phase = "bonus";
  r.done = true;
  r.won = c.me.won;
  const pts = (s) => (s.won ? POINTS[s.attempts.length - 1] : 0);
  c.mePts = pts(c.me);
  c.chatPts = pts(c.chat);
  stream.me += c.mePts;
  stream.chat += c.chatPts;
  if (c.calledIt) stream.calls.push(c.calledIt);
  stopAudio();
  buildWave(false);
  renderAll(true);
  showDone(true);
  hideAlbum();
  renderStreamReveal();
  renderStream();
  streamControls();
  updateNextButton();
  if (c.mePts || c.chatPts) confetti();
  setStatus("Koppints a lemezre a teljes előnézethez.");
  // Bónuszkérdés: a dalt eltaláló fél(ek) +25 pontért; a streamer itt is előbb zár le.
  const b = c.me.won || c.chat.won ? await makeBonus(r) : null;
  if (!stream || stream.cur !== c) return;
  if (!b) return streamDone();
  c.bonus = { ...b, me: null, chat: null, resolved: false };
  if (c.me.won) {
    renderStreamBonus();
    setStatus("🎯 Bónusz: válaszolj, utána a chat jön!");
  } else openVote("bonus");
  renderStreamBonus();
}

function streamPickBonus(i) {
  const c = stream.cur;
  if (!c.bonus || c.bonus.resolved || c.bonus.me !== null || c.phase !== "bonus") return;
  c.bonus.me = i;
  if (c.chat.won) openVote("bonus");
  else resolveBonus(null);
  renderStreamBonus();
}

function resolveBonus(tally) {
  const c = stream.cur, b = c.bonus, right = b.options.indexOf(b.answer);
  if (tally) {
    b.chat = tally.list.length ? tally.list[0].k : null;
    b.tally = tally;
  }
  b.resolved = true;
  if (c.me.won && b.me === right) { c.mePts += BONUS_PTS; stream.me += BONUS_PTS; }
  if (c.chat.won && b.chat === right) { c.chatPts += BONUS_PTS; stream.chat += BONUS_PTS; }
  renderStreamBonus();
  streamDone();
}

function streamDone() {
  const c = stream.cur;
  c.phase = "done";
  clearInterval(stream.timer);
  revealAlbum(round);
  renderStreamReveal();
  renderStream();
  renderRoundPoints();
  streamControls();
  updateNextButton();
  setStatus(stream.idx + 1 < stream.ids.length ? "Jöhet a következő dal!" : "Vége a meccsnek – nézzük az eredményt!");
}

export function streamNext() {
  const c = stream && stream.cur;
  if (!c || c.phase !== "done") return;
  if (stream.idx + 1 >= stream.ids.length) return openStreamResult();
  stream.idx++;
  streamStartSong();
}

// ----- Megjelenítés -----
const sideText = (s, won) => (won ? `${s.attempts.length}. tippre` : "nem találta");
function renderStreamReveal() {
  const c = stream.cur, t = round.track;
  el.revealResult.textContent = `🎬 Streamer: ${sideText(c.me, c.me.won)} · 💬 Chat: ${sideText(c.chat, c.chat.won)}`;
  el.revealResult.classList.toggle("lost", !c.me.won && !c.chat.won);
  el.revealTitle.textContent = t.title;
  el.revealArtist.textContent = artistLine(t);
  setDeezerLink(t);
  el.revealEmoji.textContent = `🎬 ${emojiRow(c.me)}  💬 ${emojiRow(c.chat)}`;
  el.revealPoints.textContent = `🎬 +${c.mePts} · 💬 +${c.chatPts}`;
  el.revealSet.hidden = !c.calledIt;
  el.revealSet.textContent = c.calledIt ? `🎯 Elsőként eltalálta: ${c.calledIt}` : "";
  el.reveal.hidden = false;
  retrigger(el.reveal, "in");
  renderReportBtn();
}

function renderStreamBonus() {
  const c = stream.cur, b = c.bonus;
  if (!b) return;
  el.bonus.hidden = false;
  el.bonus.classList.remove("pending");
  const right = b.options.indexOf(b.answer);
  const q = b.kind === "year" ? "melyik évben jelent meg?" : "melyik albumon van?";
  if (b.resolved) {
    const res = (won, pick) => (!won ? "–" : pick === right ? `✓ +${BONUS_PTS}` : "✗");
    el.bonusQ.textContent = `🎯 Bónusz · 🎬 ${res(c.me.won, b.me)} · 💬 ${res(c.chat.won, b.chat)}`;
  } else {
    el.bonusQ.textContent = `🎯 Bónuszkérdés (+${BONUS_PTS} pont): ${q}`
      + (c.phase === "bonus" && c.me.won && b.me === null ? " – a streamer válaszol" : c.phase === "bvote" ? " – a chat szavaz (1–4)" : "");
  }
  el.bonusOpts.innerHTML = "";
  el.bonusOpts.classList.toggle("albums", b.kind === "album");
  b.options.forEach((o, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = `${i + 1}. ${o}`;
    const open = c.phase === "bonus" && c.me.won && b.me === null;
    btn.disabled = !open;
    if (open) btn.addEventListener("click", () => streamPickBonus(i));
    if (b.resolved) {
      if (i === right) btn.classList.add("right");
      else if (i === b.me || i === b.chat) btn.classList.add("wrong");
      const tags = [b.me === i && "🎬", b.chat === i && "💬"].filter(Boolean).join("");
      if (tags) btn.textContent += " " + tags;
    }
    el.bonusOpts.appendChild(btn);
  });
  renderStream();
}

// A tábla: a két fél tippjei körönként. A helyes tipp a dal végéig rejtve marad.
export function renderStream() {
  if (!stream) return;
  const c = stream.cur;
  st.me.textContent = stream.me;
  st.chat.textContent = stream.chat;
  renderRoundPoints();
  if (!c) return;
  const over = c.phase === "bonus" || c.phase === "bvote" || c.phase === "done";
  const fill = (list, side, isMe) => {
    list.innerHTML = "";
    for (let i = 0; i <= Math.min(c.stage, MAX_TRIES - 1); i++) {
      const a = side.attempts[i];
      if (!a && (side.done || over)) break;
      const li = document.createElement("li");
      const mark = document.createElement("span");
      mark.className = "mark";
      const label = document.createElement("span");
      label.className = "label";
      if (a) {
        li.className = a.type;
        mark.textContent = { right: "✓", wrong: "✗", near: "~", skip: "»" }[a.type];
        if (a.type === "right" && !over) label.textContent = "Megvan! (titok a dal végéig)";
        else if (a.type === "skip") label.textContent = isMe ? "Kihagyva" : a.votes ? `Kihagyás · ${a.share}%` : "Nem szavazott senki";
        else label.textContent = a.label + (isMe ? "" : ` · ${a.share}%`);
      } else {
        li.className = "pending";
        mark.textContent = "…";
        label.textContent = isMe
          ? (c.pending ? "🔒 Lezárva" : "Gondolkodik…")
          : (c.phase === "vote" ? "🗳️ Szavaz…" : "Vár a streamerre…");
      }
      label.title = label.textContent;
      li.append(mark, label);
      list.appendChild(li);
    }
  };
  fill(st.meList, c.me, true);
  fill(st.chatList, c.chat, false);
  // Az előbb végző fél oszlopát üres sorokkal pótoljuk, hogy a körök egy vonalban maradjanak.
  const rows = Math.max(st.meList.children.length, st.chatList.children.length);
  for (const list of [st.meList, st.chatList]) {
    while (list.children.length < rows) {
      const li = document.createElement("li");
      li.className = "blank";
      li.setAttribute("aria-hidden", "true");
      list.appendChild(li);
    }
  }

  // Szavazás közben csak a szavazatok száma látszik, a tippek nem.
  const voting = c.phase === "vote" || c.phase === "bvote";
  st.vote.hidden = !voting;
  if (voting) {
    st.voteTitle.textContent = c.phase === "vote" ? "💬 Chat, szavazz!" : "💬 Chat, bónusz!";
    st.voteHelp.innerHTML = c.phase === "bvote" ? "Írd a chatbe: <b>1</b>, <b>2</b>, <b>3</b> vagy <b>4</b>"
      : c.options ? `Írd a chatbe a számot: <b>1–${c.options.length}</b> · kihagyás: <b>!skip</b>`
      : "Írd a chatbe: <b>!tipp dalcím</b> · kihagyás: <b>!skip</b>";
  }
  const myTurn = c.phase === "play" && !c.me.done && !c.pending;
  const gwOpen = !!(gw && !gw.win.closed);
  st.hint.hidden = !myTurn;
  st.hint.textContent = c.options ? `🙈 Ne nézd a chatet! Nyomd meg a számot (1–${c.options.length}) a billentyűzeten – nem látszik, melyiket választottad.`
    : gwOpen ? "🙈 Ne nézd a chatet! Tippelj a tipp-ablakban – azt ne mutasd a streamen."
    : "🙈 Ne nézd a chatet! Nyisd meg a tipp-ablakot (javaslatokkal), vagy írd be lent – a cím rejtve marad.";
  st.popBtn.hidden = stream.style !== "type" || !round || round.done;
  st.popBtn.textContent = gwOpen ? "🪟 Tipp-ablak nyitva – előtérbe hozás" : "🪟 Tipp-ablak megnyitása";
  document.body.classList.toggle("gw-open", gwOpen && stream.style === "type");
  renderStreamChoices();
  renderGuessWindow();

  renderStreamBars();
  renderStreamMvp();
}

// Az utolsó szavazás 3 legnépszerűbb tippje. A dal közben a helyes tipp neve rejtve marad.
function renderStreamBars() {
  const c = stream.cur;
  const b = c.bonus;
  const bonusTally = b && b.resolved && b.tally;
  const t = bonusTally || c.lastTally;
  st.bars.hidden = !t || !t.total;
  if (st.bars.hidden) return;
  const over = c.phase === "bonus" || c.phase === "bvote" || c.phase === "done";
  // Választósnál a dal közben nem mutatjuk a szavazás megoszlását: a lehetőségek közül kikövetkeztethető lenne a jó.
  if (c.options && !over && !bonusTally) { st.bars.hidden = true; return; }
  st.bars.innerHTML = "";
  const head = document.createElement("p");
  head.className = "st-bars-head";
  const top = t.list[0];
  head.textContent = bonusTally
    ? `Bónusz szavazás · ${t.total} szavazat`
    : `Chat szavazás (${t.stage + 1}. kör) · ${t.total} szavazat · egyetértés ${Math.round((top.n / t.total) * 100)}%`;
  st.bars.appendChild(head);
  for (const g of t.list.slice(0, 3)) {
    const pct = Math.round((g.n / t.total) * 100);
    const row = document.createElement("div");
    row.className = "st-bar";
    const fillEl = document.createElement("i");
    fillEl.style.width = pct + "%";
    const label = document.createElement("span");
    const opt = c.options && g.v.track ? c.options.indexOf(g.v.track) : -1;
    if (bonusTally) label.textContent = `${g.k + 1}. ${b.options[g.k]}`;
    else if (g.k === "skip") label.textContent = "⏭ Kihagyás";
    else if (opt >= 0 && over) label.textContent = `${opt + 1}. ${trackLabel(g.v.track)}`;
    else if (!over && judge(g.v.track, round.track) === "right") label.textContent = "??? (titok a dal végéig)";
    else label.textContent = trackLabel(g.v.track);
    const n = document.createElement("b");
    n.textContent = `${pct}%`;
    row.append(fillEl, label, n);
    st.bars.appendChild(row);
  }
}

// Választós mód: a lehetőségek. A streamer választása nem látszik; a rossz tippek a kör után,
// a jó válasz a dal végén kerül rájuk.
function renderStreamChoices() {
  const c = stream.cur;
  st.choices.hidden = !c.options;
  if (!c.options) return;
  const over = c.phase === "bonus" || c.phase === "bvote" || c.phase === "done";
  const open = c.phase === "play" && !c.me.done && !c.pending && !!round && !round.done;
  st.choices.innerHTML = "";
  c.options.forEach((o, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "st-choice";
    b.disabled = !open;
    const n = document.createElement("b");
    n.textContent = i + 1;
    const label = document.createElement("span");
    label.textContent = trackLabel(o);
    label.title = label.textContent;
    const tags = document.createElement("small");
    tags.textContent = c.marks.filter((m) => m.i === i).map((m) => (m.side === "me" ? "🎬✗" : "💬✗")).join(" ");
    b.append(n, label, tags);
    if (over && round && judge(o, round.track) === "right") b.classList.add("right");
    else if (c.marks.some((m) => m.i === i)) b.classList.add("wrong");
    b.addEventListener("click", () => streamPickChoice(i));
    st.choices.appendChild(b);
  });
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  sd.catBtn.addEventListener("click", () => openCatSheet({
    current: streamCatId(),
    title: "Mit játszunk?",
    withHard: false,
    onPick: (id) => { save("streamCat", id); renderStreamSetup(); },
  }));
  sd.go.addEventListener("click", streamGo);
  sd.channel.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); streamGo(); } });
  sd.channel.addEventListener("input", () => { if (!sd.go.disabled) { resetStreamGo(); sdStatus(""); } });
  for (const b of document.querySelectorAll("[data-stream-guide]")) {
    b.addEventListener("click", () => {
      guideDialog.showModal();
      guideDialog.querySelector("form").scrollTop = 0;
      countEvent("stream-guide");
    });
  }
  for (const b of document.querySelectorAll("[data-privacy]")) {
    b.addEventListener("click", () => {
      privacyDialog.showModal();
      privacyDialog.querySelector("form").scrollTop = 0;
    });
  }
  $("streamCopyRules").addEventListener("click", async () => {
    const text = "🎵 Songdle – a chat a streamer ellen játszik! Szavazáskor írd: !tipp dalcím (választósnál csak a számot: 1–6), kihagyás: !skip, "
      + "bónusznál: 1, 2, 3 vagy 4. A legtöbb szavazatot kapott tipp a chaté. Aki a jó dalra szavaz, MVP-pontot kap! songdle.hu";
    toast(await copyText(text) ? "Másolva – illeszd be a chatbe! 📋" : "Nem sikerült másolni.");
  });

  // Mégse: ha nem indult meccs, a félbehagyott chatkapcsolatot is bontjuk.
  // (A close esemény később fut le: ha közben újra megnyitották, már nem bontunk.)
  sd.dialog.addEventListener("close", () => {
    if (sd.dialog.open) return;
    if (!stream) twClose();
    resetStreamGo();
  });

  // Számbillentyűk: választós módban a lehetőség, a bónusznál a válasz.
  document.addEventListener("keydown", (e) => {
    if (mode !== "stream" || !stream || !stream.cur || document.querySelector("dialog[open]")) return;
    if (e.target === el.input || e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const c = stream.cur, i = +e.key - 1;
    if (c.phase === "bonus" && c.bonus && i < c.bonus.options.length) { e.preventDefault(); streamPickBonus(i); }
    else if (c.phase === "play" && c.options && i < c.options.length) { e.preventDefault(); streamPickChoice(i); }
  });
  st.openVote.addEventListener("click", () => {
    const c = stream && stream.cur;
    if (c && c.phase === "play" && c.me.done && !c.chat.done && c.heard === c.stage) openVote("song");
  });
  st.closeVote.addEventListener("click", () => { if (stream && stream.cur) closeVote(); });
}
