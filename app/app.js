(function () {
  "use strict";

  var PLACES = {
    anantapur: {
      lat: 14.68, lon: 77.60,
      names: { en: "Anantapur", te: "అనంతపురం", hi: "अनंतपुर", ta: "அனந்தபூர்", kn: "ಅನಂತಪುರ", mr: "अनंतपूर", or: "ଅନନ୍ତପୁର" },
      points: { en: "Anantapur town", te: "అనంతపురం పట్టణం", hi: "अनंतपुर शहर", ta: "அனந்தபூர் நகரம்", kn: "ಅನಂತಪುರ ಪಟ್ಟಣ", mr: "अनंतपूर शहर", or: "ଅନନ୍ତପୁର ସହର" }
    },
    krishna: {
      lat: 16.43, lon: 80.99,
      names: { en: "Krishna", te: "కృష్ణా", hi: "कृष्णा", ta: "கிருஷ்ணா", kn: "ಕೃಷ್ಣಾ", mr: "कृष्णा", or: "କୃଷ୍ଣା" },
      points: { en: "Gudivada", te: "గుడివాడ", hi: "गुडीवाड़ा", ta: "குடிவாடா", kn: "ಗುಡಿವಾಡ", mr: "गुडीवाडा", or: "ଗୁଡ଼ିୱାଡ଼ା" }
    },
    anakapalli: {
      lat: 17.67, lon: 82.61,
      names: { en: "Anakapalli", te: "అనకాపల్లి", hi: "अनकापल्ली", ta: "அனகாபல்லி", kn: "ಅನಕಾಪಲ್ಲಿ", mr: "अनकापल्ली", or: "ଅନକାପଲ୍ଲୀ" },
      points: { en: "Narsipatnam", te: "నర్సీపట్నం", hi: "नरसीपट्टनम", ta: "நர்சிபட்டணம்", kn: "ನರ್ಸೀಪಟ್ನಂ", mr: "नरसीपट्टणम", or: "ନର୍ସିପଟନମ" }
    }
  };
  var CROP_COLOURS = {
    groundnut: "#7a9e3b", green_gram: "#3f8f5a", black_gram: "#56704a", chickpea: "#9bb86a",
    millet: "#d9a441", sorghum: "#c4762b", maize: "#e3c04a",
    rice: "#2f8f8f", sesame: "#8c6bb1", cotton: "#9a9a86"
  };
  var COMPONENTS = ["water_fit", "resilience", "water_saving", "soil", "diversity"];
  var MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  var LANGS = ["en", "te", "hi", "ta", "kn", "mr", "or"];

  var state = {
    lang: "en",
    place: "anantapur",
    weights: { water_fit: 3, resilience: 3, water_saving: 3, soil: 3, diversity: 3 },
    soil: 100,
    mapLayer: "ndvi",
    mapMoment: "wet",
    form: { lat: "", lon: "", kharif: "rice", rabi: "", kharifIrrigated: false, rabiIrrigated: false },
    busy: false,
    formMessage: null,
    crops: null,
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
    var dict = window.I18N[state.lang] || window.I18N.en;
    var template = key in dict ? dict[key] : window.I18N.en[key];
    return typeof template === "string" ? fill(template, params) : template;
  }

  function cropName(key) {
    return ((window.I18N[state.lang] || {}).crops || {})[key] || window.I18N.en.crops[key] || key;
  }

  function explain(entry) {
    var params = Object.assign({}, entry.params);
    if (params.crop) params.crop = cropName(params.crop);
    var dict = (window.I18N[state.lang] || {}).x || {};
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

  function placeName(key) {
    if (key !== "custom") return PLACES[key].names[state.lang] || PLACES[key].names.en;
    var data = state.cache.custom;
    return data ? t("custom_name", { lat: data.lat.toFixed(2), lon: data.lon.toFixed(2) }) : t("your_place");
  }
  function pointName(key) {
    return key === "custom" ? placeName(key) : (PLACES[key].points[state.lang] || PLACES[key].points.en);
  }
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
      var name = cropName(crop.crop);
      if (crop.irrigated) name = t("irrigated_tag", { crop: name });
      (years[crop.cycle_year] = years[crop.cycle_year] || []).push(name);
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
    if (place === "custom") return Promise.reject(new Error("no analysis yet"));
    function get(name) {
      return fetch("data/processed/" + name + ".json").then(function (response) {
        if (!response.ok) throw new Error(name + ": " + response.status);
        return response.json();
      });
    }
    var check = get(place + "_crosscheck").catch(function () { return null; });
    return Promise.all([get(place), get(place + "_rotations"), check]).then(function (parts) {
      state.cache[place] = { climate: parts[0], rotations: parts[1], check: parts[2] };
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
      esc(t("strip_title", { name: placeName(state.place) })) + '">' + svg.join("") + "</svg>";
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

  // ---------- satellite map ----------

  var GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/";
  var MAP_DATES = { dry: "2026-04-23", wet: "2026-10-16" };
  var MAP_LAYERS = {
    ndvi: { id: "MODIS_Terra_L3_NDVI_16Day", set: "GoogleMapsCompatible_Level9", zoom: 9, ext: "png" },
    smap: { id: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", set: "GoogleMapsCompatible_Level6", zoom: 6, ext: "png" },
    "true": { id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", set: "GoogleMapsCompatible_Level9", zoom: 9, ext: "jpg" }
  };
  var mapState = null;

  function gibsLayer(spec, date) {
    return window.L.tileLayer(
      GIBS + spec.id + "/default/" + date + "/" + spec.set + "/{z}/{y}/{x}." + spec.ext,
      { maxNativeZoom: spec.zoom, maxZoom: 9, minZoom: 5, tileSize: 256 });
  }

  function renderMap() {
    var section = byId("map-section");
    if (!window.L) { section.hidden = true; return; }
    if (!mapState || mapState.loaded) section.hidden = false;
    byId("map-title").textContent = t("map_title");
    byId("map-intro").textContent = t("map_intro");
    byId("map-key").textContent = t("map_key_" + state.mapLayer) + " " + t("map_credit");

    function buttons(id, options, current, onPick) {
      var box = clear(byId(id));
      options.forEach(function (option) {
        box.appendChild(h("button", {
          type: "button", "aria-pressed": String(option[0] === current), text: t(option[1]),
          onclick: function () { onPick(option[0]); renderMap(); }
        }));
      });
    }
    buttons("map-layers", [["ndvi", "map_layer_ndvi"], ["smap", "map_layer_smap"], ["true", "map_layer_true"]],
      state.mapLayer, function (value) { state.mapLayer = value; });
    buttons("map-moments", [["dry", "map_dry"], ["wet", "map_wet"]],
      state.mapMoment, function (value) { state.mapMoment = value; });

    if (!mapState) {
      var map = window.L.map("map", {
        center: [15.9, 80.2], zoom: 7, minZoom: 5, maxZoom: 9,
        scrollWheelZoom: false, attributionControl: true
      });
      map.attributionControl.setPrefix(false);
      map.attributionControl.addAttribution("NASA GIBS");
      map.createPane("lines").style.zIndex = 450;
      window.L.tileLayer(GIBS + "Reference_Features/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png",
        { pane: "lines", maxNativeZoom: 9, maxZoom: 9, minZoom: 5 }).addTo(map);
      mapState = { map: map, data: null, key: "", markers: {}, loaded: false, pin: null };
      map.on("click", function (event) {
        if (state.place !== "custom") return;
        state.form.lat = event.latlng.lat.toFixed(2);
        state.form.lon = event.latlng.lng.toFixed(2);
        state.formMessage = null;
        renderForm();
        renderMap();
      });
      Object.keys(PLACES).forEach(function (key) {
        mapState.markers[key] = window.L.circleMarker([PLACES[key].lat, PLACES[key].lon], {
          radius: 9, weight: 3, color: "#ffffff", fillColor: "#2b2622", fillOpacity: 1
        }).addTo(map).on("click", function () { state.place = key; render(); });
      });
    }
    var key = state.mapLayer + state.mapMoment;
    if (key !== mapState.key) {
      if (mapState.data) mapState.map.removeLayer(mapState.data);
      mapState.data = gibsLayer(MAP_LAYERS[state.mapLayer], MAP_DATES[state.mapMoment]);
      mapState.data.on("tileload", function () { mapState.loaded = true; });
      mapState.data.addTo(mapState.map);
      mapState.key = key;
      // If the imagery cannot be reached at all (offline, or a host that
      // blocks outside images), hide the map instead of showing an empty box.
      window.setTimeout(function () {
        if (!mapState.loaded) byId("map-section").hidden = true;
      }, 8000);
    }
    var lat = Number(state.form.lat), lon = Number(state.form.lon);
    var showPin = state.place === "custom" && state.form.lat !== "" && state.form.lon !== "" && isFinite(lat) && isFinite(lon);
    if (mapState.pin) { mapState.map.removeLayer(mapState.pin); mapState.pin = null; }
    if (showPin) {
      mapState.pin = window.L.circleMarker([lat, lon], {
        radius: 11, weight: 3, color: "#ffffff", fillColor: "#e0a106", fillOpacity: 1
      }).addTo(mapState.map);
      if (!mapState.map.getBounds().pad(-0.1).contains([lat, lon])) mapState.map.panTo([lat, lon]);
    }
    Object.keys(PLACES).forEach(function (place) {
      var marker = mapState.markers[place], selected = place === state.place;
      marker.setStyle({ fillColor: selected ? "#e0a106" : "#2b2622", radius: selected ? 11 : 9 });
      marker.unbindTooltip();
      marker.bindTooltip(placeName(place), { permanent: true, direction: "right", offset: [10, 0] });
    });
  }

  // ---------- sections ----------

  function renderChrome() {
    document.documentElement.lang = state.lang;
    byId("tagline").textContent = t("tagline");

    var lang = clear(byId("lang"));
    byId("lang-label").textContent = t("language_label");
    LANGS.forEach(function (code) {
      if (!window.I18N[code]) return;
      lang.appendChild(h("option", { value: code, lang: code, text: window.I18N[code].lang_name }));
    });
    lang.value = state.lang;
    lang.onchange = function () { state.lang = lang.value; render(); };

    var places = clear(byId("places"));
    places.setAttribute("aria-label", t("choose_location"));
    Object.keys(PLACES).forEach(function (key) {
      places.appendChild(h("button", {
        type: "button", "aria-current": String(key === state.place),
        text: placeName(key),
        onclick: function () { state.place = key; render(); }
      }));
    });
    places.appendChild(h("button", {
      type: "button", "aria-current": String(state.place === "custom"), text: t("your_place"),
      onclick: function () { state.place = "custom"; render(); }
    }));

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
    byId("review-note").textContent = t("review_note");
    byId("sources").textContent = t("sources");
    byId("methods-link").textContent = t("methods_link");
  }

  function renderClimate(data) {
    var name = placeName(state.place);
    var summary = data.climate.summary;
    byId("strip-title").textContent = t("strip_title", { name: name });
    byId("strip-intro").textContent = t("strip_intro");
    var note = t("grid_note", { point: pointName(state.place) });
    if (data.custom) {
      note += " " + t("custom_note", {
        date: data.sowing.kharif[1] + " " + t("months")[data.sowing.kharif[0] - 1], n: data.candidates
      });
    }
    byId("grid-note").textContent = note;

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
      ["stat_onset", summary.onset.p10_days_after_jun1 === null ? "–" : t("stat_onset_value", {
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

  function renderCheck(data) {
    var section = byId("check"), check = data.check;
    if (!check) { section.hidden = true; return; }
    section.hidden = false;
    var rain = check.monsoon_rain;
    byId("check-title").textContent = t("check_title");
    byId("check-intro").textContent = t("check_intro", { from: check.period[0], to: check.period[1] });
    var points = clear(byId("check-points"));
    var percent = Math.abs(rain.mean_difference_percent);
    [
      t("check_together", { r: rain.pearson_r.toFixed(2) }),
      t(rain.mean_difference_percent < 0 ? "check_wetter" : "check_drier", { percent: percent }),
      t("check_driest", { n: rain.driest_five_in_common }),
      t(check.ranking_agrees ? "check_rank_same" : "check_rank_diff")
    ].forEach(function (text) { points.appendChild(h("li", { text: text })); });

    var labels = {};
    data.rotations.rotations.forEach(function (r) { labels[r.id] = rotationLabel(r); });
    var table = clear(byId("check-table"));
    table.appendChild(h("thead", null, h("tr", null,
      h("th", { text: t("check_col_crop") }),
      h("th", { class: "num", text: t("check_col_model") }),
      h("th", { class: "num", text: t("check_col_sat") }))));
    var body = h("tbody");
    check.rotations.forEach(function (rotation) {
      rotation.crops.forEach(function (crop) {
        if (crop.irrigated) return;
        body.appendChild(h("tr", null,
          h("td", null, cropName(crop.crop), h("div", { class: "note", text: labels[rotation.id] || rotation.id })),
          h("td", { class: "num", text: fmt(crop.wrsi_median_reanalysis) + "%" }),
          h("td", { class: "num", text: fmt(crop.wrsi_median_satellite) + "%" })));
      });
    });
    table.appendChild(body);
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
    notify();
  }

  // ---------- your own place ----------

  var INDIA = { latMin: 6.5, latMax: 37.5, lonMin: 68, lonMax: 97.5 };

  function loadCrops() {
    if (state.crops) return Promise.resolve(state.crops);
    return fetch("data/reference/crops.json").then(function (response) {
      if (!response.ok) throw new Error("crops: " + response.status);
      return response.json();
    }).then(function (json) { state.crops = json.crops; return state.crops; });
  }

  function analyse() {
    var lat = Number(state.form.lat), lon = Number(state.form.lon);
    var inside = state.form.lat !== "" && state.form.lon !== "" && isFinite(lat) && isFinite(lon) &&
      lat >= INDIA.latMin && lat <= INDIA.latMax && lon >= INDIA.lonMin && lon <= INDIA.lonMax;
    if (!inside) { state.formMessage = { key: "form_err_bounds", bad: true }; renderForm(); return; }
    state.busy = true;
    state.formMessage = { key: "form_loading", bad: false };
    renderForm();
    var url = "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR,T2M_MAX,T2M_MIN" +
      "&community=AG&longitude=" + lon + "&latitude=" + lat + "&start=19810101&end=20251231&format=JSON";
    var failure = "form_err_fetch";
    Promise.all([loadCrops(), fetch(url).then(function (response) {
      if (!response.ok) throw new Error("NASA POWER: " + response.status);
      return response.json();
    })]).then(function (parts) {
      var result = window.KhetEngine.analysePlace(parts[1], lat, parts[0], {
        kharif: state.form.kharif, rabi: state.form.rabi || null,
        kharifIrrigated: state.form.kharifIrrigated, rabiIrrigated: state.form.rabiIrrigated
      });
      if (result.error) { failure = "form_err_fit"; throw new Error(result.error); }
      state.cache.custom = {
        custom: true, lat: lat, lon: lon, check: null,
        climate: result.climate, rotations: result.rotations,
        candidates: result.candidates, sowing: result.sowing
      };
      state.formMessage = null;
    }).catch(function (error) {
      console.error(error);
      state.formMessage = { key: failure, bad: true };
    }).then(function () { state.busy = false; render(); });
  }

  function renderForm() {
    var section = byId("place-form");
    section.hidden = state.place !== "custom";
    if (section.hidden) return;
    byId("form-title").textContent = t("form_title");
    byId("form-intro").textContent = t("form_intro");
    var crops = state.crops || {};
    function options(season, allowNone) {
      var list = allowNone ? [h("option", { value: "", text: t("form_none") })] : [];
      Object.keys(crops).forEach(function (key) {
        if ((crops[key].seasons || []).indexOf(season) >= 0) list.push(h("option", { value: key, text: cropName(key) }));
      });
      return list;
    }
    function field(id, labelKey, control) {
      return h("div", null, h("label", { for: id, text: t(labelKey) }), control);
    }
    function number(id, name, min, max) {
      return h("input", {
        id: id, type: "number", step: "0.01", min: String(min), max: String(max), value: state.form[name], inputmode: "decimal",
        oninput: function (event) { state.form[name] = event.target.value; },
        onchange: function () { renderMap(); }
      });
    }
    function select(id, name, season, allowNone) {
      var node = h.apply(null, ["select", {
        id: id, onchange: function (event) { state.form[name] = event.target.value; }
      }].concat(options(season, allowNone)));
      node.value = state.form[name];
      return node;
    }
    function tick(id, name) {
      var box = h("input", { id: id, type: "checkbox", onchange: function (event) { state.form[name] = event.target.checked; } });
      box.checked = state.form[name];
      return h("div", { class: "tick" }, box, h("label", { for: id, text: t("form_irrigated") }));
    }
    var form = clear(byId("form"));
    form.onsubmit = function (event) { event.preventDefault(); if (!state.busy) analyse(); };
    var kharif = field("f-kharif", "form_kharif", select("f-kharif", "kharif", "kharif", false));
    kharif.appendChild(tick("f-kharif-irr", "kharifIrrigated"));
    var rabi = field("f-rabi", "form_rabi", select("f-rabi", "rabi", "rabi", true));
    rabi.appendChild(tick("f-rabi-irr", "rabiIrrigated"));
    var locate = h("button", {
      type: "button", text: t("form_locate"),
      onclick: function () {
        if (!navigator.geolocation) { state.formMessage = { key: "form_err_locate", bad: true }; renderForm(); return; }
        navigator.geolocation.getCurrentPosition(function (position) {
          state.form.lat = position.coords.latitude.toFixed(2);
          state.form.lon = position.coords.longitude.toFixed(2);
          state.formMessage = null; renderForm(); renderMap();
        }, function () { state.formMessage = { key: "form_err_locate", bad: true }; renderForm(); });
      }
    });
    var go = h("button", { type: "submit", class: "go", text: t("form_go") });
    if (state.busy) go.disabled = true;
    [field("f-lat", "form_lat", number("f-lat", "lat", INDIA.latMin, INDIA.latMax)),
      field("f-lon", "form_lon", number("f-lon", "lon", INDIA.lonMin, INDIA.lonMax)),
      h("div", null, locate), kharif, rabi, h("div", null, go)
    ].forEach(function (node) { form.appendChild(node); });
    var status = byId("form-status");
    status.textContent = state.formMessage ? t(state.formMessage.key) : "";
    status.className = "note" + (state.formMessage && state.formMessage.bad ? " bad" : "");
    if (!state.crops) loadCrops().then(renderForm).catch(function (error) { console.error(error); });
  }

  function showResults(visible) {
    ["strip", "work", "soil", "climate"].forEach(function (id) { byId(id).hidden = !visible; });
    if (!visible) byId("check").hidden = true;
  }

  // Lets the voice guide (app/assistant.js) redraw when the language, place or ranking changes.
  function notify() {
    ((window.KhetSat || {}).hooks || []).forEach(function (hook) { hook(); });
  }

  function render() {
    renderChrome();
    renderMap();
    renderForm();
    notify();
    if (state.place === "custom" && !state.cache.custom) { showResults(false); return; }
    showResults(true);
    load(state.place).then(function (data) {
      renderClimate(data);
      renderRanked();
      renderCheck(data);
    }).catch(function (error) {
      console.error(error);
      var main = document.querySelector("main");
      if (!document.querySelector(".error")) {
        main.insertBefore(h("p", { class: "error", text: t("load_error") }), main.children[1]);
      }
    });
  }

  var preferred = (typeof navigator !== "undefined" && navigator.language || "").slice(0, 2).toLowerCase();
  if (LANGS.indexOf(preferred) >= 0 && window.I18N[preferred]) state.lang = preferred;

  window.KhetSat = {
    state: state, score: score, ranked: ranked, fill: fill, fmt: fmt,
    t: t, explain: explain, cropName: cropName, placeName: placeName, pointName: pointName,
    rotationLabel: rotationLabel, dateAfterJune1: dateAfterJune1, h: h, byId: byId, clear: clear,
    hooks: []
  };
  if (typeof document !== "undefined" && document.getElementById) render();
})();
