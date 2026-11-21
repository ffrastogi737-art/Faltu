#!/usr/bin/env python3
"""Publish time for both channels (owner 21 Nov 2026): slot.py is the single source of truth; the fixed-hour lists are retired.
   python3 shorts-out/slot.py [solo|gta]   -> '<UTC> <HH>:00 IST  mode=explore|exploit  bin=<name>  (why)' + a HYPOTHESIS line for explore
   python3 shorts-out/slot.py --test       -> self-check (asserts)
Slot: hours 09-21 IST on the hour, >= 60 min ahead, within 3 days, >= 30 min from every taken time. Taken = solo: publish-queue.txt;
gta and solo: every scheduled or public time in perf.csv (so the Kratos bookings count).
Time bins (IST): morning 09-10, midday 11-13, afternoon 14-16, evening 17-19, night 20-21. Hour 13 is never picked automatically.
Clean rows (the only rows used for timing): a real video id, a public time, public by now, views not measured before their public day,
not a same-day 0-view snapshot, slot_mode not quota-forced. Rows with no public time (legacy) are never used for timing.
Fair views = views_72h (age-normalised). Legacy rows (no views_72h) count for the sample size n only, never for a median.
EXPLORE (every 3rd upload per channel, starting with the next one): the least-tested bin (lowest n), and in it the hour with the lowest n.
EXPLOIT: the best bin with >= 3 fair rows and a median >= 1.5x the reference; it replaces the incumbent (the bin of the last exploit row) only
if it beats the incumbent's median by 1.5x. If no bin is proven yet: the best bin by fair median, else by the legacy median (ordering only).
shortcut: the reference is the legacy median until 3 fair rows exist; upgrade when the 72 h snapshots pile up."""
import sys, pathlib, csv, re, collections, datetime as dt, statistics as st

D = pathlib.Path(__file__).parent
HOURS = range(9, 22)                                             # IST, on the hour
BINS = {'morning': (9, 10), 'midday': (11, 12, 13), 'afternoon': (14, 15, 16), 'evening': (17, 18, 19), 'night': (20, 21)}
ORDER = list(BINS)
AUTO_AVOID = {13}                                                # 13:00-13:59: quota-reset publishes land there; never picked automatically
EXPLORE_EVERY, PROVEN_N, PROMOTE = 3, 3, 1.5
DAILY = {'solo': 2, 'gta': 3}                                    # daily upload target per channel (FACTORY CHECK), IST calendar day
CATCHUP = 'catchup'                                              # slot_mode of a same-day catch-up upload
CATCHUP_LEAD = dt.timedelta(minutes=20)                          # a catch-up slot is at least this far ahead
CATCHUP_END = dt.time(23, 30)                                    # IST: no catch-up at or after this time (rollover to tomorrow)
NOT_TIMING = {'quota-forced', CATCHUP}                           # rows that count for the quota but never for the timing experiment
IST_OFF = dt.timedelta(hours=5, minutes=30)

def bin_of(h): return next(b for b, hs in BINS.items() if h in hs)
def ist_to_utc(s): return dt.datetime.strptime(s, '%Y-%m-%d %H:%M') - IST_OFF
def _int(s):
    s = (s or '').strip(); return int(s) if s.isdigit() else None

def load_rows(ch):
    """perf.csv rows of one channel, in upload order."""
    return [r for r in csv.DictReader((D / 'perf.csv').open()) if r['channel'] == ch]

def today_count(ch, raw, now_utc):
    """Videos of this channel public or scheduled for today's IST date (catch-up rows included): the quota count."""
    day = (now_utc + IST_OFF).date().isoformat()
    return sum(1 for r in raw if (r['video_id'] or '').strip() not in ('', 'TBD') and (r['public_ist'] or '').strip()[:10] == day)

def catchup_slot(now_utc, taken):
    """Earliest open time today (IST): >= now + 20 min, rounded up to 5 min, 30 min clear of every taken time, before 23:30 IST. None if none."""
    t = now_utc + CATCHUP_LEAD
    t = t.replace(second=0, microsecond=0) + dt.timedelta(minutes=(5 - t.minute % 5) % 5)
    if t < now_utc + CATCHUP_LEAD: t += dt.timedelta(minutes=5)
    end = dt.datetime.combine((now_utc + IST_OFF).date(), CATCHUP_END) - IST_OFF
    while t < end:
        if all(abs((t - x).total_seconds()) >= 1800 for x in taken): return t
        t += dt.timedelta(minutes=5)
    return None

def clean(raw, now_ist):
    """Rows usable for timing. Each: {file, pub (IST datetime), hour, views, v72 (fair views or None), mode}."""
    out = []
    for r in raw:
        vid = (r['video_id'] or '').strip(); views = _int(r['views']); v72 = _int(r.get('views_72h'))
        mode = (r.get('slot_mode') or '').strip() or 'legacy'
        pubs = (r['public_ist'] or '').strip()
        if vid in ('', 'TBD') or views is None or not pubs or mode in NOT_TIMING: continue
        pub = dt.datetime.strptime(pubs, '%Y-%m-%d %H:%M')
        if pub > now_ist: continue                                                       # not public yet
        chk = (r['checked'] or '').strip()[:10]; day = pub.date().isoformat()
        if chk < day: continue                                                           # measured before it went public
        if views == 0 and chk == day: continue                                           # same-day zero: not a result
        out.append({'file': r['file'], 'pub': pub, 'hour': pub.hour, 'views': views, 'v72': v72, 'mode': mode})
    return out

def taken_utc(ch, raw):
    """Every time that holds a slot: solo's publish queue (PENDING and DONE) and every scheduled or public time in perf.csv."""
    t = []
    if ch == 'solo':
        t += [dt.datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%SZ') for l in (D / 'publish-queue.txt').read_text().splitlines()
              for m in [re.match(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s', l)] if m]
    t += [ist_to_utc((r['public_ist'] or '').strip()) for r in raw if (r['public_ist'] or '').strip()]
    return t

def free_slots(now_utc, taken, hours):
    """(utc, hour) candidates: the given hours, 60 min ahead, within 3 days, 30 min clear of every taken time."""
    out = []; today = (now_utc + IST_OFF).date()
    for d in range(3):
        for h in hours:
            utc = dt.datetime.combine(today + dt.timedelta(days=d), dt.time(h)) - IST_OFF
            if utc < now_utc + dt.timedelta(minutes=60): continue
            if any(abs((utc - t).total_seconds()) < 1800 for t in taken): continue
            out.append((utc, h))
    return out

def explore_due(raw):
    """Explore on the next upload if the channel has never explored; afterwards every 3rd upload (two exploit uploads in between)."""
    ups = [r for r in raw if (r['video_id'] or '').strip() not in ('', 'TBD') and (r.get('slot_mode') or '').strip() != CATCHUP]
    last = max((i for i, r in enumerate(ups) if (r.get('slot_mode') or '').strip() == 'explore'), default=None)
    return last is None or len(ups) - 1 - last >= EXPLORE_EVERY - 1

def decide(now_utc, raw, ch, gate=True):
    """The next slot for a channel. Pure: takes the perf.csv rows of the channel and the current UTC time.
    gate=True: the same-day quota comes first (a short day gets a catch-up slot today). gate=False: timing logic alone (tests)."""
    rows = clean(raw, now_utc + IST_OFF); taken = taken_utc(ch, raw)
    fair_all = [r['v72'] for r in rows if r['v72'] is not None]
    ref_kind = 'fair' if len(fair_all) >= PROVEN_N else 'legacy'
    ref_vals = fair_all if ref_kind == 'fair' else [r['views'] for r in rows]
    ref = st.median(ref_vals) if ref_vals else 0
    n_bin = {b: 0 for b in BINS}; n_hour = collections.Counter(); fair_bin = collections.defaultdict(list)
    fair_hour = collections.defaultdict(list); legacy_bin = collections.defaultdict(list)
    for r in rows:
        if r['hour'] not in HOURS: continue
        b = bin_of(r['hour']); n_bin[b] += 1; n_hour[r['hour']] += 1; legacy_bin[b].append(r['views'])
        if r['v72'] is not None: fair_bin[b].append(r['v72']); fair_hour[r['hour']].append(r['v72'])
    med_fair = {b: st.median(v) for b, v in fair_bin.items()}
    proven = {b: m for b, m in med_fair.items() if len(fair_bin[b]) >= PROVEN_N and ref and m >= PROMOTE * ref}
    info = {'ref': ref, 'ref_kind': ref_kind, 'n_clean': len(rows), 'n_bin': dict(n_bin)}
    if gate:
        have = today_count(ch, raw, now_utc); info['today'] = have
        if have < DAILY[ch]:
            t = catchup_slot(now_utc, taken)
            if t is not None:
                h = (t + IST_OFF).hour
                return dict(utc=t, hour=h, mode=CATCHUP, bin='catch-up', why=f"catch-up: {have}/{DAILY[ch]} today, earliest open IST slot", hypothesis=None, **info)
            info['catchup'] = f'none: no open IST slot before 23:30 today ({have}/{DAILY[ch]}); normal scheduling for tomorrow'
    if explore_due(raw):
        b = min(BINS, key=lambda x: (n_bin[x], ORDER.index(x)))              # least-tested bin
        cands = free_slots(now_utc, taken, [h for h in BINS[b] if h not in AUTO_AVOID])
        if cands:
            utc, h = min(cands, key=lambda c: (n_hour[c[1]], c[0]))              # least-tested hour in it, then earliest
            why = f"explore: least-tested bin {b} (n={n_bin[b]}), hour with n={n_hour[h]}"
            return dict(utc=utc, hour=h, mode='explore', bin=b, why=why,
                        hypothesis=f"Testing {b} bin {h:02d}:00 IST, n={n_hour[h]} -> target >= 1.2x channel {ref_kind} median ({ref:.0f})", **info)
    # exploit: keep the incumbent unless a challenger proves 1.5x its median
    inc = None
    for r in reversed(raw):
        if (r.get('slot_mode') or '').strip() == 'exploit' and (r['public_ist'] or '').strip():
            inc = bin_of(int((r['public_ist'] or '')[11:13])); break
    if proven:
        best = max(proven, key=proven.get)
        win = best if inc not in proven or best == inc or proven[best] >= PROMOTE * proven[inc] else inc
        why = f"proven: n={len(fair_bin[win])} fair, median {med_fair[win]:.0f} >= {PROMOTE}x ref {ref:.0f}"
    else:
        scored = [b for b in BINS if fair_bin[b]]
        if scored:
            win = max(scored, key=lambda b: (med_fair[b], -ORDER.index(b))); why = f"fallback: best fair median {med_fair[win]:.0f} (no bin proven yet)"
        else:
            win = max(BINS, key=lambda b: (st.median(legacy_bin[b]) if legacy_bin[b] else -1, -ORDER.index(b)))
            why = 'fallback: no fair data yet, legacy median used only to order the bins'
    cands = free_slots(now_utc, taken, [h for h in BINS[win] if h not in AUTO_AVOID]) or free_slots(now_utc, taken, [h for h in HOURS if h not in AUTO_AVOID])
    if not cands: return None
    def hour_key(c):
        f = fair_hour.get(c[1]); return (0, -st.median(f)) if f else (1, 0)
    utc, h = min(cands, key=lambda c: (hour_key(c), c[0]))
    return dict(utc=utc, hour=h, mode='exploit', bin=bin_of(h), why=why, **info)

def _test():
    now = dt.datetime(2026, 11, 20, 8, 53)                                  # 14:23 IST
    row = lambda file, pub, views, v72='', mode='legacy', vid='x1', chk='2026-11-25': {'channel': 'solo', 'file': file, 'video_id': vid,
              'public_ist': pub, 'views': str(views), 'views_72h': str(v72) if v72 != '' else '', 'slot_mode': mode, 'checked': chk}
    # 1. clean rows: no id, no public time, same-day zero, quota-forced, measured before public: all out; a legacy row with a time: in
    raw = [row('a', '', 9), row('b', '2026-11-19 10:00', 0, chk='2026-11-19'), row('c', '2026-11-19 10:00', 5, mode='quota-forced'),
           row('d', '2026-11-19 10:00', 500, chk='2026-11-18'), row('e', '2026-11-19 10:00', 500), row('f', '2026-11-19 10:00', 9, vid='TBD')]
    got = [r['file'] for r in clean(raw, dt.datetime(2026, 11, 22))]
    assert got == ['e'], got
    # 2. explore cadence: first explore at once, then 2 exploit uploads, then explore again
    assert explore_due([row('a', '', 1, vid='')]) and explore_due([row('a', '2026-11-19 10:00', 1)])
    assert explore_due([row('a', '2026-11-19 10:00', 1, mode='explore')] + [row('b', '2026-11-19 10:00', 1, vid=f'v{i}') for i in range(2)])
    assert not explore_due([row('a', '2026-11-19 10:00', 1, mode='explore'), row('b', '2026-11-19 10:00', 1, vid='y')])
    # 3. explore: least-tested bin (midday here: n=0), hour 11 or 12 (never 13)
    rows = [row(f'r{i}', '2026-11-19 09:00', 100 + i, vid=f'q{i}') for i in range(4)] + [row('e1', '2026-11-19 14:00', 9, vid='e1'), row('e2', '2026-11-19 17:00', 9, vid='e2')]
    d = decide(now, rows, 'solo', gate=False)
    assert d['mode'] == 'explore' and d['bin'] == 'midday' and d['hour'] in (11, 12), d
    assert d['hypothesis'].startswith('Testing midday bin ') and 'n=0' in d['hypothesis'], d['hypothesis']
    # 4. exploit: a bin needs 3 fair rows and 1.5x the reference; a challenger must beat the incumbent (the last exploit row's bin) by 1.5x
    fair = [row(f'm{i}', '2026-11-19 09:00', 100, v72=100, vid=f'm{i}', mode='exploit') for i in range(7)]
    fair += [row(f'v{i}', '2026-11-19 17:00', 200, v72=200, vid=f'v{i}', mode='exploit') for i in range(3)]
    fair += [row(f'g{i}', '2026-11-19 20:00', 1100, v72=1100, vid=f'g{i}', mode='exploit') for i in range(3)]
    fair += [row(f'a{i}', '2026-11-19 14:00', 1000, v72=1000, vid=f'a{i}', mode='exploit') for i in range(4)]
    e0 = row('e0', '2026-11-19 10:00', 5, vid='e0', mode='explore')
    d = decide(now, fair + [e0, row('z', '2026-11-19 14:00', 1000, v72=1000, vid='z', mode='exploit')], 'solo', gate=False)
    assert d['mode'] == 'exploit' and d['bin'] == 'afternoon', d                       # incumbent afternoon; night (1100) is not 1.5x 1000
    d = decide(now, fair + [row('z2', '2026-11-19 17:00', 200, v72=200, vid='z2', mode='exploit'), e0], 'solo', gate=False)
    assert d['mode'] == 'exploit' and d['bin'] == 'night', d                           # evening incumbent is not proven: the best proven bin takes over
    d = decide(now, [row(f'x{i}', '2026-11-19 14:00', 300, v72=300, vid=f'x{i}', mode='exploit') for i in range(3)] + [row('w', '2026-11-19 09:00', 300, vid='w', mode='exploit'), row('e9', '2026-11-19 10:00', 5, vid='e9', mode='explore')], 'solo', gate=False)
    assert d['mode'] == 'exploit' and d['bin'] == 'afternoon' and d['ref_kind'] == 'fair', d
    # 5. taken: a future gta booking blocks its 30 min; solo queue lines block too
    tk = taken_utc('gta', [{'public_ist': '2026-11-22 09:00', 'video_id': 'g', 'views': '0', 'checked': '', 'file': 'g', 'channel': 'gta', 'slot_mode': '', 'views_72h': ''}])
    assert dt.datetime(2026, 11, 22, 3, 30) in tk, tk
    cands = free_slots(dt.datetime(2026, 11, 21, 4, 0), tk, [9])
    assert all(abs((u - dt.datetime(2026, 11, 22, 3, 30)).total_seconds()) >= 1800 for u, _ in cands), cands
    # 6. lead time and window
    for u, _ in free_slots(now, [], HOURS): assert u >= now + dt.timedelta(minutes=60) and u <= now + dt.timedelta(days=3)
    # 7. catch-up rows: out of the timing stats and the explore cadence, but their times block slots
    cu = row('k', '2026-11-19 10:00', 999, mode=CATCHUP)
    assert clean([cu], dt.datetime(2026, 11, 22)) == []
    assert explore_due([cu, cu]) and not explore_due([row('a', '2026-11-19 10:00', 1, mode='explore'), row('b', '2026-11-19 10:00', 1, vid='y'), row('c', '2026-11-19 10:00', 1, vid='z', mode=CATCHUP)])
    gtr = lambda file, pub, mode='', vid='g1': {'channel': 'gta', 'file': file, 'video_id': vid, 'public_ist': pub, 'views': '', 'views_72h': '', 'slot_mode': mode, 'checked': ''}
    assert dt.datetime(2026, 11, 21, 13, 0) in taken_utc('gta', [gtr('c', '2026-11-21 18:30', CATCHUP, 'g2')])
    # 8. today's quota full: the gate does nothing, normal explore/exploit for the upcoming days
    today_full = [row('t1', '2026-11-21 09:49', 0, vid='t1'), row('t2', '2026-11-21 09:50', 0, vid='t2')]
    now21 = dt.datetime(2026, 11, 21, 10, 0)                                    # 15:30 IST
    d = decide(now21, today_full, 'solo'); assert d['mode'] in ('explore', 'exploit') and d['today'] == 2, d
    gtoday = [gtr(f'g{i}', '2026-11-21 09:00', '', f'gx{i}') for i in range(3)]
    d = decide(now21, gtoday, 'gta'); assert d['mode'] in ('explore', 'exploit') and d['today'] == 3, d
    # 9. today short: catch-up at the earliest open slot (>= now + 20 min, rounded to 5 min), then 30 min clear of taken times
    d = decide(now21, [gtr('g0', '2026-11-21 09:00', '', 'gx0')], 'gta')
    assert d['mode'] == CATCHUP and d['utc'] == dt.datetime(2026, 11, 21, 10, 20), d       # 15:50 IST
    d = decide(now21, [gtr('g0', '2026-11-21 09:00', '', 'gx0'), gtr('blk', '2026-11-21 15:50', '', 'gx9')], 'gta')
    assert d['mode'] == CATCHUP and d['utc'] == dt.datetime(2026, 11, 21, 10, 50), d       # 30 min buffer from 15:50 IST
    # 10. after 23:30 IST: no catch-up, normal tomorrow scheduling, and the rollover is recorded
    late = dt.datetime(2026, 11, 21, 18, 15)                                    # 23:45 IST
    d = decide(late, [gtr('g0', '2026-11-21 09:00', '', 'gx0')], 'gta')
    assert d['mode'] in ('explore', 'exploit') and d['utc'] > late and d['catchup'].startswith('none'), d
    d = decide(dt.datetime(2026, 11, 21, 17, 0), [gtr('g0', '2026-11-21 09:00', '', 'gx0')], 'gta')   # 22:30 IST: still open
    assert d['mode'] == CATCHUP and d['utc'] + IST_OFF < dt.datetime.combine(d['utc'].date(), CATCHUP_END), d
    print('slot.py: self-check OK')

if __name__ == '__main__':
    if '--test' in sys.argv:
        _test(); sys.exit()
    ch = sys.argv[1] if len(sys.argv) > 1 else 'solo'
    raw = load_rows(ch)
    res = decide(dt.datetime.now(dt.timezone.utc).replace(tzinfo=None), raw, ch)
    if res is None: sys.exit('no free slot in 3 days: check publish-queue.txt and perf.csv')
    print(f"{res['utc']:%Y-%m-%dT%H:%M:%SZ} {res['hour']:02d}:00 IST  mode={res['mode']}  bin={res['bin']}  ({res['why']}; clean timed rows {res['n_clean']}; bins n {res['n_bin']})")
    if res['mode'] == 'explore': print('HYPOTHESIS (copy to experiments.txt): ' + res['hypothesis'])
