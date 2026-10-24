"""Model discovery (list endpoints -> SQLite) and capability probes.
Nothing here raises for a single bad provider: errors are recorded and
the rest carry on."""
import asyncio
import re
import time
from datetime import datetime, timezone

from .config import load_extra_models, usable
from .messages import Message, ProviderError
from .providers import make_adapter
from .providers.repair import parse_args

UPSERT = """
INSERT INTO models (provider, model, context, max_output, tools, vision, free, price_in, price_out, last_seen)
VALUES (:provider, :model, :context, :max_output, :tools, :vision, :free, :price_in, :price_out, :ts)
ON CONFLICT(provider, model) DO UPDATE SET
  context = COALESCE(excluded.context, context),
  max_output = COALESCE(excluded.max_output, max_output),
  tools = COALESCE(tools, excluded.tools),
  vision = COALESCE(excluded.vision, vision),
  free = COALESCE(excluded.free, free),
  price_in = COALESCE(excluded.price_in, price_in),
  price_out = COALESCE(excluded.price_out, price_out),
  last_seen = excluded.last_seen,
  status = CASE WHEN status = 'gone' THEN 'probation' ELSE status END
"""


def _now():
    # microseconds, so two refreshes in the same second still tell old rows from new
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")


async def _list(name, p, extra):
    if p.get("models") == "extra":
        return [{"model": m["id"], "context": m.get("context"), "max_output": m.get("max_output"),
                 "tools": None if m.get("tools") is None else int(bool(m["tools"])), "vision": None, "free": None,
                 "price_in": m.get("price_in"), "price_out": m.get("price_out")}
                for m in extra.get(name) or []]
    return await make_adapter(name, p).list_models()


def _fresh(con, name, max_age_hours):
    row = con.execute("SELECT 1 FROM discovery WHERE provider=? AND ok=1 AND refreshed_at > datetime('now', ?)",
                      (name, f"-{max_age_hours} hours")).fetchone()
    return row is not None


async def refresh(con, providers, concurrency=8, max_age_hours=6, force=False, timeout=30):
    """Fetch model lists for every usable provider. Returns {provider: count or error}."""
    extra = load_extra_models()
    sem = asyncio.Semaphore(concurrency)
    todo = {n: p for n, p in usable(providers).items() if force or not _fresh(con, n, max_age_hours)}

    async def one(name, p):
        async with sem:
            try:
                return name, await asyncio.wait_for(_list(name, p, extra), timeout), None
            except (ProviderError, asyncio.TimeoutError, ValueError, KeyError, TypeError) as e:
                return name, None, f"{type(e).__name__}: {e}"[:300]

    results = await asyncio.gather(*(one(n, p) for n, p in todo.items()))
    report = {}
    for name, records, error in results:
        ts = _now()
        if error is None:
            con.executemany(UPSERT, [{**r, "provider": name, "ts": ts} for r in records])
            # models that vanished from the list stop being routed to
            con.execute("UPDATE models SET status='gone' WHERE provider=? AND last_seen < ? AND status != 'disabled'",
                        (name, ts))
        con.execute("INSERT OR REPLACE INTO discovery VALUES (?, ?, ?, ?, ?)",
                    (name, ts, int(error is None), error, len(records) if records else 0))
        report[name] = error or len(records)
    con.commit()
    return report


# --- probes -------------------------------------------------------------

ADD_TOOL = {"name": "add", "description": "Add two integers.",
            "parameters": {"type": "object", "required": ["a", "b"],
                           "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}}}}


def _num(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


async def _probe_reply(a, model):
    r = await a.chat(model, [Message("user", "Reply with the single word: pong")], [])
    return "pong" in r.message.content.lower()


async def _probe_tool(a, model):
    r = await a.chat(model, [Message("user", "Use the add tool to add 2 and 3. Do not answer in text.")], [ADD_TOOL])
    c = r.message.tool_calls
    return bool(c) and c[0].name == "add" and _num(c[0].arguments.get("a")) == 2 and _num(c[0].arguments.get("b")) == 3


async def _probe_json(a, model):
    r = await a.chat(model, [Message("user", 'Return only a JSON object with keys "city" and "country" '
                                             "for the capital of France. No other text.")], [])
    v = parse_args(r.message.content)
    return "_error" not in v and "paris" in str(v.get("city", "")).lower()


async def _probe_code(a, model):
    r = await a.chat(model, [Message("user", "This Python function is wrong:\n\ndef is_even(n):\n    return n % 2 == 1\n\n"
                                             "Reply with only the corrected function.")], [])
    # checked by pattern, never executed: model output is untrusted
    return re.search(r"%\s*2\s*(==\s*0|!=\s*1)|not\s+n\s*%\s*2|n\s*&\s*1\s*==\s*0", r.message.content) is not None


PROBES = {"reply": _probe_reply, "tool": _probe_tool, "json": _probe_json, "code": _probe_code}


async def probe_model(con, name, p, model):
    """Runs the probes; a 429 aborts without counting as a failure."""
    a = make_adapter(name, p)
    con.execute("INSERT OR IGNORE INTO models (provider, model) VALUES (?, ?)", (name, model))
    passed, first_err = {}, None
    for key, fn in PROBES.items():
        if key == "tool" and p.get("api") == "horde":
            passed[key] = False
            continue
        t0 = time.monotonic()
        try:
            ok = await fn(a, model)
            err = None
        except ProviderError as e:
            if e.status == 429:
                return {"model": model, "rate_limited": True}
            ok, err = False, str(e)[:300]
            first_err = first_err or err
        con.execute("INSERT INTO calls (provider, model, task_type, ok, latency_ms, error) VALUES (?,?,?,?,?,?)",
                    (name, model, f"probe_{key}", int(ok), int((time.monotonic() - t0) * 1000), err))
        passed[key] = ok
    score = sum(passed.values()) / len(passed)
    row = con.execute("SELECT probe_fails FROM models WHERE provider=? AND model=?", (name, model)).fetchone()
    fails = (row["probe_fails"] if row else 0) + (score < 0.5)
    status = "active" if score >= 0.75 else ("disabled" if fails >= 3 else "failing" if score < 0.5 else "probation")
    con.execute("""UPDATE models SET quality=?, tools=?, json_mode=?, status=?, probe_runs=probe_runs+1, probe_fails=?
                   WHERE provider=? AND model=?""",
                (score, int(passed["tool"]), int(passed["json"]), status, fails, name, model))
    con.commit()
    return {"model": model, "score": score, "status": status, "error": first_err, **passed}


async def probe(con, providers, provider=None, model=None, limit=5, concurrency=4):
    """Probe up to `limit` unproven models per provider (or one given model).
    Providers run in parallel; models within one provider run in turn."""
    ready = usable(providers)
    if provider:
        ready = {provider: ready[provider]} if provider in ready else {}
    sem = asyncio.Semaphore(concurrency)

    async def per_provider(name, p):
        if model:
            models = [model]
        else:
            models = [r["model"] for r in con.execute(
                "SELECT model FROM models WHERE provider=? AND status IN ('probation','failing') "
                "ORDER BY probe_runs, free DESC, model LIMIT ?", (name, limit))]
        out = []
        async with sem:
            for m in models:
                res = await probe_model(con, name, p, m)
                out.append(res)
                if res.get("rate_limited"):
                    break  # try again later instead of burning the quota
        return name, out

    return dict(await asyncio.gather(*(per_provider(n, p) for n, p in ready.items())))
