#!/usr/bin/env python3
"""Next publish time from performance (owner 20 Nov: no fixed slots). Solo by default, `gta` for Kratos Playz.
   python3 shorts-out/slot.py [solo|gta]   -> e.g. '2026-11-20T14:00:00Z 19:00 IST (n=2 median 950)'
   python3 shorts-out/slot.py --test       -> self-check (asserts)
Score per IST hour = median views of the counted rows public at that hour (n>=2). An untested hour next to a proven
peak is tested (scored 0.9 x the best peak); other untested hours score the channel median. The best score wins.
Slot: on the hour, 09:00-21:00 IST, at least 60 min ahead, within 3 days, no publish-queue line within 30 min.
shortcut: scores use views at the last check, not view velocity (perf.csv keeps one snapshot), upgrade when snapshots repeat."""
import sys, pathlib, re, collections, datetime as dt, statistics as st
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from pick_style import perf_rows, D

HOURS = range(9, 22)  # IST, on the hour
IST_OFF = dt.timedelta(hours=5, minutes=30)

def scores(rows):
    by = collections.defaultdict(list)
    for r in rows:
        if r['hour']: by[int(r['hour'])].append(r['views'])
    overall = st.median([r['views'] for r in rows]) if rows else 0
    proven = {h: st.median(v) for h, v in by.items() if len(v) >= 2}
    best = max(proven.values(), default=overall)
    out = {}
    for h in HOURS:
        if h in proven:
            out[h] = (proven[h], f'n={len(by[h])} median {proven[h]:.0f}')
        elif any(proven.get(x, 0) >= 1.5 * overall for x in (h - 1, h + 1)):
            out[h] = (0.9 * best, 'untested, next to a proven peak')
        else:
            out[h] = (overall, 'untested, channel median')
    return out

def pick(now_utc, rows, taken):
    sc = scores(rows)
    cands = []
    for d in range(3):
        for h in HOURS:
            ist = dt.datetime.combine((now_utc + IST_OFF).date() + dt.timedelta(days=d), dt.time(h))
            utc = ist - IST_OFF
            if utc < now_utc + dt.timedelta(minutes=60): continue
            if any(abs((utc - t).total_seconds()) < 1800 for t in taken): continue
            cands.append((sc[h][0], -(utc - dt.datetime(1970, 1, 1)).total_seconds(), utc, h, sc[h][1]))
    if not cands: return None
    _, _, utc, h, why = max(cands, key=lambda c: (c[0], c[1]))
    return utc, h, why

def taken_utc(channel='solo'):
    # publish-queue.txt is the solo queue; the Kratos publishAt times are not in it (checked by hand)
    if channel != 'solo': return []
    return [dt.datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%SZ') for l in (D / 'publish-queue.txt').read_text().splitlines()
            for m in [re.match(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s', l)] if m]

def _test():
    now = dt.datetime(2026, 11, 20, 8, 53)                       # 14:23 IST
    rows = [dict(hour='13', views=v) for v in (1000, 900)] + [dict(hour='19', views=v) for v in (100, 120)]
    utc, h, _ = pick(now, rows, [])                              # proven 13:00 IST is the best score
    assert h == 13 and utc == dt.datetime(2026, 11, 21, 7, 30), (utc, h)
    block = [dt.datetime(2026, 11, 20, 7, 30) + dt.timedelta(days=d) for d in range(3)]   # every 13:00 IST taken
    utc, h, _ = pick(now, rows, block)                           # then a tested neighbour (12 or 14) takes it
    assert h in (12, 14), h
    utc, h, _ = pick(now, [], [])                                # no data: still a free slot, never a taken one
    assert utc >= now + dt.timedelta(minutes=60)
    print('slot.py: self-check OK')

if __name__ == '__main__':
    if '--test' in sys.argv:
        _test(); sys.exit()
    ch = sys.argv[1] if len(sys.argv) > 1 else 'solo'
    ok, skipped = perf_rows(ch)
    res = pick(dt.datetime.now(dt.timezone.utc).replace(tzinfo=None), ok, taken_utc(ch))
    if res is None: sys.exit('no free slot in 3 days: check publish-queue.txt')
    utc, h, why = res
    print(f"{utc:%Y-%m-%dT%H:%M:%SZ} {h:02d}:00 IST  ({why}; counted rows {len(ok)})")
