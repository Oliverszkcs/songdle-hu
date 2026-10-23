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
