"""Loads providers.yaml and .env, and redacts key values from any text."""
import os
import re

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


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


def load_providers(path=os.path.join(ROOT, "providers.yaml")):
    with open(path) as f:
        return yaml.safe_load(f)["providers"]


def base_url(p):
    return re.sub(r"\{([A-Z0-9_]+)\}", lambda m: os.environ.get(m.group(1), ""), p["base_url"]).rstrip("/")


def usable(providers):
    """Providers that are enabled and have a key set, in file order."""
    return {n: p for n, p in providers.items() if p["enabled"] and os.environ.get(p["key_env"])}


def secrets(providers):
    return [v for p in providers.values() if len(v := os.environ.get(p["key_env"], "")) >= 8]


def redact(text, secret_values):
    for s in secret_values:
        text = text.replace(s, "[REDACTED]")
    return text
