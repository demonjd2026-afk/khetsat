<img src="app/logo.svg" alt="KhetSat logo" width="72">

# KhetSat

Compare crop rotations using 45 years of NASA weather data, for Andhra Pradesh and any other place in India, in seven languages.

**Live app: https://demonjd2026-afk.github.io/khetsat/**

Entry for the **2026 NASA Space Apps Challenge**, challenge *Field Shift: Adapting Farms with NASA Data* (Visakhapatnam local event, 14-15 November 2026).

## The problem

A farmer chooses a rotation before knowing what kind of year is coming. In Anantapur, monsoon rainfall averages about 350 mm but has ranged from 144 mm to 611 mm since 1981, and the date the rains settle in moves across three months. Rain you can count on in three years out of four is only 284 mm.

## What KhetSat does

For a location, KhetSat takes the rotation in use today and compares it with two alternatives. It runs each one, day by day, through every year from 1981 to 2025 and reports how often each crop got the water it needed. For every rotation it shows:

- why it was suggested
- the evidence behind it
- the benefits it may offer
- what is not known
- what to check locally before acting

Three locations (Anantapur, Krishna, Anakapalli) come pre-analysed with sourced current rotations. For any other place in India, the farmer picks a point on the map and enters what they grow now; the app fetches NASA data for that point and compares their rotation with the two best alternatives it finds.

The farmer sets five priorities with sliders (water in a normal year, holding up in a poor year, using less water, building the soil, breaking pest cycles) and the ranking updates.

A "Suggestion for your farm" box at the top states the result in plain words: the rotation that fits best, how it holds up in a poor-rain year, when the rains usually settle, and what to check before acting.

A voice guide answers eight common questions (which rotation fits, what happens in a poor-rain year, how to read the map and the chart, how accurate the data is, what to check locally) by tap, by typing or by speaking, and reads the answer aloud in the chosen language. It is for people who do not read, or who do not follow the charts. Each answer is assembled from the figures already on the page and is never written by a language model, so the guide cannot say anything the data does not support. An optional question router (`worker/`) lets a Claude model decide which of the eight questions a free-form question matches; it is off unless its address is set in `app/config.js`, and the app falls back to keyword matching if it is unreachable.

KhetSat supports decisions. It does not replace a farmer's judgment or the local agriculture officer.

## What the data shows

Anantapur, 1981-2025:

| Rotation | Crop water need per year | Share of water need met, normal year | Seasons below 50% |
|---|---|---|---|
| Groundnut every year (current) | 511 mm | 71% | 5 of 45 |
| Groundnut one year, millet the next | 441 mm | 71% groundnut, 76% millet | 5 and 4 of 45 |
| Millet, then chickpea | 685 mm | 67% millet, 53% chickpea | 9 of 45 and 20 of 44 |

- Alternating groundnut with millet needs 14% less water and adds a second crop family.
- Millet followed by chickpea fails often; the tool shows that too.
- In Krishna, after irrigated rice, irrigated maize needs about 406 mm of irrigation a season against about 248 mm for black gram.
- Repeating the analysis on GPM IMERG satellite rainfall (2001-2025) leaves the ranking of rotations unchanged at all three locations.

Results for crops grown on leftover soil moisture in the delta are flagged as unreliable: the model does not yet represent deep delta soils. See [docs/METHODS.md](docs/METHODS.md).

## How it works

![KhetSat architecture](docs/architecture.png)

## NASA data and other sources

| Source | Used for |
|---|---|
| NASA POWER daily API (MERRA-2 rainfall and temperature, 1981-2025) | Climate indicators and the rotation water balance |
| GPM IMERG rainfall, served by NASA POWER (2001-2025) | Cross-check of rainfall and of the rotation ranking |
| NASA GIBS: MODIS NDVI, SMAP L4 root-zone soil moisture, VIIRS true colour | Satellite map in the app (display only) |
| OpenStreetMap Nominatim | Place name shown for chosen coordinates (label only) |
| FAO Irrigation and Drainage Paper 56, Tables 11 and 12 | Crop coefficients and growth-stage lengths |
| Sivakumar (1988) | Definition of monsoon onset |
| KVK Reddipalli district profile; ICAR-CRIDA contingency plan for Krishna | Current rotations |

## What is checked, and what is not

- 37 unit tests cover the calculations; one checks the radiation formula against a worked example in FAO-56.
- The in-browser engine used for other places is checked against the Python pipeline: 546 values compared, all in agreement.
- Every formula, its source, its verification status and the known limitations are listed in [docs/METHODS.md](docs/METHODS.md).
- Figures describe a NASA grid cell about 50 km across, not a field.
- Soil water storage is assumed, and every result is re-run at four storage values to show how much it matters.
- The app is available in English, Telugu, Hindi, Tamil, Kannada, Marathi and Odia. The six Indian-language versions were drafted during the hackathon and have not yet been reviewed by a second native speaker; the app says so in each of them. `node tests/i18n_check.js` checks that every language has every string and placeholder.
- The voice guide is checked without a browser: every question in every language is recognised from its keywords, and every answer for every place and language is complete (`node tests/assistant_check.js`, 634 checks). Reading aloud and voice input use the browser's own speech features, so they depend on the device: a phone or computer without a voice for a language shows the answer as text and says so. Voice input needs Chrome or Edge and an internet connection.
- How well the guide understands free wording was measured on 120 natural phrasings in English, Telugu and Hindi that were not used to build its keyword lists: 53% were routed to the right question, 33% were not recognised (the guide says so and shows the question list) and 13% got an answer on the wrong topic. All 12 out-of-scope questions were declined. The listed questions themselves are always recognised. With the optional question router switched on, the same 120 phrasings scored 97% right (116 of 120), 1 on the wrong topic and 3 not recognised, with all 12 out-of-scope questions declined (`node tests/assistant_eval.js`). The phrasings were written by the author, not collected from farmers.
- Not yet done: local soil data, prices and yields, checks against rain-gauge records, native-speaker review of the translations.

## Run it

```
python3 -m pipeline.run            # climate indicators
python3 -m pipeline.run_rotations  # rotation comparison
python3 -m pipeline.crosscheck     # satellite rainfall cross-check
python3 -m unittest discover -s tests
node tests/engine_parity.js        # in-browser engine against the pipeline
node tests/i18n_check.js           # every language has every string
node tests/assistant_check.js      # voice guide: questions recognised, answers complete
node tests/assistant_eval.js       # voice guide: share of natural phrasings understood
```

Python 3.10 or later, standard library only. Results are written to `data/processed/`.

To open the app:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000. The app is plain HTML, CSS and JavaScript with no build step.

## Repository layout

| Path | Contents |
|---|---|
| `pipeline/` | Data download, indicators, rotation engine, year types, cross-check |
| `tests/` | Unit tests |
| `data/reference/` | Crop table and candidate rotations, with their sources |
| `data/processed/` | Result files read by the app |
| `app/`, `index.html` | The web app; `app/engine.js` is the in-browser engine, `app/assistant.js` the voice guide |
| `worker/` | Optional question router (Cloudflare Worker) for the voice guide |
| `docs/` | Methods and the architecture diagram |

## Licence

MIT
