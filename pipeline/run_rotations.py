"""Evaluate the candidate rotations for each location.

Usage:
    python3 -m pipeline.run_rotations              # all locations
    python3 -m pipeline.run_rotations anantapur
"""
import datetime as dt
import json
import pathlib
import sys

import statistics

from . import config, indicators, power, rotation, yeartypes

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "data" / "reference"
OUT_DIR = ROOT / "data" / "processed"


def item(code, **params):
    return {"code": code, "params": params}


def explain(result, existing, crops):
    """The five fields the challenge asks for, built only from computed values.

    Each entry is a code with parameters, so the app can render it in any
    language. The wording for each code lives in app/i18n.js.
    """
    why, evidence, benefits, gaps, risks = [], [], [], [], []
    seen_rice = False
    for crop in result["crops"]:
        if crop["irrigated"]:
            evidence.append(item("crop_irrigated", crop=crop["crop"],
                                 need=crop["water_need_mm_mean"],
                                 irrigation=crop["irrigation_mm_mean"]))
        else:
            evidence.append(item("crop_rainfed", crop=crop["crop"],
                                 median=crop["wrsi_median"], bad=crop["wrsi_bad_year"],
                                 failed=crop["failed_seasons"],
                                 total=crop["seasons_simulated"],
                                 threshold=config.WRSI_FAILURE))
        if crop["crop"] == "rice" and not seen_rice:
            seen_rice = True
            gaps.append(item("rice_et_only"))
        if not crop["parameters_verified"]:
            gaps.append(item("placeholder_length", crop=crop["crop"]))
    if result["existing"]:
        why.append(item("baseline"))
    else:
        res, base_res = result["components"]["resilience"], existing["components"]["resilience"]
        d_div = result["components"]["diversity"] - existing["components"]["diversity"]
        d_bare = existing["bare_months_per_year"] - result["bare_months_per_year"]
        if res - base_res > 0.02:
            why.append(item("better_poor_years"))
            benefits.append(item("resilience_up", base=round(base_res * 100),
                                 value=round(res * 100)))
        elif res - base_res < -0.02:
            risks.append(item("worse_poor_years", base=round(base_res * 100),
                              value=round(res * 100)))
        if d_bare > 0.5:
            why.append(item("more_cover"))
            benefits.append(item("fewer_bare", months=round(d_bare, 1)))
        if result["legume_share"] > existing["legume_share"]:
            benefits.append(item("adds_legume"))
        if d_div > 0:
            why.append(item("alternates_families"))
            benefits.append(item("breaks_pests"))
        need, base = result["crop_water_need_mm_per_year"], existing["crop_water_need_mm_per_year"]
        if need < base * 0.95:
            why.append(item("less_water"))
            benefits.append(item("less_water_amount", need=need, base=base,
                                 percent=round((base - need) / base * 100)))
        elif need > base * 1.05:
            risks.append(item("more_water", need=need, base=base))
        if result["irrigation_mm_per_year"] > existing["irrigation_mm_per_year"] + 1:
            risks.append(item("more_irrigation"))
        if not why:
            why.append(item("no_clear_gain"))
    gaps.extend([
        item("soil_assumed", mm=config.SOIL_AVAILABLE_WATER_MM),
        item("fao_lengths"),
        item("no_market"),
        item("assumed_rotation"),
    ])
    risks.extend([item("grid_cell"), item("not_modelled")])
    return {
        "why_suggested": why,
        "evidence": evidence,
        "benefits": benefits,
        "information_gaps": gaps,
        "risks_for_local_review": risks,
    }


def build_year_types(payload, lat, results):
    """Group the years two ways and compare how well each explains crop outcomes."""
    rain = power.clean_series(payload, "PRECTOTCORR")
    tmax = power.clean_series(payload, "T2M_MAX")
    tmin = power.clean_series(payload, "T2M_MIN")
    years = list(range(config.START_YEAR, config.END_YEAR + 1))
    rows = [indicators.yearly_indicators(y, rain, tmax, tmin, lat) for y in years]
    cluster_labels, clusters, _ = yeartypes.classify(rows)
    tercile_labels = yeartypes.terciles([r["monsoon_rain_mm"] for r in rows])
    cluster_of = {str(r["year"]): l for r, l in zip(rows, cluster_labels)}
    tercile_of = {str(r["year"]): l for r, l in zip(rows, tercile_labels)}

    comparison = []
    for result in results:
        for crop in result["crops"]:
            if crop["irrigated"]:
                continue
            pairs = sorted(crop["wrsi_by_year"].items())
            values = [v for _, v in pairs]
            comparison.append({
                "rotation": result["id"],
                "crop": crop["crop"],
                "variance_explained_by_clusters": round(
                    yeartypes.eta_squared([cluster_of[y] for y, _ in pairs], values), 3),
                "variance_explained_by_rain_terciles": round(
                    yeartypes.eta_squared([tercile_of[y] for y, _ in pairs], values), 3),
            })
            crop["wrsi_by_year_type"] = {
                str(c["id"]): round(statistics.fmean(
                    [v for y, v in pairs if cluster_of[y] == c["id"]]), 0)
                for c in clusters
                if any(cluster_of[y] == c["id"] for y, _ in pairs)
            }
    same = sum(1 for a, b in zip(cluster_labels, tercile_labels) if a == b)
    return {
        "features": yeartypes.FEATURES,
        "clusters": clusters,
        "rain_terciles": {
            str(j): [r["year"] for r, l in zip(rows, tercile_labels) if l == j]
            for j in range(3)
        },
        "years_given_same_group_by_both": same,
        "years_total": len(rows),
        "comparison": comparison,
    }


def build(key):
    loc = config.LOCATIONS[key]
    crops = json.loads((REFERENCE / "crops.json").read_text())["crops"]
    rotations = json.loads((REFERENCE / "rotations.json").read_text())[key]
    payload = power.fetch_daily(key, loc["lat"], loc["lon"])
    dates, rain, et0 = rotation.daily_series(
        payload, loc["lat"], config.START_YEAR, config.END_YEAR)
    results = [rotation.evaluate(r, dates, rain, et0, crops) for r in rotations]
    existing = next(r for r in results if r["existing"])
    for result in results:
        result["score_equal_weights"] = rotation.score(result["components"])
        result["explanation"] = explain(result, existing, crops)
    sensitivity = []
    for capacity in config.SOIL_SENSITIVITY_MM:
        row = {"soil_available_water_mm": capacity, "rotations": {}}
        for r in rotations:
            res = rotation.evaluate(r, dates, rain, et0, crops, capacity=capacity)
            row["rotations"][r["id"]] = {
                "weakest_crop_wrsi_median": round(res["components"]["water_fit"] * 100),
                "weakest_crop_wrsi_bad_year": round(res["components"]["resilience"] * 100),
                "failed_season_share": res["failed_season_share"],
            }
        sensitivity.append(row)
    year_types = build_year_types(payload, loc["lat"], results)
    low, high = sensitivity[0], sensitivity[-1]
    for result in results:
        a = low["rotations"][result["id"]]["weakest_crop_wrsi_median"]
        b = high["rotations"][result["id"]]["weakest_crop_wrsi_median"]
        result["soil_sensitive"] = abs(b - a) >= 20
        if result["soil_sensitive"]:
            result["explanation"]["information_gaps"].insert(0, item(
                "soil_sensitive", low=a, low_mm=low["soil_available_water_mm"],
                high=b, high_mm=high["soil_available_water_mm"]))
    out = {
        "location": {"key": key, **loc},
        "period": [config.START_YEAR, config.END_YEAR],
        "assumptions": {
            "soil_available_water_mm": config.SOIL_AVAILABLE_WATER_MM,
            "fallow_kc": config.FALLOW_KC,
            "wrsi_failure_threshold": config.WRSI_FAILURE,
        },
        "generated_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "disclaimer": "Decision support only. Review with local farmers and agriculture officers before acting.",
        "rotations": results,
        "soil_capacity_sensitivity": sensitivity,
        "year_types": year_types,
    }
    path = OUT_DIR / f"{key}_rotations.json"
    path.write_text(json.dumps(out, indent=1))
    return out, path


def main(argv):
    keys = [a for a in argv if not a.startswith("--")] or list(config.LOCATIONS)
    for key in keys:
        out, path = build(key)
        print(f"== {out['location']['name']} -> {path.name}")
        for r in out["rotations"]:
            crops = "; ".join(
                f"{c['name']} WRSI {c['wrsi_median']:.0f}/{c['wrsi_bad_year']:.0f}"
                f" fail {c['failed_seasons']}/{c['seasons_simulated']}"
                + (f" irr {c['irrigation_mm_mean']:.0f}mm" if c["irrigated"] else "")
                for c in r["crops"])
            print(f"  {r['label']}: score {r['score_equal_weights']} "
                  f"{r['components']} bare {r['bare_months_per_year']} | {crops}")
        for row in out["soil_capacity_sensitivity"]:
            print("  soil", row["soil_available_water_mm"], {
                k: (v["weakest_crop_wrsi_median"], v["failed_season_share"])
                for k, v in row["rotations"].items()})


if __name__ == "__main__":
    main(sys.argv[1:])
