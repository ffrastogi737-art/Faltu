#!/usr/bin/env python3
"""Next free solo-hype slot. A new video never lands on a taken slot.
   python3 shorts-out/slot.py          -> prints e.g. '2026-11-20T11:30:00Z 17:00 IST'
   python3 shorts-out/slot.py --test   -> self-check (asserts)
Taken = a publish-queue.txt line with that exact UTC time. Earliest slot at least 60 min from now."""
import sys, pathlib, re, datetime as dt
D = pathlib.Path(__file__).parent
SLOTS = [(3, 30, '09:00'), (6, 0, '11:30'), (11, 30, '17:00'), (14, 0, '19:30')]  # (UTC h, UTC m, IST label)

def taken():
    return {m.group(1) for l in (D / 'publish-queue.txt').read_text().splitlines()
            for m in [re.match(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s', l)] if m}

def free(now, t):
    for d in range(4):
        for h, m, ist in SLOTS:
            s = dt.datetime(now.year, now.month, now.day, h, m, tzinfo=dt.timezone.utc) + dt.timedelta(days=d)
            iso = s.strftime('%Y-%m-%dT%H:%M:%SZ')
            if s >= now + dt.timedelta(minutes=60) and iso not in t:
                return iso, ist

if __name__ == '__main__':
    if '--test' in sys.argv:
        n = dt.datetime(2026, 11, 20, 8, 53, tzinfo=dt.timezone.utc)      # 14:23 IST
        assert free(n, set()) == ('2026-11-20T11:30:00Z', '17:00')          # 09:00 and 11:30 IST are past
        assert free(n, {'2026-11-20T11:30:00Z'}) == ('2026-11-20T14:00:00Z', '19:30')
        assert free(n, {'2026-11-20T11:30:00Z', '2026-11-20T14:00:00Z'}) == ('2026-11-21T03:30:00Z', '09:00')
        print('slot.py: self-check OK'); sys.exit()
    print(*free(dt.datetime.now(dt.timezone.utc), taken()))
