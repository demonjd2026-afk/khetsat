"""Small statistics helpers (standard library only)."""
import math
import statistics


def mean(values):
    return statistics.fmean(values)


def coefficient_of_variation(values):
    """Population standard deviation divided by the mean, in percent."""
    m = statistics.fmean(values)
    if m == 0:
        return None
    return statistics.pstdev(values) / m * 100.0


def percentile(values, p):
    """Linear-interpolation percentile, p in [0, 1]."""
    xs = sorted(values)
    if not xs:
        raise ValueError("no values")
    if len(xs) == 1:
        return xs[0]
    pos = p * (len(xs) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo)


def dependable(values, probability):
    """Value reached or exceeded with the given probability.

    dependable(x, 0.75) is the 25th percentile: the amount you can count on in
    three years out of four.
    """
    return percentile(values, 1.0 - probability)


def mann_kendall(values):
    """Two-sided Mann-Kendall trend test with tie correction.

    Returns (S, z, p). Uses the normal approximation, adequate for n >= 10.
    """
    n = len(values)
    if n < 3:
        raise ValueError("need at least 3 values")
    s = 0
    for i in range(n - 1):
        for j in range(i + 1, n):
            diff = values[j] - values[i]
            s += (diff > 0) - (diff < 0)
    ties = {}
    for v in values:
        ties[v] = ties.get(v, 0) + 1
    tie_term = sum(t * (t - 1) * (2 * t + 5) for t in ties.values() if t > 1)
    var = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    if var == 0:
        return s, 0.0, 1.0
    if s > 0:
        z = (s - 1) / math.sqrt(var)
    elif s < 0:
        z = (s + 1) / math.sqrt(var)
    else:
        z = 0.0
    p = math.erfc(abs(z) / math.sqrt(2.0))
    return s, z, p


def theil_sen_slope(xs, ys):
    """Median of all pairwise slopes."""
    slopes = [
        (ys[j] - ys[i]) / (xs[j] - xs[i])
        for i in range(len(xs))
        for j in range(i + 1, len(xs))
        if xs[j] != xs[i]
    ]
    return statistics.median(slopes)


def trend(years, values, alpha=0.05):
    """Trend summary for a yearly series; None entries are skipped."""
    pairs = [(y, v) for y, v in zip(years, values) if v is not None]
    xs = [p[0] for p in pairs]
    ys = [p[1] for p in pairs]
    _, z, p = mann_kendall(ys)
    return {
        "n": len(ys),
        "slope_per_decade": round(theil_sen_slope(xs, ys) * 10.0, 3),
        "mann_kendall_z": round(z, 3),
        "p_value": round(p, 4),
        "significant": p < alpha,
    }
