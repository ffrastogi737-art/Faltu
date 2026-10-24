"""Provider registry and secrets.

providers.yaml is the shipped, commented base. Every change made with
`edith providers ...` goes to providers.local.yaml (git-ignored), which is
merged on top, so the base file keeps its comments and your changes survive
updates. A removed provider is hidden here; its stats stay in SQLite."""
import os
import re

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "providers.yaml")
LOCAL = os.path.join(ROOT, "providers.local.yaml")
EXTRA = os.path.join(ROOT, "models_extra.yaml")


def load_env(path=os.path.join(ROOT, ".env")):
    """Fill os.environ from a .env file; real environment variables win."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _read(path):
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return yaml.safe_load(f) or {}


def load_providers():
    """Merged registry, read fresh on every call so edits apply immediately."""
    merged = {n: dict(p) for n, p in (_read(BASE).get("providers") or {}).items()}
    for n, changes in (_read(LOCAL).get("providers") or {}).items():
        merged[n] = {**merged.get(n, {}), **changes}
    return {n: p for n, p in merged.items() if not p.get("removed")}


def save_override(name, changes):
    data = _read(LOCAL)
    data.setdefault("providers", {}).setdefault(name, {}).update(changes)
    with open(LOCAL, "w") as f:
        yaml.safe_dump(data, f, sort_keys=False)


def load_extra_models():
    """{provider: [ {id, context?, tools?}, ... ]} for providers without a list endpoint."""
    return _read(EXTRA)


def fill(url):
    return re.sub(r"\{([A-Z0-9_]+)\}", lambda m: os.environ.get(m.group(1), ""), url).rstrip("/")


def base_url(p):
    return fill(p["base_url"])


def key_envs(p):
    """key_env may list several variables (comma-separated) for several keys of one provider."""
    return [k.strip() for k in str(p.get("key_env", "")).split(",") if k.strip()]


def keys(p):
    return [v for k in key_envs(p) if (v := os.environ.get(k))]


def usable(providers):
    """Providers that are enabled and have at least one key set, in file order."""
    return {n: p for n, p in providers.items() if p.get("enabled") and keys(p)}


def secrets(providers):
    return [v for p in providers.values() for v in keys(p) if len(v) >= 8]


def load_router_settings():
    """`router:` and `budget:` sections of providers.yaml, overlaid by providers.local.yaml."""
    base, local = _read(BASE), _read(LOCAL)
    out = {}
    for section in ("router", "budget"):
        out[section] = {**(base.get(section) or {}), **(local.get(section) or {})}
    return out


def save_router_setting(section, key, value):
    data = _read(LOCAL)
    data.setdefault(section, {})[key] = value
    with open(LOCAL, "w") as f:
        yaml.safe_dump(data, f, sort_keys=False)


def redact(text, secret_values):
    for s in secret_values:
        text = text.replace(s, "[REDACTED]")
    return text
