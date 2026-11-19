"""CLI used by GitHub Actions workers and for local runs.
  python -m app.cli init | research | plan | work [N] | report | stats | yt-auth-url | yt-test | demo
"""
import json
import sys

from .db import init_db
from .brain import trends, planner, queue
from .engines import shorts, longform, clipping  # noqa: F401
from .publish import youtube
from . import storage


def main(argv):
    cmd = argv[0] if argv else "report"
    init_db()
    if cmd == "init":
        print("db ready")
    elif cmd == "research":
        print(json.dumps({"new_topics": trends.research()}))
    elif cmd == "plan":
        print(json.dumps({"planned": planner.plan_day()}))
    elif cmd == "work":
        storage.sync_library()
        print(json.dumps({"processed": queue.drain(int(argv[1]) if len(argv) > 1 else 20)}))
    elif cmd == "report":
        print(json.dumps(planner.daily_report(), indent=2, default=str))
    elif cmd == "stats":
        print(json.dumps(youtube.pull_stats() if youtube.configured() else {"skipped": "YouTube not configured"}))
    elif cmd == "yt-auth-url":  # prefer the dashboard's CONNECT YOUTUBE button; the token is stored in the DB, never printed
        print(youtube.auth_url(argv[1] if len(argv) > 1 else "http://localhost"))
    elif cmd == "yt-test":
        print(json.dumps(youtube.integration_test()))
    elif cmd == "demo":  # end-to-end offline: research -> plan -> render
        trends.research()
        print("planned:", planner.plan_day())
        print("processed:", queue.drain(10))
        print(json.dumps(planner.daily_report(), indent=2, default=str))
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
