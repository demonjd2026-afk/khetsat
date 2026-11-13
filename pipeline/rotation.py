"""Rotation engine: daily soil-water balance for crop rotations.

For every day of the record the engine tracks a single soil-water store.
Rain fills it (anything above capacity is lost as runoff or drainage); the crop
in the ground, or bare soil, draws it down. A crop's season is summarised with
the Water Requirement Satisfaction Index (WRSI): water the crop actually got
as a percentage of the water it needed.

Crop water need follows FAO-56: ETc = Kc x ET0, with a four-stage Kc curve.
"""
import datetime as dt

from . import config, indicators, stats


def kc_on_day(day, stages, kc):
    """Crop coefficient on a 0-based day after sowing (FAO-56 Kc curve)."""
    ini, dev, mid, late = stages
    if day < 0 or day >= ini + dev + mid + late:
        raise ValueError("day outside the crop season")
    if day < ini:
        return kc["ini"]
    if day < ini + dev:
        return kc["ini"] + (kc["mid"] - kc["ini"]) * (day - ini) / dev
    if day < ini + dev + mid:
        return kc["mid"]
    return kc["mid"] + (kc["end"] - kc["mid"]) * (day - ini - dev - mid) / late


def build_calendar(dates, cycle, crops):
    """Place the crops of a rotation on the daily timeline.

    Returns (slots, seasons). slots[i] is None for a fallow day or
    (season_index, kc) for a cropped day. Seasons that would run past the end
    of the record are dropped.
    """
    index = {d: i for i, d in enumerate(dates)}
    slots = [None] * len(dates)
    seasons = []
    first_year, last_year = dates[0].year, dates[-1].year
    for year in range(first_year, last_year + 1):
        pattern_index = (year - first_year) % len(cycle)
        for slot_index, entry in enumerate(cycle[pattern_index]):
            crop = crops[entry["crop"]]
            length = sum(crop["stages_days"])
            start = index[dt.date(year, entry["sow"][0], entry["sow"][1])]
            if start + length > len(dates):
                continue
            season = {
                "year": year,
                "pattern": pattern_index,
                "slot": slot_index,
                "crop": entry["crop"],
                "irrigated": bool(entry.get("irrigated", False)),
                "start": start,
                "length": length,
            }
            for offset in range(length):
                if slots[start + offset] is not None:
                    raise ValueError(
                        f"{entry['crop']} sown {year}-{entry['sow'][0]:02d} overlaps "
                        "another crop in the rotation")
                slots[start + offset] = (
                    len(seasons), kc_on_day(offset, crop["stages_days"], crop["kc"]))
            seasons.append(season)
    return slots, seasons


def simulate(rain, et0, slots, seasons,
             capacity=config.SOIL_AVAILABLE_WATER_MM, fallow_kc=config.FALLOW_KC):
    """Run the daily soil-water balance. Adds results to each season dict."""
    for season in seasons:
        season.update(etc_mm=0.0, eta_mm=0.0, irrigation_mm=0.0, rain_mm=0.0)
    store = 0.0
    for i in range(len(rain)):
        r = rain[i] or 0.0
        e = et0[i] or 0.0
        store = min(store + r, capacity)
        slot = slots[i]
        if slot is None:
            store -= min(fallow_kc * e, store)
            continue
        season = seasons[slot[0]]
        demand = slot[1] * e
        supplied = min(demand, store)
        store -= supplied
        season["etc_mm"] += demand
        season["rain_mm"] += r
        if season["irrigated"]:
            season["irrigation_mm"] += demand - supplied
            season["eta_mm"] += demand
        else:
            season["eta_mm"] += supplied
    for season in seasons:
        season["wrsi"] = (
            100.0 if season["etc_mm"] == 0
            else 100.0 * season["eta_mm"] / season["etc_mm"])
    return seasons


def months_covered(cycle, crops):
    """Average number of calendar months per year with a crop in the ground."""
    total = 0.0
    for pattern in cycle:
        days = sum(sum(crops[e["crop"]]["stages_days"]) for e in pattern)
        total += min(days, 365) / 30.4
    return total / len(cycle)


def evaluate(rotation, dates, rain, et0, crops,
             capacity=config.SOIL_AVAILABLE_WATER_MM):
    """Simulate one rotation and return its metrics."""
    cycle = rotation["cycle"]
    # A multi-year cycle can start on any of its years. Every starting point is
    # simulated and the seasons pooled, so each crop is tested against every
    # year of the record and not only the odd or even ones.
    groups = {}
    seasons = []
    for offset in range(len(cycle)):
        shifted = cycle[offset:] + cycle[:offset]
        slots, run = build_calendar(dates, shifted, crops)
        simulate(rain, et0, slots, run, capacity=capacity)
        for season in run:
            season["pattern"] = (season["pattern"] + offset) % len(cycle)
            groups.setdefault((season["pattern"], season["slot"]), []).append(season)
        seasons.extend(run)

    crop_results = []
    for (pattern, slot), group in sorted(groups.items()):
        wrsi = [s["wrsi"] for s in group]
        crop = crops[group[0]["crop"]]
        failed = [s["year"] for s in group if s["wrsi"] < config.WRSI_FAILURE]
        crop_results.append({
            "crop": group[0]["crop"],
            "name": crop["name"],
            "cycle_year": pattern + 1,
            "sow": cycle[pattern][slot]["sow"],
            "season_days": group[0]["length"],
            "irrigated": group[0]["irrigated"],
            "seasons_simulated": len(group),
            "water_need_mm_mean": round(stats.mean([s["etc_mm"] for s in group]), 0),
            "season_rain_mm_mean": round(stats.mean([s["rain_mm"] for s in group]), 0),
            "wrsi_median": round(stats.percentile(wrsi, 0.5), 0),
            "wrsi_bad_year": round(stats.percentile(wrsi, 0.25), 0),
            "failed_seasons": len(failed),
            "failed_years": sorted(failed),
            "wrsi_by_year": {str(s["year"]): round(s["wrsi"], 1) for s in group},
            "irrigation_mm_mean": round(stats.mean([s["irrigation_mm"] for s in group]), 0),
            "parameters_verified": crop["verified"],
            "parameters_borrowed_from": crop.get("proxy_of"),
        })

    entries = [e for pattern in cycle for e in pattern]
    families = sorted({crops[e["crop"]]["family"] for e in entries})
    legume_share = sum(1 for e in entries if crops[e["crop"]]["legume"]) / len(entries)
    cover = months_covered(cycle, crops)
    total_seasons = sum(c["seasons_simulated"] for c in crop_results)
    failed_share = sum(c["failed_seasons"] for c in crop_results) / total_seasons
    irrigation = sum(s["irrigation_mm"] for s in seasons) / (
        (dates[-1].year - dates[0].year + 1) * len(cycle))

    water_need = sum(s["etc_mm"] for s in seasons) / (
        (dates[-1].year - dates[0].year + 1) * len(cycle))

    components = {
        # how well rain meets crop need in a typical year (weakest crop counts)
        "water_fit": min(c["wrsi_median"] for c in crop_results) / 100.0,
        # how well it holds up in a poor year (1 year in 4)
        "resilience": min(c["wrsi_bad_year"] for c in crop_results) / 100.0,
        # legumes in the sequence and months the soil is covered
        "soil": round(0.5 * legume_share + 0.5 * min(cover / 12.0, 1.0), 3),
        # crop families in the sequence (breaks pest and disease cycles)
        "diversity": min((len(families) - 1) / 2.0, 1.0),
    }
    return {
        "id": rotation["id"],
        "label": rotation["label"],
        "existing": rotation["existing"],
        "cycle_years": len(cycle),
        "crops": crop_results,
        "months_covered_per_year": round(cover, 1),
        "bare_months_per_year": round(12 - cover, 1),
        "legume_share": round(legume_share, 2),
        "crop_families": families,
        "failed_season_share": round(failed_share, 3),
        "irrigation_mm_per_year": round(irrigation, 0),
        "crop_water_need_mm_per_year": round(water_need, 0),
        "components": {k: round(v, 3) for k, v in components.items()},
    }


DEFAULT_WEIGHTS = {"water_fit": 1.0, "resilience": 1.0, "water_saving": 1.0,
                   "soil": 1.0, "diversity": 1.0}


def add_water_saving(results):
    """Add the water-saving component: 1.0 for the rotation whose crops need
    the least water over a year, lower in proportion for the others."""
    least = min(r["crop_water_need_mm_per_year"] for r in results)
    for r in results:
        r["components"]["water_saving"] = round(
            least / r["crop_water_need_mm_per_year"], 3)


def score(components, weights=None):
    """Weighted average of the component scores, 0-100."""
    weights = weights or {k: v for k, v in DEFAULT_WEIGHTS.items() if k in components}
    total = sum(weights.values())
    if total == 0:
        raise ValueError("at least one weight must be above zero")
    return round(100.0 * sum(components[k] * w for k, w in weights.items()) / total, 1)


def daily_series(payload, lat, start_year, end_year):
    """Dates, rain and Hargreaves ET0 for the full record."""
    from . import power
    rain_by_day = power.clean_series(payload, "PRECTOTCORR")
    tmax_by_day = power.clean_series(payload, "T2M_MAX")
    tmin_by_day = power.clean_series(payload, "T2M_MIN")
    first = dt.date(start_year, 1, 1)
    count = (dt.date(end_year + 1, 1, 1) - first).days
    dates = [first + dt.timedelta(days=i) for i in range(count)]
    rain, et0 = [], []
    for d in dates:
        key = d.strftime("%Y%m%d")
        rain.append(rain_by_day.get(key))
        et0.append(indicators.hargreaves_et0(
            tmax_by_day.get(key), tmin_by_day.get(key), lat, d.timetuple().tm_yday))
    return dates, rain, et0
