"""Build per-location indicator files from NASA POWER daily data.

Usage:
    python3 -m pipeline.run                # all locations
    python3 -m pipeline.run anantapur      # one location
    python3 -m pipeline.run --refresh      # ignore the download cache
"""
import datetime as dt
import json
import pathlib
import sys

from . import config, indicators, power, stats

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "data" / "processed"

# Fields where "dependable" (reached in 3 years out of 4) is meaningful.
DEPENDABLE_FIELDS = {"annual_rain_mm", "monsoon_rain_mm", "post_monsoon_rain_mm"}

TREND_FIELDS = [
    "annual_rain_mm",
    "monsoon_rain_mm",
    "post_monsoon_rain_mm",
    "monsoon_et0_mm",
    "onset_days_after_jun1",
    "longest_monsoon_dry_spell_days",
    "hot_days",
]


def summarise(years, rows):
    summary = {}
    for field in TREND_FIELDS:
        values = [r[field] for r in rows]
        present = [v for v in values if v is not None]
        summary[field] = {
            "mean": round(stats.mean(present), 1),
            "cv_percent": _round(stats.coefficient_of_variation(present)),
            "min": min(present),
            "max": max(present),
            "trend": stats.trend(years, values),
        }
        if field in DEPENDABLE_FIELDS:
            summary[field]["dependable_75"] = round(
                stats.dependable(present, config.DEPENDABLE_PROBABILITY), 1)
    onsets = [r["onset_days_after_jun1"] for r in rows]
    present = [v for v in onsets if v is not None]
    summary["onset"] = {
        "years_without_onset": [r["year"] for r in rows
                                if r["onset_days_after_jun1"] is None],
        "earliest_days_after_jun1": min(present),
        "latest_days_after_jun1": max(present),
        "p10_days_after_jun1": round(stats.percentile(present, 0.10), 1),
        "p90_days_after_jun1": round(stats.percentile(present, 0.90), 1),
    }
    ranked = sorted(rows, key=lambda r: r["monsoon_rain_mm"])
    summary["driest_monsoons"] = [
        {"year": r["year"], "monsoon_rain_mm": r["monsoon_rain_mm"]}
        for r in ranked[:5]
    ]
    months = range(12)
    summary["monthly_climatology"] = {
        "mean_rain_mm": [round(stats.mean([r["monthly_rain_mm"][m] for r in rows]), 1)
                         for m in months],
        "dependable_75_rain_mm": [
            round(stats.dependable([r["monthly_rain_mm"][m] for r in rows],
                                   config.DEPENDABLE_PROBABILITY), 1)
            for m in months],
        "mean_et0_mm": [round(stats.mean([r["monthly_et0_mm"][m] for r in rows]), 1)
                        for m in months],
    }
    return summary


def build(key, refresh=False):
    loc = config.LOCATIONS[key]
    payload = power.fetch_daily(key, loc["lat"], loc["lon"], refresh=refresh)
    rain = power.clean_series(payload, "PRECTOTCORR")
    tmax = power.clean_series(payload, "T2M_MAX")
    tmin = power.clean_series(payload, "T2M_MIN")
    years = list(range(config.START_YEAR, config.END_YEAR + 1))
    rows = [indicators.yearly_indicators(y, rain, tmax, tmin, loc["lat"])
            for y in years]
    header = payload.get("header", {})
    result = {
        "location": {"key": key, **loc},
        "source": {
            "name": "NASA POWER Daily API",
            "api_version": header.get("api", {}).get("version"),
            "underlying_sources": header.get("sources"),
            "parameters": ["PRECTOTCORR", "T2M_MAX", "T2M_MIN"],
            "grid_point": payload.get("geometry", {}).get("coordinates"),
            "period": [config.START_YEAR, config.END_YEAR],
        },
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": summarise(years, rows),
        "years": rows,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{key}.json"
    out.write_text(json.dumps(result, indent=1))
    return result, out


def _round(value, digits=1):
    return None if value is None else round(value, digits)


def main(argv):
    refresh = "--refresh" in argv
    keys = [a for a in argv if not a.startswith("--")] or list(config.LOCATIONS)
    for key in keys:
        if key not in config.LOCATIONS:
            raise SystemExit(f"Unknown location '{key}'. Known: {', '.join(config.LOCATIONS)}")
        result, out = build(key, refresh=refresh)
        s = result["summary"]
        print(f"{result['location']['name']}: monsoon rain mean "
              f"{s['monsoon_rain_mm']['mean']} mm, dependable "
              f"{s['monsoon_rain_mm']['dependable_75']} mm, CV "
              f"{s['monsoon_rain_mm']['cv_percent']}% -> {out.name}")


if __name__ == "__main__":
    main(sys.argv[1:])
