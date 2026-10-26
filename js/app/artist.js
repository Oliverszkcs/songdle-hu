import {
  CFG, $, el, load, save, norm, dateKey, shiftDate, msToNextDay, prettyDate, hashString, toast,
} from "./core.js?v=59";
import { excludeRe, withRetry, isLive, configBlocked } from "./pool.js?v=59";
import { points, vibrate, setPoints } from "./state.js?v=59";
import { updateDailyBadge } from "./modes.js?v=59";
import { renderRoundPoints, animatePoints, confetti } from "./render.js?v=59";
import { actx, gainNode, ensureAudioGraph, libAudio, stopAudio, applyVolume } from "./audio.js?v=59";
import { highlighted, comboSync } from "./autocomplete.js?v=59";
import { homeUrl, shareText } from "./controls.js?v=59";
import { countEvent } from "./analytics.js?v=59";
import { libSrcNode, libStop, setLibSrcNode } from "./library.js?v=59";

// ---------- Napi előadó ----------
// Találós a Napi módban: minden tippnél megmutatjuk, mennyire hasonlít a tippelt
// előadó a mai megfejtésre (zöld: egyezik, sárga: részben/közel, nyíl: merre).
const AD_INFO = CFG.ARTIST_INFO || {};
const adArtists = CFG.ARTISTS.filter((a) => a.id && AD_INFO[a.name]).map((a) => ({
  ...a, ...AD_INFO[a.name], n: norm([a.name, ...(a.aka || [])].join(" ")), genres: a.tags.filter((t) => t !== "all"),
}));
const AD_TYPE = { solo: "Szóló", duo: "Duó", band: "Zenekar" };
const AD_GENDER = { m: "Férfi", f: "Nő", mixed: "Vegyes" };
const AD_STATUS = { active: "Aktív", split: "Feloszlott", dead: "Elhunyt" };
const AD_ESC = { esc: "Indult", adal: "A Dal", no: "Nem" };
const AD_HINT_AFTER = 4;
const AD_GIVEUP_AFTER = 5;
const AD_POINTS = (n) => Math.max(20, 150 - (n - 1) * 20);
// Címsúgó: egy ismert dal címe, ennyi pont levonással (legalább AD_MIN_POINTS marad).
const AD_TITLE_COST = 40, AD_MIN_POINTS = 10;
export const adPointsFor = (n, st) => Math.max(AD_MIN_POINTS, AD_POINTS(n) - (st.titleHint ? AD_TITLE_COST : 0));
const tagLabel = (id) => (CFG.CATEGORIES.find((c) => c.id === id) || { label: id }).label;
const ad = {
  input: $("artistInput"), sugg: $("artistSuggestions"), list: $("artistGuesses"), empty: $("artistEmpty"),
  meta: $("artistMeta"), win: $("artistWin"), hint: $("artistHintBtn"), giveUp: $("artistGiveUpBtn"), search: $("artistSearch"), help: $("artistHelp"),
  titleBtn: $("artistTitleBtn"), titleHint: $("artistTitleHint"),
};
export let adStats = load("artistStats", { played: 0, streak: 0, maxStreak: 0, lastWin: null, guesses: 0 });

function adPick(date, avoid) {
  let best = null, bestH = -1;
  for (const a of adArtists) {
    if (avoid && avoid.has(a.id)) continue;
    const h = hashString(`songdle-hu:artist:${date}:${a.id}`);
    if (h > bestH) { bestH = h; best = a; }
  }
  return best;
}
// AD_RULE_FROM-tól az előző AD_NO_REPEAT nap megfejtése nem jöhet újra. A korábbi napok
// megfejtése változatlan, hogy a már lejátszott napok (naptár, statisztika) ne változzanak.
// A szabály kezdete óta napról napra haladunk, és megjegyezzük az eredményt.
const AD_NO_REPEAT = 30, AD_RULE_FROM = "2026-10-25";
const adAnswerCache = new Map();
function adAnswer(date) {
  if (date < AD_RULE_FROM) return adPick(date);
  if (!adAnswerCache.has(date)) {
    const todo = [];
    for (let d = date; d >= AD_RULE_FROM && !adAnswerCache.has(d); d = shiftDate(d, -1)) todo.push(d);
    for (const day of todo.reverse()) {
      const avoid = new Set();
      for (let k = 1; k <= AD_NO_REPEAT; k++) {
        const p = shiftDate(day, -k);
        avoid.add((p < AD_RULE_FROM ? adPick(p) : adAnswerCache.get(p)).id);
      }
      adAnswerCache.set(day, adPick(day, avoid));
    }
  }
  return adAnswerCache.get(date);
}
export const adKey = (date) => `artistdle.${date}`;
export const adState = () => load(adKey(dateKey()), { guesses: [], done: false, points: 0 });
export const adDone = () => adState().done;

// Deezer-adat (kép) előadónként, egy napig tárolva.
const adInfoCache = new Map();
function adFetch(a) {
  if (adInfoCache.has(a.id)) return adInfoCache.get(a.id);
  const key = "artistInfo." + a.id;
  const cached = load(key, null);
  const p = cached && Date.now() - cached.ts < 24 * 3600e3
    ? Promise.resolve(cached)
    : withRetry(() => Deezer.artist(a.id)).then((d) => {
      const v = { ts: Date.now(), pic: d.picture_medium || "" };
      save(key, v);
      return v;
    }).catch(() => ({ pic: "" }));
  adInfoCache.set(a.id, p);
  return p;
}

const fmtFans = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M"
  : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n);

// Egy tipp összevetése a megfejtéssel: [osztály, szöveg] oszloponként.
function adCompare(g, ans, gFans, aFans) {
  const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
  const arrow = (gv, av) => (av > gv ? " ▲" : av < gv ? " ▼" : "");
  const type = g.type === ans.type ? "hit" : g.type !== "solo" && ans.type !== "solo" ? "near" : "miss";
  const gender = g.gender === ans.gender ? "hit" : g.gender === "mixed" || ans.gender === "mixed" ? "near" : "miss";
  // Születési évet csak születési évvel, alakulási évet csak alakulásival vetünk össze:
  // szóló és csapat között az év sosem zöld vagy sárga, csak a nyíl segít.
  const sameKind = (g.type === "solo") === (ans.type === "solo");
  const dy = Math.abs(g.year - ans.year);
  const year = !sameKind ? "miss" : dy === 0 ? "hit" : dy <= 5 ? "near" : "miss";
  const genre = same(g.genres, ans.genres) ? "hit" : g.genres.some((x) => ans.genres.includes(x)) ? "near" : "miss";
  // Spotify havi hallgatók; ha valamelyiknél hiányzik, nincs összevetés.
  const known = gFans > 0 && aFans > 0;
  const ratio = known ? Math.max(gFans, aFans) / Math.min(gFans, aFans) : Infinity;
  const fans = g.id === ans.id ? "hit" : !known ? "miss" : ratio <= 1.15 ? "hit" : ratio <= 2 ? "near" : "miss";
  // Szólónál a születési, duónál és zenekarnál az alakulás éve számít.
  const born = g.type === "solo";
  const yearWord = born ? "született" : "alakult";
  const later = ans.year > g.year;
  const more = aFans > gFans;
  const genreText = g.genres.map(tagLabel).join(", ");
  // Első megjelenés éve: ±3 év közel.
  const dd = Math.abs(g.debut - ans.debut);
  const debut = dd === 0 ? "hit" : dd <= 3 ? "near" : "miss";
  // Státusz: a feloszlott és az elhunyt is „már nem aktív”, ezért egymáshoz közel.
  const status = g.status === ans.status ? "hit" : g.status !== "active" && ans.status !== "active" ? "near" : "miss";
  // Eurovízió: aki csak az A Dalban indult, az közel van egy eurovíziós indulóhoz.
  const gEsc = g.esc || "no", aEsc = ans.esc || "no";
  const esc = gEsc === aEsc ? "hit" : gEsc !== "no" && aEsc !== "no" ? "near" : "miss";
  // Két sor, soronként négy mező (telefonon így elfér).
  return [
    {
      label: "Típus", cls: type, text: AD_TYPE[g.type],
      why: type === "hit" ? `Típus: egyezik – a mai előadó is ${AD_TYPE[g.type].toLowerCase()}.`
        : type === "near" ? `Típus: közel – a mai előadó is csapat (duó vagy zenekar), de nem ${AD_TYPE[g.type].toLowerCase()}.`
        : `Típus: nem egyezik – a mai előadó nem ${AD_TYPE[g.type].toLowerCase()}.`,
    },
    {
      label: "Nem", cls: gender, text: AD_GENDER[g.gender],
      why: gender === "hit" ? `Nem: egyezik (${AD_GENDER[g.gender].toLowerCase()}).`
        : gender === "near" ? "Nem: részben egyezik – az egyikük vegyes (férfi és női tagok is), a másik nem."
        : "Nem: nem egyezik.",
    },
    {
      label: "Műfaj", cls: genre, text: genreText,
      why: genre === "hit" ? "Műfaj: pontosan ugyanazok a műfajok."
        : genre === "near" ? "Műfaj: van közös műfaj, de nem mind egyezik." : "Műfaj: nincs közös műfaj.",
    },
    {
      label: "Státusz", cls: status, text: AD_STATUS[g.status],
      why: status === "hit" ? `Státusz: egyezik (${AD_STATUS[g.status].toLowerCase()}).`
        : status === "near" ? "Státusz: közel – egyikük sem aktív már, de az egyik feloszlott, a másik elhunyt."
        : g.status === "active" ? "Státusz: a mai előadó már nem aktív (feloszlott vagy elhunyt)." : "Státusz: a mai előadó még aktív.",
    },
    {
      label: born ? "Született" : "Alakult", cls: year, text: g.year + (year === "hit" ? "" : arrow(g.year, ans.year)),
      why: `${g.name} ${g.year}-ben ${yearWord}. ` + (!sameKind ? `A mai előadó ${born ? "csapat, ezért ott az alakulás éve számít" : "szólóelőadó, ezért ott a születési év számít"} – ez nem vethető össze, ezért nem lehet zöld vagy sárga. A nyíl azért mutatja, hogy az ő éve ${later ? "későbbi (▲)" : ans.year < g.year ? "korábbi (▼)" : "ugyanez"}.` : year === "hit" ? "Pontosan egyezik a mai előadóval."
        : `A mai előadó ${later ? "később (▲)" : "korábban (▼)"} született vagy alakult` + (year === "near" ? ", legfeljebb 5 év a különbség." : ", több mint 5 év a különbség.")),
    },
    {
      label: "Debüt", cls: debut, text: g.debut + (debut === "hit" ? "" : arrow(g.debut, ans.debut)),
      why: `${g.name} első kiadványa ${g.debut}-ben jelent meg. ` + (debut === "hit" ? "Ugyanabban az évben, mint a mai előadóé."
        : `A mai előadó ${ans.debut > g.debut ? "később (▲)" : "korábban (▼)"} debütált` + (debut === "near" ? ", legfeljebb 3 év a különbség." : ", több mint 3 év a különbség.")),
    },
    {
      label: "Hallgató", cls: fans, text: !gFans ? "–" : fmtFans(gFans) + (fans === "hit" || !known ? "" : arrow(gFans, aFans)),
      why: !known ? "Hallgatók: ennél az előadónál nincs Spotify-adat."
        : `${g.name}: ${gFans.toLocaleString("hu-HU")} havi hallgató a Spotify-on. ` + (fans === "hit" ? "Nagyjából ugyanannyi, mint a mai előadónak."
        : `A mai előadónak ${more ? "több (▲)" : "kevesebb (▼)"} van` + (fans === "near" ? ", de legfeljebb kétszeres a különbség." : ", több mint kétszeres a különbség.")),
    },
    {
      label: "Eurovízió", cls: esc, text: AD_ESC[gEsc],
      why: (gEsc === "esc" ? `${g.name} indult az Eurovíziós Dalfesztiválon. ` : gEsc === "adal" ? `${g.name} versenyzett az A Dalban (magyar eurovíziós válogató), de nem jutott ki. ` : `${g.name} nem indult sem az Eurovízión, sem az A Dalban. `)
        + (esc === "hit" ? "Ebben egyezik a mai előadóval." : esc === "near" ? "A mai előadó is kötődik az Eurovízióhoz, de máshogy." : "A mai előadónál ez másképp van."),
    },
  ];
}

async function adRenderRow(g, ans, animate) {
  const gi = await adFetch(g);
  const li = document.createElement("li");
  li.className = "artist-row" + (g.id === ans.id ? " win" : "");
  const head = document.createElement("div");
  head.className = "artist-name";
  const img = document.createElement("img");
  img.alt = "";
  if (gi.pic) img.src = gi.pic;
  const name = document.createElement("b");
  name.textContent = g.name;
  head.append(img, name);
  const tiles = document.createElement("div");
  tiles.className = "artist-tiles";
  adCompare(g, ans, g.listeners, ans.listeners).forEach((c, i) => {
    // Koppintásra elmagyarázza, mit jelent a mező.
    const t = document.createElement("button");
    t.type = "button";
    t.className = "artist-tile " + c.cls;
    t.setAttribute("aria-label", c.why);
    t.title = c.why;
    const lab = document.createElement("small");
    lab.textContent = c.label;
    const v = document.createElement("span");
    v.textContent = c.text;
    t.append(lab, v);
    t.addEventListener("click", () => toast(c.why));
    if (animate) t.style.animationDelay = i * 0.08 + "s";
    else t.classList.add("still");
    tiles.appendChild(t);
  });
  li.append(head, tiles);
  return li;
}

async function adRender(animateLast) {
  const date = dateKey(), ans = adAnswer(date), st = adState();
  ad.meta.textContent = `${prettyDate(date)} · ${st.guesses.length} tipp`;
  const rows = await Promise.all(st.guesses.map((n, i) => {
    const g = adArtists.find((a) => a.name === n);
    return g ? adRenderRow(g, ans, animateLast && i === st.guesses.length - 1) : null;
  }));
  ad.list.innerHTML = "";
  // A legújabb tipp kerül felülre.
  rows.filter(Boolean).reverse().forEach((r) => ad.list.appendChild(r));
  ad.empty.hidden = st.guesses.length > 0;
  ad.search.hidden = st.done;
  const left = AD_HINT_AFTER - st.guesses.length;
  ad.hint.hidden = st.done;
  ad.hint.disabled = left > 0;
  ad.hint.textContent = left > 0 ? `🎧 Hallgass bele (még ${left} tipp)` : "🎧 Hallgass bele";
  ad.titleBtn.hidden = st.done || !!st.titleHint;
  ad.titleBtn.disabled = left > 0;
  ad.titleBtn.textContent = left > 0 ? "💡 Egy dala" : `💡 Egy dala (−${AD_TITLE_COST} pont)`;
  ad.titleHint.hidden = !st.titleHint;
  if (st.titleHint) {
    ad.titleHint.textContent = "";
    const b = document.createElement("b");
    b.textContent = `„${st.titleHint}”`;
    ad.titleHint.append("💡 Egyik ismert dala: ", b);
  }
  ad.giveUp.hidden = st.done || st.guesses.length < AD_GIVEUP_AFTER;
  adResetGiveUp();
  adRenderWin(st, ans);
}

function adRenderWin(st, ans) {
  ad.win.hidden = !st.done;
  if (!st.done) return;
  ad.win.innerHTML = "";
  const title = document.createElement("p");
  title.className = "artist-win-title";
  title.textContent = st.gaveUp ? `Feladva ${st.guesses.length} tipp után`
    : st.guesses.length === 1 ? "Elsőre! 🤯" : `Eltaláltad ${st.guesses.length} tippből! 🎉`;
  ad.win.classList.toggle("lost", !!st.gaveUp);
  const nameEl = document.createElement("p");
  nameEl.className = "artist-win-name";
  nameEl.textContent = ans.name;
  const pts = document.createElement("p");
  pts.className = "artist-win-points";
  pts.textContent = st.gaveUp ? "0 pont · a sorozat nullázódott" : `+${st.points} pont`;
  const next = document.createElement("p");
  next.className = "artist-win-next";
  const h = Math.floor(msToNextDay() / 3600e3), m = Math.floor(msToNextDay() / 60e3) % 60;
  next.textContent = `Új előadó ${h} óra ${m} perc múlva · sorozat: ${adStats.streak}`;
  const share = document.createElement("button");
  share.className = "btn btn-ghost";
  share.type = "button";
  share.textContent = "Megosztás";
  share.addEventListener("click", adShare);
  ad.win.append(title, nameEl, pts, next, share);
  // Feladás után megmutatjuk a megfejtés mind a 8 adatát.
  if (st.gaveUp) {
    const box = document.createElement("ol");
    box.className = "artist-guesses artist-answer";
    ad.win.insertBefore(box, pts);
    adRenderRow(ans, ans, false).then((li) => box.appendChild(li));
  }
}

async function adShare() {
  const date = dateKey(), ans = adAnswer(date), st = adState();
  const emoji = { hit: "🟩", near: "🟨", miss: "⬛" };
  const lines = [];
  for (const n of st.guesses) {
    const g = adArtists.find((a) => a.name === n);
    if (!g) continue;
    // Két négyes csoport, mint a két csempesor.
    const e = adCompare(g, ans, g.listeners, ans.listeners).map((c) => emoji[c.cls]);
    lines.push(e.slice(0, 4).join("") + " " + e.slice(4).join(""));
  }
  return shareText(`Songdle HU 🎤 Napi előadó · ${prettyDate(date)}\n${st.guesses.length} tipp${st.titleHint ? " · 💡" : ""}${st.gaveUp ? " · feladva 🏳️" : ""}\n${lines.join("\n")}\n${homeUrl()}`);
}

function adGuess(a) {
  const date = dateKey(), ans = adAnswer(date), st = adState();
  if (st.done || st.guesses.includes(a.name)) return;
  st.guesses.push(a.name);
  ad.input.value = "";
  adHideSugg();
  if (a.id === ans.id) {
    st.done = true;
    st.points = adPointsFor(st.guesses.length, st);
    setPoints(points + st.points);
    save("points", points);
    adStats.played++;
    adStats.guesses += st.guesses.length;
    adStats.streak = adStats.lastWin === shiftDate(date, -1) ? adStats.streak + 1 : 1;
    adStats.lastWin = date;
    adStats.maxStreak = Math.max(adStats.maxStreak, adStats.streak);
    save("artistStats", adStats);
    countEvent("artist-won");
    vibrate([30, 40, 30]);
    setTimeout(() => { confetti(); animatePoints(); }, 700);
  } else {
    vibrate(40);
  }
  save(adKey(date), st);
  adRender(true).then(() => { if (st.done) el.scroll.scrollTo({ top: 0, behavior: "smooth" }); });
  updateDailyBadge();
  renderRoundPoints();
}

// Keresés a játékban szereplő előadók között (a már tippelteket kihagyva).
let adItems = [], adActive = -1;
function adRenderSugg() {
  const q = norm(ad.input.value);
  const guessed = new Set(adState().guesses);
  adItems = q ? adArtists.filter((a) => !guessed.has(a.name) && a.n.includes(q))
    .sort((x, y) => x.n.indexOf(q) - y.n.indexOf(q) || x.name.localeCompare(y.name, "hu")).slice(0, 8) : [];
  ad.sugg.innerHTML = "";
  adActive = adItems.length ? 0 : -1;
  adItems.forEach((a, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === adActive));
    if (i === adActive) li.classList.add("active");
    const text = document.createElement("span");
    text.className = "s-text";
    const b = document.createElement("span");
    b.className = "s-title";
    b.appendChild(highlighted(a.name, ad.input.value));
    const sub = document.createElement("span");
    sub.className = "s-artist";
    sub.textContent = a.genres.map(tagLabel).join(", ");
    text.append(b, sub);
    li.appendChild(text);
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", () => adGuess(a));
    ad.sugg.appendChild(li);
  });
  ad.sugg.hidden = !adItems.length;
  comboSync(ad.input, ad.sugg, adActive);
}
function adHideSugg() { ad.sugg.hidden = true; adItems = []; comboSync(ad.input, ad.sugg, -1); }

// Feladás: első koppintásra megerősítést kér, a másodikra felfedi a megfejtést.
let adGiveUpTimer = 0;
function adResetGiveUp() {
  clearTimeout(adGiveUpTimer);
  ad.giveUp.classList.remove("confirm");
  ad.giveUp.textContent = "🏳️ Feladom";
}

// Tipp: a megfejtés legnépszerűbb dalából 10 másodperc.
let adHintTimer = 0;

export function openArtistGame() {
  ad.input.value = "";
  adHideSugg();
  adRender(false);
  // Első tipp előtt nyitva a magyarázat, később csak kérésre.
  ad.help.open = !adState().guesses.length;
  adFetch(adAnswer(dateKey()));
}
// Az oldal elhagyásakor a tipp-lejátszás leáll.
export function adLeave() {
  clearTimeout(adHintTimer);
  libStop();
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  ad.input.addEventListener("input", adRenderSugg);
  ad.input.addEventListener("blur", () => setTimeout(adHideSugg, 150));
  ad.input.addEventListener("keydown", (e) => {
    if (!adItems.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      adActive = (adActive + (e.key === "ArrowDown" ? 1 : -1) + adItems.length) % adItems.length;
      [...ad.sugg.children].forEach((li, i) => {
        li.classList.toggle("active", i === adActive);
        li.setAttribute("aria-selected", String(i === adActive));
      });
      comboSync(ad.input, ad.sugg, adActive);
    } else if (e.key === "Enter" && adActive >= 0) {
      e.preventDefault();
      adGuess(adItems[adActive]);
    }
  });
  ad.giveUp.addEventListener("click", () => {
    if (!ad.giveUp.classList.contains("confirm")) {
      ad.giveUp.classList.add("confirm");
      ad.giveUp.textContent = "Biztos? Koppints újra";
      adGiveUpTimer = setTimeout(adResetGiveUp, 3500);
      return;
    }
    const date = dateKey(), st = adState();
    if (st.done) return;
    st.done = true;
    st.gaveUp = true;
    st.points = 0;
    adStats.played++;
    adStats.guesses += st.guesses.length;
    adStats.streak = 0;
    save("artistStats", adStats);
    save(adKey(date), st);
    countEvent("artist-gaveup");
    vibrate(120);
    adRender(false).then(() => el.scroll.scrollTo({ top: 0, behavior: "smooth" }));
    updateDailyBadge();
    renderRoundPoints();
  });
  ad.hint.addEventListener("click", async () => {
    const ans = adAnswer(dateKey());
    clearTimeout(adHintTimer);
    ad.hint.classList.add("loading");
    try {
      const top = (await withRetry(() => Deezer.artistTop(ans.id, 5)))
        .filter((t) => t.preview && (t.artist.id === ans.id))
        .sort((x, y) => y.rank - x.rank)[0];
      if (!top) throw new Error("Nincs előnézet");
      const full = await Deezer.track(top.id);
      libStop();
      stopAudio();
      ensureAudioGraph();
      if (actx && !libSrcNode) { setLibSrcNode(actx.createMediaElementSource(libAudio)); libSrcNode.connect(gainNode); }
      if (actx && actx.state === "suspended") actx.resume();
      applyVolume();
      libAudio.src = full.preview;
      await libAudio.play();
      adHintTimer = setTimeout(() => libAudio.pause(), 10000);
    } catch (e) {
      console.warn(e);
      toast("A tippet most nem sikerült lejátszani.");
    } finally {
      ad.hint.classList.remove("loading");
    }
  });

  // Címsúgó: a megfejtés legnépszerűbb (saját) dalának címe, pontlevonással.
  ad.titleBtn.addEventListener("click", async () => {
    const date = dateKey(), ans = adAnswer(date), st = adState();
    if (st.done || st.titleHint) return;
    ad.titleBtn.classList.add("loading");
    try {
      const top = (await withRetry(() => Deezer.artistTop(ans.id, 10)))
        .filter((t) => t.artist.id === ans.id && !configBlocked.has(t.id) && !excludeRe.test(t.title) && !isLive(t))
        .sort((x, y) => y.rank - x.rank)[0];
      if (!top) throw new Error("Nincs dal");
      st.titleHint = top.title.replace(/\s*[([].*?[)\]]/g, "").trim() || top.title;
      save(adKey(date), st);
      countEvent("artist-title-hint");
      adRender(false);
      renderRoundPoints();
    } catch (e) {
      console.warn(e);
      toast("A súgót most nem sikerült betölteni.");
    } finally {
      ad.titleBtn.classList.remove("loading");
    }
  });
}
