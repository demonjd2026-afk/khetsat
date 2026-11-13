# KhetSat

Compare crop rotations for Andhra Pradesh using 45 years of NASA weather data, in English, Telugu and Hindi.

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

The farmer sets five priorities with sliders (water in a normal year, holding up in a poor year, using less water, building the soil, breaking pest cycles) and the ranking updates.

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
| FAO Irrigation and Drainage Paper 56, Tables 11 and 12 | Crop coefficients and growth-stage lengths |
| Sivakumar (1988) | Definition of monsoon onset |
| KVK Reddipalli district profile; ICAR-CRIDA contingency plan for Krishna | Current rotations |

## What is checked, and what is not

- 37 unit tests cover the calculations; one checks the radiation formula against a worked example in FAO-56.
- Every formula, its source, its verification status and the known limitations are listed in [docs/METHODS.md](docs/METHODS.md).
- Figures describe a NASA grid cell about 50 km across, not a field.
- Soil water storage is assumed, and every result is re-run at four storage values to show how much it matters.
- Not yet done: local soil data, prices and yields, checks against rain-gauge records, review of the Telugu and Hindi text by a second native speaker.

## Run it

```
python3 -m pipeline.run            # climate indicators
python3 -m pipeline.run_rotations  # rotation comparison
python3 -m pipeline.crosscheck     # satellite rainfall cross-check
python3 -m unittest discover -s tests
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
| `app/`, `index.html` | The web app |
| `docs/` | Methods and the architecture diagram |

## Licence

MIT
