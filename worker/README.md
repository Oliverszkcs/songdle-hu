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

## Deezer-közvetítő (GET /deezer/…)

A játék a Deezer API-t is ezen a Workeren keresztül éri el, sima JSON-ként (a Deezer nem küld
CORS-fejlécet, ezért a böngésző közvetlenül csak JSONP-vel, `<script>`-ként tudná betölteni,
és az bármilyen kódot futtathatna az oldalon).

- Csak a játék végpontjai mennek át: `/search/artist`, `/artist/{id}`, `/artist/{id}/top`, `/track/{id}`.
- A válaszokat a Cloudflare gyorsítótárazza (a dalokat 5 percig, az előadókat órákig); a Deezer hibáit nem.
- IP-nként legfeljebb 300 kérés percenként (`wrangler.toml` → `DEEZER_LIMITER`).
- Egy új játékos első napja kb. 100–150 kérés. Az ingyenes Cloudflare-keret napi 100 000 kérés
  (a jelentésekkel együtt). Ha elfogy, vagy a Worker nem elérhető, a játék magától visszavált
  a közvetlen JSONP-re (`js/deezer.js`), így nem áll le.
