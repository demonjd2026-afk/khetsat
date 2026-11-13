# Methods

This file records how every number in KhetSat is produced, where the formula comes from, and how far it has been checked. Anything marked "not yet verified" must not be presented as established.

## Data

| Dataset | Used for | Access | Resolution | Period used |
|---|---|---|---|---|
| NASA POWER Daily API (`PRECTOTCORR`, `T2M_MAX`, `T2M_MIN`) | Rainfall, temperature, reference evapotranspiration | Public REST API, no login | 0.5 x 0.625 degree (MERRA-2) | 1981-2025 |

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

## Verification status

| Item | Status |
|---|---|
| Ra formula | Verified by unit test against FAO-56 Example 8 (20 deg S, 3 September, 32.2 MJ m-2 day-1) |
| Mann-Kendall, Theil-Sen, percentile | Unit-tested on series with known answers |
| Onset rule | Unit-tested for behaviour. The thresholds are not yet tied to a published definition; replace or cite before presenting onset dates as authoritative |
| Hargreaves ET0 | Formula implemented as published. Not yet compared with Penman-Monteith or with observed ET for these locations |
| Rainfall totals | Not yet cross-checked against GPM IMERG or India Meteorological Department data |

## Known limitations

- **Reanalysis rainfall trends are weak evidence.** `PRECTOTCORR` comes from a reanalysis model. Long-term trends in reanalysis rainfall can reflect changes in the observing system. Trends are reported with their p-values and should be confirmed against satellite rainfall before being presented as climate change.
- **One point per location.** A district spans several grid cells; one cell is a sample, not an average.
- **Coastal cells.** Cells that include sea surface under-report land heat and evaporative demand.
- **Hargreaves ET0** uses temperature only and can overestimate in humid conditions.
- **The onset rule fits the southwest monsoon.** Anantapur gets much of its rain in September and October, so a June-anchored onset is a rough guide there.

## Reproducing

```
python3 -m pipeline.run            # downloads to data/raw (cached), writes data/processed
python3 -m unittest discover -s tests
```

Python 3.10 or later, standard library only.
