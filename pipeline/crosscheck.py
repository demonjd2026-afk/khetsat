"""Cross-check the reanalysis rainfall against GPM IMERG satellite rainfall.

NASA POWER serves both: `PRECTOTCORR` (MERRA-2 reanalysis, used by the main
pipeline because it starts in 1981) and `IMERG_PRECTOT` (satellite estimate,
available from 2001). This module compares the two over their common period
and re-runs the rotation engine on IMERG rain to see whether the conclusions
hold.

Usage:
    python3 -m pipeline.crosscheck              # all locations
    python3 -m pipeline.crosscheck anantapur
"""
import datetime as dt
import json
import pathlib
import sys

from . import config, indicators, power, rotation, stats

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "data" / "reference"
OUT_DIR = ROOT / "data" / "processed"


def monsoon_totals(series, years):
    totals = []
    for year in years:
        day = dt.date(year, 6, 1)
        total, missing = 0.0, 0
        while day < dt.date(year, 10, 1):
            value = series.get(day.strftime("%Y%m%d"))
            if value is None:
                missing += 1
            else:
                total += value
            day += dt.timedelta(days=1)
        totals.append((total, missing))
    return totals


def build(key):
    loc = config.LOCATIONS[key]
    start, end = config.IMERG_START_YEAR, config.END_YEAR
    years = list(range(start, end + 1))

    main = power.fetch_daily(key, loc["lat"], loc["lon"])
    both = power.fetch_daily(
        key, loc["lat"], loc["lon"], start_year=start, end_year=end,
        parameters=["IMERG_PRECTOT", "PRECTOTCORR"], time_standard="UTC", tag="_imerg")
    imerg = power.clean_series(both, "IMERG_PRECTOT")
    merra = power.clean_series(both, "PRECTOTCORR")

    imerg_totals = monsoon_totals(imerg, years)
    merra_totals = monsoon_totals(merra, years)
    usable = [i for i, (_, missing) in enumerate(imerg_totals) if missing == 0]
    a = [merra_totals[i][0] for i in usable]
    b = [imerg_totals[i][0] for i in usable]
    used_years = [years[i] for i in usable]

    def driest(values, n=5):
        return sorted(y for _, y in sorted(zip(values, used_years))[:n])

    # Rotation engine on each rainfall source, same temperatures, same period.
    tmax = power.clean_series(main, "T2M_MAX")
    tmin = power.clean_series(main, "T2M_MIN")
    first = dt.date(start, 1, 1)
    dates = [first + dt.timedelta(days=i)
             for i in range((dt.date(end + 1, 1, 1) - first).days)]
    et0 = [indicators.hargreaves_et0(
        tmax.get(d.strftime("%Y%m%d")), tmin.get(d.strftime("%Y%m%d")),
        loc["lat"], d.timetuple().tm_yday) for d in dates]
    crops = json.loads((REFERENCE / "crops.json").read_text())["crops"]
    rotations = json.loads((REFERENCE / "rotations.json").read_text())[key]
    comparison = []
    for rot in rotations:
        row = {"id": rot["id"], "crops": []}
        results = {}
        for name, series in (("reanalysis", merra), ("satellite", imerg)):
            rain = [series.get(d.strftime("%Y%m%d")) for d in dates]
            results[name] = rotation.evaluate(rot, dates, rain, et0, crops)
        for c_re, c_sat in zip(results["reanalysis"]["crops"], results["satellite"]["crops"]):
            row["crops"].append({
                "crop": c_re["crop"],
                "irrigated": c_re["irrigated"],
                "seasons": c_re["seasons_simulated"],
                "wrsi_median_reanalysis": c_re["wrsi_median"],
                "wrsi_median_satellite": c_sat["wrsi_median"],
                "wrsi_bad_year_reanalysis": c_re["wrsi_bad_year"],
                "wrsi_bad_year_satellite": c_sat["wrsi_bad_year"],
                "failed_reanalysis": c_re["failed_seasons"],
                "failed_satellite": c_sat["failed_seasons"],
            })
        row["score_reanalysis"] = rotation.score(results["reanalysis"]["components"])
        row["score_satellite"] = rotation.score(results["satellite"]["components"])
        comparison.append(row)

    def order(field):
        return [r["id"] for r in sorted(comparison, key=lambda r: -r[field])]

    out = {
        "location": {"key": key, **loc},
        "period": [start, end],
        "years_compared": len(used_years),
        "years_dropped_for_missing_satellite_days": [
            years[i] for i in range(len(years)) if i not in usable],
        "sources": {
            "reanalysis": "PRECTOTCORR (MERRA-2) via NASA POWER",
            "satellite": "IMERG_PRECTOT (GPM IMERG) via NASA POWER",
            "time_standard": "UTC for both in this comparison",
        },
        "monsoon_rain": {
            "mean_reanalysis_mm": round(stats.mean(a), 0),
            "mean_satellite_mm": round(stats.mean(b), 0),
            "mean_difference_mm": round(stats.mean(a) - stats.mean(b), 0),
            "mean_difference_percent": round(
                (stats.mean(a) - stats.mean(b)) / stats.mean(b) * 100, 0),
            "pearson_r": round(stats.pearson(a, b), 2),
            "spearman_r": round(stats.spearman(a, b), 2),
            "driest_five_reanalysis": driest(a),
            "driest_five_satellite": driest(b),
            "driest_five_in_common": len(set(driest(a)) & set(driest(b))),
            "by_year": [
                {"year": y, "reanalysis_mm": round(x, 0), "satellite_mm": round(z, 0)}
                for y, x, z in zip(used_years, a, b)],
        },
        "rotations": comparison,
        "ranking_reanalysis": order("score_reanalysis"),
        "ranking_satellite": order("score_satellite"),
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    out["ranking_agrees"] = out["ranking_reanalysis"] == out["ranking_satellite"]
    path = OUT_DIR / f"{key}_crosscheck.json"
    path.write_text(json.dumps(out, indent=1))
    return out, path


def main(argv):
    keys = [a for a in argv if not a.startswith("--")] or list(config.LOCATIONS)
    for key in keys:
        out, path = build(key)
        m = out["monsoon_rain"]
        print(f"== {out['location']['name']} ({out['years_compared']} years) -> {path.name}")
        print(f"  monsoon rain: reanalysis {m['mean_reanalysis_mm']:.0f} mm, satellite "
              f"{m['mean_satellite_mm']:.0f} mm ({m['mean_difference_percent']:+.0f}%), "
              f"r={m['pearson_r']}, rank r={m['spearman_r']}, driest five in common "
              f"{m['driest_five_in_common']}")
        print("  dropped:", out["years_dropped_for_missing_satellite_days"])
        for r in out["rotations"]:
            for c in r["crops"]:
                print(f"  {r['id']} {c['crop']}: median {c['wrsi_median_reanalysis']:.0f} vs "
                      f"{c['wrsi_median_satellite']:.0f}, poor {c['wrsi_bad_year_reanalysis']:.0f} vs "
                      f"{c['wrsi_bad_year_satellite']:.0f}, failed {c['failed_reanalysis']} vs "
                      f"{c['failed_satellite']} of {c['seasons']}")
        print("  ranking agrees:", out["ranking_agrees"], out["ranking_reanalysis"], out["ranking_satellite"])


if __name__ == "__main__":
    main(sys.argv[1:])
