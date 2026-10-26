// Verzióemelés minden frissítés előtt: sw.js CACHE, index.html data-v és ?v= linkek, a modulok
// importjainak ?v=-je és a main.js APP_V-je. Ha ezek nem egyeznek, a böngésző régi és új fájlokat
// keverhet (pl. eltűnik az előadó-mód), modulnál pedig egy hiányzó export az egész indulást megakasztja.
//
// Használat (a repó gyökeréből):  node tools/bump-version.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";

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
edit("js/app/main.js", [[/const APP_V = "\d+";/, `const APP_V = "${next}";`]]);
// Minden modul ugyanazzal a ?v=-vel importál (egy modul címe = egy példány a böngészőben).
for (const f of readdirSync("js/app").filter((f) => f.endsWith(".js"))) {
  const s = readFileSync(`js/app/${f}`, "utf8");
  if (/\.js\?v=\d+"/.test(s)) writeFileSync(`js/app/${f}`, s.replace(/\.js\?v=\d+"/g, `.js?v=${next}"`));
}
console.log(`v${cur} → v${next}`);
