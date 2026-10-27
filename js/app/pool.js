import { CFG, LS, load, save, norm, baseTitle, artistLine, hashString } from "./core.js?v=60";
import { pool } from "./state.js?v=60";

// ---------- Dalkészlet ----------
export const excludeRe = new RegExp(CFG.EXCLUDE_TITLE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");

export function slimTrack(t) {
  return {
    id: t.id, title: t.title, artist: t.artist.name, album: t.album ? t.album.title : "",
    feat: [...new Set((t.contributors || []).map((c) => c.name))].filter((n) => n !== t.artist.name),
    md5: t.md5_image || (t.album && t.album.md5_image) || "", rank: t.rank || 0,
  };
}

export async function withRetry(fn) {
  for (const delay of [2000, 4000]) {
    try { return await fn(); } catch (e) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return fn();
}

// Az előadók dallistái a Cache tárban vannak (a localStorage ~5 MB-os keretébe nem férne el
// biztonságosan mind); a régi, localStorage-ban tárolt listákat egyszer átköltöztetjük.
const POOL_CACHE = "songdle-pool-v1";
const poolUrl = (key) => new URL(`__pool/${key}`, location.href).href;
async function readPool(key) {
  const legacy = load(key, null);
  if (legacy) {
    if (await writePool(key, legacy)) {
      try { localStorage.removeItem(LS + key); } catch { /* nem elérhető */ }
    }
    return legacy;
  }
  try {
    const res = await (await caches.open(POOL_CACHE)).match(poolUrl(key));
    return res ? await res.json() : null;
  } catch { return null; }
}
async function writePool(key, value) {
  try {
    await (await caches.open(POOL_CACHE)).put(poolUrl(key), new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }));
    return true;
  } catch {
    save(key, value); // nincs Cache API (pl. nem biztonságos oldal): marad a régi tár
    return false;
  }
}

const poolKey = (artist) => "artist3." + (artist.id || norm(artist.name));
async function loadArtist(artist) {
  const cacheKey = poolKey(artist);
  const cached = await readPool(cacheKey);
  if (cached && Date.now() - cached.ts < CFG.POOL_CACHE_HOURS * 3600e3) return cached.tracks;
  // Offline (vagy ha a Deezer nem válaszol) a régebbi lista is jó.
  if (cached && !navigator.onLine) return cached.tracks;
  try { return await fetchArtist(artist, cacheKey, cached); } catch (e) {
    if (cached) return cached.tracks;
    throw e;
  }
}

// Egy dal már kiderített eredeti évét a dallistájába írjuk (előadónként egymás után, hogy
// két egyszerre érkező év ne írja felül egymást).
const yearWrites = new Map();
export function storeFirstYear(t, year) {
  const artist = CFG.ARTISTS.find((a) => a.name === t.src);
  if (!artist) return; // a meccshez külön betöltött dal: csak a memóriában marad
  const key = poolKey(artist);
  const job = (yearWrites.get(key) || Promise.resolve()).then(async () => {
    const data = await readPool(key);
    const hit = data && data.tracks.find((x) => x.id === t.id);
    if (!hit || hit.firstYear === year) return;
    hit.firstYear = year;
    await writePool(key, data);
  }).catch(() => {});
  yearWrites.set(key, job);
}

async function fetchArtist(artist, cacheKey, old) {
  let id = artist.id;
  if (!id) id = await withRetry(() => Deezer.findArtistId(artist.name));
  let tracks = [];
  if (id) {
    const raw = await withRetry(() => Deezer.artistTop(id, CFG.TRACKS_PER_ARTIST));
    // Csak olyan dal, amelyen az előadó tényleg szerepel (fő előadó vagy közreműködő).
    const features = (t) => t.artist.id === id || (t.contributors || []).some((c) => c.id === id);
    tracks = raw.filter((t) => t.readable !== false && t.preview && !excludeRe.test(t.title) && features(t)).map(slimTrack);
    // A frissített listában is megmaradnak a már kiderített évek.
    const years = new Map(((old && old.tracks) || []).filter((t) => t.firstYear).map((t) => [t.id, t.firstYear]));
    for (const t of tracks) if (years.has(t.id)) t.firstYear = years.get(t.id);
  }
  await writePool(cacheKey, { ts: Date.now(), tracks });
  return tracks;
}

// Egy dal adatai (előnézet-link, borító, év) a Deezerről; a kör eleji és az előtöltés közös kérése.
const clipRequests = new Map();
export function loadClip(t) {
  if (!clipRequests.has(t.id)) {
    clipRequests.set(t.id, fetchClip(t).finally(() => setTimeout(() => clipRequests.delete(t.id), 60e3)));
  }
  return clipRequests.get(t.id);
}
async function fetchClip(t) {
  const full = await Deezer.track(t.id);
  if (!full.preview) throw new Error("Nincs előnézet");
  return {
    preview: full.preview,
    md5: (full.album && full.album.md5_image) || t.md5,
    year: ((full.release_date || (full.album && full.album.release_date) || "").match(/^\d{4}/) || [""])[0],
    feat: full.contributors ? [...new Set(full.contributors.map((c) => c.name))] : null,
  };
}

const nameKey = (s) => norm(s).split(" ").sort().join(" ");
const sameName = (x, y) => nameKey(x) === nameKey(y);

// Egyszerre néhány kérés; a tempót a deezer.js szabályozza.
export async function loadArtists(artists, onProgress) {
  const results = [];
  let next = 0, done = 0;
  async function worker() {
    while (next < artists.length) {
      const a = artists[next++];
      try {
        // src: melyik beállított előadótól jött a dal (a dallista így csoportosít)
        let list = await loadArtist(a);
        if (a.only) {
          const want = new Set(a.only.map(baseTitle));
          list = list.filter((t) => want.has(baseTitle(t.title)));
        }
        if (a.top) list = [...list].sort((x, y) => y.rank - x.rank).slice(0, a.top);
        // Ha a Deezer csak kis-nagybetűben vagy ékezetben tér el (pl. „General”, „BÓDI GUSZTI”),
        // a configban megadott írásmódot mutatjuk.
        results.push(...list.map((t) => {
          // Fordított névsorrendnél is (pl. „Klári Katona” → „Katona Klári”).
          const artist = sameName(t.artist, a.name) ? a.name : t.artist;
          // A Deezer néha a fő előadót közreműködőként is felsorolja („Generál feat. General”).
          const feat = (t.feat || []).filter((f) => !sameName(f, artist));
          return { ...t, artist, feat, src: a.name };
        }));
      } catch (e) { console.warn("Nem sikerült:", a.name, e); }
      onProgress(++done, artists.length);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return results;
}

export const isLive = (t) => /\blive\b|\bél[őo]\b|koncert/i.test(t.title);

// Kitiltott dalok: a configban megadottak teljesen kimaradnak; a játékos által
// jelentettek bent maradnak (tippelni lehet rájuk), csak nem sorsoljuk őket.
// Az `aka` nevek (pl. Locomotiv GT) helyett a config szerinti név látszik (LGT), de a régi névre is lehet keresni.
const AKA = new Map(CFG.ARTISTS.flatMap((a) => (a.aka || []).map((n) => [n, a.name])));
export const shownName = (n) => AKA.get(n) || n;
export const configBlocked = new Set((CFG.BLOCKED_TRACKS || []).map((b) => (typeof b === "object" ? b.id : b)));
export let reported = load("reported", []);
export const isReported = (id) => reported.some((r) => r.id === id);

// keepBlocked: párbajban és kihívásban a meccs dala akkor is kell, ha azóta kitiltottuk.
export function buildPool(tracks, keepBlocked) {
  const byKey = new Map();
  for (const t of tracks) {
    if (configBlocked.has(t.id) && !keepBlocked) continue;
    if (AKA.has(t.artist)) { t.aka = t.artist; t.artist = shownName(t.artist); }
    if (t.feat) t.feat = t.feat.map(shownName).filter((n) => n !== t.artist);
    t.base = baseTitle(t.title);
    t.key = t.base + "|" + norm(t.artist);
    const prev = byKey.get(t.key);
    const better = !prev || (isLive(prev) && !isLive(t)) || (isLive(prev) === isLive(t) && t.rank > prev.rank);
    if (better) byKey.set(t.key, t);
  }
  // Előadónként csak a legnépszerűbb MAX_SONGS_PER_ARTIST dal marad.
  const max = CFG.MAX_SONGS_PER_ARTIST || Infinity;
  const bySrc = new Map();
  for (const t of byKey.values()) {
    const k = t.src || t.artist;
    if (!bySrc.has(k)) bySrc.set(k, []);
    bySrc.get(k).push(t);
  }
  const pool = [...bySrc.values()].flatMap((list) => list.sort((a, b) => b.rank - a.rank).slice(0, max));
  for (const t of pool) {
    t.feat = t.feat || [];
    t.nTitle = norm(t.title);
    t.nArtist = norm(t.artist);
    t.nArtists = [t.artist, ...t.feat].map(norm);
    t.hay = t.nTitle + " " + t.nArtists.join(" ") + (t.aka ? " " + norm(t.aka) : "");
  }
  pool.sort((a, b) => a.title.localeCompare(b.title, "hu"));
  assignWeights(pool);
  return pool;
}

// Népszerűségi súly: a lista rangsor szerinti helyéből (0 = leggyengébb,
// 1 = legnagyobb sláger) exponenciálisan, hogy a kiugró értékek ne torzítsanak.
export function assignWeights(list) {
  const bias = CFG.POPULARITY_BIAS ?? 2;
  const byRank = [...list].sort((a, b) => a.rank - b.rank);
  const n = byRank.length;
  byRank.forEach((t, i) => {
    const p = n > 1 ? i / (n - 1) : 1;
    t.pct = p;
    t.weight = Math.exp(bias * (p - 1));
  });
}

export function weightedPick(list, rnd) {
  const total = list.reduce((s, t) => s + (t.weight ?? 1), 0);
  let r = rnd() * total;
  for (const t of list) {
    r -= t.weight ?? 1;
    if (r <= 0) return t;
  }
  return list[list.length - 1];
}

// Évtized-kategóriák: minden előadó dalaiból a megjelenési év szerint szűrünk.
export const DECADES = CFG.DECADES || [];
export const decadeOf = (id) => DECADES.find((d) => d.id === id);
export const allCats = [...CFG.CATEGORIES, ...DECADES];
export const catLabel = (id) => (allCats.find((c) => c.id === id) || { label: id }).label;
export const artistsFor = (cat) => cat === "all" || decadeOf(cat) ? CFG.ARTISTS : CFG.ARTISTS.filter((a) => (a.tags || []).includes(cat));

// A dalok megjelenési éve (tools/build-years.mjs készíti); csak az évtized-kategóriákhoz kell.
let yearsData = null;
export async function loadYears() {
  if (yearsData) return yearsData;
  try {
    const res = await fetch("data/years.json");
    yearsData = res.ok ? (await res.json()).years || {} : {};
  } catch { yearsData = {}; }
  return yearsData;
}

// A napi dal mindenkinek ugyanaz: a nehézség népszerűségi sávjából az a dal
// nyer, amelyiknek a (dátum, nehézség, dal) hash-e a legnagyobb. Így ha két
// játékos dallistája kicsit eltér, a nyertes akkor is ugyanaz marad. A saját jelentés
// itt nem számít (csak a végtelen módban), hogy a napi dal tényleg mindenkinek ugyanaz legyen.
export function pickDailyTrack(date, diff) {
  let best = null, bestScore = -1;
  for (const t of pool) {
    if (isLive(t) || t.pct < diff.from || (t.pct >= diff.to && diff.to < 1)) continue;
    const score = hashString(`songdle-hu:${date}:${diff.id}:${t.id}`);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

export function setReported(t, reason) {
  reported = reported.filter((r) => r.id !== t.id);
  if (reason) reported.push({ id: t.id, title: t.title, artist: artistLine(t), reason, ts: Date.now() });
  save("reported", reported);
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  // A régi, 50 dalos gyorsítótár (artist2.*) helyett 100 dalos (artist3.*); a régit töröljük.
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(LS + "artist2.")).forEach((k) => localStorage.removeItem(k));
  } catch { /* nem elérhető */ }

  // Az összes régi listát egyszerre átköltöztetjük (nem csak a most betöltött előadókét),
  // A dalok eredeti megjelenési éve is a listában van (firstYear), ezért a régi, külön
  // évkulcsokat (year.*) töröljük.
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(LS + "artist3.")) readPool(k.slice(LS.length));
      else if (k.startsWith(LS + "year.")) localStorage.removeItem(k);
    }
  } catch { /* nem elérhető */ }

  // A hangot csak streameljük a Deezerről, nem tároljuk. A korábbi verzió a legutóbbi dalok
  // hangját a böngészőben tartotta (songdle-clips-v1): azt egyszer kitöröljük.
  try { caches.delete("songdle-clips-v1").catch(() => {}); } catch { /* nincs Cache API */ }
}
