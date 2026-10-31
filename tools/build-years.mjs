// Megjelenési évek az „Évtized” kategóriákhoz → data/years.json
//
// Használat (a repó gyökeréből):  node tools/build-years.mjs
//
// 1) Minden előadó Deezer top listájához lekéri az albumok megjelenési évét és típusát.
// 2) Ugyanannak a dalnak (cím + előadó) a legkorábbi évét veszi, mert a Deezer sokszor egy
//    későbbi kiadásból adja a dalt. Ha a legkorábbi év is csak válogatásból, best of-ból,
//    koncertlemezről, remasterből vagy újrafelvételből jön, az bizonytalan (csak felső korlát).
// 3) Minden előadónál a MusicBrainz első megjelenési évével is pontosít (másodpercenként
//    1 kérés, ezért ez a lassú rész); a legkorábbi hihető év számít.
// 4) Józansági ellenőrzés: a dal nem lehet az előadó debütálása (ARTIST_INFO.debut) előtti.
//    Ha egy 2000 előtt indult előadó dala 2010 utánra esik, és a MusicBrainz sem erősíti meg,
//    gyanús: kimarad (hacsak az előadó 2005 után is bizonyítottan adott ki), és a
//    tools/.cache/years-report.json-ba kerül.
// 5) A config YEAR_OVERRIDES kézi javításai mindent felülírnak (a játék is figyeli őket).
// A MusicBrainz- és album-eredmények a tools/.cache mappába kerülnek, így az újrafuttatás gyors.
import fs from "node:fs";
import vm from "node:vm";

const win = {};
vm.runInNewContext(fs.readFileSync("js/config.js", "utf8"), { window: win });
const CFG = win.SONGDLE_CONFIG;
const UA = { "User-Agent": "songdle-hu/1.0 (https://github.com/Oliverszkcs/songdle-hu)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fold = (s) => s.toLocaleLowerCase("hu").normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();
const baseTitle = (t) => norm(t.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "")) || norm(t);
const PART_SUFFIX = /^(.*?)(?: (?:i|ii|iii|iv|v|vi|[1-9]))?$/;
const songKey = (s) => norm(s).replace(/^az? /, "").match(PART_SUFFIX)[1];
// Zárójel nélküli változat-jelölések a cím végén (pl. „Szállj! Radio Edit”).
const VERSION_TAIL = /\s+(radio edit|radio version|album version|original( lp)? mix|extended mix|club mix|[\w' ]*\bmix)$/i;
const cleanTitle = (t) => (t.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "").replace(VERSION_TAIL, "").trim() || t);

// Későbbi kiadásra utaló album- és dalcímek: ezek éve csak végső esetben számít.
const REISSUE_ALBUM = /best of|greatest|\bhits\b|válogatás|valogatas|slágerei|slagerei|slágerválogatás|aranyalbum|collection|gyűjtemény|anthology|antológia|összes|legszebb|legjobb|legnagyobb|retro party|karaoke|\blive\b|élő|koncert|unplugged|remaster|very best|jubileumi|finálé|\b\d+ ?év\b|the best|\bgold\b|platina|evergreen|legendák|best 4|remix album|dance stars|funk machine|újratöltve|ujratoltve/i;
const REISSUE_TRACK = /remaster|re-?recorded|\blive\b|élő|koncert|unplugged|\b(19|20)\d\d (version|remix|mix)\b|\((19|20)\d\d\)/i;

let last = 0;
async function deezer(path) {
  const wait = last + 130 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let i = 0; i < 4; i++) {
    try {
      const j = await (await fetch("https://api.deezer.com" + path)).json();
      if (!j.error) return j;
      if (j.error.code !== 4) return null; // 4 = kvóta, újra
    } catch { /* hálózati hiba, újra */ }
    await sleep(2000 * (i + 1));
  }
  return null;
}

const CACHE_DIR = "tools/.cache";
const MB_CACHE = CACHE_DIR + "/musicbrainz-years.json";
fs.mkdirSync(CACHE_DIR, { recursive: true });
const mbCache = fs.existsSync(MB_CACHE) ? JSON.parse(fs.readFileSync(MB_CACHE, "utf8")) : {};
let mbLast = 0;
async function musicbrainzYear(title, artist) {
  const key = norm(artist) + "|" + songKey(title);
  if (key in mbCache) return mbCache[key];
  const raw = cleanTitle(title);
  const q = `recording:"${raw.replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`;
  const url = "https://musicbrainz.org/ws/2/recording?" + new URLSearchParams({ query: q, fmt: "json", limit: "40" });
  for (let i = 0; i < 4; i++) {
    const wait = mbLast + 1100 - Date.now();
    if (wait > 0) await sleep(wait);
    mbLast = Date.now();
    try {
      const res = await fetch(url, { headers: UA });
      if (res.status === 503 || res.status === 429) { await sleep(3000); continue; }
      if (!res.ok) break;
      const data = await res.json();
      const want = songKey(raw), a = norm(artist);
      let best = null;
      for (const r of data.recordings || []) {
        const credit = norm((r["artist-credit"] || []).map((x) => x.name).join(" "));
        if (!credit.includes(a) || songKey(r.title) !== want) continue;
        const yr = parseInt(String(r["first-release-date"] || "").slice(0, 4), 10);
        if (yr > 1900 && (!best || yr < best)) best = yr;
      }
      mbCache[key] = best;
      return best;
    } catch { await sleep(2000); }
  }
  return null;
}

// Album-adatok: közös gyorsítótár a check-foreign.mjs-sel. A `type` (album/single/ep/compile)
// újabb mező: ahol hiányzik, újra lekérjük.
const ALBUM_CACHE = CACHE_DIR + "/albums.json";
const albums = fs.existsSync(ALBUM_CACHE) ? JSON.parse(fs.readFileSync(ALBUM_CACHE, "utf8")) : {};
async function albumInfo(id) {
  const a = albums[id];
  if (!a || !a.type) {
    const d = await deezer(`/album/${id}`);
    albums[id] = {
      ...(a || {}), label: (d && d.label) || (a && a.label) || "?", title: (d && d.title) || (a && a.title) || "",
      date: (d && d.release_date) || (a && a.date) || "", type: (d && d.record_type) || "?",
    };
  }
  return albums[id];
}

const fixes = new Map((CFG.YEAR_OVERRIDES || []).map((o) => [norm(o.artist) + "|" + baseTitle(o.title), o.year]));
const years = {};
const report = { suspicious: [], beforeDebut: [], overrides: [] };
const sources = {}; // dal → [év, forrás, előadó, cím] (ellenőrzéshez, tools/.cache/years-sources.json)
const info = CFG.ARTIST_INFO || {};
const artists = CFG.ARTISTS.filter((a) => a.id);
const MB_PER_ARTIST = (CFG.MAX_SONGS_PER_ARTIST || 35) + 5;
let n = 0;
for (const a of artists) {
  n++;
  const top = await deezer(`/artist/${a.id}/top?limit=${CFG.TRACKS_PER_ARTIST}`);
  const tracks = (top && top.data) || [];
  const debut = info[a.name] ? info[a.name].debut : null;
  const plausible = (y) => y > 1900 && y >= (debut || 1955);
  // Dalonként (cím + előadó) a legkorábbi év: eredeti kiadásból (orig), illetve bármiből (any).
  const orig = new Map(), any = new Map();
  const keep = (m, k, y) => { if (!m.has(k) || y < m.get(k)) m.set(k, y); };
  // Ha az előadó több nagylemeze ugyanazon a napon „jelent meg”, az a régi katalógus digitalizálása
  // (pl. Kozmix: a 100%, a 200% és a Lázadááás! is 2013-12-13): ezek az évek újrakiadásnak számítanak.
  const albumDates = new Map();
  for (const t of tracks) {
    const alb = t.album && t.album.id && await albumInfo(t.album.id);
    if (!alb || !alb.date || alb.type === "single") continue;
    if (!albumDates.has(alb.date)) albumDates.set(alb.date, new Set());
    albumDates.get(alb.date).add(t.album.id);
  }
  const batch = (alb) => alb.type !== "single" && (albumDates.get(alb.date) || new Set()).size >= 2;
  for (const t of tracks) {
    const alb = t.album && t.album.id && await albumInfo(t.album.id);
    const y = alb ? parseInt(String(alb.date || "").slice(0, 4), 10) : NaN;
    if (!(y > 1900)) continue;
    const k = baseTitle(t.title) + "|" + norm(t.artist.name);
    if (!plausible(y)) { report.beforeDebut.push({ artist: a.name, title: t.title, year: y, debut, source: "deezer: " + alb.title }); continue; }
    keep(any, k, y);
    if (alb.type !== "compile" && !batch(alb) && !REISSUE_ALBUM.test(alb.title) && !REISSUE_TRACK.test(t.title)) keep(orig, k, y);
  }
  // MusicBrainz: minden előadónál a népszerűbb dalokra.
  const seen = new Set();
  const ranked = [...tracks].sort((x, y) => y.rank - x.rank);
  const found = [], confirmed = [];
  for (const t of ranked) {
    const k = baseTitle(t.title) + "|" + norm(t.artist.name);
    // A válogatás éve felső korlát (a dal annál nem későbbi), ezért a kettő minimuma számít; ha csak
    // válogatásból ismert, az év bizonytalan (lásd lent).
    let y = any.get(k) || null, source = !y ? "" : orig.get(k) === y ? "deezer" : "deezer (újrakiadás)";
    let sure = false;
    if (!seen.has(k) && seen.size < MB_PER_ARTIST) {
      seen.add(k);
      const mb = await musicbrainzYear(t.title, t.artist.name);
      if (mb && !plausible(mb)) report.beforeDebut.push({ artist: a.name, title: t.title, year: mb, debut, source: "musicbrainz" });
      if (mb && plausible(mb)) { sure = true; if (!y || mb < y) { y = mb; source = "musicbrainz"; } }
    }
    const fix = fixes.get(norm(a.name) + "|" + baseTitle(t.title));
    if (fix !== undefined) { if (fix) found.push({ t, y: fix, sure: true, source: "kézi" }); else report.overrides.push({ artist: a.name, title: t.title, year: null }); continue; }
    if (!y) continue;
    found.push({ t, y, sure, source });
    if (sure) confirmed.push(y);
  }
  // Régi (2000 előtt indult) előadóknál a Deezer gyakran az újrakiadás évét adja (pl. Koncz Zsuzsa
  // 2020-ban). Ha a MusicBrainz szerint az előadó dalai jóval korábbiak, a meg nem erősített késői
  // évet elhagyjuk: az ilyen dal így egyik évtizedben sem szerepel, de rossz helyen sem. A 2010 utáni,
  // meg nem erősített év csak akkor marad, ha az előadó a MusicBrainz szerint 2005 után is adott ki
  // dalt (régi előadó új dala); ezek a riportba kerülnek.
  confirmed.sort((x, y) => x - y);
  const oldArtist = debut && debut < 2000;
  const cap = oldArtist && confirmed.length >= 5 ? confirmed[Math.floor(confirmed.length * 0.9)] + 5 : Infinity;
  const recentlyActive = confirmed.length > 0 && confirmed[confirmed.length - 1] >= 2005;
  // Feloszlott vagy elhunyt régi előadónál a 2010 utáni év szinte mindig újrakiadás (a MusicBrainz is
  // gyakran csak azt ismeri, pl. Korál 2021): kimarad, hacsak nincs kézi javítás.
  const inactive = info[a.name] && info[a.name].status !== "active";
  for (const f of found) {
    const late = oldArtist && f.y > 2010;
    // Csak újrakiadásból ismert, meg nem erősített év, jóval a debütálás után: inkább kimarad.
    const reissueOnly = !f.sure && f.source === "deezer (újrakiadás)" && debut && f.y - debut > 10;
    if (f.source === "kézi") report.overrides.push({ artist: a.name, title: f.t.title, year: f.y });
    else if ((!f.sure && f.y > cap) || (late && !f.sure && !recentlyActive) || (late && inactive) || (late && f.source === "deezer (újrakiadás)") || reissueOnly) {
      report.suspicious.push({ artist: a.name, title: f.t.title, year: f.y, source: f.source, dropped: true });
      continue;
    } else if (late) report.suspicious.push({ artist: a.name, title: f.t.title, year: f.y, source: f.source, dropped: false });
    years[f.t.id] = f.y;
    sources[f.t.id] = [f.y, f.source, a.name, f.t.title];
  }
  fs.writeFileSync(MB_CACHE, JSON.stringify(mbCache));
  fs.writeFileSync(ALBUM_CACHE, JSON.stringify(albums));
  console.log(`${n}/${artists.length} ${a.name}: ${tracks.length} dal`);
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/years.json", JSON.stringify({ generated: new Date().toISOString().slice(0, 10), years }));
fs.writeFileSync(CACHE_DIR + "/years-report.json", JSON.stringify(report, null, 1));
fs.writeFileSync(CACHE_DIR + "/years-sources.json", JSON.stringify(sources));
console.log("Kész:", Object.keys(years).length, "dal → data/years.json;",
  report.suspicious.length, "gyanús,", report.beforeDebut.length, "debüt előtti év → tools/.cache/years-report.json");
