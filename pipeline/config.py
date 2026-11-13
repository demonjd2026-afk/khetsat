"""Pipeline configuration: locations, period and indicator thresholds.

Each location is a single representative point. NASA POWER meteorology comes
from MERRA-2 on a 0.5 x 0.625 degree grid, so the values describe the grid cell
containing the point (roughly 50 km), not one field and not a district average.
"""

START_YEAR = 1981
END_YEAR = 2025

POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_COMMUNITY = "AG"
POWER_PARAMETERS = [
    "PRECTOTCORR",  # precipitation, bias-corrected, mm/day
    "T2M_MAX",      # daily maximum 2 m air temperature, deg C
    "T2M_MIN",      # daily minimum 2 m air temperature, deg C
    "GWETROOT",     # root-zone soil wetness, 0-1
]
POWER_FILL_VALUE = -999.0

# Representative inland points. Inland points are used on purpose: coastal grid
# cells mix land and sea and under-report land heat.
LOCATIONS = {
    "anantapur": {
        "name": "Anantapur",
        "point_label": "Anantapur town",
        "lat": 14.68,
        "lon": 77.60,
    },
    "krishna": {
        "name": "Krishna",
        "point_label": "Gudivada",
        "lat": 16.43,
        "lon": 80.99,
    },
    "anakapalli": {
        "name": "Anakapalli",
        "point_label": "Narsipatnam",
        "lat": 17.67,
        "lon": 82.61,
    },
}

# Indicator thresholds (all documented in docs/METHODS.md)
WET_DAY_MM = 1.0             # a day with less rain than this counts as dry
ONSET_SEARCH_START = (6, 1)  # month, day: earliest date onset is searched from
ONSET_SEARCH_END = (9, 30)
ONSET_SPELL_DAYS = 3         # rain is summed over this many days
ONSET_SPELL_MM = 20.0        # and must reach this total
ONSET_FALSE_START_WINDOW = 30  # days after the wet spell that are checked
ONSET_FALSE_START_DRY_DAYS = 8   # a dry spell exceeding 7 days cancels the onset (Sivakumar 1988)
HOT_DAY_C = 40.0
DEPENDABLE_PROBABILITY = 0.75  # rainfall reached or exceeded in 3 years out of 4

# Rotation water-balance assumptions (see docs/METHODS.md, "Rotation engine")
SOIL_AVAILABLE_WATER_MM = 100.0  # plant-available water the root zone can hold
FALLOW_KC = 0.3                  # evaporation coefficient for uncropped days
WRSI_FAILURE = 50.0              # below this a season is counted as failed
WRSI_SATISFACTORY = 80.0
SOIL_SENSITIVITY_MM = [75.0, 100.0, 150.0, 200.0]  # capacities tested

# Satellite rainfall cross-check
IMERG_START_YEAR = 2001  # first full calendar year of GPM IMERG
