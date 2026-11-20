#!/usr/bin/env python3
"""Refresh views/likes in perf.csv from the workbench output of perf_refresh.py:  python3 shorts-out/perf_merge.py < lines.txt
Only numbers change (views, likes, checked = today). Empty input changes nothing. IDs not in perf.csv are printed:
add those rows by hand (channel,file,video_id,style,kind,public_ist,0,0,date)."""
import csv, sys, pathlib, datetime
p = pathlib.Path(__file__).parent / 'perf.csv'
new = {l.split('|')[1]: l.split('|') for l in sys.stdin if l.count('|') >= 7}
if not new:
    print('no lines, perf.csv unchanged'); sys.exit(0)
rows = list(csv.DictReader(p.open()))
for r in rows:
    if r['video_id'] in new: r['views'], r['likes'], r['checked'] = new[r['video_id']][5], new[r['video_id']][6], datetime.date.today().isoformat()
with p.open('w', newline='') as f:
    w = csv.DictWriter(f, rows[0].keys()); w.writeheader(); w.writerows(rows)
known = {r['video_id'] for r in rows}
print(sum(r['video_id'] in new for r in rows), 'rows updated of', len(rows))
for vid, parts in new.items():
    if vid not in known: print('not in perf.csv, add by hand:', parts[0], vid, parts[7][:40])
