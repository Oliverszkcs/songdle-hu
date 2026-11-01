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

- Csak a `songdle.hu`, az `oliverszkcs.github.io` és a saját gép (`localhost`) felől fogad kérést. Telefonos
  teszthez a helyi hálózatról: `npx wrangler deploy --var DEV_LAN:1`, utána sima `npx wrangler deploy`.
- IP-nként percenként legfeljebb 5 jelentés (`wrangler.toml`).
- Ha a tokent le kell cserélni: `npx wrangler secret put GITHUB_TOKEN` újra.

## Deezer

A Worker korábban a Deezer API-t is közvetítette (`GET /deezer/…`). 2026 novembere óta a Deezer
(Akamai) minden Cloudflare-címről jövő kérést „Access Denied”-del utasít el, ezért ez megszűnt: a játék
közvetlenül, a játékos böngészőjéből kér (JSONP, `js/deezer.js`).

A jelentésnél a Worker még megpróbálja a Deezertől lekérni a dal címét. Ha nem megy, a játéktól kapott
címet és előadót használja, szigorúan szűrve (betűk, számok és néhány írásjel; link, @említés és
Markdown nem kerülhet a jegybe), és a jegyben jelzi, hogy ezt a Deezer-linken érdemes ellenőrizni.
