import { CFG } from "./core.js?v=60";

// ---------- Látogatottság (GoatCounter, ha be van állítva) ----------
export function countEvent(name) {
  try {
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, event: true });
  } catch { /* nem elérhető */ }
}

// Betöltéskor (a main.js hívja, az eredeti sorrendben).
export function init() {
  if (CFG.GOATCOUNTER) {
    const s = document.createElement("script");
    s.async = true;
    // Rögzített változat ellenőrző összeggel: ha a fájl a szerveren megváltozna, a böngésző nem futtatja.
    s.src = "https://gc.zgo.at/count.v5.js";
    s.integrity = "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";
    s.crossOrigin = "anonymous";
    s.dataset.goatcounter = `https://${CFG.GOATCOUNTER}.goatcounter.com/count`;
    document.head.appendChild(s);
  }
}
