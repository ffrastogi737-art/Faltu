"""Topic scoring: 6 factors, each 0-100, weighted to a 0-100 total.

Inputs (signals) are whatever the trend sources could measure. Missing signals
score a neutral 50 so a topic is never boosted by data we don't have."""
import math
from datetime import datetime, timezone

WEIGHTS = {
    "search_demand": 0.22,
    "trend_velocity": 0.20,
    "competition": 0.13,   # higher score = LESS competition
    "viral_potential": 0.18,
    "freshness": 0.15,
    "monetization": 0.12,
}

VIRAL_WORDS = ["leak", "trailer", "secret", "hidden", "map", "price", "release date", "delay",
               "vs", "never", "insane", "easter egg", "cheat", "money", "fastest", "rarest"]
MONEY_WORDS = ["guide", "how to", "best", "money", "tips", "tutorial", "location", "unlock",
               "pc", "ps5", "price", "edition", "pre-order"]


def _log_scale(x, lo, hi):
    if x is None:
        return 50.0
    x = max(float(x), 0.0)
    return max(0.0, min(100.0, 100 * (math.log10(x + 1) - math.log10(lo + 1)) / (math.log10(hi + 1) - math.log10(lo + 1))))


def _kw_score(title, words):
    t = title.lower()
    hits = sum(1 for w in words if w in t)
    return min(100.0, 30 + hits * 25)


def score_topic(title, signals, published_at=None):
    s = signals or {}
    scores = {
        # monthly searches or summed views of top results
        "search_demand": _log_scale(s.get("search_volume"), 100, 1_000_000),
        # views/hour of recent videos on the topic
        "trend_velocity": _log_scale(s.get("views_per_hour"), 10, 100_000),
        # number of competing videos in last 7 days (inverted)
        "competition": 100 - _log_scale(s.get("competing_videos"), 1, 500) if s.get("competing_videos") is not None else 50.0,
        "viral_potential": _kw_score(title, VIRAL_WORDS),
        "freshness": 50.0,
        "monetization": _kw_score(title, MONEY_WORDS),
    }
    if published_at:
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        hours = (datetime.now(timezone.utc) - published_at).total_seconds() / 3600
        scores["freshness"] = max(0.0, 100 - hours * (100 / 168))  # 0 after a week
    total = sum(scores[k] * w for k, w in WEIGHTS.items())
    return {k: round(v, 1) for k, v in scores.items()}, round(total, 1)
