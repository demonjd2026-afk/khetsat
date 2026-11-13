// Checks that the JavaScript engine (app/engine.js) reproduces the Python
// pipeline's results. Run after the pipeline:  node tests/engine_parity.js
const fs = require("fs");
const path = require("path");
const engine = require("../app/engine.js");
const root = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
const crops = read("data/reference/crops.json").crops;
const rotations = read("data/reference/rotations.json");
const points = { anantapur: 14.68, krishna: 16.43, anakapalli: 17.67 };
let checks = 0, failures = 0;

function close(label, a, b, tolerance) {
  checks++;
  const ok = a === b || (a !== null && b !== null && Math.abs(a - b) <= tolerance);
  if (!ok) { failures++; console.log("MISMATCH", label, "js:", a, "python:", b); }
}

for (const key of Object.keys(points)) {
  const raw = path.join(root, "data/raw", `power_${key}_1981_2025.json`);
  if (!fs.existsSync(raw)) { console.log(`skip ${key}: run the pipeline first (no ${raw})`); continue; }
  const series = engine.buildSeries(JSON.parse(fs.readFileSync(raw, "utf8")), points[key]);
  const climate = engine.climate(series);
  const expectedClimate = read(`data/processed/${key}.json`);
  for (const field of ["annual_rain_mm", "monsoon_rain_mm", "monsoon_et0_mm", "onset_days_after_jun1", "hot_days"]) {
    const a = climate.summary[field], b = expectedClimate.summary[field];
    close(`${key} ${field} mean`, a.mean, b.mean, 0.11);
    close(`${key} ${field} cv`, a.cv_percent, b.cv_percent, 0.11);
    // Python and JavaScript round the yearly values slightly differently, which can move a median slope a little.
    close(`${key} ${field} slope`, a.trend.slope_per_decade, b.trend.slope_per_decade, 0.06);
    close(`${key} ${field} p`, a.trend.p_value, b.trend.p_value, 0.0005);
    if (b.dependable_75 !== undefined) close(`${key} ${field} dependable`, a.dependable_75, b.dependable_75, 0.11);
  }
  expectedClimate.years.forEach((row, i) => {
    close(`${key} ${row.year} monsoon rain`, climate.years[i].monsoon_rain_mm, row.monsoon_rain_mm, 0.11);
    close(`${key} ${row.year} onset`, climate.years[i].onset_days_after_jun1, row.onset_days_after_jun1, 0);
  });
  for (let m = 0; m < 12; m++) {
    close(`${key} month ${m} et0`, climate.summary.monthly_climatology.mean_et0_mm[m], expectedClimate.summary.monthly_climatology.mean_et0_mm[m], 0.11);
  }
  const expected = read(`data/processed/${key}_rotations.json`);
  const got = engine.compare(rotations[key], series, crops);
  expected.rotations.forEach((want, i) => {
    const have = got.rotations[i];
    close(`${key} ${want.id} score`, have.score_equal_weights, want.score_equal_weights, 0.11);
    close(`${key} ${want.id} water need`, have.crop_water_need_mm_per_year, want.crop_water_need_mm_per_year, 1);
    close(`${key} ${want.id} irrigation`, have.irrigation_mm_per_year, want.irrigation_mm_per_year, 1);
    for (const c of Object.keys(want.components)) close(`${key} ${want.id} ${c}`, have.components[c], want.components[c], 0.0011);
    want.crops.forEach((crop, j) => {
      close(`${key} ${want.id} ${crop.crop} wrsi`, have.crops[j].wrsi_median, crop.wrsi_median, 1);
      close(`${key} ${want.id} ${crop.crop} bad`, have.crops[j].wrsi_bad_year, crop.wrsi_bad_year, 1);
      close(`${key} ${want.id} ${crop.crop} failed`, have.crops[j].failed_seasons, crop.failed_seasons, 0);
    });
    const codes = (e) => JSON.stringify(Object.values(e).map((list) => list.map((x) => x.code)));
    checks++;
    if (codes(have.explanation) !== codes(want.explanation)) { failures++; console.log("MISMATCH", key, want.id, "explanation codes\n js:", codes(have.explanation), "\n py:", codes(want.explanation)); }
    close(`${key} ${want.id} soil sensitive`, have.soil_sensitive ? 1 : 0, want.soil_sensitive ? 1 : 0, 0);
  });
  expected.soil_capacity_sensitivity.forEach((row, i) => {
    for (const id of Object.keys(row.rotations)) {
      close(`${key} soil ${row.soil_available_water_mm} ${id}`, got.soil_capacity_sensitivity[i].rotations[id].weakest_crop_wrsi_median, row.rotations[id].weakest_crop_wrsi_median, 1);
    }
  });
}
console.log(`${checks} checks, ${failures} mismatches`);
process.exit(failures ? 1 : 0);
