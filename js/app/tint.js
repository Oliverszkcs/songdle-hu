import { DEFAULT_TINT } from "./core.js?v=60";

// ---------- Háttérszín a borítóból ----------
export function setTint(colors) {
  const root = document.documentElement.style;
  root.setProperty("--t1", colors[0]);
  root.setProperty("--t2", colors[1]);
  root.setProperty("--t3", colors[2]);
}

// A borító legélénkebb színeit keresi meg (a CDN engedi a CORS-t).
export function coverColors(img) {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max ? (max - min) / max : 0;
      px.push({ r, g, b, score: sat * 0.7 + (max / 255) * 0.3, hue: hueOf(r, g, b) });
    }
    px.sort((a, b) => b.score - a.score);
    const picks = [];
    for (const p of px) {
      if (picks.every((q) => Math.min(Math.abs(q.hue - p.hue), 360 - Math.abs(q.hue - p.hue)) > 40)) picks.push(p);
      if (picks.length === 3) break;
    }
    while (picks.length < 3) picks.push(px[picks.length * 7] || px[0]);
    return picks.map((p) => `rgb(${boost(p.r, p.g, p.b).join(",")})`);
  } catch { return DEFAULT_TINT; }
}
function hueOf(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), dd = max - min;
  if (!dd) return 0;
  const h = max === r ? ((g - b) / dd) % 6 : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return (h * 60 + 360) % 360;
}
function boost(r, g, b) {
  // élénkebb, világosabb változat a háttérhez
  const max = Math.max(r, g, b, 1), k = 230 / max;
  return [r, g, b].map((v) => Math.min(255, Math.round(v * k)));
}
