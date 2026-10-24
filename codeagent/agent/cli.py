"""`edith` command: welcome screen. The agent loop plugs in here in Phase 1."""
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
    codes = {"main": color, "shadow": "38;2;110;40;35", "bold": "1", "dim": "2", "link": "38;2;120;140;255"}
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
    print(f"\n--- E.D.I.T.H. wants to run this {kind} ---\n{detail}")
    return _ask("Allow? [y/N] ").strip().lower() in ("y", "yes")


def _pick(args, providers, con):
    """Returns (name, adapter, model) or exits with a hint."""
    from .config import usable
    from .providers import make_adapter
    ready = usable(providers)
    name = args.provider or os.environ.get("EDITH_PROVIDER") or next(iter(ready), None)
    if not name:
        sys.exit("No provider has a key. Put one in codeagent/.env (see .env.example).")
    if name not in providers:
        sys.exit(f"Unknown provider `{name}`. See `edith providers`.")
    if name not in ready:
        sys.exit(f"`{name}` is disabled or {providers[name]['key_env']} is empty.")
    model = getattr(args, "model", None) or os.environ.get("EDITH_MODEL")
    if not model:  # best probed model of this provider; no names in code
        row = con.execute("SELECT model FROM models WHERE provider=? AND status='active' AND tools=1 "
                          "ORDER BY quality DESC, context DESC LIMIT 1", (name,)).fetchone()
        model = row["model"] if row else None
    return name, make_adapter(name, providers[name]), model


def _providers_cmd(args, providers, con):
    from . import config
    act = args.action
    if act == "list":
        stats = {r["provider"]: r for r in con.execute("SELECT * FROM discovery")}
        counts = {r[0]: r[1] for r in con.execute(
            "SELECT provider, COUNT(*) FROM models WHERE status != 'gone' GROUP BY provider")}
        for n, p in providers.items():
            key = "key" if os.environ.get(p.get("key_env", "")) else "no-key"
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
    for p in (ap, *sub.choices.values()):  # options go after the subcommand
        p.add_argument("--provider", help="provider name from providers.yaml (or EDITH_PROVIDER)")
        p.add_argument("--model", help="model id, see `edith models` (or EDITH_MODEL)")
    for p in (ap, run):
        p.add_argument("--mode", default="default", choices=["plan", "default", "accept_edits", "trusted"])
        p.add_argument("--workspace", default=".")
        p.add_argument("--max-steps", type=int, default=30)
    args = ap.parse_args(argv)

    config.load_env()
    con = db.connect()
    try:
        return _dispatch(args, config.load_providers(), con)
    finally:
        con.close()


def _dispatch(args, providers, con):
    import asyncio

    from . import config, discovery, loop
    from .tools import Tools

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
                      " ".join(k for k in discovery.PROBES if r.get(k))))
        return 0

    if not args.cmd:
        print(welcome())
        _ask(_paint("")("Press Enter to continue…", "link"))
    name, adapter, model = _pick(args, providers, con)
    task = getattr(args, "task", None)
    if not task:
        task = _ask("\nWhat should I do? > ").strip()
        if not task:
            return 0
    if not model:
        sys.exit(f"No model chosen. Run `edith refresh` and `edith probe --provider {name}`,\n"
                 f"or set EDITH_MODEL in .env, or pass --model (see `edith models --provider {name}`).")
    if not providers[name].get("allow_private_code"):
        sys.exit(f"`{name}` has allow_private_code: false, so it may not see your code.\n"
                 f"If you trust it: `edith providers trust {name}`.")

    secret_values = config.secrets(providers)
    tools = Tools(args.workspace, _approve, args.mode, scrub_env=[p["key_env"] for p in providers.values()])
    result = asyncio.run(loop.run(task, adapter, model, tools, max_steps=args.max_steps,
                                  redact=lambda s: config.redact(s, secret_values),
                                  log=lambda s: print(config.redact(s, secret_values))))
    return 0 if result["done"] else 1


if __name__ == "__main__":
    sys.exit(main())
