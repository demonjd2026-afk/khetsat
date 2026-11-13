import unittest

from pipeline import yeartypes


class KMeansTest(unittest.TestCase):
    def test_separates_two_obvious_groups(self):
        points = [[0.0, 0.1], [0.1, 0.0], [0.05, 0.05], [5.0, 5.1], [5.1, 5.0], [4.9, 5.0]]
        labels, inertia = yeartypes.kmeans(points, 2)
        self.assertEqual(len(set(labels[:3])), 1)
        self.assertEqual(len(set(labels[3:])), 1)
        self.assertNotEqual(labels[0], labels[3])
        self.assertLess(inertia, 0.1)

    def test_is_repeatable(self):
        points = [[float(i % 7), float(i % 3)] for i in range(30)]
        self.assertEqual(yeartypes.kmeans(points, 3)[0], yeartypes.kmeans(points, 3)[0])


class TercileTest(unittest.TestCase):
    def test_equal_thirds(self):
        labels = yeartypes.terciles([5, 1, 9, 3, 7, 2])
        self.assertEqual(labels, [1, 0, 2, 1, 2, 0])


class EtaSquaredTest(unittest.TestCase):
    def test_perfect_grouping(self):
        self.assertAlmostEqual(yeartypes.eta_squared([0, 0, 1, 1], [1, 1, 5, 5]), 1.0)

    def test_useless_grouping(self):
        self.assertAlmostEqual(yeartypes.eta_squared([0, 1, 0, 1], [1, 1, 5, 5]), 0.0)


class ClassifyTest(unittest.TestCase):
    def test_clusters_are_ordered_dry_to_wet(self):
        rows = []
        for i in range(30):
            rain = 200 + 30 * i
            rows.append({"year": 1990 + i, "monsoon_rain_mm": rain,
                         "post_monsoon_rain_mm": 100, "onset_days_after_jun1": None if i == 0 else 20,
                         "longest_monsoon_dry_spell_days": 30 - i // 2, "hot_days": 10})
        labels, clusters, _ = yeartypes.classify(rows)
        means = [c["centre"]["monsoon_rain_mm"] for c in clusters]
        self.assertEqual(means, sorted(means))
        self.assertEqual(sum(len(c["years"]) for c in clusters), 30)


if __name__ == "__main__":
    unittest.main()
