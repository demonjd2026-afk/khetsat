// KhetSat voice guide.
// Answers a fixed set of questions, by tap, by voice or by typing, and reads the answer aloud.
// Every sentence is assembled from the figures the page already shows; nothing is generated
// by a language model, so the guide cannot say anything the data does not support.
(function () {
  "use strict";

  var INTENTS = ["best", "poor", "water", "rain", "chart", "map", "trust", "check"];
  // Order used to break ties when a question matches two topics equally.
  var PRIORITY = ["trust", "map", "chart", "poor", "water", "check", "rain", "best"];
  var SPEECH_TAGS = { en: "en-IN", te: "te-IN", hi: "hi-IN", ta: "ta-IN", kn: "kn-IN", mr: "mr-IN", or: "or-IN" };

  function K() { return window.KhetSat; }

  // ---------- recognising the question ----------

  function norm(text) {
    return String(text).normalize("NFC").toLowerCase()
      .replace(/[?.,!;:।—–\-'"’()]/g, " ").replace(/\s+/g, " ").trim();
  }

  function match(text, lang, options) {
    var said = norm(text);
    if (!said) return null;
    var dicts = [window.I18N[lang], window.I18N.en].filter(Boolean);
    if (!(options && options.keywordsOnly)) {
      for (var d = 0; d < dicts.length; d++) {
        for (var i = 0; i < INTENTS.length; i++) {
          if (norm(dicts[d]["q_" + INTENTS[i]]) === said) return INTENTS[i];
        }
      }
    }
    var scores = {};
    dicts.forEach(function (dict) {
      INTENTS.forEach(function (intent) {
        ((dict.kw || {})[intent] || []).forEach(function (word) {
          var key = norm(word);
          if (key && said.indexOf(key) >= 0) scores[intent] = (scores[intent] || 0) + key.length;
        });
      });
    });
    var best = null;
    PRIORITY.forEach(function (intent) {
      if (scores[intent] && (best === null || scores[intent] > scores[best])) best = intent;
    });
    return best;
  }

  // ---------- building the answer from the page's data ----------

  function answer(intent) {
    var k = K(), t = k.t, state = k.state;
    var data = state.cache[state.place];
    var title = t("q_" + intent);
    var lines = [];
    function x(code, params) { return k.explain({ code: code, params: params || {} }); }

    if (intent === "map") {
      lines.push(t("a_map"));
      lines.push(t("map_key_" + state.mapLayer));
      return { title: title, lines: lines };
    }
    if (!data) return { title: title, lines: [t("form_intro")] };

    var order = k.ranked(data.rotations.rotations);
    var top = order[0].rotation;
    var summary = data.climate.summary;

    if (intent === "best") {
      lines.push(t("a_best", { place: k.placeName(state.place), rotation: k.rotationLabel(top), score: order[0].score }));
      if (top.existing) lines.push(t("a_best_current"));
      else top.explanation.why_suggested.forEach(function (entry) { lines.push(k.explain(entry)); });
      top.explanation.evidence.forEach(function (entry) { lines.push(k.explain(entry)); });
      order.slice(1).forEach(function (entry) {
        lines.push(t("a_best_next", { rotation: k.rotationLabel(entry.rotation), score: entry.score }));
      });
      lines.push(x("no_market"));
      lines.push(t("disclaimer"));
    } else if (intent === "poor") {
      lines.push(t("a_poor_intro"));
      order.forEach(function (entry) {
        var parts = entry.rotation.crops.map(function (crop) {
          var name = k.cropName(crop.crop);
          return crop.irrigated ? t("a_poor_irrigated", { crop: name })
            : t("a_poor_crop", { crop: name, bad: crop.wrsi_bad_year, failed: crop.failed_seasons, total: crop.seasons_simulated });
        });
        lines.push(k.rotationLabel(entry.rotation) + ". " + parts.join(" "));
      });
    } else if (intent === "water") {
      order.forEach(function (entry) {
        var r = entry.rotation;
        var line = t("a_water_line", { rotation: k.rotationLabel(r), mm: Math.round(r.crop_water_need_mm_per_year) });
        if (r.irrigation_mm_per_year > 0) line += " " + t("a_water_irr", { mm: Math.round(r.irrigation_mm_per_year) });
        lines.push(line);
      });
      lines.push(x("soil_assumed", { mm: state.soil }));
    } else if (intent === "rain") {
      var rain = summary.monsoon_rain_mm;
      lines.push(t("a_rain", { mean: Math.round(rain.mean), dep: Math.round(rain.dependable_75) }));
      if (summary.onset.p10_days_after_jun1 !== null) {
        lines.push(t("a_rain_onset", {
          from: k.dateAfterJune1(summary.onset.p10_days_after_jun1),
          to: k.dateAfterJune1(summary.onset.p90_days_after_jun1)
        }));
      }
      var trend = rain.trend;
      lines.push(!trend.significant ? t("trend_flat")
        : t(trend.slope_per_decade > 0 ? "trend_up" : "trend_down", { value: Math.abs(Math.round(trend.slope_per_decade)) }));
    } else if (intent === "chart") {
      lines.push(t("strip_intro"));
      lines.push(t("a_chart"));
    } else if (intent === "trust") {
      var check = data.check;
      if (check) {
        var both = check.monsoon_rain;
        lines.push(t("check_intro", { from: check.period[0], to: check.period[1] }));
        lines.push(t("check_together", { r: both.pearson_r.toFixed(2) }));
        lines.push(t(both.mean_difference_percent < 0 ? "check_wetter" : "check_drier",
          { percent: Math.abs(both.mean_difference_percent) }));
        lines.push(t("check_driest", { n: both.driest_five_in_common }));
        lines.push(t(check.ranking_agrees ? "check_rank_same" : "check_rank_diff"));
      } else {
        lines.push(t("a_trust_custom"));
      }
      lines.push(t("grid_note", { point: k.pointName(state.place) }));
      lines.push(t("a_trust_not"));
      lines.push(t("a_trust_use"));
    } else if (intent === "check") {
      lines.push(t("a_check_intro"));
      var seen = {};
      top.explanation.risks_for_local_review.concat(top.explanation.information_gaps).forEach(function (entry) {
        var text = k.explain(entry);
        if (!seen[text]) { seen[text] = true; lines.push(text); }
      });
      lines.push(t("disclaimer"));
    }
    return { title: title, lines: lines };
  }

  // Text as it should be spoken: units written out, one sentence per chunk.
  function spoken(lines, lang) {
    var dict = window.I18N[lang] || window.I18N.en;
    var chunks = [];
    lines.forEach(function (line) {
      var text = String(line);
      if (lang === "en") text = text.replace(/(\d)\s*mm\b/g, "$1 " + dict.say_mm);
      else if (dict.mm_abbr) text = text.split(dict.mm_abbr).join(dict.say_mm + " ");
      text.replace(/([.!?।:])\s+/g, "$1\u0001").split("\u0001").forEach(function (part) {
        part = part.trim();
        if (part) chunks.push(part);
      });
    });
    return chunks;
  }

  window.KhetAssist = { INTENTS: INTENTS, match: match, answer: answer, spoken: spoken, norm: norm };
  if (typeof document === "undefined" || !document.getElementById || !K()) return;

  // ---------- page ----------

  var k = K(), t = k.t, h = k.h, byId = k.byId, clear = k.clear;
  var synth = window.speechSynthesis || null;
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a5 5 0 0 1 0 7M18.8 5.8a9 9 0 0 1 0 12.4"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

  var ui = { current: null, heard: "", status: null, speaking: false, listening: false, open: false, rec: null };

  function iconButton(className, icon, label, onclick) {
    var button = h("button", { type: "button", class: className, onclick: onclick });
    button.innerHTML = icon + "<span></span>";
    button.lastChild.textContent = label;
    return button;
  }
  function setLabel(button, icon, label) {
    button.innerHTML = icon + "<span></span>";
    button.lastChild.textContent = label;
  }

  // ---------- speech out ----------

  function voiceFor(lang) {
    if (!synth) return { ok: false };
    var voices = synth.getVoices() || [];
    var tag = SPEECH_TAGS[lang] || "en-IN";
    var prefix = tag.slice(0, 2);
    var exact = voices.filter(function (v) { return v.lang.replace("_", "-") === tag; })[0];
    var any = voices.filter(function (v) { return v.lang.slice(0, 2).toLowerCase() === prefix; })[0];
    // Some phones report no voice list but still speak the language through the system engine.
    return { ok: Boolean(exact || any) || voices.length === 0, voice: exact || any || null, tag: tag };
  }

  function stopSpeaking() {
    if (synth) synth.cancel();
    ui.speaking = false;
    paintControls();
  }

  function speak(lines) {
    if (!synth) return;
    synth.cancel();
    var lang = k.state.lang;
    var pick = voiceFor(lang);
    if (!pick.ok) {
      ui.status = { key: "assist_no_voice", params: { lang: (window.I18N[lang] || {}).lang_name || lang }, bad: true };
      ui.speaking = false;
      paintControls();
      return;
    }
    var chunks = spoken(lines, lang);
    ui.speaking = true;
    chunks.forEach(function (chunk, index) {
      var utterance = new window.SpeechSynthesisUtterance(chunk);
      utterance.lang = pick.tag;
      if (pick.voice) utterance.voice = pick.voice;
      utterance.rate = 0.92;
      if (index === chunks.length - 1) {
        utterance.onend = function () { ui.speaking = false; paintControls(); };
      }
      utterance.onerror = function (event) {
        if (event.error === "interrupted" || event.error === "canceled") return;
        ui.speaking = false;
        ui.status = { key: "assist_no_voice", params: { lang: (window.I18N[lang] || {}).lang_name || lang }, bad: true };
        paintControls();
      };
      synth.speak(utterance);
    });
    paintControls();
  }

  // ---------- speech in ----------

  function listen() {
    if (!Recognition) { ui.status = { key: "assist_no_mic", bad: true }; paintControls(); return; }
    if (ui.listening && ui.rec) { ui.rec.stop(); return; }
    stopSpeaking();
    var rec = new Recognition();
    ui.rec = rec;
    rec.lang = SPEECH_TAGS[k.state.lang] || "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onstart = function () { ui.listening = true; ui.status = { key: "assist_listening" }; paintControls(); };
    rec.onend = function () {
      ui.listening = false;
      if (ui.status && ui.status.key === "assist_listening") ui.status = { key: "assist_mic_error", bad: true };
      paintControls();
    };
    rec.onerror = function (event) {
      var blocked = ["not-allowed", "service-not-allowed", "language-not-supported", "audio-capture"].indexOf(event.error) >= 0;
      ui.status = { key: blocked ? "assist_no_mic" : "assist_mic_error", bad: true };
      paintControls();
    };
    rec.onresult = function (event) {
      var options = event.results[0], heard = options[0].transcript, intent = null;
      for (var i = 0; i < options.length && !intent; i++) {
        intent = match(options[i].transcript, k.state.lang);
        if (intent) heard = options[i].transcript;
      }
      ui.status = null;
      ask(intent, heard);
    };
    try { rec.start(); } catch (error) { ui.status = { key: "assist_mic_error", bad: true }; paintControls(); }
  }

  // ---------- asking ----------

  function ask(intent, heard) {
    ui.heard = heard || "";
    ui.current = intent || "unknown";
    if (heard === undefined) ui.status = null;
    openPanel();
    paintAnswer();
    // On a small screen the answer sits below the list of questions; bring it into view.
    var panel = byId("assist-panel"), target = byId("assist-status");
    if (panel && target && panel.scrollHeight > panel.clientHeight) panel.scrollTop = Math.max(0, target.offsetTop - 8);
    var lines = intent ? [answer(intent).title].concat(answer(intent).lines) : [t("assist_unknown")];
    speak(lines);
  }

  function openPanel() {
    ui.open = true;
    byId("assist-panel").hidden = false;
    byId("assist-fab").setAttribute("aria-expanded", "true");
  }
  function closePanel() {
    ui.open = false;
    stopSpeaking();
    if (ui.listening && ui.rec) ui.rec.stop();
    byId("assist-panel").hidden = true;
    byId("assist-fab").setAttribute("aria-expanded", "false");
  }

  // ---------- drawing ----------

  function paintAnswer() {
    var box = clear(byId("assist-answer"));
    byId("assist-heard").textContent = ui.heard ? t("assist_heard", { text: ui.heard }) : "";
    if (!ui.current) return;
    if (ui.current === "unknown") { box.appendChild(h("p", { text: t("assist_unknown") })); return; }
    var reply = answer(ui.current);
    box.appendChild(h("h3", { text: reply.title }));
    reply.lines.forEach(function (line) { box.appendChild(h("p", { text: line })); });
  }

  function paintControls() {
    var speakButton = byId("assist-speak");
    if (speakButton) {
      speakButton.hidden = !synth || !ui.current;
      setLabel(speakButton, ui.speaking ? ICON_STOP : ICON_SPEAKER, t(ui.speaking ? "assist_stop" : "assist_listen"));
    }
    var mic = byId("assist-mic");
    if (mic) {
      mic.hidden = !Recognition;
      mic.setAttribute("aria-pressed", String(ui.listening));
      setLabel(mic, ICON_MIC, t(ui.listening ? "assist_listening" : "assist_mic"));
    }
    var status = byId("assist-status");
    if (status) {
      var message = ui.status || (!Recognition && ui.open ? { key: "assist_no_mic" } : null);
      status.textContent = message ? t(message.key, message.params) : "";
      status.className = "note" + (message && message.bad ? " bad" : "");
    }
  }

  function paintTrust() {
    var section = byId("trust");
    if (!section) return;
    var data = k.state.cache[k.state.place];
    section.hidden = !data;
    if (!data) return;
    byId("trust-title").textContent = t("q_trust");
    var list = clear(byId("trust-points"));
    answer("trust").lines.forEach(function (line) { list.appendChild(h("li", { text: line })); });
  }

  function refresh() {
    document.querySelectorAll("[data-say]").forEach(function (button) {
      setLabel(button, ICON_SPEAKER, t(button.getAttribute("data-label") || "assist_listen"));
    });
    setLabel(byId("assist-fab"), ICON_MIC, t("assist_open"));
    setLabel(byId("assist-top"), ICON_MIC, t("assist_open"));
    byId("assist-title").textContent = t("assist_title");
    byId("assist-intro").textContent = t("assist_intro");
    byId("assist-close").setAttribute("aria-label", t("assist_close"));
    byId("assist-input").setAttribute("placeholder", t("assist_type"));
    byId("assist-input").setAttribute("aria-label", t("assist_type"));
    byId("assist-send").textContent = t("assist_send");
    var chips = clear(byId("assist-chips"));
    INTENTS.forEach(function (intent) {
      chips.appendChild(h("button", { type: "button", text: t("q_" + intent), onclick: function () { ask(intent); } }));
    });
    paintAnswer();
    paintControls();
    paintTrust();
  }

  function sayButton(intent, labelKey, className) {
    var button = iconButton(className || "say", ICON_SPEAKER, "", function () { ask(intent); });
    button.setAttribute("data-say", intent);
    if (labelKey) button.setAttribute("data-label", labelKey);
    return button;
  }

  function build() {
    // Large listen and ask buttons under the list of places, for people who do not read.
    var bar = h("div", { class: "listen-bar" });
    bar.appendChild(sayButton("best", "listen_summary", "say big"));
    var top = iconButton("say big ask", ICON_MIC, "", function () { openPanel(); paintControls(); if (Recognition) listen(); });
    top.id = "assist-top";
    bar.appendChild(top);
    var places = byId("places");
    places.parentNode.insertBefore(bar, places.nextSibling);

    // A listen button beside each section heading.
    [["strip-title", "chart"], ["map-title", "map"], ["rotations-title", "best"],
      ["climate-title", "rain"], ["check-title", "trust"], ["trust-title", "trust"]].forEach(function (pair) {
      var heading = byId(pair[0]);
      if (heading) heading.parentNode.insertBefore(sayButton(pair[1]), heading.nextSibling);
    });

    var fab = iconButton("assist-fab", ICON_MIC, "", function () { if (ui.open) closePanel(); else { openPanel(); paintControls(); } });
    fab.id = "assist-fab";
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-controls", "assist-panel");

    var close = h("button", { type: "button", id: "assist-close", class: "assist-close", text: "×", onclick: closePanel });
    var mic = iconButton("assist-mic", ICON_MIC, "", listen);
    mic.id = "assist-mic";
    var input = h("input", { id: "assist-input", type: "text", autocomplete: "off" });
    var form = h("form", { class: "assist-form" }, input, h("button", { type: "submit", id: "assist-send" }));
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      ui.status = null;
      ask(match(text, k.state.lang), text);
      input.value = "";
    });
    var speakButton = iconButton("assist-speak", ICON_SPEAKER, "", function () {
      if (ui.speaking) { stopSpeaking(); return; }
      if (!ui.current) return;
      ui.status = null;
      speak(ui.current === "unknown" ? [t("assist_unknown")] : [answer(ui.current).title].concat(answer(ui.current).lines));
    });
    speakButton.id = "assist-speak";

    var panel = h("section", { id: "assist-panel", class: "assist-panel", role: "dialog", "aria-labelledby": "assist-title", hidden: "" },
      h("div", { class: "assist-head" }, h("h2", { id: "assist-title" }), close),
      h("p", { id: "assist-intro", class: "note" }),
      h("div", { id: "assist-chips", class: "assist-chips" }),
      h("div", { class: "assist-ask" }, mic, form),
      h("p", { id: "assist-status", class: "note", role: "status" }),
      h("p", { id: "assist-heard", class: "note" }),
      h("div", { id: "assist-answer", class: "assist-answer", "aria-live": "polite" }),
      speakButton);
    document.body.appendChild(panel);
    document.body.appendChild(fab);

    document.addEventListener("keydown", function (event) { if (event.key === "Escape" && ui.open) closePanel(); });
    if (synth && "onvoiceschanged" in synth) synth.onvoiceschanged = paintControls;
    window.addEventListener("pagehide", function () { if (synth) synth.cancel(); });
  }

  var lastLang = k.state.lang;
  build();
  k.hooks.push(function () {
    if (k.state.lang !== lastLang) { lastLang = k.state.lang; stopSpeaking(); ui.status = null; }
    refresh();
  });
  refresh();
})();
