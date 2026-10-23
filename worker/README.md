# Jelentés → GitHub-hibajegy

A játék „Jelentés” gombja ide küldi a jelentést, ez a Worker pedig a te
fiókodnál nyit belőle hibajegyet (`jelentés` címkével). Ha egy dalnak már van
nyitott jegye, csak hozzászól. A GitHub-token titkos változóként a
Cloudflare-nél van, a játék oldalában nincs benne.

## Beállítás (egyszer)

1. **GitHub-token:** GitHub → Settings → Developer settings → Fine-grained tokens →
   *Generate new token*. Repository access: **csak `songdle-hu`**.
   Permissions → Repository → **Issues: Read and write**. Másold ki a tokent.
2. **Cloudflare (ingyenes fiók):** ebben a mappában:

   ```sh
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN   # ide illeszd be a tokent
   npx wrangler deploy
   ```

   A végén kiírja a címet, pl. `https://songdle-report.<neved>.workers.dev`.
3. Írd be ezt a címet a `js/config.js` → `REPORT_ENDPOINT` mezőbe, és töltsd fel.

## Megjegyzés

- Csak a `songdle.hu`, az `oliverszkcs.github.io` és a helyi hálózat felől fogad kérést.
- IP-nként percenként legfeljebb 5 jelentés (`wrangler.toml`).
- Ha a tokent le kell cserélni: `npx wrangler secret put GITHUB_TOKEN` újra.
