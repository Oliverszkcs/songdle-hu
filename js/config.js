// Songdle HU – szerkeszthető beállítások.
//
// CATEGORIES: a választható kategóriák (id → felirat). Új kategóriához adj
// hozzá egy sort, és címkézz fel vele előadókat a `tags` mezőben.
//
// ARTISTS: a dalkészlet forrása. Minden előadóhoz a Deezer "top" listáját
// töltjük le. Az `id` opcionális: ha megadod, pontosan azt az előadót
// használjuk; ha nincs, név alapján keresünk (pontos névegyezés, legtöbb
// rajongó). Kétértelmű neveknél (pl. Omega, Republic) érdemes ID-t megadni.
// ID-t így találsz: deezer.com → előadó oldala → az URL végén lévő szám
// (deezer.com/artist/<id>). Egy előadónak több címkéje is lehet.
// Az `only` opcionális: ha megadod, az előadótól csak ezek a dalok kerülnek be
// (cím alapján, zárójeles kiegészítések nélkül).
window.SONGDLE_CONFIG = {
  CATEGORIES: [
    { id: "all", label: "Mind" },
    { id: "pop", label: "Pop" },
    { id: "alter", label: "Alter" },
    { id: "rap", label: "Rap" },
    { id: "rock", label: "Rock" },
    { id: "trash", label: "Trash" },
    { id: "mulatos", label: "Mulatós" },
    { id: "retro", label: "Retró" },
    { id: "disco", label: "Diszkó" },
  ],

  ARTISTS: [
    // Pop
    { name: "Azahriah", id: 57553912, tags: ["pop", "rap"] },
    { name: "Follow The Flow", id: 11800683, tags: ["pop"] },
    { name: "ByeAlex", id: 4102741, tags: ["pop", "alter"] },
    { name: "ByeAlex és a Slepp", id: 8787040, tags: ["pop", "alter"] },
    { name: "Rúzsa Magdi", id: 292212, tags: ["pop"] },
    { name: "Manuel", id: 79455642, tags: ["pop", "rap"] },
    { name: "Bereczki Zoltán", id: 1189933, tags: ["pop"] },

    // Alter
    { name: "Quimby", id: 2177, tags: ["alter", "rock"] },
    { name: "Halott Pénz", id: 5380757, tags: ["alter", "pop"] },
    { name: "Wellhello", id: 1066094, tags: ["alter", "pop"] },
    { name: "Bagossy Brothers Company", id: 5552522, tags: ["alter"] },
    { name: "Carson Coma", id: 51645022, tags: ["alter"] },
    { name: "Elefánt", id: 7163076, tags: ["alter"] },
    { name: "Margaret Island", id: 7248342, tags: ["alter", "pop"] },
    { name: "Csaknekedkislány", id: 10923014, tags: ["alter"] },
    { name: "Kiscsillag", id: 8110, tags: ["alter"] },
    { name: "30Y", id: 4305, tags: ["alter", "rock"] },
    { name: "Platon Karataev", id: 11295390, tags: ["alter"] },
    { name: "Hiperkarma", id: 2178, tags: ["alter", "rock"] },
    { name: "Irie Maffia", id: 469406, tags: ["alter"] },
    { name: "Dzsúdló", id: 62356152, tags: ["alter", "pop"] },
    // Jelenleg nincs letölthető dala a Deezeren – ha megjelenik, magától bekerül.
    { name: "Children of Distortion", tags: ["alter"] },

    // Rap
    { name: "Majka", id: 281118, tags: ["rap", "pop"] },
    { name: "Punnany Massif", id: 4602807, tags: ["rap", "alter"] },
    { name: "Pogány Induló", id: 162188472, tags: ["rap"] },
    { name: "Krúbi", id: 13879063, tags: ["rap"] },
    { name: "Ganxsta Zolee és a Kartel", id: 8129, tags: ["rap"] },
    { name: "Dopeman", id: 10769, tags: ["rap"] },
    { name: "Bëlga", id: 101, tags: ["rap"] },
    { name: "Beton.Hofi", id: 80234972, tags: ["rap"] },

    // Trash
    { name: "Kkevin", id: 91432962, tags: ["trash"] },
    { name: "Bruno X Spacc", id: 98175162, tags: ["trash", "rap"] },
    { name: "L.L. Junior", id: 992816, tags: ["trash"] },
    { name: "T. Danny", id: 12834819, tags: ["trash", "rap"] },
    { name: "Desh", id: 1442145, tags: ["trash", "rap"] },
    { name: "LMEN PRALA", id: 14814623, tags: ["trash"] },
    { name: "Marics Peti", id: 171192717, tags: ["trash"] },
    { name: "BSW", id: 9812410, tags: ["trash"] },
    // A régi Beerseewalk névről csak a Picsa; a többi dal a BSW-től jön.
    { name: "Beerseewalk", id: 5400018, tags: ["trash", "rap"], only: ["Picsa"] },
    { name: "Fluor", id: 1569284, tags: ["trash", "rap"] },

    // Mulatós
    { name: "Kis Grófo", id: 5511228, tags: ["mulatos"] },
    { name: "Lagzi Lajcsi", id: 4928745, tags: ["mulatos"] },
    { name: "Dupla KáVé", id: 1292079, tags: ["mulatos"] },
    { name: "Nótár Mary", id: 3729861, tags: ["mulatos"] },
    { name: "Bunyós Pityu", id: 5123792, tags: ["mulatos"] },
    { name: "Bódi Guszti", id: 4821636, tags: ["mulatos"] },
    { name: "Sláger Tibó", id: 7076161, tags: ["mulatos"] },

    // Rock
    { name: "Tankcsapda", id: 86, tags: ["rock"] },
    { name: "Ossian", id: 7031, tags: ["rock"] },
    { name: "Kowalsky meg a Vega", id: 296839, tags: ["rock"] },

    // Retró
    { name: "Omega", id: 82058802, tags: ["retro", "rock"] },
    { name: "Republic", id: 2412, tags: ["retro", "rock"] },
    { name: "Locomotiv GT", id: 2988711, tags: ["retro", "rock"] },
    { name: "Illés", id: 263014, tags: ["retro"] },
    { name: "Bikini", id: 3033, tags: ["retro", "rock"] },
    { name: "Zorán", id: 293519, tags: ["retro"] },
    { name: "KFT", id: 67490, tags: ["retro"] },
    { name: "Fenyő Miklós", id: 1508963, tags: ["retro"] },
    { name: "Generál", id: 8805, tags: ["retro"] },
    { name: "Delhusa Gjon", id: 293520, tags: ["retro"] },

    // Diszkó
    { name: "Neoton Família", id: 458508, tags: ["disco", "retro"] },
    { name: "Hungária", id: 263008, tags: ["disco", "retro"] },
    { name: "Dolly Roll", id: 1515641, tags: ["disco", "retro"] },
    { name: "Szandi", id: 237312, tags: ["disco"] },
    { name: "Happy Gang", id: 1399928, tags: ["disco"] },
    { name: "Groovehouse", id: 115298, tags: ["disco"] },
    { name: "Splash", id: 66816, tags: ["disco"] },
    { name: "Kozmix", id: 454484, tags: ["disco"] },
    { name: "Unique", id: 13675, tags: ["disco", "pop"] },
  ],

  // Hány dalt kérjünk le előadónként (Deezer max. ~100).
  TRACKS_PER_ARTIST: 50,

  // Ilyen szavakat tartalmazó címeket kihagyunk a készletből.
  EXCLUDE_TITLE_WORDS: ["remix", "karaoke", "instrumental", "acapella", "a cappella", "sped up", "slowed", "extended mix"],

  // Meghallgatható hosszak másodpercben (próbálkozásonként).
  CLIP_LENGTHS: [1, 2, 4, 7, 11, 16],

  // Mennyi ideig használjuk egy előadó gyorsítótárazott dallistáját (óra).
  POOL_CACHE_HOURS: 24,

  // Mennyire részesítse előnyben a sorsolás a slágereket (Deezer-népszerűség
  // alapján, kategórián belül). 0 = minden dal egyforma eséllyel jön;
  // 2 = a legnépszerűbb negyed kapja a sorsolások kb. 45%-át; 5+ = szinte csak slágerek.
  POPULARITY_BIAS: 2,

  // Napi nehézségek: mindegyik külön napi dal. A `from`–`to` a népszerűségi
  // sáv (0 = legkevésbé ismert, 1 = legnagyobb sláger) az összes dal között;
  // a `multiplier` a pontszorzó.
  DAILY_DIFFICULTIES: [
    { id: "easy", label: "Könnyű", icon: "🟢", from: 0.85, to: 1, multiplier: 1 },
    { id: "medium", label: "Közepes", icon: "🟡", from: 0.55, to: 0.85, multiplier: 2 },
    { id: "hard", label: "Nehéz", icon: "🟠", from: 0.25, to: 0.55, multiplier: 3 },
    { id: "extreme", label: "Extrém", icon: "🔴", from: 0, to: 0.25, multiplier: 4 },
  ],

  // Kitiltott dalok: ezek senkinél nem jönnek ki. A játékban jelentett dalokat
  // a Dallista → „Jelentett” → „Lista másolása” gombbal lehet ide bemásolni.
  BLOCKED_TRACKS: [
    // { id: 123456, note: "Cím – Előadó: duplikált" },
  ],

  // Ennyi legutóbbi dalt nem sorsolunk újra.
  RECENT_MEMORY: 40,
};
