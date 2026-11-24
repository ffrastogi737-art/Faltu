#!/usr/bin/env python3
"""LIVE CHECK (owner 24 Nov 2026): records never beat the platform. Input = the YouTube rows read LIVE from Windsor
(get_data, connector youtube, fields account_name, video, video_title, privacy_status, published_at), saved as JSON.
  python3 shorts-out/live_check.py live.json          report mismatches, write shorts-out/live-check.txt
  python3 shorts-out/live_check.py --test             self-check (asserts)
Rules: a queue line or perf row that says DONE / is past its slot but the video is not public = MISMATCH (fix the record, never the video).
A video that is live but still PENDING in the queue = FIX (mark DONE). Live videos with no record = UNRECORDED (report only, never delete)."""
import sys, csv, json, pathlib, re, datetime as dt

D = pathlib.Path(__file__).parent
NOW_UTC = lambda: dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
IST_OFF = dt.timedelta(hours=5, minutes=30)

def queue_lines(text):
    """publish-queue.txt -> [(utc datetime, video id, status)] for solo."""
    out = []
    for l in text.splitlines():
        m = re.match(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+(\S+)\s+.*\s(PENDING|DONE)\s*$', l)
        if m: out.append((dt.datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%SZ'), m.group(2), m.group(3)))
    return out

def perf_rows(text):
    """perf.csv -> [(channel, video id, public_ist as naive IST datetime or None)] for rows with a real id."""
    out = []
    for r in csv.DictReader(text.splitlines()):
        vid = (r.get('video_id') or '').strip()
        if vid in ('', 'TBD'): continue
        p = (r.get('public_ist') or '').strip()
        out.append((r['channel'], vid, dt.datetime.strptime(p, '%Y-%m-%d %H:%M') if p else None))
    return out

def check(live_rows, q, perf, now):
    """Returns (mismatches, fixes, unrecorded). live_rows: dicts from Windsor. q/perf: parsed records. now: UTC datetime."""
    live = {r['video']: (r.get('privacy_status') or '').lower() for r in live_rows}
    mism, fixes, seen = [], [], set()
    for when, vid, st in q:
        s = live.get(vid, 'not found')
        seen.add(vid)
        if st == 'DONE' and s != 'public': mism.append(f"queue DONE but live is '{s}': {vid} ({when:%Y-%m-%d %H:%M}Z)")
        if st == 'PENDING' and s == 'public': fixes.append(f"queue PENDING but live public: {vid} -> mark DONE")
        if st == 'PENDING' and when <= now and s != 'public': mism.append(f"overdue, still '{s}': {vid} slot {when:%Y-%m-%d %H:%M}Z (guard: catch-up slot, never public on the spot)")
    for ch, vid, pub in perf:
        seen.add(vid)
        s = live.get(vid, 'not found')
        if pub and pub <= now + IST_OFF and s != 'public' and vid not in {m.split(': ')[-1].split(' ')[0] for m in mism}:
            mism.append(f"perf says public at {pub:%Y-%m-%d %H:%M} IST, live is '{s}': {ch} {vid}")
    unrec = [f"live but no record: {v} ({s})" for v, s in live.items() if v not in seen and v]
    return mism, fixes, unrec

def main(argv):
    if '--test' in argv: return _test()
    rows = json.loads(pathlib.Path(argv[0]).read_text())
    q = queue_lines((D / 'publish-queue.txt').read_text())
    perf = perf_rows((D / 'perf.csv').read_text())
    m, f, u = check(rows, q, perf, NOW_UTC())
    lines = [f"LIVE CHECK {NOW_UTC():%Y-%m-%d %H:%M}Z: {len(rows)} live rows", *[f"MISMATCH {x}" for x in m], *[f"FIX {x}" for x in f], *[f"NOTE {x}" for x in u]]
    if not (m or f or u): lines.append("all records match the live state")
    (D / 'live-check.txt').write_text('\n'.join(lines) + '\n'); print('\n'.join(lines))
    return 1 if m else 0

def _test():
    now = dt.datetime(2026, 11, 24, 8, 5)
    live = [{'video': 'Dgr3Jg63DpE', 'privacy_status': 'private'}, {'video': 'c8pO56jQCtI', 'privacy_status': 'public'},
            {'video': 'AAA', 'privacy_status': 'public'}]
    q = [(dt.datetime(2026, 11, 24, 8, 5), 'Dgr3Jg63DpE', 'PENDING'), (dt.datetime(2026, 11, 24, 5, 30), 'c8pO56jQCtI', 'PENDING'),
         (dt.datetime(2026, 11, 24, 3, 0), 'OLD', 'DONE')]
    perf = [('solo', 'Dgr3Jg63DpE', dt.datetime(2026, 11, 24, 13, 55)), ('gta', 'c8pO56jQCtI', dt.datetime(2026, 11, 24, 11, 0))]
    m, f, u = check(live, q, perf, now)
    assert any('overdue, still' in x and 'Dgr3' in x for x in m), m        # overdue private = mismatch
    assert any('queue PENDING but live public' in x for x in f), f         # live public, queue PENDING = fix
    assert any('queue DONE but live' in x and 'OLD' in x for x in m), m    # DONE with no live row = mismatch
    assert any('live but no record: AAA' in x for x in u), u               # live with no record = note only
    assert not any('c8pO56jQCtI' in x for x in m), m                       # public and recorded public = fine
    m2, _, _ = check(live[:1], [], [('solo', 'Dgr3Jg63DpE', dt.datetime(2026, 11, 24, 13, 55))], now)
    assert not m2, m2                                                     # a future public_ist is not a mismatch
    print('live_check.py: self-check OK'); return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
