// KhetSat engine in JavaScript: the same calculations as the Python pipeline
// (pipeline/indicators.py, stats.py, rotation.py, run_rotations.py), so the
// app can analyse a place the pipeline has not been run for.
// tests/engine_parity.js checks that both give the same numbers.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.KhetEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CONFIG = {
    startYear: 1981, endYear: 2025, fill: -999,
    wetDay: 1.0, onsetSpellDays: 3, onsetSpellMm: 20, onsetWindow: 30, onsetDryDays: 8,
    hotDay: 40, dependable: 0.75,
    soilMm: 100, fallowKc: 0.3, wrsiFailure: 50,
    soilScenarios: [75, 100, 150, 200]
  };
  var DAY = 86400000;

  // ---------- statistics ----------
  function mean(xs) { var s = 0; for (var i = 0; i < xs.length; i++) s += xs[i]; return s / xs.length; }
  function pstdev(xs) { var m = mean(xs), s = 0; for (var i = 0; i < xs.length; i++) s += (xs[i] - m) * (xs[i] - m); return Math.sqrt(s / xs.length); }
  function percentile(values, p) {
    var xs = values.slice().sort(function (a, b) { return a - b; });
    if (xs.length === 1) return xs[0];
    var pos = p * (xs.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
  }
  function dependable(values, probability) { return percentile(values, 1 - probability); }
  function erfc(x) {
    // Abramowitz and Stegun 7.1.26, absolute error below 1.5e-7
    var z = Math.abs(x), t = 1 / (1 + 0.3275911 * z);
    var y = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? y : 2 - y;
  }
  function mannKendall(values) {
    var n = values.length, s = 0, i, j;
    for (i = 0; i < n - 1; i++) for (j = i + 1; j < n; j++) s += Math.sign(values[j] - values[i]);
    var ties = {}, tieTerm = 0;
    values.forEach(function (v) { ties[v] = (ties[v] || 0) + 1; });
    Object.keys(ties).forEach(function (k) { var t = ties[k]; if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5); });
    var variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
    if (variance === 0) return { z: 0, p: 1 };
    var z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
    return { z: z, p: erfc(Math.abs(z) / Math.SQRT2) };
  }
  function theilSen(xs, ys) {
    var slopes = [];
    for (var i = 0; i < xs.length; i++) for (var j = i + 1; j < xs.length; j++) if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    return percentile(slopes, 0.5);
  }
  function trend(years, values) {
    var xs = [], ys = [];
    values.forEach(function (v, i) { if (v !== null) { xs.push(years[i]); ys.push(v); } });
    var mk = mannKendall(ys);
    return { n: ys.length, slope_per_decade: round(theilSen(xs, ys) * 10, 3), mann_kendall_z: round(mk.z, 3), p_value: round(mk.p, 4), significant: mk.p < 0.05 };
  }
  function round(value, digits) {
    if (value === null || value === undefined) return null;
    var f = Math.pow(10, digits === undefined ? 1 : digits);
    return Math.round(value * f) / f;
  }

  // ---------- daily series ----------
  function extraterrestrialRadiation(latDeg, dayOfYear) {
    var phi = latDeg * Math.PI / 180;
    var dr = 1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365);
    var delta = 0.409 * Math.sin(2 * Math.PI * dayOfYear / 365 - 1.39);
    var ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
    return (24 * 60 / Math.PI) * 0.0820 * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws));
  }
  function hargreaves(tmax, tmin, latDeg, dayOfYear) {
    if (tmax === null || tmin === null) return null;
    var spread = Math.max(tmax - tmin, 0), tmean = (tmax + tmin) / 2;
    return Math.max(0.0023 * (tmean + 17.8) * Math.sqrt(spread) * 0.408 * extraterrestrialRadiation(latDeg, dayOfYear), 0);
  }
  function key(date) {
    return date.getUTCFullYear() + String(date.getUTCMonth() + 1).padStart(2, "0") + String(date.getUTCDate()).padStart(2, "0");
  }
  function clean(value) { return value === undefined || value <= CONFIG.fill + 1e-6 ? null : value; }

  // Turn a NASA POWER daily response into aligned daily arrays.
  function buildSeries(payload, lat) {
    var p = payload.properties.parameter;
    var first = Date.UTC(CONFIG.startYear, 0, 1), last = Date.UTC(CONFIG.endYear, 11, 31);
    var series = { lat: lat, dates: [], rain: [], tmax: [], tmin: [], et0: [], yearStart: {} };
    for (var t = first, i = 0; t <= last; t += DAY, i++) {
      var d = new Date(t), k = key(d);
      var doy = Math.round((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
      if (doy === 1) series.yearStart[d.getUTCFullYear()] = i;
      var tx = clean(p.T2M_MAX[k]), tn = clean(p.T2M_MIN[k]);
      series.dates.push(d); series.rain.push(clean(p.PRECTOTCORR[k]));
      series.tmax.push(tx); series.tmin.push(tn); series.et0.push(hargreaves(tx, tn, lat, doy));
    }
    return series;
  }
  function dayIndex(series, year, month, day) {
    return series.yearStart[year] + Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / DAY);
  }

  // ---------- climate indicators ----------
  function longestDrySpell(rain) {
    var longest = 0, current = 0;
    for (var i = 0; i < rain.length; i++) {
      if (rain[i] !== null && rain[i] < CONFIG.wetDay) { current++; if (current > longest) longest = current; } else current = 0;
    }
    return longest;
  }
  function onsetIndex(rain) {
    for (var i = 0; i + CONFIG.onsetSpellDays <= rain.length; i++) {
      var sum = 0, missing = false;
      for (var j = 0; j < CONFIG.onsetSpellDays; j++) { if (rain[i + j] === null) missing = true; else sum += rain[i + j]; }
      if (missing || sum < CONFIG.onsetSpellMm) continue;
      var following = rain.slice(i + CONFIG.onsetSpellDays, i + CONFIG.onsetSpellDays + CONFIG.onsetWindow);
      if (longestDrySpell(following) >= CONFIG.onsetDryDays) continue;
      return i;
    }
    return null;
  }
  function total(values) {
    var s = 0, any = false;
    for (var i = 0; i < values.length; i++) if (values[i] !== null) { s += values[i]; any = true; }
    return any ? s : null;
  }
  function yearlyIndicators(series, year) {
    var a = series.yearStart[year];
    var b = series.yearStart[year + 1] !== undefined ? series.yearStart[year + 1] : series.dates.length;
    var rain = series.rain.slice(a, b), tmax = series.tmax.slice(a, b), et0 = series.et0.slice(a, b);
    var idx = function (m, d) { return dayIndex(series, year, m, d) - a; };
    var jun1 = idx(6, 1), oct1 = idx(10, 1), searchEnd = idx(9, 30);
    var tail = CONFIG.onsetSpellDays + CONFIG.onsetWindow;
    var onset = onsetIndex(rain.slice(jun1, searchEnd + 1 + tail));
    if (onset !== null && jun1 + onset > searchEnd) onset = null;
    var monsoonRain = total(rain.slice(jun1, oct1)), monsoonEt0 = total(et0.slice(jun1, oct1));
    var monthlyRain = [], monthlyEt0 = [];
    for (var m = 1; m <= 12; m++) {
      var s = idx(m, 1), e = m < 12 ? idx(m + 1, 1) : rain.length;
      monthlyRain.push(round(total(rain.slice(s, e)))); monthlyEt0.push(round(total(et0.slice(s, e))));
    }
    var hot = 0;
    tmax.forEach(function (t) { if (t !== null && t >= CONFIG.hotDay) hot++; });
    return {
      year: year,
      annual_rain_mm: round(total(rain)),
      monsoon_rain_mm: round(monsoonRain),
      post_monsoon_rain_mm: round(total(rain.slice(oct1))),
      monsoon_et0_mm: round(monsoonEt0),
      monsoon_water_balance_mm: monsoonRain === null || monsoonEt0 === null ? null : round(monsoonRain - monsoonEt0),
      onset_days_after_jun1: onset,
      longest_monsoon_dry_spell_days: longestDrySpell(rain.slice(jun1, oct1)),
      hot_days: hot,
      monthly_rain_mm: monthlyRain,
      monthly_et0_mm: monthlyEt0
    };
  }
  var TREND_FIELDS = ["annual_rain_mm", "monsoon_rain_mm", "post_monsoon_rain_mm", "monsoon_et0_mm", "onset_days_after_jun1", "longest_monsoon_dry_spell_days", "hot_days"];
  var DEPENDABLE_FIELDS = { annual_rain_mm: 1, monsoon_rain_mm: 1, post_monsoon_rain_mm: 1 };

  function climate(series) {
    var years = [], rows = [];
    for (var y = CONFIG.startYear; y <= CONFIG.endYear; y++) { years.push(y); rows.push(yearlyIndicators(series, y)); }
    var summary = {};
    TREND_FIELDS.forEach(function (field) {
      var values = rows.map(function (r) { return r[field]; });
      var present = values.filter(function (v) { return v !== null; });
      if (!present.length) { summary[field] = null; return; }
      var m = mean(present);
      summary[field] = {
        mean: round(m), cv_percent: m === 0 ? null : round(pstdev(present) / m * 100),
        min: Math.min.apply(null, present), max: Math.max.apply(null, present),
        trend: present.length >= 3 ? trend(years, values) : null
      };
      if (DEPENDABLE_FIELDS[field]) summary[field].dependable_75 = round(dependable(present, CONFIG.dependable));
    });
    var onsets = rows.map(function (r) { return r.onset_days_after_jun1; }).filter(function (v) { return v !== null; });
    summary.onset = {
      years_without_onset: rows.filter(function (r) { return r.onset_days_after_jun1 === null; }).map(function (r) { return r.year; }),
      years_with_onset: onsets.length,
      median_days_after_jun1: onsets.length ? percentile(onsets, 0.5) : null,
      p10_days_after_jun1: onsets.length ? round(percentile(onsets, 0.10)) : null,
      p90_days_after_jun1: onsets.length ? round(percentile(onsets, 0.90)) : null
    };
    summary.driest_monsoons = rows.slice().sort(function (a, b) { return a.monsoon_rain_mm - b.monsoon_rain_mm; }).slice(0, 5)
      .map(function (r) { return { year: r.year, monsoon_rain_mm: r.monsoon_rain_mm }; });
    var months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    summary.monthly_climatology = {
      mean_rain_mm: months.map(function (m) { return round(mean(rows.map(function (r) { return r.monthly_rain_mm[m]; }))); }),
      dependable_75_rain_mm: months.map(function (m) { return round(dependable(rows.map(function (r) { return r.monthly_rain_mm[m]; }), CONFIG.dependable)); }),
      mean_et0_mm: months.map(function (m) { return round(mean(rows.map(function (r) { return r.monthly_et0_mm[m]; }))); })
    };
    return { summary: summary, years: rows };
  }

  // ---------- rotation engine ----------
  function sumStages(crop) { return crop.stages_days[0] + crop.stages_days[1] + crop.stages_days[2] + crop.stages_days[3]; }
  function kcOnDay(day, stages, kc) {
    var ini = stages[0], dev = stages[1], mid = stages[2], late = stages[3];
    if (day < ini) return kc.ini;
    if (day < ini + dev) return kc.ini + (kc.mid - kc.ini) * (day - ini) / dev;
    if (day < ini + dev + mid) return kc.mid;
    return kc.mid + (kc.end - kc.mid) * (day - ini - dev - mid) / late;
  }
  // Returns null if two crops of the rotation would overlap.
  function buildCalendar(series, cycle, crops) {
    var n = series.dates.length, slotSeason = new Int32Array(n).fill(-1), slotKc = new Float64Array(n), seasons = [];
    for (var year = CONFIG.startYear; year <= CONFIG.endYear; year++) {
      var patternIndex = (year - CONFIG.startYear) % cycle.length;
      for (var s = 0; s < cycle[patternIndex].length; s++) {
        var entry = cycle[patternIndex][s], crop = crops[entry.crop], length = sumStages(crop);
        var start = dayIndex(series, year, entry.sow[0], entry.sow[1]);
        if (start + length > n) continue;
        for (var o = 0; o < length; o++) {
          if (slotSeason[start + o] !== -1) return null;
          slotSeason[start + o] = seasons.length; slotKc[start + o] = kcOnDay(o, crop.stages_days, crop.kc);
        }
        seasons.push({ year: year, pattern: patternIndex, slot: s, crop: entry.crop, irrigated: !!entry.irrigated, length: length, etc: 0, eta: 0, irrigation: 0, rain: 0 });
      }
    }
    return { slotSeason: slotSeason, slotKc: slotKc, seasons: seasons };
  }
  function simulate(series, calendar, capacity) {
    var store = 0, rain = series.rain, et0 = series.et0, seasons = calendar.seasons;
    for (var i = 0; i < rain.length; i++) {
      var r = rain[i] || 0, e = et0[i] || 0;
      store = Math.min(store + r, capacity);
      var index = calendar.slotSeason[i];
      if (index === -1) { store -= Math.min(CONFIG.fallowKc * e, store); continue; }
      var season = seasons[index], demand = calendar.slotKc[i] * e, supplied = Math.min(demand, store);
      store -= supplied; season.etc += demand; season.rain += r;
      if (season.irrigated) { season.irrigation += demand - supplied; season.eta += demand; } else season.eta += supplied;
    }
    seasons.forEach(function (s) { s.wrsi = s.etc === 0 ? 100 : 100 * s.eta / s.etc; });
    return seasons;
  }
  function evaluate(rotation, series, crops, capacity) {
    var cycle = rotation.cycle, groups = {}, all = [];
    for (var offset = 0; offset < cycle.length; offset++) {
      var shifted = cycle.slice(offset).concat(cycle.slice(0, offset));
      var calendar = buildCalendar(series, shifted, crops);
      if (!calendar) return null;
      simulate(series, calendar, capacity === undefined ? CONFIG.soilMm : capacity).forEach(function (season) {
        season.pattern = (season.pattern + offset) % cycle.length;
        var k = season.pattern + ":" + season.slot;
        (groups[k] = groups[k] || []).push(season); all.push(season);
      });
    }
    var cropResults = Object.keys(groups).sort().map(function (k) {
      var group = groups[k], crop = crops[group[0].crop];
      var wrsi = group.map(function (s) { return s.wrsi; });
      var failed = group.filter(function (s) { return s.wrsi < CONFIG.wrsiFailure; }).map(function (s) { return s.year; }).sort();
      var parts = k.split(":");
      return {
        crop: group[0].crop, name: crop.name, cycle_year: Number(parts[0]) + 1,
        sow: cycle[Number(parts[0])][Number(parts[1])].sow, season_days: group[0].length, irrigated: group[0].irrigated,
        seasons_simulated: group.length,
        water_need_mm_mean: round(mean(group.map(function (s) { return s.etc; })), 0),
        season_rain_mm_mean: round(mean(group.map(function (s) { return s.rain; })), 0),
        wrsi_median: round(percentile(wrsi, 0.5), 0), wrsi_bad_year: round(percentile(wrsi, 0.25), 0),
        failed_seasons: failed.length, failed_years: failed,
        irrigation_mm_mean: round(mean(group.map(function (s) { return s.irrigation; })), 0),
        parameters_verified: crop.verified, parameters_borrowed_from: crop.proxy_of || null
      };
    });
    var entries = [].concat.apply([], cycle), families = {}, legumes = 0, cover = 0;
    entries.forEach(function (e) { families[crops[e.crop].family] = true; if (crops[e.crop].legume) legumes++; });
    cycle.forEach(function (pattern) {
      var days = 0; pattern.forEach(function (e) { days += sumStages(crops[e.crop]); });
      cover += Math.min(days, 365) / 30.4;
    });
    cover /= cycle.length;
    var familyList = Object.keys(families).sort(), legumeShare = legumes / entries.length;
    var years = (CONFIG.endYear - CONFIG.startYear + 1) * cycle.length;
    var totalSeasons = 0, failedSeasons = 0;
    cropResults.forEach(function (c) { totalSeasons += c.seasons_simulated; failedSeasons += c.failed_seasons; });
    var irrigation = 0, need = 0;
    all.forEach(function (s) { irrigation += s.irrigation; need += s.etc; });
    return {
      id: rotation.id, label: rotation.label || "", existing: !!rotation.existing, cycle_years: cycle.length,
      crops: cropResults,
      months_covered_per_year: round(cover), bare_months_per_year: round(12 - cover),
      legume_share: round(legumeShare, 2), crop_families: familyList,
      failed_season_share: round(failedSeasons / totalSeasons, 3),
      irrigation_mm_per_year: round(irrigation / years, 0), crop_water_need_mm_per_year: round(need / years, 0),
      components: {
        water_fit: round(Math.min.apply(null, cropResults.map(function (c) { return c.wrsi_median; })) / 100, 3),
        resilience: round(Math.min.apply(null, cropResults.map(function (c) { return c.wrsi_bad_year; })) / 100, 3),
        soil: round(0.5 * legumeShare + 0.5 * Math.min(cover / 12, 1), 3),
        diversity: round(Math.min((familyList.length - 1) / 2, 1), 3)
      }
    };
  }
  function addWaterSaving(results) {
    var least = Math.min.apply(null, results.map(function (r) { return r.crop_water_need_mm_per_year; }));
    results.forEach(function (r) { r.components.water_saving = round(least / r.crop_water_need_mm_per_year, 3); });
  }
  var COMPONENTS = ["water_fit", "resilience", "water_saving", "soil", "diversity"];
  function score(components) {
    var s = 0; COMPONENTS.forEach(function (k) { s += components[k]; });
    return round(100 * s / COMPONENTS.length);
  }

  // ---------- explanations (codes; wording lives in i18n.js) ----------
  function item(code, params) { return { code: code, params: params || {} }; }
  function explain(result, existing, options) {
    var why = [], evidence = [], benefits = [], gaps = [], risks = [], seen = {};
    function gap(entry) { var k = JSON.stringify(entry); if (!seen[k]) { seen[k] = true; gaps.push(entry); } }
    result.crops.forEach(function (crop) {
      if (crop.irrigated) evidence.push(item("crop_irrigated", { crop: crop.crop, need: crop.water_need_mm_mean, irrigation: crop.irrigation_mm_mean }));
      else evidence.push(item("crop_rainfed", { crop: crop.crop, median: crop.wrsi_median, bad: crop.wrsi_bad_year, failed: crop.failed_seasons, total: crop.seasons_simulated, threshold: CONFIG.wrsiFailure }));
      if (crop.crop === "rice") gap(item("rice_et_only"));
      if (crop.parameters_borrowed_from) gap(item("proxy_crop", { crop: crop.crop }));
      else if (!crop.parameters_verified) gap(item("placeholder_length", { crop: crop.crop }));
    });
    if (result.existing) why.push(item(options.baselineCode || "baseline"));
    else {
      if (options.candidates) why.push(item("auto_alternative", { n: options.candidates }));
      var res = result.components.resilience, base = existing.components.resilience;
      var dBare = existing.bare_months_per_year - result.bare_months_per_year;
      if (res - base > 0.02) { why.push(item("better_poor_years")); benefits.push(item("resilience_up", { base: Math.round(base * 100), value: Math.round(res * 100) })); }
      else if (res - base < -0.02) risks.push(item("worse_poor_years", { base: Math.round(base * 100), value: Math.round(res * 100) }));
      if (dBare > 0.5) { why.push(item("more_cover")); benefits.push(item("fewer_bare", { months: round(dBare) })); }
      if (result.legume_share > existing.legume_share) benefits.push(item("adds_legume"));
      if (result.components.diversity - existing.components.diversity > 0) { why.push(item("alternates_families")); benefits.push(item("breaks_pests")); }
      var need = result.crop_water_need_mm_per_year, baseNeed = existing.crop_water_need_mm_per_year;
      if (need < baseNeed * 0.95) { why.push(item("less_water")); benefits.push(item("less_water_amount", { need: need, base: baseNeed, percent: Math.round((baseNeed - need) / baseNeed * 100) })); }
      else if (need > baseNeed * 1.05) risks.push(item("more_water", { need: need, base: baseNeed }));
      if (result.irrigation_mm_per_year > existing.irrigation_mm_per_year + 1) risks.push(item("more_irrigation"));
      if (!why.length) why.push(item("no_clear_gain"));
    }
    if (options.soilMm === undefined) gap(item("soil_assumed", { mm: CONFIG.soilMm }));
    else gap(item("soil_chosen", { mm: options.soilMm }));
    gap(item("fao_lengths")); gap(item("no_market"));
    gap(item(options.rotationGapCode || "assumed_rotation"));
    risks.push(item("grid_cell")); risks.push(item("not_modelled"));
    return { why_suggested: why, evidence: evidence, benefits: benefits, information_gaps: gaps, risks_for_local_review: risks };
  }

  // Full comparison for a list of rotations (the first existing one is the baseline).
  function compare(rotations, series, crops, options) {
    options = options || {};
    // options.soilMm: soil water storage chosen by the farmer or estimated from a soil map.
    // Left out, the default (CONFIG.soilMm) is used, as in the Python pipeline.
    var results = rotations.map(function (r) { return evaluate(r, series, crops, options.soilMm); });
    if (results.some(function (r) { return !r; })) return null;
    var existing = results.filter(function (r) { return r.existing; })[0];
    addWaterSaving(results);
    results.forEach(function (r) { r.score_equal_weights = score(r.components); r.explanation = explain(r, existing, options); });
    var sensitivity = CONFIG.soilScenarios.map(function (capacity) {
      var row = { soil_available_water_mm: capacity, rotations: {} };
      rotations.forEach(function (rotation) {
        var res = evaluate(rotation, series, crops, capacity);
        row.rotations[rotation.id] = {
          weakest_crop_wrsi_median: Math.round(res.components.water_fit * 100),
          weakest_crop_wrsi_bad_year: Math.round(res.components.resilience * 100),
          failed_season_share: res.failed_season_share
        };
      });
      return row;
    });
    var low = sensitivity[0], high = sensitivity[sensitivity.length - 1];
    results.forEach(function (r) {
      var a = low.rotations[r.id].weakest_crop_wrsi_median, b = high.rotations[r.id].weakest_crop_wrsi_median;
      r.soil_sensitive = Math.abs(b - a) >= 20;
      if (r.soil_sensitive) r.explanation.information_gaps.unshift(item("soil_sensitive", { low: a, low_mm: low.soil_available_water_mm, high: b, high_mm: high.soil_available_water_mm }));
    });
    return { rotations: results, soil_capacity_sensitivity: sensitivity };
  }

  // ---------- any-location mode ----------
  function addDays(month, day, days) {
    var d = new Date(Date.UTC(2001, month - 1, day) + days * DAY);
    return [d.getUTCMonth() + 1, d.getUTCDate()];
  }
  // Sowing dates for a place: kharif on the typical onset of rains, rabi after the kharif harvest.
  function sowingPlan(climateSummary, crops, kharifCrop) {
    var onset = climateSummary.onset, years = CONFIG.endYear - CONFIG.startYear + 1;
    var offset = onset.years_with_onset >= years / 2 ? Math.round(onset.median_days_after_jun1) : 30;
    offset = Math.max(0, Math.min(60, offset));
    var kharif = addDays(6, 1, offset);
    var harvest = offset + sumStages(crops[kharifCrop]) + 3;      // days after 1 June
    var earliestRabi = Math.round((Date.UTC(2001, 9, 15) - Date.UTC(2001, 5, 1)) / DAY);
    var rabiOffset = Math.max(harvest, earliestRabi);
    var latestRabi = Math.round((Date.UTC(2002, 0, 15) - Date.UTC(2001, 5, 1)) / DAY);
    return { kharif: kharif, rabi: rabiOffset <= latestRabi ? addDays(6, 1, rabiOffset) : null, onsetBased: onset.years_with_onset >= years / 2 };
  }
  function makeRotation(id, crops, climateSummary, kharif, rabi, flags) {
    var plan = sowingPlan(climateSummary, crops, kharif);
    var pattern = [{ crop: kharif, sow: plan.kharif, irrigated: !!flags.kharifIrrigated }];
    if (rabi) {
      if (!plan.rabi) return null;
      pattern.push({ crop: rabi, sow: plan.rabi, irrigated: !!flags.rabiIrrigated });
    }
    return { id: id, existing: false, cycle: [pattern] };
  }
  // The farmer's rotation plus the two best-scoring alternatives among all valid candidates.
  function analysePlace(payload, lat, crops, current) {
    var series = buildSeries(payload, lat), clim = climate(series);
    var flags = { kharifIrrigated: current.kharifIrrigated, rabiIrrigated: current.rabiIrrigated };
    var mine = makeRotation("existing", crops, clim.summary, current.kharif, current.rabi, flags);
    var soilMm = current.soilMm;
    if (!mine || !evaluate(mine, series, crops, soilMm)) return { error: "rotation_does_not_fit", climate: clim };
    mine.existing = true;
    var names = Object.keys(crops);
    var kharifCrops = names.filter(function (c) { return (crops[c].seasons || []).indexOf("kharif") >= 0; });
    var rabiCrops = [null].concat(names.filter(function (c) { return (crops[c].seasons || []).indexOf("rabi") >= 0; }));
    var candidates = [];
    kharifCrops.forEach(function (k) {
      rabiCrops.forEach(function (r) {
        if (k === current.kharif && (r || null) === (current.rabi || null)) return;
        var rotation = makeRotation("alt_" + k + "_" + (r || "fallow"), crops, clim.summary, k, r, flags);
        if (rotation) candidates.push(rotation);
      });
      if (k !== current.kharif) {
        var other = makeRotation("x", crops, clim.summary, k, current.rabi, flags);
        if (other) candidates.push({ id: "alt_alternate_" + k, existing: false, cycle: [mine.cycle[0], other.cycle[0]] });
      }
    });
    var evaluated = [];
    candidates.forEach(function (rotation) {
      var result = evaluate(rotation, series, crops, soilMm);
      if (result) evaluated.push({ rotation: rotation, result: result });
    });
    var mineResult = evaluate(mine, series, crops, soilMm);
    addWaterSaving(evaluated.map(function (e) { return e.result; }).concat([mineResult]));
    evaluated.forEach(function (e) { e.score = score(e.result.components); });
    evaluated.sort(function (a, b) { return b.score - a.score; });
    // First alternative: the best-scoring candidate. Second: the best one that
    // keeps the farmer's monsoon crop (a smaller change), else the next best.
    // Crops whose values are borrowed from another crop count as that crop, so
    // two near-identical options are not both shown.
    function signature(result) {
      return result.crops.map(function (c) { return crops[c.crop].proxy_of || c.crop; }).sort().join("+");
    }
    var picks = [], signatures = {};
    signatures[signature(mineResult)] = true;
    function take(entry) {
      var sig = signature(entry.result);
      if (signatures[sig]) return false;
      signatures[sig] = true; picks.push(entry.rotation); return true;
    }
    evaluated.some(take);
    evaluated.filter(function (e) {
      return e.result.crops.some(function (c) { return c.crop === current.kharif; });
    }).some(take);
    evaluated.forEach(function (e) { if (picks.length < 2) take(e); });
    var comparison = compare([mine].concat(picks), series, crops,
      { candidates: evaluated.length, baselineCode: "baseline_yours", rotationGapCode: "your_rotation", soilMm: soilMm });
    return { climate: clim, rotations: comparison, candidates: evaluated.length, sowing: sowingPlan(clim.summary, crops, current.kharif) };
  }

  return {
    CONFIG: CONFIG, buildSeries: buildSeries, climate: climate, evaluate: evaluate, compare: compare,
    analysePlace: analysePlace, score: score, percentile: percentile, hargreaves: hargreaves,
    extraterrestrialRadiation: extraterrestrialRadiation, onsetIndex: onsetIndex
  };
});
