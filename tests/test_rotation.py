import datetime as dt
import unittest

from pipeline import rotation

CROPS = {
    "a": {"name": "A", "family": "Fabaceae", "legume": True, "verified": True,
          "kc": {"ini": 0.4, "mid": 1.0, "end": 0.5}, "stages_days": [10, 10, 10, 10]},
    "b": {"name": "B", "family": "Poaceae", "legume": False, "verified": True,
          "kc": {"ini": 0.3, "mid": 1.0, "end": 0.3}, "stages_days": [10, 10, 10, 10]},
}


def dates(years=2):
    first = dt.date(2001, 1, 1)
    return [first + dt.timedelta(days=i) for i in range(365 * years)]


class KcCurveTest(unittest.TestCase):
    def test_stage_values(self):
        crop = CROPS["a"]
        kc = lambda d: rotation.kc_on_day(d, crop["stages_days"], crop["kc"])
        self.assertEqual(kc(0), 0.4)
        self.assertEqual(kc(9), 0.4)
        self.assertAlmostEqual(kc(15), 0.7)
        self.assertEqual(kc(20), 1.0)
        self.assertEqual(kc(29), 1.0)
        self.assertAlmostEqual(kc(35), 0.75)

    def test_outside_season(self):
        with self.assertRaises(ValueError):
            rotation.kc_on_day(40, CROPS["a"]["stages_days"], CROPS["a"]["kc"])


class CalendarTest(unittest.TestCase):
    def test_alternating_cycle(self):
        cycle = [[{"crop": "a", "sow": [6, 1]}], [{"crop": "b", "sow": [6, 1]}]]
        _, seasons = rotation.build_calendar(dates(), cycle, CROPS)
        self.assertEqual([s["crop"] for s in seasons], ["a", "b"])

    def test_overlap_is_an_error(self):
        cycle = [[{"crop": "a", "sow": [6, 1]}, {"crop": "b", "sow": [6, 20]}]]
        with self.assertRaises(ValueError):
            rotation.build_calendar(dates(), cycle, CROPS)

    def test_season_past_end_is_dropped(self):
        cycle = [[{"crop": "a", "sow": [12, 15]}]]
        _, seasons = rotation.build_calendar(dates(1), cycle, CROPS)
        self.assertEqual(seasons, [])


class SimulationTest(unittest.TestCase):
    def setUp(self):
        self.dates = dates(1)
        self.cycle = [[{"crop": "a", "sow": [6, 1]}]]

    def run_with(self, rain_value, irrigated=False):
        cycle = [[dict(self.cycle[0][0], irrigated=irrigated)]]
        slots, seasons = rotation.build_calendar(self.dates, cycle, CROPS)
        n = len(self.dates)
        return rotation.simulate([rain_value] * n, [5.0] * n, slots, seasons)[0]

    def test_ample_rain_meets_need(self):
        self.assertAlmostEqual(self.run_with(10.0)["wrsi"], 100.0)

    def test_no_rain_fails(self):
        self.assertAlmostEqual(self.run_with(0.0)["wrsi"], 0.0)

    def test_partial_rain(self):
        # 1 mm/day is below bare-soil evaporation, so no water is stored
        # before sowing and the crop gets less than it needs
        season = self.run_with(1.0)
        self.assertTrue(0.0 < season["wrsi"] < 100.0)
        self.assertLessEqual(season["eta_mm"], season["etc_mm"])

    def test_irrigation_fills_the_gap(self):
        season = self.run_with(0.0, irrigated=True)
        self.assertAlmostEqual(season["wrsi"], 100.0)
        self.assertAlmostEqual(season["irrigation_mm"], season["etc_mm"])

    def test_water_is_conserved(self):
        # crop water use can never exceed rain received plus stored water
        season = self.run_with(1.0)
        self.assertLessEqual(season["eta_mm"], 365 * 1.0 + 1e-9)


class ScoreTest(unittest.TestCase):
    def test_weights(self):
        comp = {"water_fit": 1.0, "resilience": 0.0, "soil": 0.5, "diversity": 0.5}
        self.assertEqual(rotation.score(comp), 50.0)
        self.assertEqual(rotation.score(comp, {"water_fit": 1, "resilience": 0,
                                               "soil": 0, "diversity": 0}), 100.0)

    def test_zero_weights_rejected(self):
        with self.assertRaises(ValueError):
            rotation.score({"water_fit": 1.0}, {"water_fit": 0})


if __name__ == "__main__":
    unittest.main()
