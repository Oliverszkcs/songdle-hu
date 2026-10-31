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
// A `tagOnly` opcionális: címkénként megadhatod, hogy abban a kategóriában az előadónak csak
// ezek a dalai szerepeljenek (pl. vegyes életműnél a Diszkóban csak a diszkóslágerek); a többi
// címkéjében és a „Mind” kategóriában minden dala marad. Pl. tagOnly: { disco: ["Santa Maria"] }.
window.SONGDLE_CONFIG = {
  CATEGORIES: [
    { id: "all", label: "Mind", icon: "🎵" },
    { id: "pop", label: "Pop", icon: "🎤" },
    { id: "alter", label: "Alter", icon: "🎸" },
    { id: "rap", label: "Rap", icon: "🎙️" },
    { id: "rock", label: "Rock", icon: "🤘" },
    { id: "trash", label: "Trash", icon: "🤪" },
    { id: "mulatos", label: "Mulatós", icon: "🪗" },
    { id: "retro", label: "Retró", icon: "📻" },
    { id: "disco", label: "Diszkó", icon: "🪩" },
  ],

  // Évtized-kategóriák (a végtelen mód chipjei között). A dalok évét a
  // data/years.json adja (tools/build-years.mjs készíti); év nélküli dal kimarad.
  DECADES: [
    { id: "d1960", label: "60-70-es évek", short: "60–70-es", from: 1900, to: 1979 },
    { id: "d1980", label: "80-as évek", short: "80-as", from: 1980, to: 1989 },
    { id: "d1990", label: "90-es évek", short: "90-es", from: 1990, to: 1999 },
    { id: "d2000", label: "2000-es évek", short: "2000-es", from: 2000, to: 2009 },
    { id: "d2010", label: "2010-es évek", short: "2010-es", from: 2010, to: 2019 },
    { id: "d2020", label: "2020-as évek", short: "2020-as", from: 2020, to: 2099 },
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
    { name: "Zséda", id: 1481181, tags: ["pop"] },
    { name: "Tóth Vera", id: 281048, tags: ["pop"] },
    { name: "Molnár Ferenc Caramel", id: 676029, tags: ["pop"] },
    { name: "Tóth Gabi", id: 7780, tags: ["pop"] },
    { name: "Rácz Gergő", id: 266125, tags: ["pop"] },
    { name: "Pápai Joci", id: 281597, tags: ["pop"] },
    { name: "Radics Gigi", id: 1678972, tags: ["pop"] },
    { name: "Wolf Kati", id: 5415292, tags: ["pop"] },

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
    { name: "MC Hawer és Tekknő", id: 7917112, tags: ["mulatos"] },
    { name: "Romantic", id: 288469, tags: ["mulatos"] },
    { name: "Bódi Csabi", id: 5511227, tags: ["mulatos"] },

    // Rock
    { name: "Tankcsapda", id: 86, tags: ["rock"] },
    { name: "Ossian", id: 7031, tags: ["rock"] },
    { name: "Kowalsky meg a Vega", id: 296839, tags: ["rock"] },

    // Retró
    { name: "Omega", id: 82058802, tags: ["retro", "rock"] },
    { name: "Republic", id: 2412, tags: ["retro", "rock"] },
    { name: "LGT", aka: ["Locomotiv GT"], id: 2988711, tags: ["retro", "rock"] },
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
    // A Diszkóban csak a diszkós dala; a táncdalok és a balladák csak a Retróban.
    { name: "Cserháti Zsuzsa", id: 6540, tags: ["retro", "disco"], tagOnly: { disco: ["Száguldás, Porsche, szerelem"] } },
    { name: "Máté Péter", id: 1511773, tags: ["retro"] },
    { name: "Szécsi Pál", id: 1511774, tags: ["retro"] },
    // A Deezeren csak az 1991 utáni felvételei vannak meg; a Diszkóba a tempós dance-dalok kerülnek.
    { name: "Szűcs Judith", id: 64824, tags: ["retro", "disco"], tagOnly: { disco: [
      "Holnap, holnapután", "Forró nyári éjjel", "Eljön a nap", "Tengertánc", "Mondd, mit tegyek, hogy érezd",
      "Legyen ez a tűz", "Good Bye My Love",
    ] } },
    { name: "Katona Klári", id: 194228, tags: ["retro"] },

    // A Hungária és a Dolly Roll rock and roll (revival), nem diszkó.
    { name: "Hungária", id: 263008, tags: ["retro"] },
    { name: "Dolly Roll", id: 1515641, tags: ["retro"] },

    // Diszkó: a 70-80-as évek magyar diszkója és a 90-es évek dance/eurodance slágerei.
    // A Neoton balladái (Sorsszimfónia, Vadvirág, Búcsú…) és az 1987 utáni dalai csak a Retróban.
    { name: "Neoton Família", id: 458508, tags: ["disco", "retro"], tagOnly: { disco: [
      "Kétszázhúsz felett", "Don Quijote", "Santa Maria", "Nyár van", "Sandokan", "Holnap hajnalig",
      "I Love You", "Kalandra, srácok", "Jöjjön a nyár!", "Pago Pago", "Yo-Yo", "Hétvégi motorozás", "Caligula",
      "Lobo, az idegen", "Hazudós", "Marathon", "Sámson és Delila", "Ha szombat este táncol", "Monte Carlo",
      "Diszkókece", "Mamma mia", "Margaréta", "Kell, hogy várj!", "Egy húszas elég", "Párizsi lány",
    ] } },
    // A 90-es évek eleji tini- és dance-slágerei a Diszkóban; a retró feldolgozásai és a gyerekdalai csak a Popban.
    { name: "Szandi", id: 237312, tags: ["pop", "disco"], tagOnly: { disco: [
      "Tinédzser L'amour", "Szerelmes szívek", "Kislány, kezeket fel", "Nyugi doki", "Vár a tánc",
      "Minden percem a szerelemé", "Volt egy tűzszínű nyár", "Álomból valóság", "Tűztündér", "Most és mindörökké",
    ] } },
    { name: "Happy Gang", id: 1399928, tags: ["disco"] },
    { name: "Groovehouse", id: 115298, tags: ["disco"] },
    { name: "Splash", id: 66816, tags: ["disco"] },
    { name: "Kozmix", id: 454484, tags: ["disco"] },
    { name: "Hip Hop Boyz", id: 10410, tags: ["disco"] },
    { name: "Ámokfutók", id: 454417, tags: ["disco"], only: [
      "Szomorú szamuráj", "A hold dala", "Ne sírj!", "Érted fáj", "Meghalok 1 csókodért", "Bújj mellém", "Robinson",
      "Csak a csillagok", "Ezüst eső", "Nem akarok sírni többé már...", "Ha dalunk egyszer véget ér", "Sírj!", "Bad Man",
      "Dzsungeltánc", "Kitsit vad a lány...", "Angyalok álma", "Nyugi, nyugi Baby!", "Mr.Casanova", "Vigyázz rám, angyal!",
      "Van valami", "Neked adom!", "Szerelem hajnalán", "Varázsolj el!",
    ] },
    { name: "Emergency House", id: 65289, tags: ["disco"], top: 20 },
    // A Deezer sok remixet is felsorol: dalonként egy változat.
    { name: "Soho Party", id: 449111, tags: ["disco"], only: [
      "Az Éjjel Soha Nem Ér Véget", "Szállj! Radio Edit", "Balatoni Nyár", "Gyere Táncolj! Radio Edit",
      "Nézz Az Égre Radio Edit", "Baby Nem Kell Más Radio Edit", "Dilis a lány", "Miért Nincs Nyáron Hó",
      "Kéz A Kézben Discovery Mix", "A Világ Csak Veled Szép", "Hol Az A Lány", "Hiányzol", "Repülj velem",
    ] },
    // A Deezer-oldalon a norvég TNT dalai is ott vannak, ezért csak a magyar dalok. A Diszkóban az
    // 1997–99-es eurodance-korszak; a 2000 utáni pop-dance dalok (Kicsi gesztenye…) csak a Popban.
    { name: "TNT", id: 63769, tags: ["pop", "disco"], only: [
      "Titkos üzenet", "Rendőrnő", "Összedől a ház", "Robban a bomba!", "Hurrá, suli van!", "Bele vagyok zúgva",
      "Sírni tudnék", "Holnap hazautazom", "Még várok 1 percet", "Bolond, aki sír...!", "Minden pillanatban",
      "Mért vagy szomorú?", "Tiltott perc", "Kicsi gesztenye", "Nem jön álom a szememre", "Látod zokog a szívem",
      "Egyetlen szó", "Fogd a kezem", "Hova visz a hajó", "Hallgasd hogy zsong a tavasz", "Híd a folyót",
      "Itt vagy a szívemben", "Fehér karácsony",
    ], tagOnly: { disco: [
      "Titkos üzenet", "Rendőrnő", "Összedől a ház", "Robban a bomba!", "Hurrá, suli van!", "Bele vagyok zúgva",
      "Sírni tudnék", "Holnap hazautazom", "Még várok 1 percet",
    ] } },
    { name: "Fresh", id: 86677962, tags: ["disco"], only: ["Táncolj még!", "Itt vagyunk! Radio Edit", "Boogie Nights", "Üzenet a Holdról Radio Edit"] },
    { name: "Baby Sisters", id: 452370, tags: ["disco"], only: [
      "Ne ébressz fel!", "Tánc", "Szeresd a testem", "Égben írt szerelem", "Állj mellém!", "Ha szombat este táncol",
      "Gyere!", "Baby, Baby", "Bár mindig itt lennél",
    ] },
    // 2001-től elektronikus pop, nem a 90-es évek dance-korszaka.
    { name: "Unique", id: 13675, tags: ["pop"] },
  ],

  // Hány dalt kérjünk le előadónként (a Deezer top listája legfeljebb 100).
  TRACKS_PER_ARTIST: 100,
  // Ennyi legnépszerűbb dal marad előadónként (a duplikátumok kiszűrése után),
  // hogy az előadó nevét beírva az összes dala elférjen a javaslatok között.
  MAX_SONGS_PER_ARTIST: 35,

  // Ilyen szavakat tartalmazó címeket kihagyunk a készletből.
  EXCLUDE_TITLE_WORDS: ["remix", "megamix", "karaoke", "instrumental", "acapella", "a cappella", "sped up", "slowed", "extended mix"],

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
  REPORT_ENDPOINT: "https://songdle-report.oliverszkcs.workers.dev",
  // Ugyanez a Worker közvetíti a Deezer API-t (js/deezer.js). Üresen a játék közvetlenül, JSONP-vel kér.
  DEEZER_PROXY: "https://songdle-report.oliverszkcs.workers.dev/deezer",

  // Kitiltott dalok: ezek senkinél nem jönnek ki. A játékban jelentett dalokat
  // a Dallista → „Jelentett” → „Lista másolása” gombbal lehet ide bemásolni.
  BLOCKED_TRACKS: [
    // { id: 123456, note: "Cím – Előadó: duplikált" },
    { id: 4012948221, note: "NU MĂ LASĂ – Tóth Andi: román nyelvű" },
    // A Deezer néhány előadónál egy azonos nevű külföldi előadó dalait is ugyanarra az oldalra teszi:
    { id: 3856813311, note: "Pass the Plate – nem a magyar Desh (Deezer összevont oldal, kiadó: Chillhop Music)" },
    { id: 2931361521, note: "Wherever You Are – nem a magyar Desh (Deezer összevont oldal, kiadó: Chillhop Music)" },
    { id: 3207292351, note: "Simmer – nem a magyar Desh (Deezer összevont oldal, kiadó: Chillhop Music)" },
    { id: 3332864101, note: "Pintxos – nem a magyar Desh (Deezer összevont oldal, kiadó: Lofi Jazz Records)" },
    { id: 4298088992, note: "Freaky Friday – nem a magyar Desh (Deezer összevont oldal, kiadó: Lofi Jazz Records)" },
    { id: 2790060822, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060832, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060842, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060852, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060862, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060872, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060882, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060892, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060902, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060912, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060922, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060932, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060942, note: "LGT: Képzelt riport egy amerikai popfesztiválról – vígszínházi musical" },
    { id: 2790060952, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790060962, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790060972, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790060982, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790060992, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790061002, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790061012, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790061022, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 2790061032, note: "LGT: Harmincéves vagyok – vígszínházi musical (Balázs Péter)" },
    { id: 1908841947, note: "Bloomin – nem a magyar Desh (Deezer összevont oldal, kiadó: Lofi Jazz Records)" },
    { id: 4280788032, note: "Beatrice: egy másik, külföldi Beatrice (angol nyelvű saját kiadás)" },
    { id: 4296871922, note: "Beatrice: egy másik, külföldi Beatrice (angol nyelvű saját kiadás)" },
    { id: 4320489082, note: "Beatrice: egy másik, külföldi Beatrice (angol nyelvű saját kiadás)" },
    { id: 2527564991, note: "Beatrice: egy másik, külföldi Beatrice (angol nyelvű saját kiadás)" },
    { id: 1975181817, note: "Beatrice: egy másik, külföldi Beatrice (angol nyelvű saját kiadás)" },
    { id: 3794547082, note: "Beatrice: egy másik, külföldi Beatrice (angol nyelvű saját kiadás)" },
    { id: 2079436907, note: "Beatrice: egy másik, külföldi Beatrice (angol nyelvű saját kiadás)" },
    { id: 2147064, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147065, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147066, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147067, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147068, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147069, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147070, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147071, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147072, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 2147073, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 68662124, note: "Karthago: a német Karthago együttes (Bacillus / M.i.G.)" },
    { id: 4262339601, note: "Unique: ausztrál Unique (Classified Records / Spoontech)" },
    { id: 4124158081, note: "Unique: ausztrál Unique (Classified Records / Spoontech)" },
    { id: 4048696041, note: "Unique: ausztrál Unique (Classified Records / Spoontech)" },
    { id: 4152386232, note: "Unique: ausztrál Unique (Classified Records / Spoontech)" },
    { id: 4070241081, note: "Apostol: külföldi Apostol (angol nyelvű saját kiadás)" },
    { id: 4214768162, note: "Apostol: külföldi Apostol (angol nyelvű saját kiadás)" },
    { id: 4142161701, note: "Korál: Dancing by the Ocean – nem a magyar Korál" },
    { id: 1590608902, note: "Majka: Aureola – lengyel dal (Żyleta), nem magyar" },
    { id: 3019129, note: "Katona Klári: Bunt wie ein Blumenstrauß – német nyelvű (Amiga)" },
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
    { id: 3370499531, note: "Face Of Death – nem a magyar Unique (Deezer összevont oldal, kiadó: Classified Records)" },
    { id: 3410467811, note: "Love Like This – nem a magyar Unique (Deezer összevont oldal, kiadó: Classified Records)" },
    { id: 3627823522, note: "Don't Let Me Go – nem a magyar Unique (Deezer összevont oldal, kiadó: Classified Records)" },
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
    { id: 2215007307, note: "A hold dala – Lotfi Begi 2023-as feldolgozása, nem az Ámokfutók-dal (duplikált)" },
  ],

  // Ennyi legutóbbi dalt nem sorsolunk újra.
  RECENT_MEMORY: 40,
  // Ennyi körig nem jön újra ugyanaz az előadó (végtelen módban).
  ARTIST_GAP: 3,

  // Nehéz mód: a dal eleje visszafelé szól, cserébe hosszabb részletekkel (ugyanannyi lépés,
  // mint a CLIP_LENGTHS); a pont ×HARD_MULTIPLIER.
  HARD_CLIP_LENGTHS: [2, 4, 7, 12, 20, 30],
  HARD_MULTIPLIER: 1.5,

  // Párbaj és kihívás: ennyi dalból áll egy meccs.
  VERSUS_SONGS: 5,

  // Látogatottság (GoatCounter, sütik nélkül). Regisztrálj a goatcounter.com-on, és írd ide
  // a kódodat (pl. "songdlehu" → https://songdlehu.goatcounter.com). Üresen nincs mérés.
  GOATCOUNTER: "oliverszkcs",

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
    "Zséda":                     { type: "solo", gender: "f", year: 1974, listeners: 27652, debut: 2002, status: "active" },
    "Tóth Vera":                 { type: "solo", gender: "f", year: 1985, listeners: 9204, debut: 2004, status: "active" },
    "Molnár Ferenc Caramel":     { type: "solo", gender: "m", year: 1982, listeners: 92425, debut: 2005, status: "active" },
    "Tóth Gabi":                 { type: "solo", gender: "f", year: 1988, listeners: 21616, debut: 2005, status: "active", esc: "adal" },
    "Rácz Gergő":                { type: "solo", gender: "m", year: 1976, listeners: 172860, debut: 2006, status: "active", esc: "adal" },
    "Pápai Joci":                { type: "solo", gender: "m", year: 1981, listeners: 132672, debut: 2005, status: "active", esc: "esc" },
    "Radics Gigi":               { type: "solo", gender: "f", year: 1996, listeners: 49790, debut: 2012, status: "active", esc: "adal" },
    "Wolf Kati":                 { type: "solo", gender: "f", year: 1974, listeners: 8214, debut: 2009, status: "active", esc: "esc" },
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
    "BSW":                       { type: "band", gender: "m", year: 2006, listeners: 380434, debut: 2010, status: "active" },
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
    "MC Hawer és Tekknő":        { type: "duo", gender: "m", year: 2000, listeners: 85026, debut: 2000, status: "active" },
    "Tankcsapda":                { type: "band", gender: "m", year: 1989, listeners: 184694, debut: 1989, status: "active" },
    "Ossian":                    { type: "band", gender: "m", year: 1986, listeners: 39178, debut: 1988, status: "active" },
    "Kowalsky meg a Vega":       { type: "band", gender: "m", year: 1999, listeners: 162827, debut: 2003, status: "active" },
    "Omega":                     { type: "band", gender: "m", year: 1962, listeners: 237819, debut: 1968, status: "split" },
    "Republic":                  { type: "band", gender: "m", year: 1990, listeners: 221225, debut: 1990, status: "active" },
    "LGT":                       { type: "band", gender: "m", year: 1971, listeners: 71186, debut: 1971, status: "split" },
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
    "Szandi":                    { type: "solo", gender: "f", year: 1976, listeners: 15294, debut: 1989, status: "active" },
    "Happy Gang":                { type: "band", gender: "m", year: 1993, listeners: 26443, debut: 1994, status: "active" },
    "Groovehouse":               { type: "duo", gender: "mixed", year: 1997, listeners: 108245, debut: 1999, status: "active" },
    "Splash":                    { type: "duo", gender: "mixed", year: 1998, listeners: 144755, debut: 1999, status: "active" },
    "Kozmix":                    { type: "duo", gender: "mixed", year: 1995, listeners: 43537, debut: 1995, status: "active" },
    "Unique":                    { type: "band", gender: "mixed", year: 1995, listeners: 21749, debut: 2001, status: "active" },
    // Az új diszkós előadóknál nincs Spotify-hallgatószám (ilyenkor a játék nem veti össze).
    "Hip Hop Boyz":              { type: "band", gender: "m", year: 1992, debut: 1993, status: "split" },
    "Ámokfutók":                 { type: "band", gender: "mixed", year: 1994, debut: 1994, status: "active" },
    "Emergency House":           { type: "band", gender: "m", year: 1995, debut: 1996, status: "active" },
    "Soho Party":                { type: "band", gender: "mixed", year: 1989, debut: 1994, status: "split" },
    "TNT":                       { type: "duo", gender: "m", year: 1996, debut: 1996, status: "active" },
    "Fresh":                     { type: "band", gender: "f", year: 1996, debut: 1997, status: "active" },
    "Baby Sisters":              { type: "band", gender: "f", year: 1996, debut: 1997, status: "split" },
  },

  // Kézi évjavítások az évtized-kategóriákhoz és a bónuszkérdéshez, ha a Deezer és a MusicBrainz
  // is rossz évet ad (pl. csak egy későbbi újrakiadás van meg). Előadó (a fenti név) + a Deezer-cím
  // (a zárójeles kiegészítések nem számítanak, a zárójel nélküli „Radio Edit” viszont igen) → az eredeti
  // megjelenés éve, vagy null, ha nincs megbízható év (a dal ekkor egyik évtizedben sem szerepel).
  // A tools/build-years.mjs és a játék is figyeli.
  YEAR_OVERRIDES: [
    // Karthago: a Deezeren csak a 2020-as/2022-es újrafelvételek vannak meg a 80-as évekbeli
    // klasszikusokból (pl. Requiem, Szülői ház), ezért ezek egyik évtizedben sem szerepelnek.
    { artist: "Karthago", title: "Requiem", year: null },
    { artist: "Karthago", title: "Zene nélkül", year: null },
    { artist: "Karthago", title: "Hazám", year: null },
    { artist: "Karthago", title: "Éjszakák és nappalok", year: null },
    { artist: "Karthago", title: "Most élsz", year: null },
    { artist: "Karthago", title: "Ez majdnem szerelem volt", year: null },
    { artist: "Karthago", title: "Otthonom a nagyvilág", year: null },
    { artist: "Karthago", title: "Szülői ház", year: null },
    { artist: "Karthago", title: "Ott állsz az út végén", year: null },
    { artist: "Karthago", title: "Minden szónál többet ér", year: null },
    { artist: "Karthago", title: "Elmegyek", year: null },
    { artist: "Karthago", title: "Azért vannak a jóbarátok", year: null },
    { artist: "Karthago", title: "Emlékezz rám", year: null },
    // Szandi: a Deezeren a 2014-es „Szandi 25” újrafelvételei; a Tinédzser l'amour 1990-es (Wikipédia),
    // a többinél nincs megbízható eredeti év.
    { artist: "Szandi", title: "Tinédzser L'Amour (Deejay Sampler Dance Mix)", year: 1990 },
    { artist: "Szandi", title: "Volt Egy Tűzszínű Nyár (Radio Edit)", year: null },
    { artist: "Szandi", title: "Egy Nápolyi", year: null },
    { artist: "Szandi", title: "Búcsúznunk Kell", year: null },
    // Fenyő Miklós: a Casino Twist a Hungária 1980-as dala (a Deezeren egy 2021-es kiadás).
    { artist: "Fenyő Miklós", title: "Casino Twist", year: 1980 },
    // Neoton: a Marathon LP 1980-as (a Deezeren 1998-as újrakiadás).
    { artist: "Neoton Família", title: "Don Quijote", year: 1980 },
    { artist: "Neoton Família", title: "Egy húszas elég", year: 1980 },
    { artist: "Neoton Família", title: "Marathon", year: 1980 },
    // Soho Party: a Deezeren minden 2013-as digitális kiadás; az eredeti albumok: Pizza...! 1994, Szállj! 1995, Discovery 1997.
    { artist: "Soho Party", title: "Balatoni nyár", year: 1994 },
    { artist: "Soho Party", title: "Gyere Táncolj! Radio Edit", year: 1994 },
    { artist: "Soho Party", title: "Dilis a lány", year: 1994 },
    { artist: "Soho Party", title: "Repülj velem", year: 1994 },
    { artist: "Soho Party", title: "Szállj! Radio Edit", year: 1995 },
    { artist: "Soho Party", title: "Nézz Az Égre Radio Edit", year: 1995 },
    { artist: "Soho Party", title: "Hiányzol", year: 1995 },
    { artist: "Soho Party", title: "Hol az a lány", year: 1995 },
    { artist: "Soho Party", title: "Kéz A Kézben Discovery Mix", year: 1997 },
    { artist: "Soho Party", title: "Az éjjel soha nem ér véget", year: 1998 },
    // Emergency House: Emergency House Party 1996, A party folytatódik 1997 (a Deezeren 2012).
    { artist: "Emergency House", title: "Dübörög a ház", year: 1996 },
    { artist: "Emergency House", title: "Homály zóna", year: 1996 },
    { artist: "Emergency House", title: "Bármi megtörténhet", year: 1996 },
    { artist: "Emergency House", title: "Veled pörög a világ", year: 1996 },
    { artist: "Emergency House", title: "House - Party", year: 1996 },
    { artist: "Emergency House", title: "Táncolj a hídon", year: 1996 },
    { artist: "Emergency House", title: "You're Ready", year: 1996 },
    { artist: "Emergency House", title: "Csúcs ez a party", year: 1997 },
    { artist: "Emergency House", title: "Nyakig ér a holiday", year: 1997 },
    { artist: "Emergency House", title: "A végtelen", year: 1997 },
    { artist: "Emergency House", title: "Állj közénk", year: 1997 },
    { artist: "Emergency House", title: "Figyelj az ütemre", year: 1997 },
    { artist: "Emergency House", title: "Élvezd a veszélyt", year: 1997 },
    // Fresh: kislemezek (Wikipédia); a Deezeren 2013.
    { artist: "Fresh", title: "Táncolj még!", year: 1998 },
    { artist: "Fresh", title: "Itt vagyunk! Radio Edit", year: 1998 },
    { artist: "Fresh", title: "Boogie Nights", year: 1999 },
    { artist: "Fresh", title: "Üzenet a Holdról Radio Edit", year: 1999 },
    // Ámokfutók: Sebességláz 1994, Varázsolj el! 1995, III. 1996, A szerelem hajnalán 2000 (a Deezeren 2011–2012).
    { artist: "Ámokfutók", title: "Sírj!", year: 1994 },
    { artist: "Ámokfutók", title: "Mr.Casanova", year: 1994 },
    { artist: "Ámokfutók", title: "Szomorú szamuráj", year: 1995 },
    { artist: "Ámokfutók", title: "Dzsungeltánc", year: 1995 },
    { artist: "Ámokfutók", title: "Varázsolj el!", year: 1995 },
    { artist: "Ámokfutók", title: "A hold dala", year: 1996 },
    { artist: "Ámokfutók", title: "Kitsit vad a lány...", year: 1996 },
    { artist: "Ámokfutók", title: "Vigyázz rám, angyal!", year: 1996 },
    { artist: "Ámokfutók", title: "Szerelem hajnalán", year: 2000 },
    // TNT: Bomba 1997, Bumm-bumm 1998, kislemezek (Wikipédia); a Deezeren 1994, 2008 és 2012.
    { artist: "TNT", title: "Titkos üzenet", year: 1997 },
    { artist: "TNT", title: "Rendőrnő", year: 1997 },
    { artist: "TNT", title: "Összedől a ház", year: 1997 },
    { artist: "TNT", title: "Robban a bomba!", year: 1997 },
    { artist: "TNT", title: "Hurrá, suli van!", year: 1997 },
    { artist: "TNT", title: "Bele vagyok zúgva", year: 1998 },
    { artist: "TNT", title: "Holnap hazautazom", year: 1998 },
    { artist: "TNT", title: "Sírni tudnék", year: 1998 },
    { artist: "TNT", title: "Még várok 1 percet", year: 1998 },
    { artist: "TNT", title: "Mért vagy szomorú?", year: 2000 },
    { artist: "TNT", title: "Tiltott perc", year: 2001 },
    { artist: "TNT", title: "Itt vagy a szívemben", year: 2001 },
    { artist: "TNT", title: "Kicsi gesztenye", year: 2002 },
    { artist: "TNT", title: "Nem jön álom a szememre", year: 2002 },
    { artist: "TNT", title: "Hova visz a hajó", year: 2003 },
    { artist: "TNT", title: "Egyetlen szó", year: 2003 },
    { artist: "TNT", title: "Hallgasd hogy zsong a tavasz", year: 2005 },
  ],
};
