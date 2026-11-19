"""Engine 1: Viral YouTube Shorts Factory (9:16)."""
from ..brain.queue import handler
from .common import produce

BEATS_FOR_PRESET = {"short15": 2, "short30": 3, "short58": 5}


@handler("shorts.produce")
def produce_short(p):
    preset = p.get("preset", "short30")
    return produce("shorts", p["topic_id"], preset, BEATS_FOR_PRESET[preset])
