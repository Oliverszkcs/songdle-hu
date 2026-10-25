// Verzióemelés minden frissítés előtt: sw.js CACHE, index.html data-v és ?v= linkek, app.js APP_V.
// Ha ezek nem egyeznek, a böngésző régi és új fájlokat keverhet (pl. eltűnik az előadó-mód).
//
// Használat (a repó gyökeréből):  node tools/bump-version.mjs

import { readFileSync, writeFileSync } from "node:fs";

const sw = readFileSync("sw.js", "utf8");
const cur = +sw.match(/songdle-hu-v(\d+)/)[1];
const next = cur + 1;

const edit = (file, pairs) => {
  let s = readFileSync(file, "utf8");
  for (const [re, to] of pairs) {
    if (!re.test(s)) throw new Error(`${file}: nem található: ${re}`);
    s = s.replace(re, to);
  }
  writeFileSync(file, s);
};

edit("sw.js", [[/songdle-hu-v\d+/, `songdle-hu-v${next}`]]);
edit("index.html", [[/data-v="\d+"/, `data-v="${next}"`], [/\?v=\d+/g, `?v=${next}`]]);
edit("js/app.js", [[/const APP_V = "\d+";/, `const APP_V = "${next}";`]]);
console.log(`v${cur} → v${next}`);
