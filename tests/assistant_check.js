// Checks the voice guide without a browser:
//  1. every question, in every language, is recognised from its keywords alone;
//  2. some free-form English questions land on the right topic;
//  3. every answer, for every place and language, is complete (no empty or unfilled text).
// Run:  node tests/assistant_check.js
const fs = require("fs");
const path = require("path");
global.window = global;
require("../app/i18n.js");
for (const code of ["ta", "kn", "mr", "or"]) require(`../app/i18n-${code}.js`);
require("../app/i18n-voice.js");
require("../app/app.js");
require("../app/assistant.js");

const { INTENTS, match, answer, spoken } = window.KhetAssist;
const state = window.KhetSat.state;
let checks = 0, problems = 0;
const expect = (ok, message) => { checks++; if (!ok) { problems++; console.log(message); } };

for (const lang of Object.keys(window.I18N)) {
  for (const intent of INTENTS) {
    const question = window.I18N[lang]["q_" + intent];
    const got = match(question, lang, { keywordsOnly: true });
    expect(got === intent, `${lang}: "${question}" was read as ${got}, expected ${intent}`);
  }
}

const free = [
  ["is this data accurate", "trust"], ["can i trust these numbers", "trust"],
  ["what if there is a drought", "poor"], ["how do i understand the map", "map"],
  ["which crop should i grow", "best"], ["how much irrigation is needed", "water"],
  ["when does the monsoon start", "rain"], ["what do the coloured bands mean", "chart"],
  ["what are the risks", "check"], ["tell me a joke", null]
];
for (const [text, intent] of free) expect(match(text, "en") === intent, `en: "${text}" was read as ${match(text, "en")}, expected ${intent}`);

const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "processed", name + ".json"), "utf8"));
for (const place of ["anantapur", "krishna", "anakapalli"]) {
  state.cache[place] = { climate: read(place), rotations: read(place + "_rotations"), check: read(place + "_crosscheck") };
  state.place = place;
  for (const lang of Object.keys(window.I18N)) {
    state.lang = lang;
    for (const intent of INTENTS) {
      const reply = answer(intent);
      const text = [reply.title].concat(reply.lines).join(" ");
      expect(reply.lines.length > 0 && reply.lines.every((line) => line && line.trim().length > 3), `${place}/${lang}/${intent}: empty line`);
      expect(!/[{}]|undefined|NaN|null/.test(text), `${place}/${lang}/${intent}: unfilled text: ${text.slice(0, 160)}`);
      expect(spoken(reply.lines, lang).length >= reply.lines.length, `${place}/${lang}/${intent}: speech chunks missing`);
    }
  }
}
state.place = "custom"; state.lang = "en";
expect(answer("best").lines.length === 1, "custom place without an analysis should point to the form");

console.log(`${checks} checks, ${problems} problems`);
process.exit(problems ? 1 : 0);
