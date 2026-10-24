"""Smart router: picks the best (provider, key, model) for every single
model call, and fails over to the next one when a call goes wrong.

Per call: classify the step -> SQL prefilter -> hard filters -> score ->
explore a little -> call -> on failure cool down and try the next
candidate, preferring a different provider."""
import asyncio
import json
import random
import re
import time

from . import config
from .messages import ProviderError
from .providers import make_adapter

TASK_TYPES = ["plan", "code_generation", "patch_edit", "debug", "review", "summarize_or_compact",
              "quick_answer", "long_context_read", "vision", "tool_heavy", "research"]

# weights: quality, speed, headroom, cost, reliability
PROFILES = {
    "plan": (0.45, 0.10, 0.15, 0.15, 0.15),
    "code_generation": (0.40, 0.15, 0.15, 0.15, 0.15),
    "patch_edit": (0.35, 0.20, 0.15, 0.15, 0.15),
    "debug": (0.45, 0.10, 0.15, 0.15, 0.15),
    "review": (0.45, 0.10, 0.15, 0.15, 0.15),
    "summarize_or_compact": (0.20, 0.30, 0.20, 0.20, 0.10),
    "quick_answer": (0.15, 0.35, 0.20, 0.20, 0.10),
    "long_context_read": (0.30, 0.15, 0.20, 0.15, 0.20),
    "vision": (0.40, 0.15, 0.15, 0.15, 0.15),
    "tool_heavy": (0.35, 0.20, 0.15, 0.15, 0.15),
    "research": (0.35, 0.15, 0.15, 0.15, 0.20),
}
ESCALATED = (0.75, 0.05, 0.10, 0.05, 0.05)

REFUSAL = re.compile(r"^\s*(I'm sorry|I am sorry|I can(no|')t (help|assist)|I am unable to)", re.I)
PREFILTER_LIMIT = 200   # best-quality rows pulled from SQLite before scoring
MAX_ATTEMPTS = 8
BREAKER_STRIKES = 3     # consecutive failures that open a model's circuit
BREAKER_SECONDS = 300


class AllFailed(Exception):
    pass


def estimate_tokens(history):
    return sum(len(m.content) + sum(len(json.dumps(t.arguments)) for t in m.tool_calls) for m in history) // 4 + 1


def family(provider, model):
    """Model family for the reviewer diversity rule: 'org/llama-3-70b' -> 'llama'."""
    base = model.split("/")[-1].split(":")[0].lower()
    m = re.match(r"[a-z]+", base)
    return m.group(0) if m else base


def classify(history, mode="default"):
    """Cheap heuristic task type for the next step."""
    if mode == "plan":
        return "plan"
    assistant = [m for m in history if m.role == "assistant"]
    if not assistant:
        return "plan"
    if estimate_tokens(history) > 30_000:
        return "long_context_read"
    last_tool = next((m for m in reversed(history) if m.role == "tool"), None)
    if last_tool and (last_tool.content.startswith("error") or
                      (last_tool.content.startswith("exit code ") and not last_tool.content.startswith("exit code 0\n"))):
        return "debug"
    last_call = assistant[-1].tool_calls[-1].name if assistant[-1].tool_calls else ""
    if last_call == "read_file":
        return "patch_edit"
    if last_call in ("list_files", "grep"):
        return "tool_heavy"
    if last_call == "run_command":
        return "review"
    if last_call in ("edit_file", "write_file"):
        return "tool_heavy"
    return "code_generation"


class Quota:
    """Requests per minute/day per lane (provider#key), from local counters
    and rate-limit headers. Cooldowns are kept in SQLite so they survive restarts."""

    def __init__(self, con):
        self.con = con
        self.minute = {}   # lane -> [timestamps]
        self.header = {}   # lane -> (remaining, limit) from the last response

    def note_call(self, lane, headers):
        now = time.time()
        self.minute.setdefault(lane, []).append(now)
        rem = headers.get("x-ratelimit-remaining-requests") or headers.get("x-ratelimit-remaining")
        lim = headers.get("x-ratelimit-limit-requests") or headers.get("x-ratelimit-limit")
        try:
            if rem is not None and lim:
                self.header[lane] = (float(rem), float(lim))
        except ValueError:
            pass

    def used_minute(self, lane):
        now = time.time()
        recent = [t for t in self.minute.get(lane, []) if now - t < 60]
        self.minute[lane] = recent
        return len(recent)

    def used_day(self, provider, key_idx):
        return self.con.execute("SELECT COUNT(*) FROM calls WHERE provider=? AND key_idx=? AND ts >= date('now') "
                                "AND task_type NOT LIKE 'probe%'", (provider, key_idx)).fetchone()[0]

    def headroom(self, provider, key_idx, limits):
        """0 = exhausted, 1 = untouched; 0.7 when nothing is known."""
        lane = f"{provider}#{key_idx}"
        parts = []
        if limits.get("rpm"):
            parts.append(1 - self.used_minute(lane) / limits["rpm"])
        if limits.get("rpd"):
            parts.append(1 - self.used_day(provider, key_idx) / limits["rpd"])
        if lane in self.header:
            rem, lim = self.header[lane]
            parts.append(rem / lim)
        return max(0.0, min(parts)) if parts else 0.7

    # --- cooldowns / circuit breaker ---
    def cooling(self, lane):
        row = self.con.execute("SELECT until, reason FROM cooldowns WHERE lane=?", (lane,)).fetchone()
        return row["reason"] if row and row["until"] > time.time() else None

    def cool(self, lane, seconds=None, reason=""):
        """Exponential backoff: 15s, 30s, 60s ... capped at 1h, unless the provider said how long."""
        row = self.con.execute("SELECT strikes, until FROM cooldowns WHERE lane=?", (lane,)).fetchone()
        strikes = (row["strikes"] + 1) if row and row["until"] > time.time() - 600 else 1
        wait = seconds if seconds else min(15 * 2 ** (strikes - 1), 3600)
        self.con.execute("INSERT OR REPLACE INTO cooldowns VALUES (?, ?, ?, ?)", (lane, time.time() + wait, reason, strikes))
        self.con.commit()
        return wait

    def clear(self, lane):
        self.con.execute("DELETE FROM cooldowns WHERE lane=?", (lane,))


class Router:
    def __init__(self, con, mode="default", needs_private=True, log=print, rng=None, providers=None, quota=None):
        self.con, self.mode, self.needs_private, self.log = con, mode, needs_private, log
        self.quota = quota or Quota(con)  # parallel agents share one, so their calls count together
        self.rng = rng or random.Random()
        self._providers = providers  # tests pass a fixed dict; normally re-read every call
        self.adapters = {}
        self.fails = {}               # provider/model -> consecutive failures (circuit breaker)
        self.limited = {}             # provider -> [(time, model)] recent 429s
        self.last_provider = None
        self.session_cost_usd = 0.0
        self.switches = []            # (provider, model) per successful call, for reports

    # --- inputs that may change while a session runs ---
    def providers(self):
        return self._providers if self._providers is not None else config.load_providers()

    def settings(self):
        return config.load_router_settings()

    # --- ranking ---
    def candidates(self, task_type, need_tokens, needs_tools=True, avoid_family=None, exclude=()):
        """Returns (scored list best-first, rejected-reason counts)."""
        providers = self.providers()
        s = self.settings()
        router, budget = s["router"], s["budget"]
        ready = config.usable(providers)
        rejected = {}

        def reject(reason, n=1):
            rejected[reason] = rejected.get(reason, 0) + n

        allowed = {}
        for name, p in ready.items():
            if router.get("force_provider") and name != router["force_provider"]:
                reject("not forced provider")
                continue
            if name in (router.get("ban") or []):
                reject("banned provider")
                continue
            if self.needs_private and not p.get("allow_private_code"):
                reject("privacy flag")
                continue
            if self.quota.cooling(name):
                reject("provider cooldown")
                continue
            allowed[name] = p
        if not allowed:
            return [], rejected

        marks = ",".join("?" * len(allowed))
        rows = self.con.execute(
            f"SELECT * FROM models WHERE provider IN ({marks}) AND status IN ('active','probation') "
            f"ORDER BY (status='active') DESC, quality DESC NULLS LAST, context DESC NULLS LAST LIMIT ?",
            (*allowed, PREFILTER_LIMIT)).fetchall()
        stats = self._stats(rows, task_type)
        spent_today = self._spent_today_inr(budget)
        spent_by = {}
        out = []
        for r in rows:
            name, model, p = r["provider"], r["model"], allowed[r["provider"]]
            key = f"{name}/{model}"
            if key in exclude:
                reject("excluded after failure")
                continue
            if key in (router.get("ban") or []):
                reject("banned model")
                continue
            if needs_tools and r["tools"] == 0:
                reject("no tool calling")
                continue
            if needs_tools and r["tools"] is None and r["status"] != "probation":
                reject("tool support unknown")
                continue
            if r["context"] and r["context"] < need_tokens:
                reject("context too small")
                continue
            if self.quota.cooling(key):
                reject("model cooldown")
                continue
            if avoid_family and family(name, model) == avoid_family:
                reject("same family as coder")
                continue
            # all_models_free: the free key covers every model; listed prices are the paid tier's (Groq)
            paid = (r["free"] == 0 or p.get("free_tier") is False
                    or ((r["price_in"] or 0) > 0 and not p.get("all_models_free")))
            if paid:
                cap = (budget.get("per_provider_inr") or {}).get(name, budget.get("daily_inr", 0))
                if name not in spent_by:
                    spent_by[name] = self._spent_today_inr(budget, name)
                if (not budget.get("paid_enabled") or spent_today >= (budget.get("daily_inr") or 0) or not cap
                        or spent_by[name] >= cap):
                    reject("paid, no budget")
                    continue
            # best key lane of this provider = most headroom
            lanes = [(self.quota.headroom(name, i, p.get("limits") or {}), i) for i in range(len(config.keys(p)))]
            lanes = [(h, i) for h, i in lanes if h > 0 and not self.quota.cooling(f"{name}#{i}")]
            if not lanes:
                reject("quota exhausted")
                continue
            headroom, key_idx = max(lanes)
            out.append(self._score(r, p, task_type, stats.get((name, model), {}), headroom, key_idx, paid, router))
        out.sort(key=lambda c: c["score"], reverse=True)
        return out, rejected

    def _stats(self, rows, task_type):
        if not rows:
            return {}
        q = ("SELECT provider, model, COUNT(*) n, SUM(ok) ok, AVG(CASE WHEN ok THEN latency_ms END) lat, "
             "SUM(CASE WHEN task_type=? THEN 1 ELSE 0 END) tn, SUM(CASE WHEN task_type=? AND ok THEN 1 ELSE 0 END) tok "
             "FROM (SELECT * FROM calls WHERE ts > datetime('now','-3 days') AND task_type NOT LIKE 'probe%' "
             "ORDER BY ts DESC LIMIT 5000) GROUP BY provider, model")
        return {(s["provider"], s["model"]): dict(s) for s in self.con.execute(q, (task_type, task_type))}

    def _spent_today_inr(self, budget, provider=None):
        usd = self.con.execute("SELECT COALESCE(SUM(cost_usd),0) FROM calls WHERE ts >= date('now') "
                               "AND (? IS NULL OR provider = ?)", (provider, provider)).fetchone()[0]
        return usd * float(budget.get("usd_to_inr", 88))

    def _score(self, r, p, task_type, st, headroom, key_idx, paid, router):
        prior = r["quality"] if r["quality"] is not None else 0.5
        if r["status"] == "probation":
            prior *= 0.8  # unproven: small share of traffic until it passes probes
        # Bayesian blend: probe score counts like 3 calls of evidence for this task type
        quality = ((st.get("tok") or 0) + 3 * prior) / ((st.get("tn") or 0) + 3)
        lat = st.get("lat")
        speed = 0.5 if lat is None else 1 / (1 + lat / 4000)
        n = st.get("n") or 0
        reliability = ((st.get("ok") or 0) + 1.6) / (n + 2)  # prior 0.8 worth 2 calls
        cost = 0.2 if paid else (1.0 if r["free"] == 1 else 0.9 if p.get("free_tier") is True else 0.6)
        w = ESCALATED if task_type == "escalated" else PROFILES.get(task_type, PROFILES["code_generation"])
        parts = {"q": quality, "s": speed, "h": headroom, "c": cost, "r": reliability}
        score = sum(wi * v for wi, v in zip(w, parts.values()))
        if self.last_provider and r["provider"] != self.last_provider:
            score -= float(router.get("switch_penalty", 0.03))
        return {"provider": r["provider"], "model": r["model"], "key_idx": key_idx, "score": round(score, 4),
                "parts": {k: round(v, 2) for k, v in parts.items()}, "price_in": r["price_in"],
                "price_out": r["price_out"]}

    def choose(self, task_type, need_tokens, needs_tools=True, avoid_family=None, exclude=(), escalate=False):
        scored, rejected = self.candidates("escalated" if escalate else task_type, need_tokens, needs_tools,
                                           avoid_family, exclude)
        if not scored:
            return [], rejected
        router = self.settings()["router"]
        pin = (router.get("pin") or {}).get(task_type)
        if pin:
            pinned = [c for c in scored if f"{c['provider']}/{c['model']}" == pin]
            scored = pinned + [c for c in scored if c not in pinned]
        elif not escalate and len(scored) > 1 and self.rng.random() < float(router.get("explore", 0.1)):
            pick = self.rng.randrange(1, min(5, len(scored)))  # epsilon-greedy among the next best
            scored.insert(0, scored.pop(pick))
            scored[0] = {**scored[0], "explore": True}
        return scored, rejected

    # --- the call ---
    async def chat(self, history, tools, task_type=None, escalate=False, avoid_family=None):
        task_type = task_type or classify(history, self.mode)
        need = int(estimate_tokens(history) * 1.2) + 2000
        exclude = set()
        failed_providers = []
        for attempt in range(MAX_ATTEMPTS):
            ranked, rejected = self.choose(task_type, need, bool(tools), avoid_family, exclude, escalate)
            if not ranked and avoid_family:  # diversity is a preference, not a reason to fail
                self.log(f"  route: no model outside family {avoid_family!r}; using any")
                avoid_family = None
                ranked, rejected = self.choose(task_type, need, bool(tools), None, exclude, escalate)
            if failed_providers:  # after a failure prefer a provider that has not failed this step
                ranked.sort(key=lambda c: c["provider"] in failed_providers)
            if not ranked:
                hint = (" Run `edith providers trust <name>` for a provider you trust with your code."
                        if rejected.get("privacy flag") else "")
                raise AllFailed(f"no usable model for {task_type}: rejected {rejected or 'nothing (no models; run edith refresh/probe)'}.{hint}")
            c = ranked[0]
            why = {"task": task_type, "score": c["score"], "parts": c["parts"], "explore": c.get("explore", False),
                   "alts": [f"{a['provider']}/{a['model']} {a['score']}" for a in ranked[1:4]], "rejected": rejected}
            self.log(f"  route[{task_type}{'+esc' if escalate else ''}] -> {c['provider']}/{c['model']} "
                     f"score={c['score']} {c['parts']}{' explore' if c.get('explore') else ''} | "
                     f"alts: {', '.join(why['alts']) or '-'} | rejected: {rejected or '-'}")
            resp, err = await self._attempt(c, history, tools, task_type, why)
            if resp:
                return resp
            self.log(f"  failover: {c['provider']}/{c['model']} {err}")
            exclude.add(f"{c['provider']}/{c['model']}")
            failed_providers.append(c["provider"])
        raise AllFailed(f"{MAX_ATTEMPTS} attempts failed for {task_type}")

    async def _attempt(self, c, history, tools, task_type, why):
        name, model, key_idx = c["provider"], c["model"], c["key_idx"]
        lane = (name, key_idx)
        if lane not in self.adapters:
            self.adapters[lane] = make_adapter(name, self.providers()[name], key_idx)
        adapter = self.adapters[lane]
        t0 = time.monotonic()
        err, resp = None, None
        try:
            resp = await adapter.chat(model, history, tools)
            if not resp.message.content.strip() and not resp.message.tool_calls:
                err = "empty output"
            elif any("_error" in t.arguments for t in resp.message.tool_calls):
                err = "malformed tool-call JSON"
            elif resp.message.tool_calls and not tools:
                err = "called a tool when none were offered"
            elif not resp.message.tool_calls and tools and REFUSAL.match(resp.message.content):
                err = "refusal"
        except ProviderError as e:
            err = f"HTTP {e.status}: {str(e)[-160:]}"
            if e.status in (400, 413) and any(k in str(e).lower() for k in ("context", "too long", "token limit",
                                                                              "too many tokens", "maximum")):
                self.con.execute("INSERT INTO calls (provider, model, task_type, ok, latency_ms, error, key_idx) "
                                 "VALUES (?,?,?,0,?,?,?)", (name, model, task_type,
                                                            int((time.monotonic() - t0) * 1000), err, key_idx))
                self.con.commit()
                raise  # the loop compacts the history and retries; failing over would not help
            if e.status == 400 and tools and re.search(r"tool.{0,40}not (supported|support)|"
                                                       r"(not|n't) support.{0,40}tool", str(e), re.IGNORECASE):
                # the listing said nothing about tools; now we know, so it is never picked for tool steps again
                self.con.execute("UPDATE models SET tools=0 WHERE provider=? AND model=?", (name, model))
            if e.status == 429:
                retry = None
                try:
                    retry = float(e.retry_after) if e.retry_after else None
                except ValueError:
                    pass
                # quotas are often per model: cool this model; the key/provider only when a
                # second model of it is limited within a minute
                waited = self.quota.cool(f"{name}/{model}", retry, "429")
                now = time.time()
                hits = [(t, m) for t, m in self.limited.get(name, []) if now - t < 60] + [(now, model)]
                self.limited[name] = hits
                if len({m for _, m in hits}) >= 2:
                    self.quota.cool(f"{name}#{key_idx}", retry, "429")
                    if len(config.keys(self.providers()[name])) == 1:
                        self.quota.cool(name, retry or waited, "429")
                err += f" -> cooldown {waited:.0f}s"
            elif e.status in (401, 403):
                self.quota.cool(name, 3600, f"auth {e.status}")
            elif e.status == 0:  # unreachable: the whole provider is down
                self.quota.cool(name, None, f"HTTP {e.status}")
            elif e.status >= 500:  # often one overloaded model ("high demand"); its siblings still work
                self.quota.cool(f"{name}/{model}", None, f"HTTP {e.status}")
        latency = int((time.monotonic() - t0) * 1000)
        self.quota.note_call(f"{name}#{key_idx}", getattr(adapter, "last_headers", {}) or {})
        mkey = f"{name}/{model}"
        cost = 0.0
        if resp:
            cost = (resp.usage.input_tokens * (c["price_in"] or 0) + resp.usage.output_tokens * (c["price_out"] or 0)) / 1e6
        self.con.execute("INSERT INTO calls (provider, model, task_type, ok, latency_ms, input_tokens, output_tokens, "
                         "error, key_idx, cost_usd, why) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                         (name, model, task_type, int(err is None), latency,
                          resp.usage.input_tokens if resp else 0, resp.usage.output_tokens if resp else 0,
                          err, key_idx, cost, json.dumps(why)))
        self.con.commit()
        if err:
            self.fails[mkey] = self.fails.get(mkey, 0) + 1
            if self.fails[mkey] >= BREAKER_STRIKES:
                self.quota.cool(mkey, BREAKER_SECONDS, "circuit open")
            return None, err
        self.fails[mkey] = 0
        self.session_cost_usd += cost
        if self.last_provider and self.last_provider != name:
            self.log(f"  switch: {self.last_provider} -> {name}")
        self.last_provider = name
        self.switches.append((name, model))
        self.log(f"  ok {latency}ms {resp.usage.input_tokens}/{resp.usage.output_tokens} tok"
                 + (f" ${cost:.5f}" if cost else ""))
        return resp, None


class Fixed:
    """One provider and model for the whole session (`--provider/--model`)."""

    def __init__(self, adapter, model):
        self.adapter, self.model = adapter, model
        self.session_cost_usd = 0.0

    async def chat(self, history, tools, task_type=None, escalate=False, avoid_family=None):
        """No other model to fail over to, so a rate limit or overload is waited out (twice at most)."""
        for attempt in range(3):
            try:
                return await self.adapter.chat(self.model, history, tools)
            except ProviderError as e:
                if attempt == 2 or e.status not in (429, 500, 502, 503, 504):
                    raise
                try:
                    wait = float(e.retry_after)
                except (TypeError, ValueError):
                    wait = 10 * (attempt + 1)
                await asyncio.sleep(min(wait, 60))
