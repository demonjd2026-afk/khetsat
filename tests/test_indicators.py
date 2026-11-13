import unittest

from pipeline import indicators, stats


class ExtraterrestrialRadiationTest(unittest.TestCase):
    def test_fao56_example_8(self):
        # FAO-56 Example 8: 20 deg S on 3 September (day 246) gives 32.2 MJ m-2 day-1
        self.assertAlmostEqual(
            indicators.extraterrestrial_radiation(-20.0, 246), 32.2, delta=0.1)


class HargreavesTest(unittest.TestCase):
    def test_missing_input_gives_none(self):
        self.assertIsNone(indicators.hargreaves_et0(None, 20.0, 15.0, 180))

    def test_zero_spread_gives_zero(self):
        self.assertEqual(indicators.hargreaves_et0(25.0, 25.0, 15.0, 180), 0.0)

    def test_plausible_range_for_tropics(self):
        value = indicators.hargreaves_et0(38.0, 26.0, 14.68, 135)
        self.assertTrue(4.0 < value < 9.0, value)


class DrySpellTest(unittest.TestCase):
    def test_longest_run(self):
        rain = [5, 0, 0.5, 0, 12, 0, 0, 3]
        self.assertEqual(indicators.longest_dry_spell(rain), 3)

    def test_missing_breaks_run(self):
        self.assertEqual(indicators.longest_dry_spell([0, 0, None, 0]), 2)


class OnsetTest(unittest.TestCase):
    def test_simple_onset(self):
        rain = [0, 0, 10, 8, 5] + [3] * 40
        self.assertEqual(indicators.onset_index(rain), 2)

    def test_seven_dry_days_do_not_cancel_onset(self):
        # Sivakumar (1988): only a dry spell exceeding 7 days cancels the onset
        rain = [10, 8, 5] + [0] * 7 + [3] * 40
        self.assertEqual(indicators.onset_index(rain), 0)

    def test_false_start_is_rejected(self):
        false_start = [10, 8, 5] + [0] * 12
        real = [10, 8, 5] + [3] * 40
        self.assertEqual(indicators.onset_index(false_start + real), len(false_start))

    def test_no_onset(self):
        self.assertIsNone(indicators.onset_index([0.2] * 60))


class StatsTest(unittest.TestCase):
    def test_dependable_is_lower_quartile(self):
        self.assertEqual(stats.dependable([1, 2, 3, 4, 5], 0.75), 2)

    def test_mann_kendall_increasing(self):
        s, z, p = stats.mann_kendall(list(range(20)))
        self.assertEqual(s, 190)
        self.assertLess(p, 0.001)

    def test_mann_kendall_flat(self):
        _, z, p = stats.mann_kendall([3] * 12)
        self.assertEqual(z, 0.0)
        self.assertEqual(p, 1.0)

    def test_theil_sen(self):
        self.assertAlmostEqual(stats.theil_sen_slope([0, 1, 2, 3], [1, 3, 5, 7]), 2.0)


class CorrelationTest(unittest.TestCase):
    def test_pearson_perfect(self):
        self.assertAlmostEqual(stats.pearson([1, 2, 3], [2, 4, 6]), 1.0)
        self.assertAlmostEqual(stats.pearson([1, 2, 3], [6, 4, 2]), -1.0)

    def test_pearson_constant_is_undefined(self):
        self.assertIsNone(stats.pearson([1, 1, 1], [1, 2, 3]))

    def test_ranks_with_ties(self):
        self.assertEqual(stats.ranks([10, 20, 20, 30]), [1.0, 2.5, 2.5, 4.0])

    def test_spearman_monotonic(self):
        self.assertAlmostEqual(stats.spearman([1, 2, 3, 4], [1, 4, 9, 100]), 1.0)


if __name__ == "__main__":
    unittest.main()
