"""`edith` command: welcome screen. The agent loop plugs in here in Phase 1."""
import json
import os
import shutil
import sys
import textwrap

NAME = "E.D.I.T.H."
FULL_NAME = "Efficient Developer Interface for Tech & Hacks"

# 5x5 bitmap font, only the glyphs the banner needs.
FONT = {
    "E": ["#####", "#    ", "#### ", "#    ", "#####"],
    "D": ["#### ", "#   #", "#   #", "#   #", "#### "],
    "I": ["#####", "  #  ", "  #  ", "  #  ", "#####"],
    "T": ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
    "H": ["#   #", "#   #", "#####", "#   #", "#   #"],
    ".": [" ", " ", " ", " ", "#"],
}

NOTES = [
    ("E.D.I.T.H. is in early preview",
     "This version may have limitations or unexpected behaviors."),
    ("E.D.I.T.H. can make mistakes",
     "Always review its changes, especially before running code."),
    ("Due to prompt injection risks, only use it with code you trust",
     "Text from files and web pages is treated as data, never as instructions."),
]


def _paint(color):
    if os.environ.get("NO_COLOR") or not sys.stdout.isatty():
        return lambda s, *_: s
    codes = {"main": color, "shadow": "38;2;110;40;35", "bold": "1", "dim": "2", "link": "38;2;120;140;255",
             "add": "32", "del": "31"}
    return lambda s, kind="main": f"\033[{codes[kind]}m{s}\033[0m"


def banner(paint):
    """Block letters with a one-cell drop shadow, like a 3D sign."""
    rows = [" ".join(FONT[ch][r] for ch in NAME) for r in range(5)]
    w = len(rows[0]) + 1
    on = lambda r, c: 0 <= r < 5 and 0 <= c < len(rows[r]) and rows[r][c] == "#"
    out = []
    for r in range(6):
        line = ""
        for c in range(w):
            if on(r, c):
                line += paint("█")
            elif on(r - 1, c - 1):
                line += paint("▒", "shadow")
            else:
                line += " "
        out.append(line.rstrip())
    return out


def box(text, width, paint):
    lines = textwrap.wrap(text, width - 4)
    top = paint("╭" + "─" * (width - 2) + "╮")
    bottom = paint("╰" + "─" * (width - 2) + "╯")
    mid = [paint("│") + " " + l.ljust(width - 4) + " " + paint("│") for l in lines]
    return [top, *mid, bottom]


def welcome(color="38;2;224;69;58"):
    paint = _paint(color)
    cols = shutil.get_terminal_size((80, 24)).columns
    width = max(30, min(cols - 2, 64))
    out = [""]
    out += box(f"✻ Welcome to {NAME} — {FULL_NAME}", width, paint)
    out.append("")
    art = banner(paint)
    # shortcut: phones narrower than the banner get the plain name, a smaller font is the upgrade
    out += [" " + l for l in art] if cols >= 44 else [" " + paint(NAME, "bold")]
    out += ["", " " + paint("Security notes:", "bold"), ""]
    for i, (title, body) in enumerate(NOTES, 1):
        out.append(f" {i}. " + textwrap.fill(title, width - 4, subsequent_indent="    "))
        out.append(paint(textwrap.fill(body, width - 4, initial_indent="    ", subsequent_indent="    "), "dim"))
        out.append("")
    return "\n".join(out)


def _ask(prompt):
    if not sys.stdin.isatty():
        return ""
    try:
        return input(prompt)
    except (EOFError, KeyboardInterrupt):
        print()
        return ""


def _approve(kind, detail):
    paint = _paint("")
    lines = []
    for line in detail.splitlines():  # a small diff viewer: green adds, red removals
        if line.startswith("+") and not line.startswith("+++"):
            line = paint(line, "add")
        elif line.startswith("-") and not line.startswith("---"):
            line = paint(line, "del")
        lines.append(line)
    print(f"\n--- E.D.I.T.H. wants to do this ({kind}) ---\n" + "\n".join(lines))
    return _ask("Allow? [y/N] ").strip().lower() in ("y", "yes")


def _route_cmd(args, con):
    from . import config
    from .router import Router
    act, val = args.action, args.value
    if act == "explain":
        r = Router(con, log=lambda s: None)
        ranked, rejected = r.candidates(args.task_type, args.context)
        print(f"task type: {args.task_type}, needs {args.context} tokens of context")
        for c in ranked[:15]:
            print(f"  {c['score']:.3f}  {c['provider'] + '/' + c['model']:50} key#{c['key_idx']} {c['parts']}")
        print(f"{len(ranked)} candidates; rejected: {rejected or '-'}")
        return 0
    router = config.load_router_settings()["router"]
    if act == "pin":  # value: task_type=provider/model
        tt, target = val.split("=", 1)
        config.save_router_setting("router", "pin", {**(router.get("pin") or {}), tt: target})
    elif act == "unpin":
        config.save_router_setting("router", "pin", {k: v for k, v in (router.get("pin") or {}).items() if k != val})
    elif act == "ban":
        config.save_router_setting("router", "ban", sorted(set(router.get("ban") or []) | {val}))
    elif act == "unban":
        config.save_router_setting("router", "ban", [b for b in router.get("ban") or [] if b != val])
    elif act == "force":
        config.save_router_setting("router", "force_provider", None if val in (None, "off", "none") else val)
    elif act == "paid":
        config.save_router_setting("budget", "paid_enabled", val == "on")
    elif act == "budget":
        config.save_router_setting("budget", "daily_inr", float(val))
    print(json.dumps(config.load_router_settings(), indent=1))
    return 0


def _dashboard(con, providers):
    from . import config
    from .router import Quota
    q = Quota(con)
    print(f"{'provider':18} {'keys':4} {'models':>6} {'calls today':>11} {'errors':>6} {'avg ms':>7} {'cost $':>8}  state")
    rows = {r["provider"]: r for r in con.execute(
        "SELECT provider, COUNT(*) n, SUM(1-ok) err, AVG(latency_ms) lat, SUM(cost_usd) cost FROM calls "
        "WHERE ts >= date('now') AND task_type NOT LIKE 'probe%' GROUP BY provider")}
    counts = dict(con.execute("SELECT provider, COUNT(*) FROM models WHERE status IN ('active','probation') GROUP BY provider").fetchall())
    for n, p in config.usable(providers).items():
        r = rows.get(n) or {"n": 0, "err": 0, "lat": None, "cost": 0}
        state = q.cooling(n)
        print(f"{n:18} {len(config.keys(p)):4} {counts.get(n, 0):6} {r['n']:11} {r['err'] or 0:6} "
              f"{int(r['lat'] or 0):7} {r['cost'] or 0:8.4f}  {'COOLDOWN ' + state if state else 'ok'}")
    for r in con.execute("SELECT ts, provider, model, task_type, ok, latency_ms, error FROM calls "
                         "WHERE task_type NOT LIKE 'probe%' ORDER BY rowid DESC LIMIT 10"):
        print(f"  {r['ts']} {r['task_type']:14} {r['provider']}/{r['model']} "
              f"{'ok' if r['ok'] else 'FAIL ' + (r['error'] or '')[:60]} {r['latency_ms']}ms")
    return 0


def _providers_cmd(args, providers, con):
    from . import config
    act = args.action
    if act == "list":
        stats = {r["provider"]: r for r in con.execute("SELECT * FROM discovery")}
        counts = {r[0]: r[1] for r in con.execute(
            "SELECT provider, COUNT(*) FROM models WHERE status != 'gone' GROUP BY provider")}
        for n, p in providers.items():
            key = f"{len(config.keys(p))}key" if config.keys(p) else "no-key"
            d = stats.get(n)
            health = "-" if not d else ("ok" if d["ok"] else "ERR " + (d["error"] or "")[:40])
            print(f"{'on ' if p.get('enabled') else 'off'} {n:18} {p.get('api', 'openai'):7} {p.get('status', '?'):10} "
                  f"{key:6} models={counts.get(n, 0):<5} private={str(p.get('allow_private_code', False)).lower():5} {health}")
        return 0
    name = args.name
    if act == "add":
        if not args.base_url or not args.key_env:
            sys.exit("add needs --base-url and --key-env")
        config.save_override(name, {"api": args.api, "base_url": args.base_url, "key_env": args.key_env,
                                    "models": args.models_path, "enabled": True, "status": "unverified",
                                    "free_tier": "unknown", "allow_private_code": False, "removed": False})
        print(f"added {name}. Run `edith refresh --provider {name}` then `edith probe --provider {name}`.")
        return 0
    if act == "restore":
        config.save_override(name, {"removed": False})
    elif name not in providers:
        sys.exit(f"Unknown provider `{name}`.")
    elif act in ("enable", "disable"):
        config.save_override(name, {"enabled": act == "enable"})
    elif act == "remove":
        config.save_override(name, {"removed": True})  # stats stay in SQLite for `restore`
    elif act == "trust":
        config.save_override(name, {"allow_private_code": True})
    elif act == "untrust":
        config.save_override(name, {"allow_private_code": False})
    print(f"{name}: {act} done")
    return 0


def _models_cmd(args, con):
    q = "SELECT * FROM models WHERE status != 'gone'" + ("" if args.all else " AND status != 'disabled'")
    params = []
    if args.provider:
        q += " AND provider=?"
        params.append(args.provider)
    rows = con.execute(q + " ORDER BY provider, quality DESC NULLS LAST, model", params).fetchall()
    if not rows:
        print("No models yet. Run `edith refresh` (needs at least one key in .env).")
    for r in rows:
        tools = {1: "tools", 0: "no-tools"}.get(r["tools"], "tools?")
        q_ = "-" if r["quality"] is None else f"{r['quality']:.2f}"
        print(f"{r['provider']:16} {r['status']:9} q={q_:4} ctx={r['context'] or '?':<8} {tools:8} "
              f"{'free' if r['free'] else '':4} {r['model']}")
    print(f"{len(rows)} models")
    return 0


def main(argv=None):
    import argparse

    from . import config, db

    ap = argparse.ArgumentParser(prog="edith", description=f"{NAME} {FULL_NAME}")
    sub = ap.add_subparsers(dest="cmd")
    run = sub.add_parser("run", help="do a coding task")
    run.add_argument("task")
    pr = sub.add_parser("providers", help="list, add, enable, disable, remove, restore, trust, untrust")
    pr.add_argument("action", nargs="?", default="list",
                    choices=["list", "add", "enable", "disable", "remove", "restore", "trust", "untrust"])
    pr.add_argument("name", nargs="?")
    pr.add_argument("--base-url")
    pr.add_argument("--key-env")
    pr.add_argument("--api", default="openai")
    pr.add_argument("--models-path", default="/models")
    md = sub.add_parser("models", help="discovered models with health (from the local database)")
    md.add_argument("--all", action="store_true", help="include disabled models")
    rf = sub.add_parser("refresh", help="fetch model lists from providers")
    rf.add_argument("--force", action="store_true")
    pb = sub.add_parser("probe", help="test unproven models: reply, tool call, JSON, code fix")
    pb.add_argument("--limit", type=int, default=3, help="models per provider")
    rt = sub.add_parser("route", help="explain routing, or pin/unpin/ban/unban/force/paid/budget")
    rt.add_argument("action", nargs="?", default="explain",
                    choices=["explain", "pin", "unpin", "ban", "unban", "force", "paid", "budget"])
    rt.add_argument("value", nargs="?", help="pin: task_type=provider/model; ban: provider[/model]; "
                                             "force: provider|off; paid: on|off; budget: rupees per day")
    rt.add_argument("--task-type", default="code_generation")
    rt.add_argument("--context", type=int, default=8000, help="tokens the step needs")
    sub.add_parser("dashboard", help="per-provider calls, errors, latency, cost, cooldowns today")
    sub.add_parser("sessions", help="recent sessions")
    rs = sub.add_parser("resume", help="continue a stopped or interrupted session")
    rs.add_argument("session")
    rs.add_argument("note", nargs="?", help="extra instruction for the agent")
    rw = sub.add_parser("rewind", help="restore files changed by a session to before a step")
    rw.add_argument("session")
    rw.add_argument("--to", type=int, default=1, help="step number (1 = before the session changed anything)")
    rw.add_argument("--git", action="store_true", help="also restore tracked files from the git checkpoint")
    rp = sub.add_parser("report", help="show a session's report")
    rp.add_argument("session")
    mm = sub.add_parser("memory", help="long-term lessons: list, add TEXT, forget ID")
    mm.add_argument("action", nargs="?", default="list", choices=["list", "add", "forget"])
    mm.add_argument("text", nargs="?")
    sub.add_parser("dream", help="review past sessions and curate memory now")
    tm = sub.add_parser("team", help="supervisor splits the task across specialist agents (parallel in git worktrees)")
    tm.add_argument("task")
    tm.add_argument("--sequential", action="store_true", help="no parallel worktrees")
    sub.add_parser("agents", help="list built-in and custom agent roles")
    ev = sub.add_parser("eval", help="run the benchmark tasks and compare with an earlier run")
    ev.add_argument("--tasks", help="comma-separated task names (default: all)")
    ev.add_argument("--oracle", action="store_true", help="replay reference solutions: checks harness and graders only")
    ev.add_argument("--noop", action="store_true", help="an agent that changes nothing: every grader must fail")
    ev.add_argument("--compare", help="earlier report .json, or 'latest' (default: latest with the same label)")
    ev.add_argument("--label", default=None, help="name for this run (default: oracle or model)")
    ev.add_argument("--review", action="store_true", help="also run the reviewer (costs more calls)")
    ev.add_argument("--max-steps", type=int, default=25)
    cs = sub.add_parser("cost", help="calls, tokens and cost per provider and day")
    cs.add_argument("--days", type=int, default=7)
    sv = sub.add_parser("serve", help="local HTTP + WebSocket API")
    sv.add_argument("--host", default="127.0.0.1")
    sv.add_argument("--port", type=int, default=8765)
    sub.add_parser("mcp", help="run as an MCP server on stdin/stdout (for other agents)")
    bd = sub.add_parser("board", help="task board of a team run (latest if no id)")
    bd.add_argument("run_id", nargs="?")
    for p in (ap, *sub.choices.values()):  # options go after the subcommand
        p.add_argument("--provider", help="provider name from providers.yaml (or EDITH_PROVIDER)")
        p.add_argument("--model", help="model id, see `edith models` (or EDITH_MODEL)")
    for p in (ap, run, rs, tm):
        p.add_argument("--mode", default="default", choices=["plan", "default", "accept_edits", "trusted", "bypass"])
        p.add_argument("--no-verify", action="store_true", help="skip automatic tests/lint after changes")
        p.add_argument("--no-review", action="store_true", help="skip the reviewer agent")
        p.add_argument("--headless", action="store_true", help="CI mode: no prompts (approvals refused), JSON result "
                                                                 "on stdout, logs on stderr, exit code 0 only if done")
        p.add_argument("--workspace", default=".")
        p.add_argument("--max-steps", type=int, default=30)
        p.add_argument("--max-cost-usd", type=float, default=None, help="stop when this session has cost more")
    args = ap.parse_args(argv)
    for attr in ("provider", "name"):  # provider names are lower-case in providers.yaml; `Gemini` should work too
        if isinstance(getattr(args, attr, None), str) and not (attr == "name" and getattr(args, "action", "") == "add"):
            setattr(args, attr, getattr(args, attr).lower())

    config.load_env()
    con = db.connect()
    try:
        return _dispatch(args, config.load_providers(), con)
    finally:
        con.close()


def _dispatch(args, providers, con):
    import asyncio

    from . import config, discovery
    from . import session as session_mod
    from .memory import Memory
    from .messages import Message

    if args.cmd == "providers":
        return _providers_cmd(args, providers, con)
    if args.cmd == "models":
        return _models_cmd(args, con)
    if args.cmd == "refresh":
        chosen = {args.provider: providers[args.provider]} if args.provider in providers else providers
        report = asyncio.run(discovery.refresh(con, chosen, force=args.force or bool(args.provider)))
        for n, r in report.items():
            print(f"{n:18} {r if isinstance(r, str) else f'{r} models'}")
        print(f"{len(report)} providers refreshed" if report else "nothing to refresh (no keys, or all fresh)")
        return 0
    if args.cmd == "probe":
        res = asyncio.run(discovery.probe(con, providers, args.provider, args.model, args.limit))
        for n, rows in res.items():
            for r in rows:
                print(f"{n:16} {r['model']:40} " + ("rate limited, try later" if r.get("rate_limited") else
                      f"score={r['score']:.2f} {r['status']}  " +
                      " ".join(k for k in discovery.PROBES if r.get(k)) +
                      (f"\n{'':17}error: {r['error'][:200]}" if r.get("error") else "")))
        return 0

    if args.cmd == "route":
        return _route_cmd(args, con)
    if args.cmd == "dashboard":
        return _dashboard(con, providers)

    if args.cmd == "sessions":
        for s in session_mod.list_sessions():
            print(f"{s['id']}  {s['status']:11} {os.path.basename(s['workspace'] or '')[:20]:20} {s['task'][:60]}")
        return 0
    if args.cmd == "rewind":
        s = session_mod.Session(args.session, resume=True)
        restored = s.rewind(args.to)
        print(f"restored {len(restored)} files to before step {args.to}: {', '.join(restored) or '-'}")
        if args.git:
            print(s.restore_git_checkpoint())
        return 0
    if args.cmd == "report":
        path = os.path.join(session_mod.Session(args.session, resume=True).dir, "artifacts", "report.md")
        print(open(path).read() if os.path.exists(path) else "no report yet")
        return 0
    if args.cmd == "agents":
        from .agents import load_roles
        for name, r in load_roles(os.path.realpath(args.workspace) if hasattr(args, "workspace") else None).items():
            tools = "all tools" if r["tools"] is None else ", ".join(r["tools"])
            print(f"{name:12} max_steps={r['max_steps']:<3} {r['description'][:60]}  [{tools}]")
        return 0
    if args.cmd == "board":
        from .agents import BOARD
        con.executescript(BOARD)
        rid = args.run_id or (con.execute("SELECT run_id FROM board ORDER BY rowid DESC LIMIT 1").fetchone() or [None])[0]
        for b in con.execute("SELECT * FROM board WHERE run_id=? ORDER BY rowid", (rid,)):
            print(f"{b['id']:6} {b['role']:10} {b['status']:9} {b['title'][:60]}")
        return 0
    if args.cmd in ("memory", "dream"):
        mem = Memory(con)
        if args.cmd == "dream":
            print(json.dumps(mem.dream(), indent=1))
        elif args.action == "add":
            print(mem.remember(args.text or "", source="user"))
        elif args.action == "forget":
            mem.forget(int(args.text))
            print("forgotten")
        else:
            for m in mem.all():
                print(f"{m['id']:4} [{m['tags'] or '-'}] {m['text']}")
        return 0

    if args.cmd == "eval":
        return _eval_cmd(args, con)
    if args.cmd == "cost":
        budget = config.load_router_settings()["budget"]
        rate = float(budget.get("usd_to_inr", 88))
        print(f"{'day':10} {'provider':18} {'calls':>6} {'failed':>6} {'tokens in':>10} {'tokens out':>10} {'cost $':>8} {'cost Rs':>8}")
        for r in con.execute("SELECT date(ts) d, provider, COUNT(*) n, SUM(1-ok) f, SUM(input_tokens) i, "
                             "SUM(output_tokens) o, SUM(cost_usd) c FROM calls WHERE ts >= date('now', ?) "
                             "GROUP BY d, provider ORDER BY d DESC, n DESC", (f"-{args.days} days",)):
            print(f"{r['d']:10} {r['provider']:18} {r['n']:6} {r['f'] or 0:6} {r['i'] or 0:10} {r['o'] or 0:10} "
                  f"{r['c'] or 0:8.4f} {(r['c'] or 0) * rate:8.2f}")
        return 0
    if args.cmd == "serve":
        from .server import serve
        asyncio.run(serve(con, args.host, args.port))
        return 0
    if args.cmd == "mcp":
        return _mcp_server(con)

    from . import app
    session, history = None, None
    if args.cmd == "resume":
        session = session_mod.Session(args.session, resume=True)
        history = session.history_for_resume()
        args.workspace = session.meta["workspace"]
        history.append(Message("user", args.note or "Continue the task from where you stopped."))
        session.message(history[-1])
    headless = getattr(args, "headless", False)
    if not args.cmd and not headless:
        print(welcome())
        _ask(_paint("")("Press Enter to continue…", "link"))
    task = getattr(args, "task", None)
    out = sys.stderr if headless else sys.stdout
    try:
        run, _ = app.build(con, args.workspace, _deny if headless else _approve, lambda s: print(s, file=out),
                           mode=args.mode, provider=args.provider, model=args.model, max_steps=args.max_steps,
                           max_cost_usd=args.max_cost_usd, verify=not args.no_verify, review=not args.no_review,
                           team=args.cmd == "team", parallel=not getattr(args, "sequential", False), session=session)
    except app.SetupError as e:
        sys.exit(str(e))
    if not task and not history:
        task = _ask("\nWhat should I do? > ").strip()
        if not task:
            return 0
    result = asyncio.run(run(task, history=history))
    if headless:
        print(json.dumps({k: result.get(k) for k in ("done", "status", "answer", "session", "run_id", "evidence",
                                                      "input_tokens", "output_tokens", "checks_passed", "review")},
                         default=str, indent=1))
    return 0 if result.get("done") else 1


def _eval_cmd(args, con):
    import asyncio

    from . import app, evals
    from .loop import Agent
    from .tools import Tools
    tasks = evals.load_tasks(set(args.tasks.split(",")) if args.tasks else None)
    label = args.label or ("oracle" if args.oracle else "noop" if args.noop else "model")
    quiet = lambda s: None  # noqa: E731

    def make_run(t, ws):
        if args.oracle or args.noop:
            brain = evals.Oracle(t) if args.oracle else evals.Noop()
            agent = Agent(brain, Tools(ws, lambda *_: True, "trusted"), log=quiet, review_changes=False)
            return agent.run
        run, info = app.build(con, ws, _deny, quiet, mode="trusted", provider=args.provider, model=args.model,
                              max_steps=args.max_steps, review=args.review)
        return run
    print(f"running {len(tasks)} tasks ({label})")
    rows = asyncio.run(evals.run_all(tasks, make_run))
    path, data = evals.save(rows, label, {"brain": "oracle (reference solutions)" if args.oracle else
                                          "noop (changes nothing)" if args.noop else
                                          f"{args.provider or 'router'}/{args.model or 'auto'}"})
    s = data["summary"]
    print(f"\n{s['passed']}/{s['tasks']} passed ({s['pass_rate']:.0%}); report: {path[:-5]}.md")
    old = args.compare if args.compare and args.compare != "latest" else evals.latest(
        None if args.compare == "latest" else label, exclude=path)
    if old and os.path.exists(old):
        with open(old) as f:
            c = evals.compare(json.load(f), data)
        print(f"compared with {os.path.basename(old)}: {c['verdict']}; fixed {c['fixed'] or '-'}; "
              f"regressed {c['regressed'] or '-'}; pass rate {c['old']['pass_rate']:.0%} -> {c['new']['pass_rate']:.0%}")
    return 0 if s["passed"] == s["tasks"] else 1


def _deny(kind, detail):
    """Headless: nobody can answer, so anything that needs approval is refused."""
    print(f"[headless] refused ({kind}): {detail.splitlines()[0][:200] if detail else ''}", file=sys.stderr)
    return False


def _mcp_server(con):
    """`edith mcp`: E.D.I.T.H. as an MCP tool server on stdin/stdout."""
    import asyncio

    from . import app
    from . import session as session_mod
    from .mcp import serve_stdio

    def handle(name, a):
        if name == "edith_models":
            rows = con.execute("SELECT provider, model, status, quality FROM models WHERE status IN "
                               "('active','probation') ORDER BY quality DESC NULLS LAST LIMIT 100")
            return "\n".join(f"{r['provider']}/{r['model']} {r['status']} q={r['quality']}" for r in rows) or "no models"
        if name == "edith_session_report":
            path = os.path.join(session_mod.Session(a["session"], resume=True).dir, "artifacts", "report.md")
            with open(path) as f:
                return f.read()
        if name == "edith_run_task":
            mode = a.get("mode", "plan")
            if mode not in ("plan", "accept_edits", "trusted"):
                raise ValueError("mode must be plan, accept_edits or trusted")
            logs = []
            run, _ = app.build(con, a["workspace"], _deny, logs.append, mode=mode,
                               max_steps=int(a.get("max_steps", 30)), team=bool(a.get("team")))
            r = asyncio.run(run(a["task"]))
            sid = r.get("session")
            report = ""
            if sid:
                with open(os.path.join(session_mod.Session(sid, resume=True).dir, "artifacts", "report.md")) as f:
                    report = f.read()
            return report or json.dumps({k: r.get(k) for k in ("done", "answer", "run_id", "checks_passed")}, default=str)
        raise ValueError(f"unknown tool {name}")
    serve_stdio(handle)
    return 0

def entry():
    """Console entry point: `edith ... | head` must not print a traceback."""
    try:
        sys.exit(main())
    except BrokenPipeError:
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)


if __name__ == "__main__":
    entry()
