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

The farmer can also give their soil. Choosing a soil type, asking for an estimate from the SoilGrids soil map, or typing a known water-storage value re-runs the 45 years with that soil instead of the default 100 mm. A "What has changed" section sets the last fifteen years against the thirty before: monsoon rain, the date the rains settle, and how often each rotation failed.

The farmer sets five priorities with sliders (water in a normal year, holding up in a poor year, using less water, building the soil, breaking pest cycles) and the ranking updates.

The page has five tabs, so a farmer sees one thing at a time:

| Tab | What it holds |
|---|---|
| Suggestion | The result in everyday words, with one large "Hear the result" button |
| Rotations | The priority sliders, the soil choice, the three ranked rotations and the soil what-if table |
| Rain | The year-in-the-field chart, what has changed, and the 45-year record |
| Map | NASA satellite layers by month and year |
| Accuracy | How accurate the data is, and the check against satellite rainfall |

The Suggestion tab opens first. It says which rotation fits best, gives one reason, describes each crop in a dry year without percentages ("gets a little over half the water it needs", "failed about 1 year in 9"), and says when the rains usually settle. The exact figures are on the Rotations tab.

A voice guide answers eight common questions (which rotation fits, what happens in a poor-rain year, how to read the map and the chart, how accurate the data is, what to check locally) by tap, by typing or by speaking, and reads the answer aloud in the chosen language. It is for people who do not read, or who do not follow the charts. Each answer is assembled from the figures already on the page and is never written by a language model, so the guide cannot say anything the data does not support. A question router (`worker/`, a Cloudflare Worker calling a Claude model) decides which of the eight questions a free-form question matches. The model returns only the name of a question; it never sees the data and never writes an answer. The live app uses it (its address is in `app/config.js`), and the app falls back to keyword matching if it is unreachable or the address is removed. When the router has understood a question, the chat says so under the answer.

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
| ISRIC SoilGrids 2.0 (water content at field capacity and wilting point) | Optional estimate of soil water storage for the chosen place |
| OpenStreetMap Nominatim | Place name shown for chosen coordinates (label only) |
| FAO Irrigation and Drainage Paper 56, Tables 11 and 12 | Crop coefficients and growth-stage lengths |
| Sivakumar (1988) | Definition of monsoon onset |
| KVK Reddipalli district profile; ICAR-CRIDA contingency plan for Krishna | Current rotations |

## What is checked, and what is not

- 37 unit tests cover the calculations; one checks the radiation formula against a worked example in FAO-56.
- The in-browser engine used for other places is checked against the Python pipeline: 546 values compared, all in agreement.
- Every formula, its source, its verification status and the known limitations are listed in [docs/METHODS.md](docs/METHODS.md).
- Figures describe a NASA grid cell about 50 km across, not a field.
- For Anantapur, the five seasons the model marks as failed for groundnut grown every year (2002, 2003, 2016, 2018, 2023) are all reported drought years in the district. The check runs one way: milder declared droughts, such as 2011 to 2015, show as below-normal seasons, not failures. NASA POWER rainfall there is roughly 9% to 14% above published rain-gauge normals. Sources are in [docs/METHODS.md](docs/METHODS.md).
- Soil water storage defaults to an assumed 100 mm. The farmer can set it by soil type, from the SoilGrids map (modelled, not measured), or by typing a known value. The four soil-type values were checked against FAO-56 Table 19. Every result is also re-run at four storage values to show how much it matters.
- The app is available in English, Telugu, Hindi, Tamil, Kannada, Marathi and Odia. The six Indian-language versions were drafted during the hackathon. Each was then read against the English by a separate AI reviewer, and 146 corrections were applied. No native speaker has reviewed them yet; the app says so in each of them. `node tests/i18n_check.js` checks that every language has every string and placeholder.
- The voice guide is checked without a browser: every question in every language is recognised from its keywords, and every answer for every place and language is complete (`node tests/assistant_check.js`, 634 checks). Reading aloud and voice input use the browser's own speech features, so they depend on the device: a phone or computer without a voice for a language shows the answer as text and says so. Voice input needs Chrome, Edge or Safari and an internet connection. Dates that are read aloud use full month names.
- How well the guide understands free wording was measured on 120 natural phrasings in English, Telugu and Hindi that were not used to build its keyword lists: 53% were routed to the right question, 33% were not recognised (the guide says so and shows the question list) and 13% got an answer on the wrong topic. All 12 out-of-scope questions were declined. The listed questions themselves are always recognised. With the question router, the same 120 phrasings scored 97% right (116 of 120), 1 on the wrong topic and 3 not recognised, with all 12 out-of-scope questions declined (`node tests/assistant_eval.js`). The phrasings were written by the author, not collected from farmers.
- Not yet done: field soil tests, prices and yields, a statistical comparison with crop-yield or daily rain-gauge records, native-speaker review of the translations.

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
| `tests/` | Unit tests for the pipeline, and the checks for the in-browser engine, the text and the voice guide |
| `data/reference/` | Crop table and candidate rotations, with their sources |
| `data/processed/` | Result files read by the app |
| `app/`, `index.html` | The web app; `app/engine.js` is the in-browser engine, `app/assistant.js` the voice guide, `app/i18n*.js` the text in seven languages, `app/config.js` the question router's address |
| `worker/` | Optional question router (Cloudflare Worker) for the voice guide |
| `docs/` | Methods and the architecture diagram |

## Licence

MIT
