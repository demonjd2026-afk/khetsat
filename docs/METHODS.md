# Methods

This file records how every number in KhetSat is produced, where the formula comes from, and how far it has been checked. Anything marked "not yet verified" must not be presented as established.

## Data

| Dataset | Used for | Access | Resolution | Period used |
|---|---|---|---|---|
| NASA POWER Daily API (`PRECTOTCORR`, `T2M_MAX`, `T2M_MIN`) | Rainfall, temperature, reference evapotranspiration | Public REST API, no login | 0.5 x 0.625 degree (MERRA-2) | 1981-2025 |
| GPM IMERG via NASA POWER (`IMERG_PRECTOT`) | Satellite rainfall cross-check | Same API, `time-standard=UTC` | As served by POWER | 2001-2025 |

Values describe the grid cell containing each representative point (about 50 km across). They are not field measurements and not district averages.

### Representative points

| Location | Point | Latitude | Longitude | Why this point |
|---|---|---|---|---|
| Anantapur | Anantapur town | 14.68 | 77.60 | Inland, rainfed groundnut belt |
| Krishna | Gudivada | 16.43 | 80.99 | Inland delta; the coastal cell mixes land and sea |
| Anakapalli | Narsipatnam | 17.67 | 82.61 | Inland; the coastal cell reported no days at or above 40 C in 45 years, which is not credible for land |

## Indicators

| Indicator | Definition | Source |
|---|---|---|
| Monsoon rainfall | Total rain, 1 June to 30 September | Season convention of the India Meteorological Department |
| Post-monsoon rainfall | Total rain, 1 October to 31 December | Same |
| Dependable rainfall | Amount reached or exceeded in 75% of years (25th percentile of yearly totals) | Standard dependable-rainfall concept in irrigation planning |
| Reference evapotranspiration (ET0) | Hargreaves: `0.0023 (Tmean + 17.8) (Tmax - Tmin)^0.5 Ra`, with Ra converted to mm/day by 0.408 | FAO Irrigation and Drainage Paper 56, eq. 52 |
| Extraterrestrial radiation (Ra) | From latitude and day of year | FAO-56, eq. 21 and 23-25 |
| Monsoon water balance | Monsoon rainfall minus monsoon ET0 | Derived |
| Longest dry spell | Longest run of days with under 1 mm, 1 June to 30 September | Derived |
| Hot days | Days with maximum temperature at or above 40 C | Threshold chosen for this project |
| Onset | First day from 1 June when rain over 3 consecutive days totals at least 20 mm and no dry spell in the following 30 days exceeds 7 days | Sivakumar (1988), as restated in ICRISAT Journal Article 1222 (oar.icrisat.org/3054). The original searches from 1 May in West Africa; here the search starts on 1 June |
| Trend | Theil-Sen slope with a two-sided Mann-Kendall test (tie-corrected), significance at p < 0.05 | Mann (1945), Kendall (1975), Sen (1968) |

## Rotation engine

### Crop parameters

Crop coefficients (Kc) and growth-stage lengths are in `data/reference/crops.json`. Each crop records the FAO-56 table row it came from and a `verified` flag.

| Parameter | Source | Rule |
|---|---|---|
| Kc mid, Kc end | FAO-56 Table 12 | Midpoint of a range, except where a footnote gives the second value for dry harvest; then the dry-harvest value |
| Kc ini | FAO-56 Table 12 | Crop value where given; otherwise the crop-group value (legumes 0.4, cereals 0.3, oil crops 0.35, fibre crops 0.35) |
| Stage lengths | FAO-56 Table 11 | Row from the closest listed climate. These are for other regions and need review against local varieties |
| Legume status, crop family | Botanical classification | - |

Chickpea has no row in Table 11. Its stage lengths are a placeholder and it is flagged `verified: false`.

### Water balance

For every day of 1981-2025 the engine tracks one soil-water store:

1. Rain is added. Anything above the store's capacity is lost as runoff or drainage.
2. Demand is `Kc x ET0` for the crop in the ground (FAO-56 eq. 58, four-stage Kc curve), or `0.3 x ET0` for bare soil.
3. The crop takes what it needs, up to what is stored. An irrigated crop takes the rest from irrigation, and that amount is recorded.

A season is summarised by the Water Requirement Satisfaction Index (WRSI): water the crop received as a percentage of water it needed. A season under 50% is counted as failed.

Rotations longer than one year are simulated from every starting year of the cycle and the seasons pooled, so each crop is tested against all 45 years.

### Scores

| Component | Definition |
|---|---|
| Water fit | Median WRSI of the weakest crop in the rotation |
| Resilience | 25th-percentile WRSI of the weakest crop (a poor year, 1 in 4) |
| Water saving | Crop water need of the thriftiest rotation at the location divided by this rotation's crop water need (1 for the thriftiest) |
| Soil | Half the share of legumes among the crops, half the share of the year the field is cropped |
| Diversity | 0 for one crop family, 0.5 for two, 1 for three or more |

The overall score is a weighted average of the five, with weights set by the farmer's priorities. An irrigated crop is treated as fully watered, so for irrigated rotations the water-saving score and the irrigation amount carry the water information. It is an index for comparing rotations at one location. It is not a yield or income prediction.

### Assumptions that drive results

| Assumption | Value | Status |
|---|---|---|
| Plant-available soil water | 100 mm | Assumed, not measured. Every run also reports results at 75, 100, 150 and 200 mm. A rotation whose weakest-crop WRSI moves by 20 points or more across that range is flagged as soil-sensitive |
| Bare-soil evaporation coefficient | 0.3 | Assumed. FAO-56 Chapter 11 makes this depend on how often the soil is wetted |
| WRSI failure threshold | 50% | Follows the usual WRSI classification; not yet checked against the original FAO source |
| Existing rotations | See the next table | Based on published district profiles, not on a survey |
| Sowing dates | See `data/reference/rotations.json` | Working assumptions |

### Basis for the existing rotations

| Location | Existing rotation used | Basis |
|---|---|---|
| Anantapur | Rainfed groundnut every year | KVK Reddipalli district profile: groundnut is the main crop, grown rainfed in kharif on red soils on about 7 lakh ha (figures for the district before its 2022 division) |
| Krishna | Irrigated rice, then irrigated black gram | ICAR-CRIDA Agriculture Contingency Plan for Krishna district: paddy on about 269 thousand ha in kharif (229 thousand irrigated); black gram on about 134 thousand ha, mostly in rabi (107 thousand irrigated, 25 thousand rainfed) |
| Anakapalli | Rainfed rice, then fallow | Assumed. Srinivas et al. (2022), Indian Journal of Agricultural Sciences 92(8), describe scope to expand rice-fallow pulses in north coastal Andhra Pradesh including the former Visakhapatnam district |

Black gram is not in FAO-56. Its crop coefficients and stage lengths are borrowed from the "Green gram and cowpeas" row and flagged as borrowed.

### What the results show, and what they do not

- **Anantapur.** Groundnut gets a median 71% of its water need and fails in 5 of 45 seasons (2002, 2003, 2016, 2018, 2023). Millet needs about 371 mm against 511 mm for groundnut. Alternating the two cuts average crop water need by 14% and adds a second crop family. Millet followed by chickpea fails often: chickpea falls below 50% in 20 of 44 seasons.
- **Krishna, irrigated crops.** After rice, irrigated black gram needs about 248 mm of irrigation a season and irrigated maize about 406 mm. This comparison does not depend much on the soil assumption, because irrigation makes up the shortfall either way.
- **Krishna, a known failure of the model.** Black gram grown after rice on leftover moisture is an established practice in the district (about 25 thousand ha rainfed). The model gives it only 20% of its water need at 100 mm of soil storage and 48% at 200 mm. The model therefore under-represents water available to a crop sown into a wet paddy field on deep delta soil (no shallow water table, no relay sowing before harvest, a short local variety not represented). Results for crops on leftover moisture in the delta are flagged soil-sensitive and must not be read as "this fails".
- **Anakapalli.** The same caution applies to green gram after rice.
- **Rice.** Water need is crop evapotranspiration only. Puddling and percolation losses in paddy fields are not counted, so real water use is higher than shown.
- **No water-stress yield response.** The store is drawn down at the full crop rate until empty (no FAO-56 Chapter 8 stress coefficient).

## Year types: pattern-finding compared with a statistical grouping

The challenge asks teams to compare pattern-finding ("SI") and statistical approaches. Two groupings of the 45 years are computed in `pipeline/yeartypes.py`:

| Approach | How years are grouped |
|---|---|
| Statistical | Terciles of monsoon rainfall: the driest third, the middle third, the wettest third |
| Pattern-finding | k-means clustering (k = 3, 25 restarts, fixed seed) on five standardised features: monsoon rain, post-monsoon rain, onset date, longest monsoon dry spell, hot days |

Each grouping is scored by how much of the year-to-year variation in a crop's WRSI it explains (eta squared, 0 to 1).

### Result

| Location, crop | Explained by clusters | Explained by rain terciles |
|---|---|---|
| Anantapur, groundnut | 0.43 | 0.67 |
| Anantapur, millet (alternating with groundnut) | 0.38 | 0.56 |
| Anakapalli, rainfed rice | 0.09 | 0.03 |

For rainfed crops in Anantapur the simple rainfall grouping explains crop water outcomes better than the five-feature clusters. Rainfall terciles are therefore the grouping used to describe good and poor years. Where neither grouping explains much (Anakapalli rice, which is rarely short of water in this model), year type is not a useful lens.

The clusters are still informative as a description. In Anantapur they give three groups of 15, 15 and 15 years: dry, late and hot (about 277 mm of monsoon rain, onset about 74 days after 1 June, 43 hot days); late but cooler, with a weak post-monsoon (318 mm, onset about 78 days, 104 mm after September); and early and wet (465 mm, onset about 33 days).

### Limits

- k = 3 was chosen to match the three terciles, not selected by a fit statistic.
- Clusters use climate features only; no crop or soil information.
- 45 years is a small sample, so cluster membership is sensitive to the features chosen.

## Satellite rainfall cross-check

The main pipeline uses reanalysis rainfall (`PRECTOTCORR`, MERRA-2) because it starts in 1981. `pipeline/crosscheck.py` compares it with GPM IMERG satellite rainfall (`IMERG_PRECTOT`, also served by NASA POWER) for 2001-2025, and re-runs the rotation engine on IMERG rain with the same temperatures.

| Location | Monsoon rain, reanalysis | Monsoon rain, satellite | Difference | Correlation of yearly totals | Driest five years in common | Rotation ranking |
|---|---|---|---|---|---|---|
| Anantapur | 362 mm | 433 mm | reanalysis 16% lower | 0.91 | 4 of 5 | Same |
| Krishna | 723 mm | 795 mm | reanalysis 9% lower | 0.92 | 4 of 5 | Same |
| Anakapalli | 866 mm | 874 mm | reanalysis 1% lower | 0.87 | 5 of 5 | Same |

What this supports: the two sources agree on which years were wet or dry, and the order of the three rotations does not depend on which is used.

What it does not settle:

- **Amounts.** In Anantapur the satellite record is wetter, so groundnut fails in 2 of 25 seasons on satellite rain against 5 of 25 on reanalysis rain. The main results use the drier source and may be pessimistic there.
- **Independence.** Both products are adjusted with rain-gauge data, so they are not fully independent of each other, and neither is a local gauge record.
- **Day boundaries.** POWER serves IMERG on UTC days only, so both series use UTC days in this comparison. Seasonal totals are unaffected; individual days can differ from the main pipeline's local-time days.
- Which IMERG run (Early, Late or Final) POWER serves has not been confirmed.

## Satellite map layers

The map in the app shows imagery served by NASA Global Imagery Browse Services (GIBS), fetched by the viewer's browser. Nothing is computed from these layers; they are shown so the user can see the seasonal contrast directly.

| Layer | GIBS identifier | Dates shown |
|---|---|---|
| Vegetation greenness | `MODIS_Terra_L3_NDVI_16Day` | The 16-day composite containing the 15th of each month, January to October 2026 (16 August for August) |
| Root-zone soil moisture | `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` | The 15th of each month, January to October 2026 (16 August for August: no imagery is served for 10 to 15 August) |
| True colour | `VIIRS_NOAA20_CorrectedReflectance_TrueColor` | Same days |
| Borders and coastlines | `Reference_Features` | - |

- The ten dates are one day per month from a single year, 2026. They illustrate the seasonal cycle; they are not a climatology. True colour is a single day, so monsoon months are often cloud-covered.
- SMAP L4 is a model product that assimilates SMAP observations, on a grid of about 9 km.
- The colour descriptions in the app come from inspecting the tiles. The official colour bars are not embedded.
- Layer identifiers were checked against the GIBS capabilities document on 14 November 2026. Every date was checked by requesting tiles over Andhra Pradesh for each layer on the same day.

## Any place in India ("Your place")

The app can analyse a place the pipeline has not been run for. The browser fetches 45 years of daily NASA POWER data for the chosen point and runs `app/engine.js`, a JavaScript port of the pipeline's indicator and rotation code.

- **Same calculations.** `tests/engine_parity.js` runs the JavaScript engine on the three pipeline locations and compares 546 values (climate indicators, per-year rainfall and onset, rotation scores, water need, failed seasons, soil scenarios and explanation codes) with the Python results. All agree within rounding.
- **The farmer's rotation is the baseline.** The user chooses a monsoon-season crop and, optionally, a crop after the monsoon, and says whether each is irrigated.
- **Sowing dates.** The monsoon crop is sown on the place's median onset date (Sivakumar criterion), limited to between 1 June and 31 July; 1 July is used if fewer than half the years have an onset. The second crop is sown three days after the first is harvested, and not before 15 October. A pair that does not fit in one year is rejected.
- **Alternatives.** Every valid combination of a monsoon crop with fallow or a second crop is evaluated, plus two-year alternations of the farmer's monsoon crop with each other monsoon crop (about 70 to 80 candidates). Alternatives use irrigation only in the seasons where the farmer said they have it. The first alternative shown is the best-scoring candidate with equal priorities; the second is the best-scoring one that keeps the farmer's monsoon crop. Crops with borrowed values count as the crop they borrow from, so near-duplicates are not shown.

- **Place name.** When coordinates are set (by "Use my location", a tap on the map or typing), the browser asks OpenStreetMap's Nominatim service for the name of the place at those coordinates, rounded to two decimals (about 1 km), in the selected language where OpenStreetMap has one. The name (mandal or town, district, state) is a label only; the analysis uses the coordinates. If the lookup fails, only the coordinates are shown. Names are © OpenStreetMap contributors.

Limits specific to this mode:

- **India only.** The two-season calendar assumes India's monsoon. Places outside India are refused.
- **Crop list.** Ten crops, which suit southern and central India best. Wheat, mustard, pigeon pea and other important crops are not in the table yet.
- **Season suitability** (which crops are offered in which season) follows common practice in peninsular India. It is not from FAO-56 and is not checked against temperature.
- **Alternatives are chosen on water, soil cover and crop family only.** Without prices or yields, the tool may suggest a crop that is less valuable than the farmer's own. This is stated on every result.
- **No satellite cross-check or year types** are computed for these places.
- Sowing dates in this mode come from the onset rule; the three pipeline locations use fixed dates. Results for the same place can therefore differ slightly between the two modes.

## Voice guide

`app/assistant.js` answers eight fixed questions by tap, typed text or speech, and reads the answer aloud.

- **Answers are never written by a language model.** Each answer is built from the same result files and translated sentences the page displays (rotation scores, share of water need met, failed seasons, the satellite cross-check). The guide cannot produce a figure that is not in the data.
- **Optional question router.** If an address is set in `app/config.js`, a question that is not one of the listed questions is sent to a small server function (`worker/router.js`), where a Claude model replies with one word: which of the eight questions it matches, or none. The model's reply is checked against that list and anything else is treated as none. The question text (cut to 300 characters) is sent to Anthropic's API; nothing else about the user is sent. If the router is not configured, takes more than six seconds or fails, keyword matching is used. The router's accuracy has not been measured until `KHETSAT_AI_URL=<address> node tests/assistant_eval.js` has been run against a deployed router.
- **Suggestion box.** The "Suggestion for your farm" box at the top of the page is built the same way: the best-matching rotation for the current priorities, why it is suggested, how its crops did in a poor-rain year (1 in 4), the range of dates when the rains usually settle (10th to 90th percentile of onset) with a caution against sowing rain-fed crops before then, and the reminder that prices are not included and local advice is needed. It changes when the priorities change.
- **Recognising a question.** Spoken or typed text is matched against a keyword list for each question in the current language and in English. The best-scoring question is answered and its title is shown and spoken first, so the user can tell which question was understood. Text that matches nothing gets "I did not find that question" and the list of questions.
- **Speech.** Reading aloud uses the browser's speech synthesis and voice input uses the browser's speech recognition. Nothing is sent to a KhetSat server. In Chrome and Edge, voice input sends audio to the browser vendor's speech service and needs a connection.
- **Limits.** Which languages can be spoken depends on the voices installed on the device; where there is none, the answer is shown as text with a note. Voice input is not available in Firefox or Safari on some systems, and Odia recognition is not offered by every browser. The keyword lists and the new sentences in the six Indian languages have not been reviewed by a second native speaker.
- **Evaluation of free wording.** `node tests/assistant_eval.js` runs natural phrasings from `tests/assistant_phrases.json` through the matcher. A tuning set (80 phrasings per language in English, Telugu and Hindi) was used to extend the keyword lists; before tuning, 60% of it was recognised. A held-out set written afterwards (40 phrasings per language, never used for tuning) gives the figure to quote:

  | Language | Right question | Wrong topic | Not recognised | Out-of-scope declined |
  |---|---|---|---|---|
  | English | 21 of 40 | 7 | 12 | 4 of 4 |
  | Telugu | 22 of 40 | 5 | 13 | 4 of 4 |
  | Hindi | 21 of 40 | 4 | 15 | 4 of 4 |
  | All | 64 of 120 (53%) | 16 (13%) | 40 (33%) | 12 of 12 |

  Keyword matching does not generalise well to wording it has not seen. Most misses are declined, not answered wrongly, and the answer always states which question it is answering. The phrasings were written by the project author, typed, not spoken: errors from speech recognition, dialects and farmers' own vocabulary are not measured. Tamil, Kannada, Marathi and Odia have no evaluation set yet.
- **Checks.** `node tests/assistant_check.js` confirms that all eight questions are recognised from keywords alone in all seven languages, and that every answer for the three locations in every language is complete (634 checks).

## Verification status

| Item | Status |
|---|---|
| Ra formula | Verified by unit test against FAO-56 Example 8 (20 deg S, 3 September, 32.2 MJ m-2 day-1) |
| Mann-Kendall, Theil-Sen, percentile | Unit-tested on series with known answers |
| Onset rule | Follows Sivakumar (1988); unit-tested, including the 7-day boundary. The criterion was developed for West Africa and has not been calibrated for Andhra Pradesh |
| Hargreaves ET0 | Formula implemented as published. Not yet compared with Penman-Monteith or with observed ET for these locations |
| Kc curve, calendar, water balance, scoring | Unit-tested (12 tests): stage values, overlap detection, water conservation, irrigation accounting |
| Crop table values | Read from FAO-56 Tables 11 and 12 on fao.org on 14 Nov 2026; worth a second read-through by a person |
| k-means, terciles, eta squared | Unit-tested (6 tests) on data with known answers |
| JavaScript engine (`app/engine.js`) | 546 parity checks against the Python pipeline, 0 mismatches (`node tests/engine_parity.js`) |
| Rainfall totals | Cross-checked against GPM IMERG for 2001-2025 (see above). Not yet checked against India Meteorological Department gauge data |

## Known limitations

- **Reanalysis rainfall trends are weak evidence.** `PRECTOTCORR` comes from a reanalysis model. Long-term trends in reanalysis rainfall can reflect changes in the observing system. Trends are reported with their p-values and should be confirmed against satellite rainfall before being presented as climate change.
- **One point per location.** A district spans several grid cells; one cell is a sample, not an average.
- **Coastal cells.** Cells that include sea surface under-report land heat and evaporative demand.
- **Hargreaves ET0** uses temperature only and can overestimate in humid conditions.
- **The onset rule was developed for West Africa** and is applied here unchanged apart from the start date. Anantapur gets much of its rain in September and October, so a June-anchored onset is a rough guide there; in 3 of 45 years (1989, 1990, 2018) no date met the criterion.

## Reproducing

```
python3 -m pipeline.run            # downloads to data/raw (cached), writes data/processed
python3 -m pipeline.run_rotations  # evaluates the candidate rotations
python3 -m pipeline.crosscheck     # compares with satellite rainfall
python3 -m unittest discover -s tests
```

Python 3.10 or later, standard library only.
