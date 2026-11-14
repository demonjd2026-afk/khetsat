// Checks that every language file has every string, crop name and month, and
// that the {placeholders} in each translation match the English text.
// Run:  node tests/i18n_check.js
global.window = {};
require("../app/i18n.js");
for (const code of ["ta", "kn", "mr", "or"]) require(`../app/i18n-${code}.js`);
require("../app/i18n-voice.js");
const all = window.I18N;
const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(",");
let problems = 0;
const report = (message) => { problems++; console.log(message); };

for (const code of Object.keys(all)) {
  if (code === "en") continue;
  const lang = all[code];
  for (const key of Object.keys(all.en)) {
    if (!(key in lang)) { report(`${code}: missing ${key}`); continue; }
    if (typeof all.en[key] === "string" && placeholders(all.en[key]) !== placeholders(lang[key])) report(`${code}: placeholders differ in ${key}`);
  }
  for (const key of Object.keys(lang)) if (!(key in all.en)) report(`${code}: unknown key ${key}`);
  for (const key of Object.keys(all.en.x)) {
    if (!(key in lang.x)) report(`${code}: missing x.${key}`);
    else if (placeholders(all.en.x[key]) !== placeholders(lang.x[key])) report(`${code}: placeholders differ in x.${key}`);
  }
  for (const key of Object.keys(all.en.crops)) if (!lang.crops[key]) report(`${code}: missing crop ${key}`);
  if (lang.months.length !== 12) report(`${code}: months should have 12 entries`);
  if (!lang.review_note) report(`${code}: review_note is empty`);
}
console.log(`${Object.keys(all).length} languages checked, ${problems} problems`);
process.exit(problems ? 1 : 0);
