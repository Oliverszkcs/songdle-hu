# Songdle HU

Magyar dalfelismerős játék (Heardle-stílusban): végtelen mód kategóriákkal és évtizedekkel,
napi dal, napi előadó-találós, kihívás-link és élő párbaj akár 6 játékossal. Élesben: [songdle.hu](https://songdle.hu)

- Tiszta HTML/CSS/JS, nincs build lépés – GitHub Pages-en fut. Szerver csak a dal-jelentésekhez
  kell (egy Cloudflare Worker, lásd lent).
- A dalok 30 mp-es előnézetei a [Deezer](https://www.deezer.com) nyilvános API-jából jönnek
  (JSONP-n keresztül, így nem kell CORS proxy). Hangfájlt nem tárolunk.
- Telepíthető (PWA): „Hozzáadás a kezdőképernyőhöz”.

## Játék

1 mp → 2 → 4 → 8 → 15 → 30 mp. Rossz tipp vagy kihagyás után hosszabb részletet hallasz.
6 próbálkozás után (vagy ha eltalálod) jön a megoldás borítóval, majd a **Következő dal**.
Pont: 1. tippre 100, aztán 80, 60, 40, 25, 10, plusz sorozatbónusz (+5 dalonként, max. +50).

Ha eltaláltad a dalt, **🎯 bónuszkérdés** jön: a megjelenés éve vagy az album, 4 lehetőségből (+25 pont).
Amíg nem válaszolsz, a borító és az album rejtve marad.

A sorozat, a pontok és a statisztika a böngésző `localStorage`-ában tárolódnak.

## Módok

- **Végtelen**: 5 dalos körök kategóriánként vagy évtizedenként (60-70-es évek … 2020-as évek).
  A **🔥 Nehéz mód** kapcsolóval (a kategóriaválasztóban) a dal eleje visszafelé szól, hosszabb
  részletekkel (2 → 4 → 7 → 12 → 20 → 30 mp), ×1,5 pontért.
- **Napi**: mindenkinek ugyanaz a dal, négy nehézségi szinten (Könnyű ×1, Közepes ×2, Nehéz ×3,
  Extrém ×4); a statisztikában havi naptár mutatja a napokat.
- **Előadó**: napi előadó-találós, 8 mezővel (típus, nem, műfaj, státusz, születés/alakulás, debüt,
  Spotify-hallgatók, Eurovízió). 4 rossz tipp után kérhető a „Hallgass bele” és a „💡 Egy dala”
  súgó (ez utóbbi −40 pont). Ugyanaz az előadó 30 napon belül nem jön újra.
- **🎯 Kihívás**: egy befejezett kör megosztásakor a szövegben egy link van (`?k=…&p=…&n=…`),
  amivel a barátod ugyanazt az 5 dalt kapja, és látja, hány pontot kell megvernie. A link a
  bónusz nélküli pontot viszi (sorozatbónusz és nehéz-szorzó nélkül), mert a barát is csak annyit szerezhet.
- **⚔️ Párbaj**: 2–6 játékos élőben, ugyanazokkal a dalokkal. A szobát nyitó a váróteremben választ
  kategóriát (műfaj vagy évtized) és hosszt (5, 10 vagy 15 dal), és ő indítja a meccset. A következő
  dal akkor jön, ha mindenki végzett; a végén helyezések, a visszavágó pedig akkor indul, ha mindenki kéri.
  Meghívó link: `?parbaj=KÓD`.
  - A kapcsolat [PeerJS](https://peerjs.com)-sel jön létre: a nyilvános PeerJS-közvetítő csak az
    összekötést végzi, utána a böngészők közvetlenül, WebRTC-n beszélnek. A szobát nyitó gépe a központ,
    a többiek az ő gépén keresztül látják egymás állását.
  - Életjel 4 mp-enként: aki 16 mp-ig nem jelentkezik, kiesik (bezárta a lapot, elment a térerő).
  - Ha valaki újratölti az oldalt vagy átvált egy másik appra, ugyanabba a meccsbe tér vissza
    (a meccs állása a lap bezárásáig megmarad).
  - Szigorú (pl. egyes mobil-) hálózatokon TURN-szerver nélkül előfordulhat, hogy nem jön létre a kapcsolat.

Offline: a legutóbbi 30 dal hangja és az előadók dallistái a böngészőben maradnak (Cache Storage),
így térerő nélkül is lehet játszani.

## Eszközök (`tools/`)

```sh
node tools/build-years.mjs     # data/years.json – megjelenési évek az évtized-kategóriákhoz
node tools/check-foreign.mjs   # gyanús, nem a magyar előadótól származó dalok (→ BLOCKED_TRACKS)
node tools/check-foreign.mjs Desh Vini   # csak a megadott előadók
```

Új előadó felvétele után érdemes mindkettőt lefuttatni. A Deezer/MusicBrainz-válaszok a
`tools/.cache` mappában maradnak (nincs a repóban), így az újrafuttatás gyors.

## Látogatottság (GoatCounter)

Ingyenes, sütimentes számláló. Regisztrálj a [goatcounter.com](https://www.goatcounter.com)-on
(pl. `songdlehu` kóddal), és írd be a kódot a `js/config.js`-be: `GOATCOUNTER: "songdlehu"`.
Az oldalletöltések mellett néhány esemény is beérkezik (pl. `battle-start`, `challenge-won`, `artist-title-hint`, `bonus-right`).

## Dal jelentése

A megoldásnál a **Jelentés** gombbal egy dal kizárható (nálad többé nem jön ki). A jelentés egy
Cloudflare Workerhez megy ([`worker/`](worker/README.md)), az pedig GitHub-hibajegyet nyit róla. A Worker
a dal adatait a Deezertől kéri le, nem a böngészőtől fogadja el, így a hibajegybe nem kerülhet idegen szöveg.

## Előadók és kategóriák szerkesztése

Minden a [`js/config.js`](js/config.js) fájlban van:

```js
CATEGORIES: [{ id: "rap", label: "Rap" }, ...],
ARTISTS: [{ name: "Majka", id: 281118, tags: ["rap", "pop"] }, ...],
```

- Az `id` a Deezer előadó-azonosító (deezer.com/artist/**281118**). Elhagyható – ekkor név alapján keresünk.
- A `tags` dönti el, melyik kategóriában szerepel az előadó. A „Mind” kategória mindenkit tartalmaz.
- Az előadók dallistája 24 órára gyorsítótárazódik a böngészőben.
- Az `ARTIST_INFO` adja a napi előadó-találós adatait. Akinek nincs itt sora, az a találósban
  nem szerepel (sem megfejtésként, sem tippként).

## Helyi futtatás

Bármilyen statikus szerver jó, pl.:

```sh
npx serve .
```

(A service worker miatt `http://localhost`-on vagy HTTPS-en futtasd, ne `file://`-ként.)

Ha módosítasz az alkalmazás fájljain, emeld meg a `CACHE` verziót az `sw.js`-ben.

## Licenc

A kód [MIT licenc](LICENSE) alatt szabadon felhasználható. A dalok, borítók és előnézetek a
jogtulajdonosoké; azokat a Deezer szolgáltatja, a repóban nincsenek benne.
