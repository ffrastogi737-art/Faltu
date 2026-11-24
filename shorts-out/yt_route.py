#!/usr/bin/env python3
"""YouTube write route (owner 24 Nov 2026): Windsor and Composio take turns; a tool that hit its quota sits out until the reset, then returns.
  python3 shorts-out/yt_route.py pick                  -> prints 'windsor' or 'composio' (the less recently used one that is not exhausted), or 'none' (wait)
  python3 shorts-out/yt_route.py used <tool>           -> record one write done by <tool>
  python3 shorts-out/yt_route.py exhausted <tool>      -> quotaExceeded from <tool>: it sits out until the next 08:00Z reset (13:30 IST)
  python3 shorts-out/yt_route.py --test                -> self-check (asserts)
State: shorts-out/quota.json. Reads are free of this rule; only writes (uploads, privacy switches, replies) use the route."""
import sys, json, pathlib, datetime as dt

D = pathlib.Path(__file__).parent
STATE = D / 'quota.json'
TOOLS = ('windsor', 'composio')
RESET_HOUR_UTC = 8                                      # midnight Pacific = 08:00 UTC

def load(p=STATE):
    if not p.exists(): return {t: {'exhausted_until': None, 'last_used': None} for t in TOOLS}
    return json.loads(p.read_text())

def next_reset(now):
    r = now.replace(hour=RESET_HOUR_UTC, minute=0, second=0, microsecond=0)
    return r if now < r else r + dt.timedelta(days=1)

def pick(st, now):
    ok = [t for t in TOOLS if not st[t]['exhausted_until'] or dt.datetime.fromisoformat(st[t]['exhausted_until']) <= now]
    if not ok: return 'none'
    # least recently used first; a tool never used goes first
    return min(ok, key=lambda t: st[t]['last_used'] or '')

def used(st, tool, now):
    st[tool]['last_used'] = now.isoformat(timespec='seconds')
    return st

def exhausted(st, tool, now):
    st[tool]['exhausted_until'] = next_reset(now).isoformat(timespec='seconds')
    return st

def main(argv):
    if '--test' in argv: return _test()
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    st = load()
    cmd = argv[0] if argv else 'pick'
    if cmd == 'pick': print(pick(st, now)); return 0
    tool = argv[1]
    if tool not in TOOLS: raise SystemExit(f'unknown tool {tool}: use {"/".join(TOOLS)}')
    st = used(st, tool, now) if cmd == 'used' else exhausted(st, tool, now) if cmd == 'exhausted' else None
    if st is None: raise SystemExit('use pick | used <tool> | exhausted <tool>')
    STATE.write_text(json.dumps(st, indent=1)); print(f'{cmd} {tool} recorded'); return 0

def _test():
    now = dt.datetime(2026, 11, 24, 9, 0)
    st = {t: {'exhausted_until': None, 'last_used': None} for t in TOOLS}
    assert pick(st, now) in TOOLS                                       # both free: a tool
    st = used(st, 'windsor', now)
    assert pick(st, now) == 'composio'                                  # balance: the other one next
    st = used(st, 'composio', now + dt.timedelta(minutes=5))
    assert pick(st, now + dt.timedelta(minutes=10)) == 'windsor'        # then back to the older one
    st = exhausted(st, 'windsor', now + dt.timedelta(minutes=10))
    assert st['windsor']['exhausted_until'] == '2026-11-25T08:00:00'    # sits out until the next 08:00Z
    assert pick(st, now + dt.timedelta(minutes=11)) == 'composio'       # the other one takes over
    st = exhausted(st, 'composio', now + dt.timedelta(minutes=12))
    assert pick(st, now + dt.timedelta(minutes=13)) == 'none'           # both out: wait
    assert pick(st, dt.datetime(2026, 11, 25, 8, 1)) in TOOLS           # after the reset both return
    assert next_reset(dt.datetime(2026, 11, 24, 7, 59)) == dt.datetime(2026, 11, 24, 8, 0)
    print('yt_route.py: self-check OK'); return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
