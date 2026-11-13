(function () {
  "use strict";

  var PLACES = {
    anantapur: {
      names: { en: "Anantapur", te: "అనంతపురం", hi: "अनंतपुर" },
      points: { en: "Anantapur town", te: "అనంతపురం పట్టణం", hi: "अनंतपुर शहर" }
    },
    krishna: {
      names: { en: "Krishna", te: "కృష్ణా", hi: "कृष्णा" },
      points: { en: "Gudivada", te: "గుడివాడ", hi: "गुडीवाड़ा" }
    },
    anakapalli: {
      names: { en: "Anakapalli", te: "అనకాపల్లి", hi: "अनकापल्ली" },
      points: { en: "Narsipatnam", te: "నర్సీపట్నం", hi: "नरसीपट्टनम" }
    }
  };
  var CROP_COLOURS = {
    groundnut: "#7a9e3b", green_gram: "#3f8f5a", chickpea: "#9bb86a",
    millet: "#d9a441", sorghum: "#c4762b", maize: "#e3c04a",
    rice: "#2f8f8f", sesame: "#8c6bb1", cotton: "#9a9a86"
  };
  var COMPONENTS = ["water_fit", "resilience", "soil", "diversity"];
  var MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  var LANGS = ["en", "te", "hi"];

  var state = {
    lang: "en",
    place: "anantapur",
    weights: { water_fit: 3, resilience: 3, soil: 3, diversity: 3 },
    soil: 100,
    cache: {}
  };

  // ---------- helpers ----------

  function fmt(value) {
    if (typeof value !== "number") return String(value);
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 10) / 10);
  }

  function fill(template, params) {
    return template.replace(/\{(\w+)\}/g, function (_, key) {
      return params && key in params ? fmt(params[key]) : "";
    });
  }

  function t(key, params) {
    var dict = window.I18N[state.lang];
    var template = key in dict ? dict[key] : window.I18N.en[key];
    return typeof template === "string" ? fill(template, params) : template;
  }

  function cropName(key) {
    return window.I18N[state.lang].crops[key] || window.I18N.en.crops[key] || key;
  }

  function explain(entry) {
    var params = Object.assign({}, entry.params);
    if (params.crop) params.crop = cropName(params.crop);
    var dict = window.I18N[state.lang].x;
    return fill(dict[entry.code] || window.I18N.en.x[entry.code] || entry.code, params);
  }

  function esc(text) {
    return String(text).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function h(tag, props) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (key === "text") node.textContent = props[key];
        else if (key === "class") node.className = props[key];
        else if (key.slice(0, 2) === "on") node.addEventListener(key.slice(2), props[key]);
        else node.setAttribute(key, props[key]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var kid = arguments[i];
      if (kid == null) continue;
      node.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return node;
  }

  function byId(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function score(components) {
    var total = 0, sum = 0;
    COMPONENTS.forEach(function (key) {
      total += state.weights[key];
      sum += state.weights[key] * components[key];
    });
    if (total === 0) {
      COMPONENTS.forEach(function (key) { sum += components[key]; });
      total = COMPONENTS.length;
    }
    return Math.round(100 * sum / total);
  }

  function ranked(rotations) {
    return rotations
      .map(function (r) { return { rotation: r, score: score(r.components) }; })
      .sort(function (a, b) { return b.score - a.score; });
  }

  function rotationLabel(rotation) {
    var years = {};
    rotation.crops.forEach(function (crop) {
      (years[crop.cycle_year] = years[crop.cycle_year] || []).push(cropName(crop.crop));
    });
    function join(names) {
      return names.reduce(function (a, b) { return t("then", { a: a, b: b }); });
    }
    var keys = Object.keys(years).sort();
    if (keys.length === 1) return t("every_year", { crops: join(years[keys[0]]) });
    return keys.map(function (k) {
      return t("year_n", { n: Number(k), crops: join(years[k]) });
    }).join(". ");
  }

  function dateAfterJune1(days) {
    var date = new Date(2001, 5, 1 + Math.round(days));
    return date.getDate() + " " + t("months")[date.getMonth()];
  }

  // ---------- data ----------

  function load(place) {
    if (state.cache[place]) return Promise.resolve(state.cache[place]);
    function get(name) {
      return fetch("data/processed/" + name + ".json").then(function (response) {
        if (!response.ok) throw new Error(name + ": " + response.status);
        return response.json();
      });
    }
    return Promise.all([get(place), get(place + "_rotations")]).then(function (parts) {
      state.cache[place] = { climate: parts[0], rotations: parts[1] };
      return state.cache[place];
    });
  }

  // ---------- charts ----------

  function stripChart(data, order) {
    var W = 1200, left = 56, right = 16, top = 30, chartH = 230;
    var plotW = W - left - right;
    var clim = data.climate.summary.monthly_climatology;
    var peak = Math.max.apply(null, clim.mean_rain_mm.concat(clim.mean_et0_mm));
    var yMax = Math.ceil(peak / 50) * 50;
    var x = function (day) { return left + plotW * day / 365; };
    var y = function (mm) { return top + chartH - chartH * mm / yMax; };
    var svg = [];

    for (var tick = 0; tick <= yMax; tick += 50) {
      svg.push('<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(tick) + '" y2="' + y(tick) +
        '" stroke="#d5dacd" stroke-width="1"/>');
      svg.push('<text x="' + (left - 8) + '" y="' + (y(tick) + 5) + '" text-anchor="end" font-size="14">' + tick + '</text>');
    }
    svg.push('<text x="' + left + '" y="16" font-size="14" fill="#5d554d">' + esc(t("mm_per_month")) + '</text>');

    var months = t("months");
    var line = [];
    for (var m = 0; m < 12; m++) {
      var x0 = x(MONTH_START[m]) + 5, w = x(MONTH_START[m + 1]) - x(MONTH_START[m]) - 10;
      var mean = clim.mean_rain_mm[m], dep = clim.dependable_75_rain_mm[m];
      svg.push('<rect x="' + x0 + '" y="' + y(mean) + '" width="' + w + '" height="' + (y(0) - y(mean)) + '" fill="#b9c6e6"/>');
      svg.push('<rect x="' + x0 + '" y="' + y(dep) + '" width="' + w + '" height="' + (y(0) - y(dep)) + '" fill="#2f4b8f"/>');
      var cx = (x(MONTH_START[m]) + x(MONTH_START[m + 1])) / 2;
      line.push(cx + "," + y(clim.mean_et0_mm[m]));
      svg.push('<text x="' + cx + '" y="' + (top + chartH + 22) + '" text-anchor="middle" font-size="15">' + esc(months[m]) + '</text>');
    }
    svg.push('<polyline points="' + line.join(" ") + '" fill="none" stroke="#e0a106" stroke-width="4" stroke-linejoin="round"/>');
    line.forEach(function (point) {
      var xy = point.split(",");
      svg.push('<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="5" fill="#e0a106"/>');
    });

    var cursor = top + chartH + 44;
    order.forEach(function (entry, index) {
      var rotation = entry.rotation;
      svg.push('<text x="' + left + '" y="' + (cursor + 14) + '" font-size="15" font-weight="600">' +
        (index + 1) + ". " + esc(rotationLabel(rotation)) + '</text>');
      cursor += 22;
      for (var year = 1; year <= rotation.cycle_years; year++) {
        svg.push('<rect x="' + left + '" y="' + cursor + '" width="' + plotW + '" height="24" fill="#e9ece2" rx="3"/>');
        rotation.crops.filter(function (c) { return c.cycle_year === year; }).forEach(function (crop) {
          var start = MONTH_START[crop.sow[0] - 1] + crop.sow[1] - 1;
          var end = start + crop.season_days;
          var parts = end <= 365 ? [[start, end]] : [[start, 365], [0, end - 365]];
          parts.forEach(function (part) {
            var px = x(part[0]), pw = x(part[1]) - x(part[0]);
            svg.push('<rect x="' + px + '" y="' + cursor + '" width="' + pw + '" height="24" rx="3" fill="' +
              (CROP_COLOURS[crop.crop] || "#888") + '"/>');
            if (pw > 90) {
              svg.push('<text x="' + (px + 8) + '" y="' + (cursor + 17) + '" font-size="14" fill="#1c1a17">' +
                esc(cropName(crop.crop)) + '</text>');
            }
          });
        });
        cursor += 28;
      }
      cursor += 10;
    });

    return '<svg viewBox="0 0 ' + W + " " + cursor + '" role="img" aria-label="' +
      esc(t("strip_title", { name: PLACES[state.place].names[state.lang] })) + '">' + svg.join("") + "</svg>";
  }

  function yearsChart(climate) {
    var rows = climate.years, W = 1200, left = 56, right = 16, top = 14, H = 190;
    var plotW = W - left - right;
    var peak = Math.max.apply(null, rows.map(function (r) { return r.monsoon_rain_mm; }));
    var yMax = Math.ceil(peak / 200) * 200;
    var y = function (mm) { return top + H - H * mm / yMax; };
    var step = plotW / rows.length;
    var driest = {};
    climate.summary.driest_monsoons.forEach(function (d) { driest[d.year] = true; });
    var svg = [];
    for (var tick = 0; tick <= yMax; tick += 200) {
      svg.push('<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(tick) + '" y2="' + y(tick) + '" stroke="#d5dacd"/>');
      svg.push('<text x="' + (left - 8) + '" y="' + (y(tick) + 5) + '" text-anchor="end" font-size="14">' + tick + '</text>');
    }
    rows.forEach(function (row, i) {
      var bx = left + i * step + 3;
      svg.push('<rect x="' + bx + '" y="' + y(row.monsoon_rain_mm) + '" width="' + (step - 6) + '" height="' +
        (y(0) - y(row.monsoon_rain_mm)) + '" fill="' + (driest[row.year] ? "#a8402d" : "#2f4b8f") + '"><title>' +
        row.year + ": " + Math.round(row.monsoon_rain_mm) + ' mm</title></rect>');
      if (row.year % 5 === 0) {
        svg.push('<text x="' + (bx + (step - 6) / 2) + '" y="' + (top + H + 20) + '" text-anchor="middle" font-size="14">' + row.year + '</text>');
      }
    });
    var dep = climate.summary.monsoon_rain_mm.dependable_75;
    svg.push('<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(dep) + '" y2="' + y(dep) +
      '" stroke="#2b2622" stroke-width="2" stroke-dasharray="7 5"/>');
    return '<svg viewBox="0 0 ' + W + " " + (top + H + 30) + '" role="img" aria-label="' +
      esc(t("years_chart_title")) + '">' + svg.join("") + "</svg>";
  }

  // ---------- sections ----------

  function renderChrome() {
    document.documentElement.lang = state.lang;
    byId("tagline").textContent = t("tagline");

    var lang = clear(byId("lang"));
    LANGS.forEach(function (code) {
      lang.appendChild(h("button", {
        type: "button", lang: code, "aria-pressed": String(code === state.lang),
        text: window.I18N[code].lang_name,
        onclick: function () { state.lang = code; render(); }
      }));
    });

    var places = clear(byId("places"));
    places.setAttribute("aria-label", t("choose_location"));
    Object.keys(PLACES).forEach(function (key) {
      places.appendChild(h("button", {
        type: "button", "aria-current": String(key === state.place),
        text: PLACES[key].names[state.lang],
        onclick: function () { state.place = key; render(); }
      }));
    });

    byId("priorities-title").textContent = t("priorities_title");
    byId("priorities-intro").textContent = t("priorities_intro");
    var sliders = clear(byId("sliders"));
    COMPONENTS.forEach(function (key) {
      var id = "w-" + key;
      sliders.appendChild(h("div", { class: "slider" },
        h("label", { for: id, text: t("p_" + key) }),
        h("input", {
          id: id, type: "range", min: "0", max: "5", step: "1", value: String(state.weights[key]),
          oninput: function (event) { state.weights[key] = Number(event.target.value); renderRanked(); }
        }),
        h("div", { class: "ends" },
          h("span", { text: t("not_important") }), h("span", { text: t("very_important") }))
      ));
    });

    byId("rotations-title").textContent = t("rotations_title");
    byId("soil-title").textContent = t("soil_title");
    byId("soil-intro").textContent = t("soil_intro");
    byId("glossary-title").textContent = t("glossary_title");
    var glossary = clear(byId("glossary"));
    ["et", "need", "met", "dep", "sat"].forEach(function (key) {
      glossary.appendChild(h("div", null,
        h("dt", { text: t("g_" + key + "_term") }), h("dd", { text: t("g_" + key + "_text") })));
    });
    byId("disclaimer").textContent = t("disclaimer");
    byId("sources").textContent = t("sources");
    byId("methods-link").textContent = t("methods_link");
  }

  function renderClimate(data) {
    var name = PLACES[state.place].names[state.lang];
    var summary = data.climate.summary;
    byId("strip-title").textContent = t("strip_title", { name: name });
    byId("strip-intro").textContent = t("strip_intro");
    byId("grid-note").textContent = t("grid_note", { point: PLACES[state.place].points[state.lang] });

    var legend = clear(byId("strip-legend"));
    [["#b9c6e6", "legend_mean_rain"], ["#2f4b8f", "legend_dependable_rain"]].forEach(function (pair) {
      legend.appendChild(h("li", null,
        h("span", { class: "key", style: "background:" + pair[0] }), t(pair[1])));
    });
    legend.appendChild(h("li", null, h("span", { class: "key line" }), t("legend_et0")));

    byId("climate-title").textContent = t("climate_title", { name: name });
    var stats = clear(byId("stats"));
    [
      ["stat_monsoon", Math.round(summary.monsoon_rain_mm.mean) + " mm"],
      ["stat_dependable", Math.round(summary.monsoon_rain_mm.dependable_75) + " mm"],
      ["stat_variation", Math.round(summary.monsoon_rain_mm.cv_percent) + "%"],
      ["stat_onset", t("stat_onset_value", {
        from: dateAfterJune1(summary.onset.p10_days_after_jun1),
        to: dateAfterJune1(summary.onset.p90_days_after_jun1)
      })]
    ].forEach(function (pair) {
      stats.appendChild(h("div", null, h("dt", { text: t(pair[0]) }), h("dd", { text: pair[1] })));
    });

    byId("years-title").textContent = t("years_chart_title");
    byId("years-chart").innerHTML = yearsChart(data.climate);
    byId("years-note").textContent = t("years_chart_note");

    var trend = summary.monsoon_rain_mm.trend;
    var sentence = !trend.significant ? t("trend_flat")
      : t(trend.slope_per_decade > 0 ? "trend_up" : "trend_down",
        { value: Math.abs(Math.round(trend.slope_per_decade)) });
    byId("trend").textContent = sentence + " " + t("trend_caution");
  }

  function reasonList(entries) {
    if (!entries.length) return h("p", { class: "note", text: t("none_listed") });
    var list = h("ul");
    entries.forEach(function (entry) { list.appendChild(h("li", { text: explain(entry) })); });
    return list;
  }

  function rotationCard(entry, index) {
    var rotation = entry.rotation, ex = rotation.explanation;
    var tags = h("div", { class: "tags" });
    if (rotation.existing) tags.appendChild(h("span", { class: "tag", text: t("current") }));
    if (rotation.soil_sensitive) tags.appendChild(h("span", { class: "tag warn", text: t("soil_dependent") }));

    var meters = h("div", { class: "meters" });
    COMPONENTS.forEach(function (key) {
      var value = Math.round(rotation.components[key] * 100);
      meters.appendChild(h("div", null,
        h("div", { class: "meter-label" }, h("span", { text: t("p_" + key) }), h("span", { text: value + "%" })),
        h("div", { class: "meter" }, h("i", { style: "width:" + value + "%" }))));
    });

    var table = h("table", { class: "crop-table" },
      h("caption", { class: "note", style: "text-align:left", text: t("water_met") }),
      h("thead", null, h("tr", null,
        h("th", { text: "" }),
        h("th", { class: "num", text: t("typical_year") }),
        h("th", { class: "num", text: t("poor_year") }),
        h("th", { text: "" }))));
    var body = h("tbody");
    rotation.crops.forEach(function (crop) {
      var name = h("td", null,
        h("span", { class: "swatch", style: "background:" + (CROP_COLOURS[crop.crop] || "#888") }),
        cropName(crop.crop),
        h("div", { class: "note", text: t("needs_water", { mm: crop.water_need_mm_mean }) }));
      if (crop.irrigated) {
        body.appendChild(h("tr", null, name,
          h("td", { class: "num", text: "–" }), h("td", { class: "num", text: "–" }),
          h("td", { text: t("irrigated_note", { mm: crop.irrigation_mm_mean }) })));
      } else {
        body.appendChild(h("tr", null, name,
          h("td", { class: "num" + (crop.wrsi_median < 50 ? " low" : ""), text: fmt(crop.wrsi_median) + "%" }),
          h("td", { class: "num" + (crop.wrsi_bad_year < 50 ? " low" : ""), text: fmt(crop.wrsi_bad_year) + "%" }),
          h("td", { text: t("failed_seasons", { failed: crop.failed_seasons, total: crop.seasons_simulated }) })));
      }
    });
    table.appendChild(body);

    return h("li", { class: "rotation" },
      h("div", { class: "rank", "aria-hidden": "true", text: String(index + 1) }),
      h("div", null,
        h("h3", { text: rotationLabel(rotation) }),
        tags,
        h("div", { class: "match" },
          h("strong", { text: String(entry.score) }),
          h("span", { text: t("match") + ", " + t("out_of_100") })),
        meters,
        h("div", { class: "scroll" }, table),
        h("div", { class: "reasons" },
          h("h4", { text: t("sec_why") }), reasonList(ex.why_suggested),
          h("h4", { text: t("sec_evidence") }), reasonList(ex.evidence),
          h("h4", { text: t("sec_benefits") }), reasonList(ex.benefits),
          h("details", null, h("summary", { text: t("sec_gaps") }), reasonList(ex.information_gaps)),
          h("details", null, h("summary", { text: t("sec_risks") }), reasonList(ex.risks_for_local_review)))));
  }

  function renderSoil(data, order) {
    var rows = data.rotations.soil_capacity_sensitivity;
    var choices = clear(byId("soil-choices"));
    rows.forEach(function (row) {
      var mm = row.soil_available_water_mm;
      choices.appendChild(h("button", {
        type: "button", "aria-pressed": String(mm === state.soil),
        text: t("soil_choice", { mm: mm }),
        onclick: function () { state.soil = mm; renderSoil(data, order); }
      }));
    });
    var chosen = rows.filter(function (row) { return row.soil_available_water_mm === state.soil; })[0] || rows[0];
    var table = clear(byId("soil-table"));
    table.appendChild(h("thead", null, h("tr", null,
      h("th", { text: t("soil_col_rotation") }),
      h("th", { class: "num", text: t("soil_col_typical") }),
      h("th", { class: "num", text: t("soil_col_poor") }),
      h("th", { class: "num", text: t("soil_col_failed") }))));
    var body = h("tbody");
    order.forEach(function (entry) {
      var value = chosen.rotations[entry.rotation.id];
      body.appendChild(h("tr", null,
        h("td", { text: rotationLabel(entry.rotation) }),
        h("td", { class: "num" + (value.weakest_crop_wrsi_median < 50 ? " low" : ""), text: value.weakest_crop_wrsi_median + "%" }),
        h("td", { class: "num" + (value.weakest_crop_wrsi_bad_year < 50 ? " low" : ""), text: value.weakest_crop_wrsi_bad_year + "%" }),
        h("td", { class: "num", text: Math.round(value.failed_season_share * 100) + "%" })));
    });
    table.appendChild(body);
  }

  function renderRanked() {
    var data = state.cache[state.place];
    if (!data) return;
    var order = ranked(data.rotations.rotations);
    byId("strip-chart").innerHTML = stripChart(data, order);
    var list = clear(byId("rotation-list"));
    order.forEach(function (entry, index) { list.appendChild(rotationCard(entry, index)); });
    renderSoil(data, order);
  }

  function render() {
    renderChrome();
    load(state.place).then(function (data) {
      renderClimate(data);
      renderRanked();
    }).catch(function (error) {
      console.error(error);
      var main = document.querySelector("main");
      if (!document.querySelector(".error")) {
        main.insertBefore(h("p", { class: "error", text: t("load_error") }), main.children[1]);
      }
    });
  }

  window.KhetSat = { state: state, score: score, ranked: ranked, fill: fill, fmt: fmt };
  if (typeof document !== "undefined" && document.getElementById) render();
})();
