"""Evaluate the candidate rotations for each location.

Usage:
    python3 -m pipeline.run_rotations              # all locations
    python3 -m pipeline.run_rotations anantapur
"""
import datetime as dt
import json
import pathlib
import sys

from . import config, power, rotation

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFERENCE = ROOT / "data" / "reference"
OUT_DIR = ROOT / "data" / "processed"


def explain(result, existing, crops):
    """The five fields the challenge asks for, built only from computed values."""
    why, evidence, benefits, gaps, risks = [], [], [], [], []
    for crop in result["crops"]:
        if crop["irrigated"]:
            evidence.append(
                f"{crop['name']} needs about {crop['water_need_mm_mean']:.0f} mm per season; "
                f"rain supplies part and irrigation about {crop['irrigation_mm_mean']:.0f} mm.")
        else:
            evidence.append(
                f"{crop['name']}: rain and stored soil water met {crop['wrsi_median']:.0f}% "
                f"of crop water need in a typical year and {crop['wrsi_bad_year']:.0f}% in a "
                f"poor year (1 in 4); {crop['failed_seasons']} of "
                f"{crop['seasons_simulated']} seasons fell below "
                f"{config.WRSI_FAILURE:.0f}%.")
        if crop["crop"] == "rice":
            gaps.append("Rice water need here is crop evapotranspiration only. Puddling and "
                        "percolation losses in paddy fields are not counted, so real water "
                        "use is higher.")
        if not crop["parameters_verified"]:
            gaps.append(f"{crop['name']}: season length is a placeholder, not from a published table.")
    if result["existing"]:
        why.append("This is the rotation assumed to be in use now. It is the baseline the others are compared with.")
    else:
        d_res = result["components"]["resilience"] - existing["components"]["resilience"]
        d_soil = result["components"]["soil"] - existing["components"]["soil"]
        d_div = result["components"]["diversity"] - existing["components"]["diversity"]
        d_bare = existing["bare_months_per_year"] - result["bare_months_per_year"]
        if d_res > 0.02:
            why.append("It holds up better than the current rotation in poor-rain years.")
            benefits.append(f"Poor-year water satisfaction of the weakest crop rises from "
                            f"{existing['components']['resilience']*100:.0f}% to "
                            f"{result['components']['resilience']*100:.0f}%.")
        elif d_res < -0.02:
            risks.append(f"The weakest crop does worse in poor-rain years than the current rotation "
                         f"({result['components']['resilience']*100:.0f}% against "
                         f"{existing['components']['resilience']*100:.0f}%).")
        if d_bare > 0.5:
            why.append("It keeps the field covered for more of the year.")
            benefits.append(f"About {d_bare:.1f} fewer bare months a year, which reduces exposure of the soil to erosion.")
        if result["legume_share"] > existing["legume_share"]:
            benefits.append("Adds a legume, which fixes nitrogen from the air.")
        if d_div > 0:
            why.append("It alternates crop families.")
            benefits.append("Alternating crop families interrupts pests and diseases that build up under one crop.")
        need, base = result["crop_water_need_mm_per_year"], existing["crop_water_need_mm_per_year"]
        if need < base * 0.95:
            why.append("Its crops need less water over the year.")
            benefits.append(f"Crop water need averages {need:.0f} mm a year against {base:.0f} mm "
                            f"for the current rotation ({(base - need) / base * 100:.0f}% less).")
        elif need > base * 1.05:
            risks.append(f"Its crops need more water over the year ({need:.0f} mm against {base:.0f} mm), "
                         "because the field is cropped for longer.")
        if result["irrigation_mm_per_year"] > existing["irrigation_mm_per_year"] + 1:
            risks.append("Uses more irrigation water than the current rotation.")
        if not why:
            why.append("Included as an alternative for comparison; it does not clearly beat the current rotation on the measured criteria.")
        _ = d_soil
    gaps.extend([
        "Soil water-holding capacity is assumed (100 mm), not measured for this location.",
        "Crop season lengths come from FAO tables for other regions, not local varieties.",
        "Market prices, input costs and yields are not included.",
        "The current rotation and sowing dates are assumptions, not survey data.",
    ])
    risks.extend([
        "Results describe a grid cell of about 50 km, not an individual field.",
        "Pests, diseases, seed availability and labour are not modelled.",
    ])
    return {
        "why_suggested": why,
        "evidence": evidence,
        "benefits": benefits,
        "information_gaps": gaps,
        "risks_for_local_review": risks,
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
    low, high = sensitivity[0], sensitivity[-1]
    for result in results:
        a = low["rotations"][result["id"]]["weakest_crop_wrsi_median"]
        b = high["rotations"][result["id"]]["weakest_crop_wrsi_median"]
        result["soil_sensitive"] = abs(b - a) >= 20
        if result["soil_sensitive"]:
            result["explanation"]["information_gaps"].insert(0, (
                f"This result depends strongly on how much water the soil holds: the weakest "
                f"crop gets {a}% of its water need with {low['soil_available_water_mm']:.0f} mm "
                f"of soil storage and {b}% with {high['soil_available_water_mm']:.0f} mm. "
                "Local soil data is needed before relying on it."))
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
