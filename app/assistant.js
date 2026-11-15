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

  // The listed question itself, word for word, in the current language or in English.
  function exact(text, lang) {
    var said = norm(text);
    var dicts = [window.I18N[lang], window.I18N.en].filter(Boolean);
    for (var d = 0; d < dicts.length; d++) {
      for (var i = 0; i < INTENTS.length; i++) {
        if (norm(dicts[d]["q_" + INTENTS[i]]) === said) return INTENTS[i];
      }
    }
    return null;
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
    var title = intent === "advice" ? t("advice_title") : t("q_" + intent);
    var lines = [];
    var heads = {};   // line number -> the opening words to show in bold
    function x(code, params) { return k.explain({ code: code, params: params || {} }); }

    if (intent === "map") {
      lines.push(t("a_map"));
      lines.push(t("map_key_" + state.mapLayer));
      return { title: title, lines: lines, heads: heads };
    }
    if (!data) return { title: title, lines: [t("form_intro")] };

    var order = k.ranked(data.rotations.rotations);
    var top = order[0].rotation;
    var summary = data.climate.summary;

    if (intent === "advice") {
      // The short version shown at the top of the page: which rotation, how it does in a
      // poor-rain year, when the rains settle, and the reminder to check locally.
      // Said the way a person would say it: no percentages or scores, only "about half",
      // "about 1 year in 9". The exact figures stay in the rotation cards below.
      lines.push(t("adv_pick", { place: k.placeName(state.place), rotation: k.rotationLabel(top) }));
      if (top.existing) lines.push(t("a_best_current"));
      // One reason is enough here; the full list is on the Rotations tab.
      else if (top.explanation.why_suggested.length) lines.push(k.explain(top.explanation.why_suggested[0]));
      top.crops.forEach(function (crop) {
        var name = k.cropName(crop.crop);
        if (crop.irrigated) { lines.push(t("a_poor_irrigated", { crop: name })); return; }
        var share = crop.wrsi_bad_year;
        var band = share >= 88 ? 90 : share >= 71 ? 75 : share >= 62 ? 60 : share >= 55 ? 55 : share >= 45 ? 45 : 0;
        var often = crop.failed_seasons > 0
          ? t("adv_fail", { k: Math.max(2, Math.round(crop.seasons_simulated / crop.failed_seasons)) })
          : t("adv_nofail", { total: crop.seasons_simulated });
        lines.push(t("adv_dry_" + band, { crop: name }) + " " + often);
      });
      var rainfed = top.crops.some(function (crop) { return !crop.irrigated; });
      if (rainfed && summary.onset.p10_days_after_jun1 !== null) {
        lines.push(t("a_rain_onset", {
          from: k.dateAfterJune1(summary.onset.p10_days_after_jun1),
          to: k.dateAfterJune1(summary.onset.p90_days_after_jun1)
        }) + " " + t("a_sow"));
      }
      lines.push(t("adv_end"));
    } else if (intent === "best") {
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
        heads[lines.length] = k.rotationLabel(entry.rotation) + ".";
        lines.push(k.rotationLabel(entry.rotation) + ". " + parts.join(" "));
      });
    } else if (intent === "water") {
      order.forEach(function (entry) {
        var r = entry.rotation;
        var line = t("a_water_line", { rotation: k.rotationLabel(r), mm: Math.round(r.crop_water_need_mm_per_year) });
        if (r.irrigation_mm_per_year > 0) line += " " + t("a_water_irr", { mm: Math.round(r.irrigation_mm_per_year) });
        heads[lines.length] = k.rotationLabel(r);
        lines.push(line);
      });
      lines.push(k.soilNow() === null ? x("soil_assumed", { mm: 100 }) : x("soil_chosen", { mm: k.soilNow() }));
    } else if (intent === "rain") {
      var rain = summary.monsoon_rain_mm;
      lines.push(t("a_rain", { mean: Math.round(rain.mean), dep: Math.round(rain.dependable_75) }));
      if (summary.onset.p10_days_after_jun1 !== null) {
        lines.push(t("a_rain_onset", {
          from: k.dateAfterJune1(summary.onset.p10_days_after_jun1),
          to: k.dateAfterJune1(summary.onset.p90_days_after_jun1)
        }));
        lines.push(t("a_sow"));
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
      // Anantapur only: the failed seasons were compared with published drought reports
      // (docs/METHODS.md). The stored result is used, so a changed soil does not alter the claim.
      var now = (data.rotations.rotations || []).filter(function (r) { return r.existing; })[0];
      var dry = now && now.crops.filter(function (c) { return !c.irrigated && (c.failed_years || []).length; })[0];
      if (state.place === "anantapur" && dry && k.soilNow() === null && dry.failed_years.join() === "2002,2003,2016,2018,2023") {
        lines.push(t("a_trust_drought", { crop: k.cropName(dry.crop), years: dry.failed_years.join(", ") }));
      }
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
    return { title: title, lines: lines, heads: heads };
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

  // Decides which question was asked. A listed question is recognised directly. Otherwise,
  // if a question router is configured (app/config.js), a language model picks the question;
  // if it is not configured, is slow or fails, keyword matching is used. The model only
  // chooses among the fixed questions; it never writes the answer.
  function route(text, lang, done) {
    var listed = exact(text, lang);
    var url = (window.KHETSAT_CONFIG || {}).aiUrl;
    if (listed || !url || typeof fetch !== "function") { done(listed || match(text, lang), "local"); return; }
    var finished = false;
    function finish(intent, how) { if (!finished) { finished = true; done(intent, how); } }
    var timer = setTimeout(function () { finish(match(text, lang), "local"); }, 6000);
    fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(text).slice(0, 300), lang: lang })
    }).then(function (response) {
      if (!response.ok) throw new Error("router: " + response.status);
      return response.json();
    }).then(function (json) {
      clearTimeout(timer);
      if (INTENTS.indexOf(json.intent) >= 0) finish(json.intent, "model");
      // When the model finds no match, the keyword lists get a second look.
      else if (json.intent === "none") finish(match(text, lang), "model, then local");
      else finish(match(text, lang), "local");
    }).catch(function () { clearTimeout(timer); finish(match(text, lang), "local"); });
  }

  window.KhetAssist = { INTENTS: INTENTS, match: match, exact: exact, route: route, answer: answer, spoken: spoken, norm: norm };
  if (typeof document === "undefined" || !document.getElementById || !K()) return;

  // ---------- page ----------

  var k = K(), t = k.t, h = k.h, byId = k.byId, clear = k.clear;
  var synth = window.speechSynthesis || null;
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var ICON_SPEAKER = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M16 8.5a5 5 0 0 1 0 7M18.8 5.8a9 9 0 0 1 0 12.4"/></svg>';
  var ICON_MIC = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  var ICON_NEW = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
  var ICON_EXPAND = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>';
  var ICON_STOP = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';

  // thread: the conversation shown in the panel, oldest first.
  //   { role: "user", intent } for a tapped question, { role: "user", text } for the person's own words,
  //   { role: "bot", intent, free } for an answer; free marks an answer to the person's own words.
  var ui = { thread: [], typing: false, current: null, status: null, speaking: false, listening: false, open: false, rec: null };

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
    speechRun++;
    if (synth && (synth.speaking || synth.pending)) { synth.cancel(); lastCancel = Date.now(); }
    ui.speaking = false;
    paintControls();
  }

  // Speaking. Three things are guarded against, all seen in Chrome:
  //  - an utterance queued straight after cancel() can be dropped, so after a cancel the new
  //    speech is queued a moment later;
  //  - the browser's speech engine can stop responding altogether (it is shared by every tab);
  //    if nothing starts within a few seconds the person is told to restart the browser;
  //  - utterances that nothing refers to can be discarded mid-queue, so they are kept in a list.
  var speechRun = 0;
  var lastCancel = 0;

  function speak(lines) {
    if (!synth) return;
    var run = ++speechRun;
    var lang = k.state.lang;
    var pick = voiceFor(lang);
    var wasBusy = synth.speaking || synth.pending || Date.now() - lastCancel < 200;
    if (synth.speaking || synth.pending) synth.cancel();
    if (synth.paused) synth.resume();
    if (!pick.ok) {
      ui.status = { key: "assist_no_voice", params: { lang: (window.I18N[lang] || {}).lang_name || lang }, bad: true };
      ui.speaking = false;
      paintControls();
      return;
    }
    var chunks = spoken(lines, lang);
    var started = false;
    ui.speaking = true;
    ui.utterances = [];
    function queue() {
      if (run !== speechRun) return;
      chunks.forEach(function (chunk, index) {
        var utterance = new window.SpeechSynthesisUtterance(chunk);
        utterance.lang = pick.tag;
        if (pick.voice) utterance.voice = pick.voice;
        utterance.rate = 0.92;
        utterance.onstart = function () { started = true; };
        if (index === chunks.length - 1) {
          utterance.onend = function () { if (run === speechRun) { ui.speaking = false; paintControls(); } };
        }
        utterance.onerror = function (event) {
          if (event.error === "interrupted" || event.error === "canceled" || run !== speechRun) return;
          ui.speaking = false;
          ui.status = { key: event.error === "not-allowed" ? "assist_voice_stuck" : "assist_no_voice",
            params: { lang: (window.I18N[lang] || {}).lang_name || lang }, bad: true };
          paintControls();
        };
        ui.utterances.push(utterance);
        synth.speak(utterance);
      });
      window.setTimeout(function () {
        if (run !== speechRun || started || !ui.speaking) return;
        synth.cancel();
        ui.speaking = false;
        ui.status = { key: "assist_voice_stuck", bad: true };
        paintControls();
      }, 4000);
    }
    if (wasBusy) window.setTimeout(queue, 120); else queue();
    paintControls();
  }

  // ---------- speech in ----------

  function listen() {
    if (!Recognition) { ui.status = { key: "assist_no_mic", bad: true }; paintControls(); return; }
    if (ui.listening && ui.rec) { ui.rec.stop(); return; }
    if (ui.rec) { try { ui.rec.onresult = null; ui.rec.abort(); } catch (error) { /* already ended */ } }
    stopSpeaking();
    var rec = new Recognition();
    ui.rec = rec;
    rec.lang = SPEECH_TAGS[k.state.lang] || "en-IN";
    rec.maxAlternatives = 3;
    // The browser reports the words as they are heard, a piece at a time. They are shown in the
    // status line while the person speaks; the question is sent once, when the microphone stops
    // (a second press on the button, or a pause in speech).
    var heard = "";
    rec.interimResults = true;
    rec.onstart = function () { ui.listening = true; ui.status = { key: "assist_listening" }; paintControls(); };
    rec.onresult = function (event) {
      var parts = [];
      for (var i = 0; i < event.results.length; i++) parts.push(event.results[i][0].transcript);
      heard = parts.join(" ").replace(/\s+/g, " ").trim();
      if (heard) { ui.status = { key: "assist_heard", params: { text: heard } }; paintControls(); }
    };
    rec.onerror = function (event) {
      if (event.error === "no-speech" || event.error === "aborted") return;
      var blocked = ["not-allowed", "service-not-allowed", "language-not-supported", "audio-capture"].indexOf(event.error) >= 0;
      ui.status = { key: blocked ? "assist_no_mic" : "assist_mic_error", bad: true };
      heard = "";
      paintControls();
    };
    rec.onend = function () {
      ui.listening = false;
      if (ui.rec === rec) ui.rec = null;
      if (heard) {
        var text = heard;
        heard = "";
        ui.status = null;
        if ((window.KHETSAT_CONFIG || {}).aiUrl) askFree(text); else askFree(text, match(text, k.state.lang));
      } else if (ui.status && ui.status.key === "assist_listening") {
        ui.status = { key: "assist_mic_error", bad: true };
      }
      paintControls();
    };
    try { rec.start(); } catch (error) { ui.status = { key: "assist_mic_error", bad: true }; paintControls(); }
  }

  // ---------- asking ----------

  function linesFor(message) {
    if (message.intent === "unknown") return [t("assist_unknown")];
    var reply = answer(message.intent);
    return (message.free ? [reply.title] : []).concat(reply.lines);
  }

  function say(text) {
    ui.thread.push(text);
    if (ui.thread.length > 30) ui.thread = ui.thread.slice(-30);
  }

  function respond(intent, free, alreadySpeaking, how) {
    ui.typing = false;
    // "how" records whether the AI router or the keyword lists worked out the question.
    var message = { role: "bot", intent: intent || "unknown", free: Boolean(free), via: how || "" };
    say(message);
    ui.current = message;
    paintThread();
    paintControls();
    if (!alreadySpeaking) speak(linesFor(message));
  }

  // A tapped question or a section's Listen button.
  function ask(intent) {
    ui.status = null;
    stopSpeaking();
    openPanel();
    say({ role: "user", intent: intent });
    ui.typing = true;
    paintThread();
    // Start speaking during the tap itself; the written answer follows after the typing dots.
    speak(linesFor({ intent: intent, free: false }));
    window.setTimeout(function () { respond(intent, false, true); }, 450);
  }

  // The person's own words, typed or spoken. If the question is already known (speech matched
  // on the device), it is passed in; otherwise it is worked out here.
  function askFree(text, known) {
    // Ignore a repeat of the same words within a few seconds (a double report from the
    // microphone, or a double press), and never answer one question twice.
    var now = Date.now();
    if (ui.lastFree && ui.lastFree.text === text && now - ui.lastFree.at < 4000) return;
    ui.lastFree = { text: text, at: now };
    var answered = false;
    function once(intent, how) { if (!answered) { answered = true; respond(intent, true, false, how); } }
    ui.status = null;
    stopSpeaking();
    openPanel();
    say({ role: "user", text: text });
    ui.typing = true;
    paintThread();
    if (known !== undefined) { window.setTimeout(function () { once(known); }, 450); return; }
    route(text, k.state.lang, once);
  }

  function openPanel() {
    ui.open = true;
    byId("assist-panel").hidden = false;
    byId("assist-fab").hidden = byId("assist-panel").classList.contains("wide");
    byId("assist-fab").setAttribute("aria-expanded", "true");
  }
  function closePanel() {
    ui.open = false;
    stopSpeaking();
    if (ui.listening && ui.rec) ui.rec.stop();
    byId("assist-panel").hidden = true;
    byId("assist-fab").hidden = false;
    byId("assist-fab").setAttribute("aria-expanded", "false");
  }

  // ---------- drawing ----------

  // Lays an answer out as a lead sentence, a list of points and small-print caveats.
  function structure(bubble, reply) {
    var caveats = [t("disclaimer"), k.explain({ code: "no_market", params: {} }), t("adv_end")];
    var lines = reply.lines.slice(), notes = [];
    while (lines.length > 1 && caveats.indexOf(lines[lines.length - 1]) >= 0) notes.unshift(lines.pop());
    if (lines.length === 1 && !notes.length) { bubble.appendChild(h("p", { text: lines[0] })); return; }
    bubble.appendChild(h("p", { class: "lead", text: lines[0] }));
    if (lines.length > 1) {
      var list = h("ul", { class: "points" });
      lines.slice(1).forEach(function (line, offset) {
        var head = (reply.heads || {})[offset + 1];
        if (!head) {
          var colon = line.indexOf(":");
          if (colon > 0 && colon <= 30 && line.slice(0, colon).indexOf(".") < 0) head = line.slice(0, colon + 1);
        }
        if (head && line.indexOf(head) === 0) list.appendChild(h("li", null, h("strong", { text: head }), line.slice(head.length)));
        else list.appendChild(h("li", { text: line }));
      });
      bubble.appendChild(list);
    }
    notes.forEach(function (note) { bubble.appendChild(h("p", { class: "fine", text: note })); });
  }

  function paintThread() {
    var box = clear(byId("assist-answer"));
    box.appendChild(h("div", { class: "msg bot" }, h("p", { text: t("assist_intro") })));
    var lastQuestion = null;
    ui.thread.forEach(function (message) {
      if (message.role === "user") {
        var words = message.text || t(message.intent === "advice" ? "advice_title" : "q_" + message.intent);
        lastQuestion = h("div", { class: "msg user", text: words });
        box.appendChild(lastQuestion);
        return;
      }
      var bubble = h("div", { class: "msg bot" });
      if (message.intent === "unknown") {
        bubble.appendChild(h("p", { text: t("assist_unknown") }));
      } else {
        var reply = answer(message.intent);
        if (message.free) bubble.appendChild(h("div", { class: "matched", text: reply.title }));
        if (message.free && message.via === "model") bubble.appendChild(h("div", { class: "via", text: t("assist_via_ai") }));
        structure(bubble, reply);
      }
      box.appendChild(bubble);
    });
    if (ui.typing) box.appendChild(h("div", { class: "msg bot typing", "aria-hidden": "true" }, h("i"), h("i"), h("i")));
    // Keep the latest question at the top of the view so its answer is read from the start.
    if (lastQuestion && lastQuestion.getBoundingClientRect) {
      box.scrollTop = Math.max(0, box.scrollTop + lastQuestion.getBoundingClientRect().top - box.getBoundingClientRect().top - 6);
    } else box.scrollTop = 0;
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

  function paintAdvice() {
    var section = byId("advice");
    if (!section) return;
    var data = k.state.cache[k.state.place];
    section.hidden = !data;
    if (!data) return;
    byId("advice-title").textContent = t("advice_title");
    structure(clear(byId("advice-points")), answer("advice"));
  }

  function refresh() {
    document.querySelectorAll("[data-say]").forEach(function (button) {
      setLabel(button, ICON_SPEAKER, t(button.getAttribute("data-label") || "assist_listen"));
    });
    setLabel(byId("assist-fab"), ICON_MIC, t("assist_open"));
    byId("assist-title").textContent = t("assist_title");
    byId("assist-close").setAttribute("aria-label", t("assist_close"));
    ["assist-clear", "assist-expand"].forEach(function (id) {
      var label = t(id.replace("-", "_"));
      byId(id).setAttribute("aria-label", label);
      byId(id).setAttribute("title", label);
    });
    byId("assist-input").setAttribute("placeholder", t("assist_type"));
    byId("assist-input").setAttribute("aria-label", t("assist_type"));
    byId("assist-send").textContent = t("assist_send");
    var chips = clear(byId("assist-chips"));
    INTENTS.forEach(function (intent) {
      chips.appendChild(h("button", { type: "button", text: t("q_" + intent), onclick: function () { ask(intent); } }));
    });
    paintThread();
    paintControls();
    paintTrust();
    paintAdvice();
  }

  function sayButton(intent, labelKey, className) {
    var button = iconButton(className || "say", ICON_SPEAKER, "", function () { ask(intent); });
    button.setAttribute("data-say", intent);
    if (labelKey) button.setAttribute("data-label", labelKey);
    return button;
  }

  function build() {
    // A listen button beside each section heading.
    [["strip-title", "chart"], ["map-title", "map"], ["rotations-title", "best"],
      ["climate-title", "rain"], ["check-title", "trust"], ["trust-title", "trust"], ["advice-title", "advice"]].forEach(function (pair) {
      var heading = byId(pair[0]);
      // The suggestion gets one large button, for people who do not read.
      var button = pair[1] === "advice" ? sayButton("advice", "listen_summary", "say big") : sayButton(pair[1]);
      if (heading) heading.parentNode.insertBefore(button, heading.nextSibling);
    });

    var fab = iconButton("assist-fab", ICON_MIC, "", function () { if (ui.open) closePanel(); else { openPanel(); paintControls(); } });
    fab.id = "assist-fab";
    fab.setAttribute("aria-expanded", "false");
    fab.setAttribute("aria-controls", "assist-panel");

    var close = h("button", { type: "button", id: "assist-close", class: "assist-close", text: "×", onclick: closePanel });
    // Start a new conversation, and switch between the small panel and a large window.
    var clearButton = h("button", { type: "button", id: "assist-clear", class: "assist-tool", onclick: function () {
      stopSpeaking(); ui.thread = []; ui.typing = false; ui.current = null; ui.status = null;
      paintThread(); paintControls();
    } });
    clearButton.innerHTML = ICON_NEW;
    var expandButton = h("button", { type: "button", id: "assist-expand", class: "assist-tool", "aria-pressed": "false", onclick: function () {
      var wide = byId("assist-panel").classList.toggle("wide");
      expandButton.setAttribute("aria-pressed", String(wide));
      byId("assist-fab").hidden = wide;
      paintThread();
    } });
    expandButton.innerHTML = ICON_EXPAND;
    var mic = iconButton("assist-mic", ICON_MIC, "", listen);
    mic.id = "assist-mic";
    var input = h("input", { id: "assist-input", type: "text", autocomplete: "off" });
    var form = h("form", { class: "assist-form" }, input, h("button", { type: "submit", id: "assist-send" }));
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      askFree(text);
    });
    var speakButton = iconButton("assist-speak", ICON_SPEAKER, "", function () {
      if (ui.speaking) { stopSpeaking(); return; }
      if (!ui.current) return;
      ui.status = null;
      speak(linesFor(ui.current));
    });
    speakButton.id = "assist-speak";

    var panel = h("section", { id: "assist-panel", class: "assist-panel", role: "dialog", "aria-labelledby": "assist-title", hidden: "" },
      h("div", { class: "assist-head" }, h("h2", { id: "assist-title" }), speakButton, clearButton, expandButton, close),
      h("div", { id: "assist-answer", class: "assist-log", "aria-live": "polite" }),
      h("div", { id: "assist-chips", class: "assist-chips" }),
      h("p", { id: "assist-status", class: "note", role: "status" }),
      h("div", { class: "assist-ask" }, mic, form));
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
