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
// (cím alapján, zárójeles kiegészítések nélkül). A `top` opcionális: csak az
// előadó ennyi legnépszerűbb dala kerül be (csak a slágerek).
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
    { name: "Filo", id: 84045292, tags: ["pop", "rap"] },

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
    { name: "Krúbi", id: 13879063, tags: ["rap", "trash"], top: 15 },
    { name: "Ganxsta Zolee és a Kartel", id: 8129, tags: ["rap"] },
    { name: "Dopeman", id: 10769, tags: ["rap"] },
    { name: "Bëlga", id: 101, tags: ["rap"] },
    { name: "Beton.Hofi", id: 80234972, tags: ["rap"] },

    // Trash
    { name: "Kkevin", id: 91432962, tags: ["trash", "rap"] },
    { name: "Bruno X Spacc", id: 98175162, tags: ["trash", "rap"] },
    { name: "L.L. Junior", id: 992816, tags: ["trash", "pop"] },
    { name: "T. Danny", id: 12834819, tags: ["trash", "rap"] },
    { name: "Desh", id: 1442145, tags: ["trash", "rap"] },
    { name: "LMEN PRALA", id: 14814623, tags: ["trash", "rap"] },
    { name: "Marics Peti", id: 171192717, tags: ["trash", "pop"] },
    { name: "BSW", id: 9812410, tags: ["trash", "rap"] },
    // A régi Beerseewalk névről csak a Picsa; a többi dal a BSW-től jön.
    { name: "Beerseewalk", id: 5400018, tags: ["trash", "rap"], only: ["Picsa"] },
    { name: "Fluor", id: 1569284, tags: ["trash", "rap"], top: 5 },
    { name: "Belaño", id: 50033762, tags: ["trash", "rap"] },
    { name: "Mirror Glimpse", id: 127032772, tags: ["trash", "rap"], top: 8 },
    { name: "Vini", id: 80514092, tags: ["trash", "rap"] },

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
    { name: "Edda Művek", id: 65472, tags: ["retro", "rock"] },
    { name: "P. Mobil", id: 6446998, tags: ["retro", "rock"] },
    { name: "Piramis", id: 4082, tags: ["retro", "rock"] },
    { name: "Korál", id: 17279, tags: ["retro", "rock"] },
    { name: "Beatrice", id: 198295, tags: ["retro", "rock"] },
    { name: "Karthago", id: 132770, tags: ["retro", "rock"] },
    { name: "Bergendy", id: 263019, tags: ["retro"] },
    { name: "Apostol", id: 1514245, tags: ["retro"] },
    { name: "Demjén Ferenc", id: 957121, tags: ["retro", "pop"] },
    { name: "Koncz Zsuzsa", id: 4731301, tags: ["retro"] },
    { name: "Kovács Kati", id: 4520558, tags: ["retro"] },
    { name: "Cserháti Zsuzsa", id: 6540, tags: ["retro", "disco"] },
    { name: "Máté Péter", id: 1511773, tags: ["retro"] },
    { name: "Szécsi Pál", id: 1511774, tags: ["retro"] },
    { name: "Szűcs Judith", id: 64824, tags: ["retro", "disco"] },
    { name: "Katona Klári", id: 194228, tags: ["retro"] },

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

  // Hány dalt kérjünk le előadónként (a Deezer top listája legfeljebb 100).
  TRACKS_PER_ARTIST: 100,
  // Ennyi legnépszerűbb dal marad előadónként (a duplikátumok kiszűrése után),
  // hogy az előadó nevét beírva az összes dala elférjen a javaslatok között.
  MAX_SONGS_PER_ARTIST: 35,

  // Ilyen szavakat tartalmazó címeket kihagyunk a készletből.
  EXCLUDE_TITLE_WORDS: ["remix", "karaoke", "instrumental", "acapella", "a cappella", "sped up", "slowed", "extended mix"],

  // Meghallgatható hosszak másodpercben (próbálkozásonként).
  CLIP_LENGTHS: [1, 2, 4, 8, 15, 30],

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

  // A jelentéseket ide küldjük (Cloudflare Worker, worker/README.md); az GitHub-hibajegyet nyit.
  // Üresen hagyva a jelentés csak a játékos eszközén marad.
  REPORT_ENDPOINT: "",

  // Kitiltott dalok: ezek senkinél nem jönnek ki. A játékban jelentett dalokat
  // a Dallista → „Jelentett” → „Lista másolása” gombbal lehet ide bemásolni.
  BLOCKED_TRACKS: [
    // { id: 123456, note: "Cím – Előadó: duplikált" },
    // A Deezer néhány előadónál egy azonos nevű külföldi előadó dalait is ugyanarra az oldalra teszi:
    { id: 3856813311, note: "Pass the Plate – nem a magyar Desh (Deezer összevont oldal, kiadó: Chillhop Music)" },
    { id: 2931361521, note: "Wherever You Are – nem a magyar Desh (Deezer összevont oldal, kiadó: Chillhop Music)" },
    { id: 3207292351, note: "Simmer – nem a magyar Desh (Deezer összevont oldal, kiadó: Chillhop Music)" },
    { id: 3332864101, note: "Pintxos – nem a magyar Desh (Deezer összevont oldal, kiadó: Lofi Jazz Records)" },
    { id: 4298088992, note: "Freaky Friday – nem a magyar Desh (Deezer összevont oldal, kiadó: Lofi Jazz Records)" },
    { id: 2054540477, note: "Sunbeams – nem a magyar Desh (Deezer összevont oldal, kiadó: Hip Dozer)" },
    { id: 3001351431, note: "Flashbacks – nem a magyar Desh (Deezer összevont oldal, kiadó: Hip Dozer)" },
    { id: 2064360047, note: "Do You – nem a magyar Desh (Deezer összevont oldal, kiadó: Steezyasfuck)" },
    { id: 966432622, note: "Rapids – nem a magyar Desh (Deezer összevont oldal, kiadó: Sonder House)" },
    { id: 2690433412, note: "On The Low – nem a magyar Desh (Deezer összevont oldal, kiadó: PLYGRND)" },
    { id: 1424608612, note: "Painted the Night – nem a magyar Desh (Deezer összevont oldal, kiadó: Retro Jungle)" },
    { id: 1567438842, note: "Jag Väljer Dig – nem a magyar Generál (Deezer összevont oldal, kiadó: GENERAL RECORDS)" },
    { id: 3722944292, note: "Lé pi bon – nem a magyar Generál (Deezer összevont oldal, kiadó: Dofé)" },
    { id: 2371367675, note: "Kel zom ou lé ? – nem a magyar Generál (Deezer összevont oldal, kiadó: Fredow intel)" },
    { id: 4116459481, note: "Take Me Up – nem a magyar Unique (Deezer összevont oldal, kiadó: Classified Records)" },
    { id: 3500248001, note: "Turn It Up – nem a magyar Unique (Deezer összevont oldal, kiadó: Classified Records)" },
    { id: 4329668292, note: "Sun In My Eyes – nem a magyar Unique (Deezer összevont oldal, kiadó: Spoontech Records)" },
    { id: 67564105, note: "What I Got Is What You Need – nem a magyar Unique (Deezer összevont oldal, kiadó: Unidisc)" },
    { id: 983829632, note: "Eso No Es un Beso – nem a magyar Fluor (Deezer összevont oldal, kiadó: Fluor)" },
    { id: 827642422, note: "Tan Digital – nem a magyar Fluor (Deezer összevont oldal, kiadó: Fluor)" },
    { id: 3553557211, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3553557201, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3553557281, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999631, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999641, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999691, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999681, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999711, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999621, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999651, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999611, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3531999671, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3463163381, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 3463163361, note: "Dreamy Records lo-fi – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4236714762, note: "Tricky (Avenue Bandz Conglomerate) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4236714842, note: "Tricky (Avenue Bandz Conglomerate) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4236714792, note: "Tricky (Avenue Bandz Conglomerate) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4236714772, note: "Tricky (Avenue Bandz Conglomerate) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4236714782, note: "Tricky (Avenue Bandz Conglomerate) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4236714892, note: "Tricky (Avenue Bandz Conglomerate) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 74712653, note: "Feel The Wife Vibe (BEAT Music Fund) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4058590471, note: "Twizy/Ari (BaldRich, FDL) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 4070070251, note: "Twizy/Ari (BaldRich, FDL) – nem a magyar Vini (Deezer összevont oldal)" },
    { id: 2823601622, note: "Twizy/Ari (BaldRich, FDL) – nem a magyar Vini (Deezer összevont oldal)" },
  ],

  // Ennyi legutóbbi dalt nem sorsolunk újra.
  RECENT_MEMORY: 40,
  // Ennyi körig nem jön újra ugyanaz az előadó (végtelen módban).
  ARTIST_GAP: 3,

  // Napi előadó-találós (a Napi mód „Előadó” lapja). Előadónként:
  //   type:   "solo" (szóló), "duo" (duó) vagy "band" (zenekar)
  //   gender: "m" (férfi), "f" (nő) vagy "mixed" (vegyes)
  //   year:   születési év (szólónál) vagy alakulás éve (duónál, zenekarnál)
  //   listeners: Spotify havi hallgatók (pillanatkép: 2026. október 23.)
  //   debut:  az első kiadvány éve (MusicBrainz, Deezer, magyar Wikipédia diszkográfia)
  //   status: "active", "split" (feloszlott) vagy "dead" (elhunyt) – a Wikipédia „aktív évek” alapján
  //   esc:    "esc" (indult az Eurovízión) vagy "adal" (csak az A Dalban); ha nincs, nem indult
  // A műfaj az előadó tags mezőjéből jön. Aki nincs itt, az nem lehet napi előadó.
  // Forrás: Wikidata / magyar Wikipédia / MusicBrainz; a Follow The Flow, Elefánt, Bruno X Spacc
  // és Vini éve az első Deezer-megjelenés alapján becsült.
  ARTIST_INFO: {
    "Azahriah":                  { type: "solo", gender: "m", year: 2002, listeners: 680526, debut: 2019, status: "active" },
    "Follow The Flow":           { type: "band", gender: "m", year: 2017, listeners: 266745, debut: 2017, status: "active" },
    "ByeAlex":                   { type: "solo", gender: "m", year: 1984, listeners: 63869, debut: 2012, status: "active", esc: "esc" },
    "Rúzsa Magdi":               { type: "solo", gender: "f", year: 1985, listeners: 14569, debut: 2006, status: "active", esc: "esc" },
    "Manuel":                    { type: "solo", gender: "m", year: 2000, listeners: 387441, debut: 2019, status: "active" },
    "Bereczki Zoltán":           { type: "solo", gender: "m", year: 1976, listeners: 243886, debut: 2001, status: "active" },
    "Quimby":                    { type: "band", gender: "m", year: 1991, listeners: 137018, debut: 1993, status: "active" },
    "Halott Pénz":               { type: "band", gender: "m", year: 2004, listeners: 388494, debut: 2009, status: "active" },
    "Wellhello":                 { type: "duo", gender: "m", year: 2014, listeners: 294679, debut: 2014, status: "active" },
    "Bagossy Brothers Company":  { type: "band", gender: "m", year: 2013, listeners: 229303, debut: 2013, status: "active" },
    "Carson Coma":               { type: "band", gender: "m", year: 2018, listeners: 242596, debut: 2019, status: "active" },
    "Elefánt":                   { type: "band", gender: "m", year: 2012, listeners: 111394, debut: 2012, status: "active" },
    "Margaret Island":           { type: "band", gender: "mixed", year: 2013, listeners: 64349, debut: 2014, status: "split" },
    "Csaknekedkislány":          { type: "band", gender: "m", year: 2011, listeners: 60862, debut: 2015, status: "active" },
    "Kiscsillag":                { type: "band", gender: "m", year: 2005, listeners: 30268, debut: 2006, status: "active" },
    "30Y":                       { type: "band", gender: "m", year: 2000, listeners: 90254, debut: 2001, status: "active" },
    "Platon Karataev":           { type: "band", gender: "m", year: 2016, listeners: 42414, debut: 2016, status: "active" },
    "Hiperkarma":                { type: "band", gender: "mixed", year: 2000, listeners: 91317, debut: 2000, status: "active" },
    "Irie Maffia":               { type: "band", gender: "mixed", year: 2004, listeners: 120567, debut: 2006, status: "active" },
    "Dzsúdló":                   { type: "solo", gender: "m", year: 1998, listeners: 392519, debut: 2019, status: "active" },
    "Majka":                     { type: "solo", gender: "m", year: 1979, listeners: 309048, debut: 2003, status: "active" },
    "Punnany Massif":            { type: "band", gender: "m", year: 2003, listeners: 163443, debut: 2005, status: "active" },
    "Pogány Induló":             { type: "solo", gender: "m", year: 2005, listeners: 435121, debut: 2022, status: "active" },
    "Krúbi":                     { type: "solo", gender: "m", year: 1994, listeners: 195196, debut: 2018, status: "active" },
    "Ganxsta Zolee és a Kartel": { type: "band", gender: "m", year: 1995, listeners: 28994, debut: 1995, status: "active" },
    "Dopeman":                   { type: "solo", gender: "m", year: 1974, listeners: 219419, debut: 1997, status: "active", esc: "adal" },
    "Bëlga":                     { type: "band", gender: "m", year: 1998, listeners: 95910, debut: 1999, status: "active" },
    "Beton.Hofi":                { type: "solo", gender: "m", year: 1991, listeners: 518491, debut: 2020, status: "active" },
    "Kkevin":                    { type: "solo", gender: "m", year: 2000, listeners: 642932, debut: 2020, status: "active" },
    "Bruno X Spacc":             { type: "duo", gender: "m", year: 2020, listeners: 604944, debut: 2020, status: "active" },
    "L.L. Junior":               { type: "solo", gender: "m", year: 1981, listeners: 365256, debut: 2002, status: "active" },
    "T. Danny":                  { type: "solo", gender: "m", year: 1998, listeners: 501554, debut: 2017, status: "active" },
    "Desh":                      { type: "solo", gender: "m", year: 2001, listeners: 790384, debut: 2019, status: "active" },
    "Marics Peti":               { type: "solo", gender: "m", year: 1996, listeners: 481081, debut: 2021, status: "active" },
    "Fluor":                     { type: "solo", gender: "m", year: 1987, listeners: 146990, debut: 2004, status: "active" },
    "Mirror Glimpse":            { type: "duo", gender: "m", year: 2021, listeners: 124617, debut: 2021, status: "active" },
    "Vini":                      { type: "solo", gender: "m", year: 2003, listeners: 573433, debut: 2021, status: "active" },
    "Kis Grófo":                 { type: "solo", gender: "m", year: 1993, listeners: 101902, debut: 2006, status: "active" },
    "Lagzi Lajcsi":              { type: "solo", gender: "m", year: 1961, listeners: 29936, debut: 1987, status: "active" },
    "Dupla KáVé":                { type: "duo", gender: "m", year: 1998, listeners: 23520, debut: 1999, status: "active" },
    "Nótár Mary":                { type: "solo", gender: "f", year: 1985, listeners: 105671, debut: 2004, status: "active" },
    "Bunyós Pityu":              { type: "solo", gender: "m", year: 1964, listeners: 14701, debut: 2006, status: "active" },
    "Bódi Guszti":               { type: "solo", gender: "m", year: 1958, listeners: 65452, debut: 1990, status: "active" },
    "Sláger Tibó":               { type: "solo", gender: "m", year: 1967, listeners: 921, debut: 2009, status: "active" },
    "Tankcsapda":                { type: "band", gender: "m", year: 1989, listeners: 184694, debut: 1989, status: "active" },
    "Ossian":                    { type: "band", gender: "m", year: 1986, listeners: 39178, debut: 1988, status: "active" },
    "Kowalsky meg a Vega":       { type: "band", gender: "m", year: 1999, listeners: 162827, debut: 2003, status: "active" },
    "Omega":                     { type: "band", gender: "m", year: 1962, listeners: 237819, debut: 1968, status: "split" },
    "Republic":                  { type: "band", gender: "m", year: 1990, listeners: 221225, debut: 1990, status: "active" },
    "Locomotiv GT":              { type: "band", gender: "m", year: 1971, listeners: 71186, debut: 1971, status: "split" },
    "Illés":                     { type: "band", gender: "m", year: 1957, listeners: 4885, debut: 1967, status: "split" },
    "Bikini":                    { type: "band", gender: "m", year: 1982, listeners: 111752, debut: 1983, status: "active" },
    "Zorán":                     { type: "solo", gender: "m", year: 1942, listeners: 59414, debut: 1977, status: "active" },
    "KFT":                       { type: "band", gender: "m", year: 1981, listeners: 54454, debut: 1981, status: "active" },
    "Fenyő Miklós":              { type: "solo", gender: "m", year: 1947, listeners: 41457, debut: 1983, status: "dead" },
    "Generál":                   { type: "band", gender: "m", year: 1971, listeners: 7135, debut: 1973, status: "active" },
    "Delhusa Gjon":              { type: "solo", gender: "m", year: 1953, listeners: 7814, debut: 1976, status: "active", esc: "esc" },
    "Edda Művek":                { type: "band", gender: "m", year: 1974, listeners: 122877, debut: 1980, status: "active" },
    "P. Mobil":                  { type: "band", gender: "m", year: 1973, listeners: 64585, debut: 1978, status: "active" },
    "Piramis":                   { type: "band", gender: "m", year: 1974, listeners: 36608, debut: 1977, status: "split" },
    "Korál":                     { type: "band", gender: "m", year: 1974, listeners: 39309, debut: 1980, status: "split" },
    "Beatrice":                  { type: "band", gender: "m", year: 1969, listeners: 286745, debut: 1979, status: "active" },
    "Karthago":                  { type: "band", gender: "m", year: 1979, listeners: 23840, debut: 1981, status: "active" },
    "Bergendy":                  { type: "band", gender: "m", year: 1958, listeners: 19153, debut: 1971, status: "split" },
    "Apostol":                   { type: "band", gender: "m", year: 1970, listeners: 27323, debut: 1978, status: "active" },
    "Demjén Ferenc":             { type: "solo", gender: "m", year: 1946, listeners: 67330, debut: 1977, status: "active" },
    "Koncz Zsuzsa":              { type: "solo", gender: "f", year: 1946, listeners: 35626, debut: 1962, status: "active" },
    "Kovács Kati":               { type: "solo", gender: "f", year: 1944, listeners: 28819, debut: 1966, status: "active" },
    "Cserháti Zsuzsa":           { type: "solo", gender: "f", year: 1948, listeners: 41894, debut: 1980, status: "dead" },
    "Máté Péter":                { type: "solo", gender: "m", year: 1947, listeners: 80810, debut: 1978, status: "dead" },
    "Szécsi Pál":                { type: "solo", gender: "m", year: 1944, listeners: 27779, debut: 1967, status: "dead" },
    "Szűcs Judith":              { type: "solo", gender: "f", year: 1953, listeners: 3165, debut: 1978, status: "active" },
    "Katona Klári":              { type: "solo", gender: "f", year: 1953, listeners: 19203, debut: 1972, status: "active" },
    "Neoton Família":            { type: "band", gender: "mixed", year: 1965, listeners: 95920, debut: 1969, status: "split" },
    "Hungária":                  { type: "band", gender: "mixed", year: 1967, listeners: 50123, debut: 1967, status: "split" },
    "Dolly Roll":                { type: "band", gender: "mixed", year: 1983, listeners: 32407, debut: 1983, status: "split" },
    "Szandi":                    { type: "solo", gender: "f", year: 1976, listeners: 15294, debut: 1991, status: "active" },
    "Happy Gang":                { type: "band", gender: "m", year: 1993, listeners: 26443, debut: 1994, status: "active" },
    "Groovehouse":               { type: "duo", gender: "mixed", year: 1997, listeners: 108245, debut: 1999, status: "active" },
    "Splash":                    { type: "duo", gender: "mixed", year: 1998, listeners: 144755, debut: 1999, status: "active" },
    "Kozmix":                    { type: "duo", gender: "mixed", year: 1995, listeners: 43537, debut: 1995, status: "active" },
    "Unique":                    { type: "band", gender: "mixed", year: 1995, listeners: 21749, debut: 2001, status: "active" },
  },
};
