# KhetSat

Compare crop rotations for Andhra Pradesh districts using NASA Earth observations.

Entry for the **2026 NASA Space Apps Challenge**, challenge *Field Shift: Adapting Farms with NASA Data* (Visakhapatnam local event, 14-15 November 2026).

## What it does

For a district, KhetSat compares the current crop rotation with two alternatives and, for each one, shows:

- why it was suggested
- the evidence behind it
- the benefits it may offer
- where information is missing
- the risks that need review by local farmers or agriculture officers

Advice is given in Telugu, Hindi and English.

KhetSat is a decision-support tool. It does not replace farmer judgment or local agricultural expertise.

## Status

Work in progress during the hackathon weekend. This README is updated as features land.

Done so far:

- Data pipeline: 45 years (1981-2025) of daily NASA POWER rainfall and temperature for three Andhra Pradesh locations (Anantapur, Krishna, Anakapalli)
- Climate indicators per location: monsoon and post-monsoon rainfall, dependable rainfall, reference evapotranspiration, water balance, onset date, dry spells, hot days, and trends with significance tests
- Rotation engine: a daily soil-water balance (FAO-56 crop coefficients) that compares three rotations per location, including the current one, across all 45 years, with a dry-year view and a soil-capacity sensitivity check
- For each rotation: why it was suggested, the evidence, benefits, information gaps and risks for local review

- Year types: k-means clustering of seasons compared with rainfall terciles, scored by how well each explains crop water outcomes (the simpler grouping wins in Anantapur; see METHODS)
- Web app (`index.html`, `app/`): pick a location, see rain and evaporative demand through the year with each rotation's crops laid over it, set your priorities with sliders, and read the ranked rotations with their evidence, gaps and risks. Available in English, Telugu and Hindi

- Satellite rainfall cross-check: the rotation results repeated on GPM IMERG rainfall for 2001-2025. Yearly monsoon totals correlate at 0.87 to 0.92 and the ranking of rotations is unchanged at all three locations

Not built yet: SMAP soil moisture and MODIS vegetation checks, local soil data, a map.

The Telugu and Hindi text has not yet been reviewed by a second native speaker.

## Run it

```
python3 -m pipeline.run
python3 -m pipeline.run_rotations
python3 -m pipeline.crosscheck
python3 -m unittest discover -s tests
```

Python 3.10 or later, standard library only. Results are written to `data/processed/`.

To open the app locally:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000. The app is plain HTML, CSS and JavaScript with no build step; it reads the files in `data/processed/`.

Formulas, sources, verification status and known limitations are in [docs/METHODS.md](docs/METHODS.md).

## Licence

MIT
