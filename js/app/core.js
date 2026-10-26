
export const CFG = window.SONGDLE_CONFIG;
export const LENGTHS = CFG.CLIP_LENGTHS;
export const MAX_TRIES = LENGTHS.length;
export const MAX_LEN = LENGTHS[MAX_TRIES - 1];
export const FULL_PREVIEW = 30;
export const POINTS = [100, 80, 60, 40, 25, 10];
export const STREAK_BONUS = 5, STREAK_BONUS_MAX = 50;
export const SET_SIZE = 5; // ennyi dal egy kör a végtelen módban
export const DIFFS = CFG.DAILY_DIFFICULTIES;
export const diffById = (id) => DIFFS.find((d) => d.id === id) || DIFFS[0];
export const WAVE_BARS = 64;
export const DEFAULT_TINT = ["#1ed760", "#2bb3ff", "#8b5cf6"];
export const LS = "songdle.";
export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

export const $ = (id) => document.getElementById(id);
export const el = {
  categories: $("categories"), categoriesWrap: $("categoriesWrap"), dailyBanner: $("dailyBanner"),
  segmented: $("segmented"), streakLine: $("streakLine"), guesses: $("guesses"), tries: $("tries"),
  status: $("status"), reveal: $("reveal"),
  revealResult: $("revealResult"), revealTitle: $("revealTitle"), revealArtist: $("revealArtist"),
  revealAlbum: $("revealAlbum"), revealEmoji: $("revealEmoji"), revealPoints: $("revealPoints"),
  bonus: $("bonus"), bonusQ: $("bonusQ"), bonusOpts: $("bonusOpts"),
  stage: $("stage"), viz: $("viz"), disc: $("disc"), discCover: $("discCover"),
  ringUnlocked: $("ringUnlocked"), ringProgress: $("ringProgress"), floatPoints: $("floatPoints"),
  wave: $("wave"), waveMarks: $("waveMarks"), timeNow: $("timeNow"), timeMax: $("timeMax"),
  clipLen: $("clipLen"), playBtn: $("playBtn"), controls: $("controls"),
  input: $("guessInput"), clearBtn: $("clearBtn"), suggestions: $("suggestions"),
  skipBtn: $("skipBtn"), submitBtn: $("submitBtn"), doneButtons: $("doneButtons"),
  shareBtn: $("shareBtn"), nextBtn: $("nextBtn"), audio: $("audio"),
  loadBar: $("loadBar"), loadFill: $("loadFill"),
  statsDialog: $("statsDialog"), statGrid: $("statGrid"), statGridDaily: $("statGridDaily"),
  statPoints: $("statPoints"), dist: $("dist"), helpDialog: $("helpDialog"), confirmDialog: $("confirmDialog"),
  toast: $("toast"), confetti: $("confetti"), pointsPill: $("pointsPill"), pointsNum: $("pointsNum"), roundLabel: $("roundLabel"), confirmText: $("confirmText"),
  setBar: $("setBar"), setSlots: $("setSlots"), setRecord: $("setRecord"), revealSet: $("revealSet"),
  roundPts: $("roundPts"), roundNum: $("roundNum"),
  modeEndless: $("modeEndless"), modeDaily: $("modeDaily"), modeArtist: $("modeArtist"),
  artistView: $("artistView"), game: document.querySelector(".game"), scroll: $("scroll"),
  volumeBtn: $("volumeBtn"), volumePop: $("volumePop"), volumeRange: $("volumeRange"),
  volumeVal: $("volumeVal"), muteBtn: $("muteBtn"),
};

// ---------- Tárolás ----------
// A tárolóból jövő szám HTML-be csak így kerül: egy átírt (szöveges) érték nem futhat le kódként.
export const num = (v) => Number(v) || 0;
export function load(key, fallback) {
  try {
    const v = localStorage.getItem(LS + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem(LS + key, JSON.stringify(value)); } catch (e) {
    // Betelt tárhely: egyszer szólunk, különben a sorozat és a napi eredmény csendben elveszne.
    if (e && e.name === "QuotaExceededError" && !save.warned) {
      save.warned = true;
      setTimeout(() => toast("A böngésző tárhelye megtelt, az eredményeid most nem mentődnek."), 0);
    }
  }
}

// ---------- Szöveg ----------
export const fold = (s) => s.toLocaleLowerCase("hu").normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = (s) => fold(s).replace(/[^a-z0-9]+/g, " ").trim();
export function baseTitle(t) {
  const stripped = t.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "");
  return norm(stripped) || norm(t);
}
export const fmt = (s) => `0:${String(Math.floor(s)).padStart(2, "0")}`;
export const coverUrl = (md5, size) =>
  md5 ? `https://cdn-images.dzcdn.net/images/cover/${md5}/${size}x${size}-000000-80-0-0.jpg` : "";
export const artistLine = (t) => (t.feat && t.feat.length ? `${t.artist} feat. ${t.feat.join(", ")}` : t.artist);
export const trackLabel = (t) => `${t.title} – ${artistLine(t)}`;

// ---------- Dátum (napi dal: budapesti idő szerint) ----------
const TZ = "Europe/Budapest";
export const dateKey = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
export function shiftDate(key, days) {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Budapest eltérése az UTC-től az adott pillanatban (ms), nyári időszámítással együtt.
const tzFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23",
});
function tzOffset(t) {
  const p = Object.fromEntries(tzFmt.formatToParts(new Date(t)).map((x) => [x.type, +x.value || 0]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}
// A következő budapesti éjfélig hátralévő idő. Az óraátállítás napján az a nap 23 vagy 25 órás,
// ezért az éjfél pillanatát a holnapi eltéréssel számoljuk, nem a mai órából.
export function msToNextDay() {
  const now = Date.now();
  const [y, m, d] = shiftDate(dateKey(), 1).split("-").map(Number);
  const local = Date.UTC(y, m - 1, d);
  let t = local - tzOffset(now);
  t = local - tzOffset(t);
  return t - now;
}
export const prettyDate = (key) =>
  new Date(key + "T12:00:00Z").toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A dal azonosítója mentésben, gyorsítótárban és kihívás-linkben nem olvasható ki ránézésre.
// Ez csak a kíváncsi szemnek nehezíti a csalást: a böngésző hálózati forgalmából
// egy elszánt játékos így is megtudhatja a dalt (szerver nélkül ez nem védhető ki).
const ID_MUL = 7919, ID_ADD = 1234567;
export const encId = (id) => [...((id + ID_ADD) * ID_MUL).toString(36)].reverse().join("");
export function decId(v) {
  if (typeof v === "number") return v; // régi mentés
  const n = parseInt([...String(v || "")].reverse().join(""), 36) / ID_MUL - ID_ADD;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function retrigger(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

let toastTimer = 0;
export function toast(msg) {
  el.toast.textContent = msg;
  // Hosszabb magyarázat: szélesebb doboz, tovább látszik.
  el.toast.classList.toggle("long", msg.length > 50);
  el.toast.hidden = false;
  retrigger(el.toast, "show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, Math.max(2200, msg.length * 55));
}
