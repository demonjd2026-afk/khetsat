"""Year types: group the years of the record by the kind of season they were.

Two approaches are computed side by side so they can be compared:

1. Statistical: terciles of monsoon rainfall (dry, middle, wet).
2. Pattern-finding: k-means clustering on several standardised season
   features, so a year can be "late but wet" or "short dry spells but hot".

`eta_squared` then measures how much of the year-to-year variation in a crop's
water outcome each grouping explains.
"""
import random
import statistics

FEATURES = [
    "monsoon_rain_mm",
    "post_monsoon_rain_mm",
    "onset_days_after_jun1",
    "longest_monsoon_dry_spell_days",
    "hot_days",
]
NO_ONSET_DAYS = 122  # 1 June to 30 September: used when no onset was found


def feature_matrix(rows):
    matrix = []
    for row in rows:
        values = []
        for name in FEATURES:
            value = row[name]
            if value is None:
                value = NO_ONSET_DAYS
            values.append(float(value))
        matrix.append(values)
    return matrix


def standardise(matrix):
    columns = list(zip(*matrix))
    means = [statistics.fmean(c) for c in columns]
    sds = [statistics.pstdev(c) or 1.0 for c in columns]
    return [[(v - m) / s for v, m, s in zip(row, means, sds)] for row in matrix]


def _distance2(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b))


def kmeans(points, k, seed=7, restarts=25, iterations=100):
    """Lloyd's k-means with k-means++ starts. Returns (labels, inertia)."""
    rng = random.Random(seed)
    best = None
    for _ in range(restarts):
        centres = [points[rng.randrange(len(points))]]
        while len(centres) < k:
            d2 = [min(_distance2(p, c) for c in centres) for p in points]
            total = sum(d2)
            if total == 0:
                centres.append(points[rng.randrange(len(points))])
                continue
            pick, acc = rng.random() * total, 0.0
            for point, d in zip(points, d2):
                acc += d
                if acc >= pick:
                    centres.append(point)
                    break
        labels = None
        for _ in range(iterations):
            new = [min(range(k), key=lambda j: _distance2(p, centres[j])) for p in points]
            if new == labels:
                break
            labels = new
            for j in range(k):
                members = [p for p, l in zip(points, labels) if l == j]
                if members:
                    centres[j] = [statistics.fmean(c) for c in zip(*members)]
        inertia = sum(_distance2(p, centres[l]) for p, l in zip(points, labels))
        if best is None or inertia < best[1] - 1e-12:
            best = (labels, inertia)
    return best


def terciles(values):
    """Label each value 0 (lowest third), 1 or 2 (highest third)."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    labels = [0] * len(values)
    n = len(values)
    for rank, i in enumerate(order):
        labels[i] = min(rank * 3 // n, 2)
    return labels


def eta_squared(labels, values):
    """Share of the variance in `values` explained by the grouping (0 to 1)."""
    grand = statistics.fmean(values)
    total = sum((v - grand) ** 2 for v in values)
    if total == 0:
        return 0.0
    between = 0.0
    for label in set(labels):
        group = [v for v, l in zip(values, labels) if l == label]
        between += len(group) * (statistics.fmean(group) - grand) ** 2
    return between / total


def classify(rows, k=3):
    """Cluster the years; clusters are numbered from driest monsoon to wettest."""
    matrix = feature_matrix(rows)
    labels, inertia = kmeans(standardise(matrix), k)
    rain = [r["monsoon_rain_mm"] for r in rows]
    mean_rain = {
        j: statistics.fmean([v for v, l in zip(rain, labels) if l == j])
        for j in set(labels)
    }
    order = sorted(mean_rain, key=mean_rain.get)
    renumber = {old: new for new, old in enumerate(order)}
    labels = [renumber[l] for l in labels]
    clusters = []
    for j in range(len(order)):
        members = [i for i, l in enumerate(labels) if l == j]
        clusters.append({
            "id": j,
            "years": [rows[i]["year"] for i in members],
            "centre": {
                name: round(statistics.fmean([matrix[i][c] for i in members]), 1)
                for c, name in enumerate(FEATURES)
            },
        })
    return labels, clusters, inertia
