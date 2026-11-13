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
| Onset | First day from 1 June of a 3-day spell totalling 20 mm or more that is not followed within 30 days by a dry spell of 10 days or more | Rule written for this project; see status below |
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
| Soil | Half the share of legumes among the crops, half the share of the year the field is cropped |
| Diversity | 0 for one crop family, 0.5 for two, 1 for three or more |

The overall score is a weighted average of the four, with weights set by the farmer's priorities. It is an index for comparing rotations at one location. It is not a yield or income prediction.

### Assumptions that drive results

| Assumption | Value | Status |
|---|---|---|
| Plant-available soil water | 100 mm | Assumed, not measured. Every run also reports results at 75, 100, 150 and 200 mm. A rotation whose weakest-crop WRSI moves by 20 points or more across that range is flagged as soil-sensitive |
| Bare-soil evaporation coefficient | 0.3 | Assumed. FAO-56 Chapter 11 makes this depend on how often the soil is wetted |
| WRSI failure threshold | 50% | Follows the usual WRSI classification; not yet checked against the original FAO source |
| Existing rotations and sowing dates | See `data/reference/rotations.json` | Working assumptions, not survey data |

### What the first run shows, and what it does not

- **Anantapur.** Groundnut gets a median 71% of its water need and fails in 5 of 45 seasons (2002, 2003, 2016, 2018, 2023). Millet needs about 371 mm against 511 mm for groundnut. Alternating the two cuts average crop water need by 14% and adds a second crop family.
- **Post-rice crops (Krishna, Anakapalli).** A crop sown in December on leftover moisture scores very poorly at 100 mm of soil storage and much better at 200 mm. Deep delta soils may hold more than 100 mm, so these results are flagged soil-sensitive and must not be read as "this rotation fails" until soil data is added.
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
| Anantapur, groundnut | 0.23 | 0.67 |
| Anantapur, millet (alternating with groundnut) | 0.25 | 0.56 |
| Anakapalli, rainfed rice | 0.08 | 0.03 |

For rainfed crops in Anantapur the simple rainfall grouping explains crop water outcomes far better than the five-feature clusters. Rainfall terciles are therefore the grouping used to describe good and poor years. Where neither grouping explains much (Anakapalli rice, which is rarely short of water in this model), year type is not a useful lens.

The clusters are still informative as a description. In Anantapur they separate three kinds of season: late onset with long dry spells (13 years; onset about 83 days after 1 June), early onset but hot (11 years; about 48 days at or above 40 C), and wet (21 years; about 427 mm of monsoon rain). Groundnut gets about 65% of its water need in the first two and 83% in the third.

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
| Vegetation greenness | `MODIS_Terra_L3_NDVI_16Day` | 16-day composites starting 23 April 2026 and 16 October 2026 |
| Root-zone soil moisture | `SMAP_L4_Analyzed_Root_Zone_Soil_Moisture` | 23 April 2026 and 16 October 2026 |
| True colour | `VIIRS_NOAA20_CorrectedReflectance_TrueColor` | Same two days |
| Borders and coastlines | `Reference_Features` | - |

- The two dates are one dry-season and one post-monsoon example from a single year. They illustrate the seasonal cycle; they are not a climatology.
- SMAP L4 is a model product that assimilates SMAP observations, on a grid of about 9 km.
- The colour descriptions in the app come from inspecting the tiles. The official colour bars are not embedded.
- Layer identifiers and dates were checked against the GIBS capabilities document on 14 November 2026.

## Verification status

| Item | Status |
|---|---|
| Ra formula | Verified by unit test against FAO-56 Example 8 (20 deg S, 3 September, 32.2 MJ m-2 day-1) |
| Mann-Kendall, Theil-Sen, percentile | Unit-tested on series with known answers |
| Onset rule | Unit-tested for behaviour. The thresholds are not yet tied to a published definition; replace or cite before presenting onset dates as authoritative |
| Hargreaves ET0 | Formula implemented as published. Not yet compared with Penman-Monteith or with observed ET for these locations |
| Kc curve, calendar, water balance, scoring | Unit-tested (12 tests): stage values, overlap detection, water conservation, irrigation accounting |
| Crop table values | Read from FAO-56 Tables 11 and 12 on fao.org on 14 Nov 2026; worth a second read-through by a person |
| k-means, terciles, eta squared | Unit-tested (6 tests) on data with known answers |
| Rainfall totals | Cross-checked against GPM IMERG for 2001-2025 (see above). Not yet checked against India Meteorological Department gauge data |

## Known limitations

- **Reanalysis rainfall trends are weak evidence.** `PRECTOTCORR` comes from a reanalysis model. Long-term trends in reanalysis rainfall can reflect changes in the observing system. Trends are reported with their p-values and should be confirmed against satellite rainfall before being presented as climate change.
- **One point per location.** A district spans several grid cells; one cell is a sample, not an average.
- **Coastal cells.** Cells that include sea surface under-report land heat and evaporative demand.
- **Hargreaves ET0** uses temperature only and can overestimate in humid conditions.
- **The onset rule fits the southwest monsoon.** Anantapur gets much of its rain in September and October, so a June-anchored onset is a rough guide there.

## Reproducing

```
python3 -m pipeline.run            # downloads to data/raw (cached), writes data/processed
python3 -m pipeline.run_rotations  # evaluates the candidate rotations
python3 -m pipeline.crosscheck     # compares with satellite rainfall
python3 -m unittest discover -s tests
```

Python 3.10 or later, standard library only.
