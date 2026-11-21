#!/usr/bin/env python3
"""Refresh views/likes in perf.csv from the workbench output of perf_refresh.py:  python3 shorts-out/perf_merge.py < lines.txt
Only numbers change (views, likes, checked = today) plus the age-normalised snapshots: views_24h = the first refresh 1-2 days after
the public day, views_72h = the first refresh 3+ days after it (slot.py reads only views_72h, so 1-day-old and 6-day-old videos
are never compared). Existing snapshots are never overwritten. Empty input changes nothing. IDs not in perf.csv are printed:
add those rows by hand (channel,file,video_id,style,kind,public_ist,0,0,date).
  python3 shorts-out/perf_merge.py --test     self-check"""
import csv, sys, pathlib, datetime
p = pathlib.Path(__file__).parent / 'perf.csv'
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

def snap(r, today, views):
    """Fill views_24h / views_72h of one row from its age on `today` (IST date). Rows without a public day are left alone."""
    pub = (r.get('public_ist') or '').strip()
    if not pub: return
    age = (today - datetime.datetime.strptime(pub[:10], '%Y-%m-%d').date()).days
    if 1 <= age < 3 and not (r.get('views_24h') or '').strip(): r['views_24h'] = views
    if age >= 3 and not (r.get('views_72h') or '').strip(): r['views_72h'] = views

def merge(rows, new, today):
    for r in rows:
        if r['video_id'] in new:
            r['views'], r['likes'], r['checked'] = new[r['video_id']][5], new[r['video_id']][6], today.isoformat()
            snap(r, today, new[r['video_id']][5])
    return rows

def _test():
    t = datetime.date(2026, 11, 22)
    r = {'public_ist': '2026-11-21 09:00', 'views_24h': '', 'views_72h': ''}; snap(r, t, '900')
    assert r['views_24h'] == '900' and r['views_72h'] == '', r                       # 1 day old: 24h snapshot only
    r = {'public_ist': '2026-11-19 09:00', 'views_24h': '', 'views_72h': ''}; snap(r, t, '1200')
    assert r['views_72h'] == '1200' and r['views_24h'] == '', r                      # 3 days old: 72h snapshot
    r = {'public_ist': '2026-11-19 09:00', 'views_24h': '5', 'views_72h': '1200'}; snap(r, t, '9999')
    assert r['views_72h'] == '1200', 'an existing snapshot is never overwritten'
    r = {'public_ist': '', 'views_24h': '', 'views_72h': ''}; snap(r, t, '3'); assert r['views_72h'] == '' and r['views_24h'] == ''
    print('perf_merge.py: self-check OK')

if __name__ == '__main__':
    if '--test' in sys.argv: _test(); sys.exit()
    new = {l.split('|')[1]: l.split('|') for l in sys.stdin if l.count('|') >= 7}
    if not new:
        print('no lines, perf.csv unchanged'); sys.exit(0)
    rows = list(csv.DictReader(p.open()))
    merge(rows, new, datetime.datetime.now(IST).date())
    with p.open('w', newline='') as f:
        w = csv.DictWriter(f, rows[0].keys(), lineterminator='\n'); w.writeheader(); w.writerows(rows)
    known = {r['video_id'] for r in rows}
    print(sum(r['video_id'] in new for r in rows), 'rows updated of', len(rows))
    for vid, parts in new.items():
        if vid not in known: print('not in perf.csv, add by hand:', parts[0], vid, parts[7][:40])
