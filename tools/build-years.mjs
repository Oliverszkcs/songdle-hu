// Megjelenési évek az „Évtized” kategóriákhoz → data/years.json
//
// Használat (a repó gyökeréből):  node tools/build-years.mjs
//
// 1) Minden előadó Deezer top listájához lekéri az albumok megjelenési évét.
// 2) Ugyanannak a dalnak (cím + előadó) a legkorábbi évét veszi, mert a Deezer
//    sokszor egy későbbi válogatásból adja a dalt.
// 3) A 2008 előtt indult előadóknál a MusicBrainz első megjelenési évével is
//    pontosít (másodpercenként 1 kérés, ezért ez a lassú rész).
// A MusicBrainz-eredmények a tools/.cache mappába kerülnek, így az újrafuttatás gyors.
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
  const raw = title.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim() || title;
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

// Album-adatok: közös gyorsítótár a check-foreign.mjs-sel.
const ALBUM_CACHE = CACHE_DIR + "/albums.json";
const albums = fs.existsSync(ALBUM_CACHE) ? JSON.parse(fs.readFileSync(ALBUM_CACHE, "utf8")) : {};
const albumYear = new Map();
const years = {};
const info = CFG.ARTIST_INFO || {};
const artists = CFG.ARTISTS.filter((a) => a.id);
let n = 0;
for (const a of artists) {
  n++;
  const top = await deezer(`/artist/${a.id}/top?limit=${CFG.TRACKS_PER_ARTIST}`);
  const tracks = (top && top.data) || [];
  for (const t of tracks) {
    const alb = t.album && t.album.id;
    if (alb && !albumYear.has(alb)) {
      if (!albums[alb]) {
        const d = await deezer(`/album/${alb}`);
        albums[alb] = { label: (d && d.label) || "?", title: (d && d.title) || "", date: (d && d.release_date) || "" };
      }
      const y = parseInt(String(albums[alb].date || "").slice(0, 4), 10);
      albumYear.set(alb, y > 1900 ? y : null);
    }
  }
  // A debütálás előtti év szinte mindig hibás adat (pl. 1939-es Korál-album).
  const debut = info[a.name] ? info[a.name].debut : null;
  const plausible = (y) => y >= (debut ? debut - 1 : 1955);
  // Azonos dal több albumon: a legkorábbi év számít.
  const earliest = new Map();
  for (const t of tracks) {
    const y = albumYear.get(t.album && t.album.id);
    if (!y || !plausible(y)) continue;
    const k = baseTitle(t.title) + "|" + norm(t.artist.name);
    if (!earliest.has(k) || y < earliest.get(k)) earliest.set(k, y);
  }
  // Régebbi előadóknál a népszerűbb dalokra MusicBrainz-pontosítás.
  const old = !debut || debut < 2008;
  const seen = new Set();
  const ranked = [...tracks].sort((x, y) => y.rank - x.rank);
  const found = [], confirmed = [];
  for (const t of ranked) {
    const k = baseTitle(t.title) + "|" + norm(t.artist.name);
    let y = earliest.get(k) || null, sure = false;
    if (old && !seen.has(k) && seen.size < (CFG.MAX_SONGS_PER_ARTIST || 35) + 5) {
      seen.add(k);
      const mb = await musicbrainzYear(t.title, t.artist.name);
      if (mb && plausible(mb)) { sure = true; if (!y || mb < y) y = mb; }
    }
    if (!y) continue;
    found.push({ id: t.id, y, sure });
    if (sure) confirmed.push(y);
  }
  // Régi előadóknál a Deezer gyakran az újrakiadás évét adja (pl. Koncz Zsuzsa 2020-ban).
  // Ha a MusicBrainz szerint az előadó dalai jóval korábbiak, a meg nem erősített késői
  // évet elhagyjuk: az ilyen dal így egyik évtizedben sem szerepel, de rossz helyen sem.
  confirmed.sort((x, y) => x - y);
  const cap = confirmed.length >= 5 ? confirmed[Math.floor(confirmed.length * 0.9)] + 5 : Infinity;
  for (const f of found) if (f.sure || f.y <= cap) years[f.id] = f.y;
  fs.writeFileSync(MB_CACHE, JSON.stringify(mbCache));
  fs.writeFileSync(ALBUM_CACHE, JSON.stringify(albums));
  console.log(`${n}/${artists.length} ${a.name}: ${tracks.length} dal`);
}

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/years.json", JSON.stringify({ generated: new Date().toISOString().slice(0, 10), years }));
console.log("Kész:", Object.keys(years).length, "dal → data/years.json");
