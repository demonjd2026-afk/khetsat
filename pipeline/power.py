"""Download daily data from the NASA POWER API, with a local cache."""
import json
import pathlib
import urllib.parse
import urllib.request

from . import config

RAW_DIR = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"


def build_url(lat, lon, start_year, end_year, parameters, time_standard=None):
    extra = {"time-standard": time_standard} if time_standard else {}
    query = urllib.parse.urlencode({
        **extra,
        "parameters": ",".join(parameters),
        "community": config.POWER_COMMUNITY,
        "longitude": lon,
        "latitude": lat,
        "start": f"{start_year}0101",
        "end": f"{end_year}1231",
        "format": "JSON",
    })
    return f"{config.POWER_URL}?{query}"


def fetch_daily(key, lat, lon, start_year=config.START_YEAR,
                end_year=config.END_YEAR, parameters=None, refresh=False,
                time_standard=None, tag=""):
    """Return the POWER response for a point, using the cache when present.

    `tag` separates cache files for requests with different parameters.
    """
    parameters = parameters or config.POWER_PARAMETERS
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache = RAW_DIR / f"power{tag}_{key}_{start_year}_{end_year}.json"
    if cache.exists() and not refresh:
        return json.loads(cache.read_text())
    url = build_url(lat, lon, start_year, end_year, parameters, time_standard)
    request = urllib.request.Request(url, headers={"User-Agent": "khetsat-pipeline"})
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if "properties" not in payload or "parameter" not in payload["properties"]:
        raise RuntimeError(f"Unexpected POWER response for {key}: {str(payload)[:300]}")
    cache.write_text(json.dumps(payload))
    return payload


def clean_series(payload, parameter):
    """Map of YYYYMMDD -> value, with the POWER fill value turned into None."""
    raw = payload["properties"]["parameter"][parameter]
    return {
        day: (None if value <= config.POWER_FILL_VALUE + 1e-6 else value)
        for day, value in raw.items()
    }
