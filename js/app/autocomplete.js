import { el, fold, norm, coverUrl, trackLabel, retrigger } from "./core.js?v=62";
import { mode, pool, round, selected, setStatus, setSelected } from "./state.js?v=62";
import { registerAttempt } from "./round.js?v=62";
import { updateSubmit, updateClear } from "./render.js?v=62";
import { streamLock, chatMatch } from "./stream.js?v=62";

// ---------- Automatikus kiegészítés ----------
let suggestionItems = [];
let activeIndex = -1;

// Az ebben a körben már tippelt dalok ne jelenjenek meg újra.
function guessedKeys() {
  const keys = new Set();
  if (!round) return keys;
  for (const a of round.attempts) {
    if (a.key) keys.add(a.key);
    else if (a.label) keys.add("label:" + a.label);
  }
  return keys;
}

// Minden beírt szónak szerepelnie kell a címben vagy valamelyik előadóban
// (a közreműködőket is beleértve). Ha a keresés több előadót is érint,
// a közös dalaik kerülnek előre.
// all: a már tippelt dalokat is visszaadja (a chat szavazatainál).
export function search(q, all) {
  const nq = norm(q);
  if (!nq) return [];
  const tokens = nq.split(" ");
  const guessed = all ? new Set() : guessedKeys();
  const hits = [];
  for (const t of pool) {
    if (guessed.has(t.key) || guessed.has("label:" + trackLabel(t))) continue;
    if (!tokens.every((tok) => t.hay.includes(tok))) continue;
    const artistsHit = t.nArtists.filter((a) => tokens.some((tok) => a.includes(tok))).length;
    let score = t.nTitle.startsWith(nq) ? 0
      : t.nArtists.some((a) => a.startsWith(nq)) ? 1
      : t.nTitle.includes(nq) ? 2 : 3;
    if (artistsHit >= 2) score -= 2;
    hits.push({ t, score });
  }
  hits.sort((a, b) => a.score - b.score || b.t.rank - a.t.rank);
  // Az előadó nevét beírva az összes dala látszódjon (a lista görgethető).
  return hits.slice(0, 60).map((h) => h.t);
}

// A beírt szöveget kiemeli a találatban (ékezetektől függetlenül).
export function highlighted(text, q) {
  const frag = document.createDocumentFragment();
  const ft = fold(text);
  if (ft.length !== text.length) { frag.append(text); return frag; }
  const on = new Array(text.length).fill(false);
  for (const tok of fold(q).split(/\s+/).filter(Boolean)) {
    const i = ft.indexOf(tok);
    if (i >= 0) for (let k = i; k < i + tok.length; k++) on[k] = true;
  }
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && on[j] === on[i]) j++;
    if (on[i]) {
      const mark = document.createElement("mark");
      mark.textContent = text.slice(i, j);
      frag.append(mark);
    } else frag.append(text.slice(i, j));
    i = j;
  }
  return frag;
}

function renderSuggestions() {
  if (mode === "stream") return hideSuggestions();
  const q = el.input.value;
  suggestionItems = search(q);
  activeIndex = suggestionItems.length ? 0 : -1;
  el.suggestions.innerHTML = "";
  if (!q.trim()) return hideSuggestions();
  if (!suggestionItems.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Nincs ilyen dal a listában";
    el.suggestions.appendChild(li);
  }
  suggestionItems.forEach((t, i) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(i === activeIndex));
    const img = document.createElement("img");
    img.className = "s-cover";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    if (t.md5) img.src = coverUrl(t.md5, 120);
    const text = document.createElement("span");
    text.className = "s-text";
    const title = document.createElement("span");
    title.className = "s-title";
    title.appendChild(highlighted(t.title, q));
    const artist = document.createElement("span");
    artist.className = "s-artist";
    artist.appendChild(highlighted(t.artist, q));
    if (t.feat.length) {
      const feat = document.createElement("span");
      feat.className = "s-feat";
      feat.append(" feat. ", highlighted(t.feat.join(", "), q));
      artist.appendChild(feat);
    }
    text.append(title, artist);
    li.append(img, text);
    // A mousedown tiltása megtartja a fókuszt (és a billentyűzetet); a választás
    // click-re történik, így mobilon a lista görgetése nem választ ki dalt.
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", () => choose(t));
    el.suggestions.appendChild(li);
  });
  const wasHidden = el.suggestions.hidden;
  el.suggestions.hidden = false;
  comboSync(el.input, el.suggestions, activeIndex);
  if (wasHidden) retrigger(el.suggestions, "open");
  fitSuggestions();
  el.suggestions.scrollTop = 0;
}

// A lista ne lógjon ki a látható területből, ha a billentyűzet nyitva van.
function fitSuggestions() {
  if (el.suggestions.hidden) return;
  const vv = window.visualViewport;
  const top = vv ? vv.offsetTop : 0;
  const space = el.input.getBoundingClientRect().top - top - 16;
  // Legfeljebb a képernyő ~40%-a, hogy a lemez közepe (lejátszás gomb) látszódjon.
  const cap = Math.min(340, window.innerHeight * 0.4);
  el.suggestions.style.maxHeight = Math.max(120, Math.min(cap, space)) + "px";
}

export function hideSuggestions() {
  el.suggestions.hidden = true;
  suggestionItems = [];
  activeIndex = -1;
  comboSync(el.input, el.suggestions, -1);
}

// Combobox: a képernyőolvasó tudja, nyitva van-e a lista, és bemondja a kiemelt javaslatot.
export function comboSync(input, list, i) {
  input.setAttribute("aria-expanded", String(!list.hidden));
  const li = !list.hidden && i >= 0 ? list.children[i] : null;
  if (li) {
    li.id = li.id || `${list.id}-${i}`;
    input.setAttribute("aria-activedescendant", li.id);
  } else input.removeAttribute("aria-activedescendant");
}

function highlight(i) {
  activeIndex = i;
  [...el.suggestions.children].forEach((li, j) => li.setAttribute("aria-selected", String(j === i)));
  comboSync(el.input, el.suggestions, i);
  const li = el.suggestions.children[i];
  // Csak a listát görgetjük (a scrollIntoView az oldalt is mozgathatja).
  if (li) {
    const s = el.suggestions;
    if (li.offsetTop < s.scrollTop) s.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > s.scrollTop + s.clientHeight) s.scrollTop = li.offsetTop + li.offsetHeight - s.clientHeight;
  }
}

function choose(t) {
  setSelected(t);
  el.input.value = trackLabel(t);
  hideSuggestions();
  updateSubmit();
  updateClear();
}

export function submit() {
  if (!round || round.done) return;
  let guess = selected;
  // Streamer módban a beírt szöveg rejtett, és ugyanúgy illesztjük, mint a chat tippjeit
  // (a képernyőn a chat is látja, ezért nincs javaslatlista).
  if (round.mode === "stream") guess = chatMatch(el.input.value);
  else if (!guess || el.input.value !== trackLabel(guess)) {
    guess = search(el.input.value)[0] || null;
  }
  if (!guess) {
    retrigger(el.input, "shake");
    setStatus(round.mode === "stream" ? "Nincs ilyen dal a listában – írd be másképp!" : "Válassz egy dalt a listából!", true);
    return;
  }
  setSelected(null);
  el.input.value = "";
  hideSuggestions();
  updateSubmit();
  updateClear();
  const attempt = { type: judge(guess, round.track), label: trackLabel(guess), key: guess.key };
  // Streamer mód: a tipp rejtve lezárul, az eredmény csak a chat szavazása után derül ki.
  if (round.mode === "stream") return streamLock(attempt);
  registerAttempt(attempt);
}

// Azonos cím csak közös előadónál számít találatnak (pl. „feat.” nélküli változat);
// egy másik előadó azonos című dala nem.
export function judge(guess, answer) {
  const sharesArtist = guess.nArtists.some((a) => answer.nArtists.includes(a));
  if (guess.key === answer.key || (guess.base === answer.base && sharesArtist)) return "right";
  return sharesArtist ? "near" : "wrong";
}

// Vágólap: a modern API, ha nem megy (pl. http, fókusz nélkül), a régi módszer.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    (document.querySelector("dialog[open]") || document.body).appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* nem támogatott */ }
    ta.remove();
    return ok;
  }
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitSuggestions);
    window.visualViewport.addEventListener("scroll", fitSuggestions);
  }

  el.input.addEventListener("input", () => { setSelected(null); renderSuggestions(); updateSubmit(); updateClear(); });
  el.input.addEventListener("focus", () => { if (el.input.value && !selected) renderSuggestions(); });
  el.input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
  el.input.addEventListener("keydown", (e) => {
    const open = !el.suggestions.hidden && suggestionItems.length;
    if (e.key === "ArrowDown" && open) { e.preventDefault(); highlight((activeIndex + 1) % suggestionItems.length); }
    else if (e.key === "ArrowUp" && open) { e.preventDefault(); highlight((activeIndex - 1 + suggestionItems.length) % suggestionItems.length); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (open && activeIndex >= 0) choose(suggestionItems[activeIndex]);
      else submit();
    } else if (e.key === "Escape") hideSuggestions();
  });
  el.clearBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    el.input.value = "";
    setSelected(null);
    hideSuggestions();
    updateSubmit();
    updateClear();
    el.input.focus();
  });
}
