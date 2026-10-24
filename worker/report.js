// Cloudflare Worker: a játékból érkező dal-jelentésekből GitHub-hibajegyet nyit a
// tulajdonos nevében. A token csak itt, titkos változóként (GITHUB_TOKEN) van meg,
// a játék oldalába soha nem kerül bele.
//
// Beállítás: lásd worker/README.md.

const ALLOWED_ORIGINS = ["https://songdle.hu", "https://www.songdle.hu", "https://oliverszkcs.github.io"];
// Helyi teszteléshez (npx serve . -l 3000, telefonról a helyi hálózaton is).
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/;

const REASONS = ["Rossz kategória", "Duplikált / élő / remix", "Rossz az eleje", "Nem ez a dal szól", "Nem magyar dal", "Egyéb"];

const clip = (s, n) => String(s ?? "").replace(/[\r\n]+/g, " ").slice(0, n);
// A játékmód leírása az egyetlen szabad szöveg a játékból: csak betűk, számok és néhány jel
// maradhat, így nem kerülhet a hibajegybe link, @említés vagy Markdown.
const plain = (s, n) => clip(s, n).replace(/[^\p{L}\p{N} ·,.()–-]/gu, "").trim();

// A dal adatait a Deezertől kérjük le, nem a kérésből vesszük: így a jegybe csak valódi
// dalcím kerülhet, akármit küld is valaki a végpontra.
async function deezerTrack(id) {
  const r = await fetch(`https://api.deezer.com/track/${id}`);
  if (!r.ok) return null;
  const t = await r.json();
  if (!t || t.error || !t.title) return null;
  const names = [...new Set([t.artist && t.artist.name, ...(t.contributors || []).map((c) => c.name)].filter(Boolean))];
  return { title: t.title, artist: names.join(", "), album: t.album ? t.album.title : "" };
}
// Markdownban ne legyen aktív link vagy említés (pl. egy „@” a dalcímben).
const md = (s) => s.replace(/[\\`*_[\]<>|#]/g, "\\$&").replace(/@/g, "@\u200b").replace(/:\/\//g, ":\u200b//");

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, { error: "POST kell" });
    if (!allowed) return reply(403, { error: "Ismeretlen oldal" });

    // Opcionális korlát: IP-nként percenként néhány jelentés (wrangler.toml → [[ratelimits]]).
    if (env.LIMITER) {
      const ip = req.headers.get("CF-Connecting-IP") || "?";
      const { success } = await env.LIMITER.limit({ key: ip });
      if (!success) return reply(429, { error: "Túl sok jelentés, próbáld később" });
    }

    let d;
    try { d = await req.json(); } catch { return reply(400, { error: "Hibás kérés" }); }
    const id = Number(d.id);
    if (!Number.isInteger(id) || id <= 0 || id > 1e13) return reply(400, { error: "Hibás dal" });
    if (!REASONS.includes(d.reason)) return reply(400, { error: "Hibás ok" });

    const track = await deezerTrack(id).catch(() => null);
    if (!track) return reply(400, { error: "Ismeretlen dal" });
    const title = md(clip(track.title, 150)), artist = md(clip(track.artist, 150)), album = md(clip(track.album, 150));
    const mode = plain(d.mode, 80);
    const label = `${title} – ${artist}`;
    const tag = `[${id}]`;
    const gh = (path, init = {}) => fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "songdle-hu-report",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });

    // Ha a dalnak már van nyitott jegye, csak hozzászólunk, nem nyitunk újat.
    const q = encodeURIComponent(`repo:${env.GITHUB_REPO} is:issue is:open in:title "${tag}"`);
    const found = await gh(`/search/issues?q=${q}&per_page=1`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const existing = found && found.items && found.items[0];
    if (existing) {
      const r = await gh(`/repos/${env.GITHUB_REPO}/issues/${existing.number}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: `Újabb jelentés: **${d.reason}** (${mode})` }),
      });
      return r.ok ? reply(200, { ok: true, issue: existing.number, duplicate: true }) : reply(502, { error: "GitHub hiba" });
    }

    // A kódblokkban nincs Markdown, ott a nyers név kell (csak a kódblokkot lezáró ` nem maradhat).
    const note = `${track.title} – ${track.artist}: ${d.reason}`.replace(/`/g, "'");
    const body = [
      `**Dal:** ${label}`,
      `**Album:** ${album || "–"}`,
      `**Deezer:** https://www.deezer.com/track/${id}`,
      `**Ok:** ${d.reason}`,
      `**Mód:** ${mode || "–"}`,
      "",
      "Sor a `BLOCKED_TRACKS` listába (js/config.js):",
      "```js",
      `    { id: ${id}, note: ${JSON.stringify(note)} },`,
      "```",
    ].join("\n");
    const r = await gh(`/repos/${env.GITHUB_REPO}/issues`, {
      method: "POST",
      body: JSON.stringify({ title: `Jelentés: ${clip(track.title, 150)} – ${clip(track.artist, 150)} (${d.reason}) ${tag}`, body, labels: ["jelentés"] }),
    });
    if (!r.ok) return reply(502, { error: "GitHub hiba" });
    const issue = await r.json();
    return reply(201, { ok: true, issue: issue.number });
  },
};
