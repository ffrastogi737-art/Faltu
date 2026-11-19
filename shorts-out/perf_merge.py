#!/usr/bin/env python3
"""Refresh views/likes in perf.csv from the workbench output of perf_refresh.py:  python3 shorts-out/perf_merge.py < lines.txt
New videos: add a row by hand (channel,file,video_id,style,kind,public_ist,0,0,date) first; this only updates numbers."""
import csv, sys, pathlib, datetime
p = pathlib.Path(__file__).parent / 'perf.csv'
rows = list(csv.DictReader(p.open()))
new = {l.split('|')[1]: l.split('|') for l in sys.stdin if l.count('|') >= 7}
for r in rows:
    if r['video_id'] in new: r['views'], r['likes'], r['checked'] = new[r['video_id']][5], new[r['video_id']][6], datetime.date.today().isoformat()
w = csv.DictWriter(p.open('w'), rows[0].keys()); w.writeheader(); w.writerows(rows)
print(sum(r['video_id'] in new for r in rows), 'rows updated of', len(rows))
