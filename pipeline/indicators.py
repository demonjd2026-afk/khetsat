"""Climate indicators computed from daily NASA POWER series.

All functions are pure: they take plain lists or dicts and return numbers, so
they can be unit-tested without network access. Formulas and their sources are
listed in docs/METHODS.md.
"""
import datetime as dt
import math

from . import config

SOLAR_CONSTANT = 0.0820  # MJ m-2 min-1 (FAO-56)


def extraterrestrial_radiation(lat_deg, day_of_year):
    """Daily extraterrestrial radiation Ra in MJ m-2 day-1 (FAO-56 eq. 21-25)."""
    phi = math.radians(lat_deg)
    dr = 1.0 + 0.033 * math.cos(2.0 * math.pi * day_of_year / 365.0)
    delta = 0.409 * math.sin(2.0 * math.pi * day_of_year / 365.0 - 1.39)
    ws = math.acos(max(-1.0, min(1.0, -math.tan(phi) * math.tan(delta))))
    return (24.0 * 60.0 / math.pi) * SOLAR_CONSTANT * dr * (
        ws * math.sin(phi) * math.sin(delta)
        + math.cos(phi) * math.cos(delta) * math.sin(ws)
    )


def hargreaves_et0(tmax, tmin, lat_deg, day_of_year):
    """Reference evapotranspiration in mm/day (Hargreaves, FAO-56 eq. 52)."""
    if tmax is None or tmin is None:
        return None
    spread = max(tmax - tmin, 0.0)
    tmean = (tmax + tmin) / 2.0
    ra_mm = 0.408 * extraterrestrial_radiation(lat_deg, day_of_year)
    return max(0.0023 * (tmean + 17.8) * math.sqrt(spread) * ra_mm, 0.0)


def longest_dry_spell(rain, wet_day_mm=config.WET_DAY_MM):
    """Longest run of consecutive days with rain below the wet-day threshold."""
    longest = current = 0
    for value in rain:
        if value is not None and value < wet_day_mm:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest


def onset_index(rain,
                spell_days=config.ONSET_SPELL_DAYS,
                spell_mm=config.ONSET_SPELL_MM,
                window=config.ONSET_FALSE_START_WINDOW,
                dry_days=config.ONSET_FALSE_START_DRY_DAYS,
                wet_day_mm=config.WET_DAY_MM):
    """Index of the rainy-season onset within `rain`, or None if there is none.

    Onset is the first day of a wet spell (`spell_mm` or more over `spell_days`
    days) that is not followed, within `window` days, by a dry spell of
    `dry_days` or more. The second condition rejects false starts.

    `rain` should begin at the first date onset may occur and may run past the
    last allowed onset date so the false-start check has data; pass
    `last_start` via slicing in the caller.
    """
    n = len(rain)
    for i in range(n - spell_days + 1):
        spell = rain[i:i + spell_days]
        if any(v is None for v in spell) or sum(spell) < spell_mm:
            continue
        following = rain[i + spell_days:i + spell_days + window]
        if longest_dry_spell(following, wet_day_mm) >= dry_days:
            continue
        return i
    return None


def _year_days(year):
    first = dt.date(year, 1, 1)
    count = (dt.date(year + 1, 1, 1) - first).days
    return [first + dt.timedelta(days=i) for i in range(count)]


def _total(values):
    present = [v for v in values if v is not None]
    return sum(present) if present else None


def yearly_indicators(year, rain_by_day, tmax_by_day, tmin_by_day, lat):
    """Indicators for one calendar year. Inputs map YYYYMMDD -> value or None."""
    days = _year_days(year)
    keys = [d.strftime("%Y%m%d") for d in days]
    rain = [rain_by_day.get(k) for k in keys]
    tmax = [tmax_by_day.get(k) for k in keys]
    tmin = [tmin_by_day.get(k) for k in keys]
    et0 = [
        hargreaves_et0(tx, tn, lat, d.timetuple().tm_yday)
        for d, tx, tn in zip(days, tmax, tmin)
    ]

    def idx(month, day):
        return (dt.date(year, month, day) - days[0]).days

    jun1, oct1 = idx(6, 1), idx(10, 1)
    search_start = idx(*config.ONSET_SEARCH_START)
    search_end = idx(*config.ONSET_SEARCH_END)
    # Search for onset up to the end date, but give the false-start check the
    # days that follow it.
    tail = config.ONSET_SPELL_DAYS + config.ONSET_FALSE_START_WINDOW
    onset = onset_index(rain[search_start:search_end + 1 + tail])
    if onset is not None and search_start + onset > search_end:
        onset = None

    monsoon_rain = _total(rain[jun1:oct1])
    monsoon_et0 = _total(et0[jun1:oct1])
    monthly_rain, monthly_et0 = [], []
    for month in range(1, 13):
        a = idx(month, 1)
        b = idx(month + 1, 1) if month < 12 else len(days)
        monthly_rain.append(_round(_total(rain[a:b])))
        monthly_et0.append(_round(_total(et0[a:b])))

    return {
        "year": year,
        "annual_rain_mm": _round(_total(rain)),
        "monsoon_rain_mm": _round(monsoon_rain),
        "post_monsoon_rain_mm": _round(_total(rain[oct1:])),
        "monsoon_et0_mm": _round(monsoon_et0),
        "monsoon_water_balance_mm": _round(
            None if monsoon_rain is None or monsoon_et0 is None
            else monsoon_rain - monsoon_et0
        ),
        "onset_days_after_jun1": onset,
        "onset_date": (
            None if onset is None
            else (days[search_start] + dt.timedelta(days=onset)).isoformat()
        ),
        "longest_monsoon_dry_spell_days": longest_dry_spell(rain[jun1:oct1]),
        "hot_days": sum(1 for t in tmax if t is not None and t >= config.HOT_DAY_C),
        "monthly_rain_mm": monthly_rain,
        "monthly_et0_mm": monthly_et0,
        "missing_days": sum(1 for v in rain if v is None),
    }


def _round(value, digits=1):
    return None if value is None else round(value, digits)
