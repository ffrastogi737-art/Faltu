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


def _pick(args, providers):
    """Returns (adapter, model) or raises SystemExit with a hint."""
    from .config import base_url, usable
    from .providers.openai_compat import OpenAICompat
    ready = usable(providers)
    name = args.provider or os.environ.get("EDITH_PROVIDER") or next(iter(ready), None)
    if not name:
        sys.exit("No provider has a key. Put one in codeagent/.env (see .env.example).")
    if name not in providers:
        sys.exit(f"Unknown provider `{name}`. See `edith providers`.")
    p = providers[name]
    if name not in ready:
        sys.exit(f"`{name}` is disabled or {p['key_env']} is empty.")
    if p["api"] != "openai":
        sys.exit(f"`{name}` needs the `{p['api']}` adapter, which arrives in Phase 2. Pick an OpenAI-compatible provider.")
    return name, OpenAICompat(name, base_url(p), os.environ[p["key_env"]])


def main(argv=None):
    import argparse
    import asyncio

    from . import config, loop
    from .tools import Tools

    ap = argparse.ArgumentParser(prog="edith", description=f"{NAME} {FULL_NAME}")
    sub = ap.add_subparsers(dest="cmd")
    run = sub.add_parser("run", help="do a coding task")
    run.add_argument("task")
    sub.add_parser("providers", help="list providers and whether a key is set")
    sub.add_parser("models", help="list models of the chosen provider")
    for p in (ap, *sub.choices.values()):  # options go after the subcommand
        p.add_argument("--provider", help="provider name from providers.yaml (or EDITH_PROVIDER)")
        p.add_argument("--model", help="model id, see `edith models` (or EDITH_MODEL)")
        p.add_argument("--mode", default="default", choices=["plan", "default", "accept_edits", "trusted"])
        p.add_argument("--workspace", default=".")
        p.add_argument("--max-steps", type=int, default=30)
    args = ap.parse_args(argv)

    config.load_env()
    providers = config.load_providers()

    if args.cmd == "providers":
        for n, p in providers.items():
            key = "key set" if os.environ.get(p["key_env"]) else "no key"
            state = "on " if p["enabled"] else "off"
            print(f"{state} {n:18} {p['status']:10} {key:7} private_code={p['allow_private_code']}")
        return 0

    if not args.cmd:
        print(welcome())
        _ask(_paint("")("Press Enter to continue…", "link"))
    name, adapter = _pick(args, providers)
    if args.cmd == "models":
        print("\n".join(asyncio.run(adapter.list_models())))
        return 0

    task = getattr(args, "task", None)
    if not task:
        task = _ask("\nWhat should I do? > ").strip()
        if not task:
            return 0
    model = args.model or os.environ.get("EDITH_MODEL")
    if not model:
        sys.exit(f"No model chosen. Run `edith models --provider {name}` and set EDITH_MODEL in .env or pass --model.")
    if not providers[name]["allow_private_code"]:
        sys.exit(f"`{name}` has allow_private_code: false, so it may not see your code.\n"
                 f"If you trust it, set allow_private_code: true for {name} in providers.yaml.")

    secret_values = config.secrets(providers)
    tools = Tools(args.workspace, _approve, args.mode, scrub_env=[p["key_env"] for p in providers.values()])
    result = asyncio.run(loop.run(task, adapter, model, tools, max_steps=args.max_steps,
                                  redact=lambda s: config.redact(s, secret_values),
                                  log=lambda s: print(config.redact(s, secret_values))))
    return 0 if result["done"] else 1


if __name__ == "__main__":
    sys.exit(main())
