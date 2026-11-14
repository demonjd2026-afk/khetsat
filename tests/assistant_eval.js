// Evaluates how well the voice guide recognises natural phrasings of its eight questions.
// Unlike assistant_check.js this is a measurement, not a pass/fail test: it prints the share
// of phrasings routed to the right question, the share of out-of-scope questions correctly
// declined, and every miss. The tuning set was used to extend the keyword lists; the
// held-out set was not, so its score is the honest one.
// Run:  node tests/assistant_eval.js          (add --quiet to hide the list of misses)
global.window = global;
require("../app/i18n.js");
for (const code of ["ta", "kn", "mr", "or"]) require(`../app/i18n-${code}.js`);
require("../app/i18n-voice.js");
require("../app/app.js");
require("../app/assistant.js");
const phrases = require("./assistant_phrases.json");
const { INTENTS, match } = window.KhetAssist;
const quiet = process.argv.includes("--quiet");
const pct = (a, b) => (b ? Math.round(1000 * a / b) / 10 : 0) + "%";

for (const set of ["tuning", "heldout"]) {
  let allRight = 0, allTotal = 0, allWrong = 0;
  console.log(set === "tuning" ? "Tuning set (used to extend the keyword lists)" : "\nHeld-out set (never used for tuning)");
  for (const lang of Object.keys(phrases[set])) {
    let right = 0, total = 0, declined = 0, wrong = 0;
    const misses = [];
    for (const intent of INTENTS) {
      for (const text of phrases[set][lang][intent]) {
        const got = match(text, lang);
        total++;
        if (got !== intent && got !== null) wrong++;
        if (got === intent) right++; else misses.push(`    ${intent} <- "${text}" was read as ${got || "nothing"}`);
      }
    }
    const outside = phrases[set][lang].none || [];
    for (const text of outside) {
      const got = match(text, lang);
      if (got === null) declined++; else misses.push(`    (should decline) "${text}" was read as ${got}`);
    }
    allRight += right; allTotal += total; allWrong += wrong;
    console.log(`  ${lang}: ${right} of ${total} phrasings recognised (${pct(right, total)}), ${wrong} answered with the wrong topic, ` +
      `${total - right - wrong} not recognised; ` +
      `${declined} of ${outside.length} out-of-scope questions declined`);
    if (!quiet) misses.forEach((line) => console.log(line));
  }
  console.log(`  overall: ${allRight} of ${allTotal} recognised (${pct(allRight, allTotal)}), ` +
    `${allWrong} wrong topic (${pct(allWrong, allTotal)}), ${allTotal - allRight - allWrong} not recognised (${pct(allTotal - allRight - allWrong, allTotal)})`);
}
