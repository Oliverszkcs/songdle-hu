# Songdle HU

Magyar dalfelismerős játék (Heardle-stílusban), végtelen móddal és kategóriákkal.

- Tiszta HTML/CSS/JS, nincs build lépés, nincs backend – GitHub Pages-en fut.
- A dalok 30 mp-es előnézetei a [Deezer](https://www.deezer.com) nyilvános API-jából jönnek
  (JSONP-n keresztül, így nem kell CORS proxy). Hangfájlt nem tárolunk.
- Telepíthető (PWA): „Hozzáadás a kezdőképernyőhöz”.

## Játék

1 mp → 2 → 4 → 8 → 15 → 30 mp. Rossz tipp vagy kihagyás után hosszabb részletet hallasz.
6 próbálkozás után (vagy ha eltalálod) jön a megoldás borítóval, majd a **Következő dal**.
A sorozat és a statisztika a böngésző `localStorage`-ában tárolódik.

## Módok

- **Végtelen**: 5 dalos körök kategóriánként vagy évtizedenként (60-70-es évek … 2020-as évek).
  A **🔥 Nehéz** kapcsolóval a részlet a dal közepéről indul (5–15. mp), ×1,5 pontért.
- **Napi**: mindenkinek ugyanaz a dal, három nehézségi szinten; a statisztikában havi naptár mutatja a napokat.
- **Előadó**: napi előadó-találós. 4 rossz tipp után kérhető a „Hallgass bele” és a
  „💡 Egy dala” súgó (ez utóbbi −40 pont).
- **🎯 Kihívás**: egy befejezett kör megosztásakor a szövegben egy link van (`?k=…&p=…&n=…`),
  amivel a barátod ugyanazt az 5 dalt kapja, és látja, hány pontot kell megvernie.
- **⚔️ Párbaj**: két játékos élőben, ugyanazzal az 5 dallal. A kapcsolat [PeerJS](https://peerjs.com)-sel
  jön létre (a nyilvános PeerJS-közvetítő csak az összekötést végzi, utána a két böngésző közvetlenül,
  WebRTC-n beszél). Meghívó link: `?parbaj=KÓD`. Szigorú (pl. egyes mobil-) hálózatokon TURN-szerver
  nélkül előfordulhat, hogy nem jön létre a kapcsolat.

Offline: a legutóbbi 30 dal hangja a böngészőben marad (Cache Storage), így térerő nélkül is lehet játszani.

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
Az oldalletöltések mellett néhány esemény is beérkezik (pl. `battle-start`, `challenge-won`, `artist-title-hint`).

## Előadók és kategóriák szerkesztése

Minden a [`js/config.js`](js/config.js) fájlban van:

```js
CATEGORIES: [{ id: "rap", label: "Rap" }, ...],
ARTISTS: [{ name: "Majka", id: 281118, tags: ["rap", "pop"] }, ...],
```

- Az `id` a Deezer előadó-azonosító (deezer.com/artist/**281118**). Elhagyható – ekkor név alapján keresünk.
- A `tags` dönti el, melyik kategóriában szerepel az előadó. A „Mind” kategória mindenkit tartalmaz.
- Az előadók dallistája 24 órára gyorsítótárazódik a böngészőben.

## Helyi futtatás

Bármilyen statikus szerver jó, pl.:

```sh
npx serve .
```

(A service worker miatt `http://localhost`-on vagy HTTPS-en futtasd, ne `file://`-ként.)

Ha módosítasz az alkalmazás fájljain, emeld meg a `CACHE` verziót az `sw.js`-ben.
