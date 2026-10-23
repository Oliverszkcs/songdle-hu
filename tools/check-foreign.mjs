// Gyanús (valószínűleg nem a magyar előadótól származó) dalok keresése.
//
// Használat (a repó gyökeréből):  node tools/check-foreign.mjs [előadó neve…]
//
// A Deezer néha összevonja az azonos nevű előadókat (pl. Desh, Vini, Fluor): ilyenkor
// a top listába egy külföldi lo-fi vagy rap kiadó dalai is bekerülnek. A szkript
// előadónként megnézi, melyik kiadóknál jelennek meg a dalai, és kilistázza azokat,
// amelyek egy szokatlan kiadótól jönnek, és nincs rajtuk másik magyar (configbeli) előadó.
// ⚠️ = erősen gyanús: a cím angolnak vagy más nyelvűnek tűnik (nincs magyar ékezet, van
// benne angol szó vagy idegen betű), és a felvétel ISRC-kódja sem magyar (nem „HU…”).
// Ellenőrzés (meghallgatás) után a kiszűrendőket a js/config.js BLOCKED_TRACKS listájába
// kell felvenni (a kimenet végén kész sorok vannak).
import fs from "node:fs";
import vm from "node:vm";

const win = {};
vm.runInNewContext(fs.readFileSync("js/config.js", "utf8"), { window: win });
const CFG = win.SONGDLE_CONFIG;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2).map((s) => s.toLowerCase());

let last = 0;
async function deezer(path) {
  const wait = last + 130 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let i = 0; i < 4; i++) {
    try {
      const j = await (await fetch("https://api.deezer.com" + path)).json();
      if (!j.error) return j;
      if (j.error.code !== 4) return null;
    } catch { /* újra */ }
    await sleep(2000 * (i + 1));
  }
  return null;
}

const CACHE = "tools/.cache/albums.json";
fs.mkdirSync("tools/.cache", { recursive: true });
const albums = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
async function album(id) {
  if (!albums[id]) {
    const a = await deezer(`/album/${id}`);
    albums[id] = { label: (a && a.label) || "?", title: (a && a.title) || "", date: (a && a.release_date) || "" };
  }
  return albums[id];
}

const blocked = new Set((CFG.BLOCKED_TRACKS || []).map((b) => (typeof b === "object" ? b.id : b)));
const configIds = new Set(CFG.ARTISTS.map((a) => a.id).filter(Boolean));
const HU = /[áéíóöőúüű]/i;
// Idegen betűk (román, lengyel, német, spanyol…) és gyakori angol szavak.
const FOREIGN_CHARS = /[ăâîșțąęłńśźżßñçøåæ]/i;
const EN_WORDS = /\b(the|you|your|my|me|in|of|it|all|love|way|back|again|night|don't|can't|we|for|with|on|to|feat\.? .* remix)\b/i;
const looksForeign = (s) => !HU.test(s) && (FOREIGN_CHARS.test(s) || EN_WORDS.test(s));
const isrcCache = {};
async function isrc(id) {
  if (!(id in isrcCache)) {
    const t = await deezer(`/track/${id}`);
    isrcCache[id] = (t && t.isrc) || "";
  }
  return isrcCache[id];
}
const exclude = new RegExp(CFG.EXCLUDE_TITLE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
const lines = [];
let flagged = 0;

for (const a of CFG.ARTISTS.filter((x) => x.id)) {
  if (only.length && !only.some((o) => a.name.toLowerCase().includes(o))) continue;
  const top = await deezer(`/artist/${a.id}/top?limit=${CFG.TRACKS_PER_ARTIST}`);
  const tracks = ((top && top.data) || []).filter((t) => t.preview && t.readable !== false && !exclude.test(t.title)
    && (t.artist.id === a.id || (t.contributors || []).some((c) => c.id === a.id)) && !blocked.has(t.id));
  for (const t of tracks) t.alb = await album(t.album.id);
  // „Otthoni” kiadók: amelyek a dalok legalább 15%-át adják (és a leggyakoribb kettő).
  const count = new Map();
  for (const t of tracks) count.set(t.alb.label, (count.get(t.alb.label) || 0) + 1);
  const sorted = [...count.entries()].sort((x, y) => y[1] - x[1]);
  const home = new Set(sorted.filter(([, n], i) => i < 2 || n >= tracks.length * 0.15).map(([l]) => l));
  const odd = tracks.filter((t) => !home.has(t.alb.label)
    // Közös dal egy másik configbeli előadóval: az rendben van.
    && !(t.contributors || []).some((c) => c.id !== a.id && configIds.has(c.id)));
  if (!odd.length) continue;
  console.log(`\n${a.name}  (otthoni kiadók: ${[...home].join(", ")})`);
  for (const t of odd) {
    const code = looksForeign(t.title) ? await isrc(t.id) : "";
    const strong = !!code && !code.startsWith("HU");
    if (strong) flagged++;
    console.log(`  ${strong ? "⚠️ " : "   "}${t.id}  ${t.title}  ·  ${t.alb.title} (${t.alb.date.slice(0, 4)})  ·  kiadó: ${t.alb.label}${code ? "  ·  ISRC " + code : ""}`);
    if (strong) lines.push(`    { id: ${t.id}, note: "${t.title.replace(/"/g, "'")} – nem a magyar ${a.name}? (kiadó: ${t.alb.label.replace(/"/g, "'")})" },`);
  }
}
fs.writeFileSync(CACHE, JSON.stringify(albums));
console.log(`\n${flagged} erősen gyanús dal (⚠️).`);
if (lines.length) console.log("Ellenőrzés után a BLOCKED_TRACKS-be:\n" + lines.join("\n"));
