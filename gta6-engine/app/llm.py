"""Script writer. Uses Claude API only if ANTHROPIC_API_KEY is set AND the daily
budget allows; otherwise a deterministic offline template (free, always works).
Output is always the same JSON shape."""
import json
import re

import httpx

from .config import settings
from .brain import budget
from .db import log

# rough Haiku pricing per 1M tokens, used only for budget accounting
PRICE_IN, PRICE_OUT = 1.0, 5.0

SYSTEM = """You write ORIGINAL commentary scripts for a GTA 6 YouTube channel.
Rules: never invent facts. Only state what the provided topic + verification note support.
If the topic is unverified, say clearly it is a rumor/unconfirmed. No clickbait lies.
Return ONLY JSON: {"title": str<=90 chars, "hook": str, "beats": [str], "cta": str,
"description": str, "tags": [str]}"""


def _template(topic, kind, verified, n_beats):
    label = "" if verified else "UNCONFIRMED: "
    hook = {
        "shorts": f"{label}{topic} — here's what it actually means.",
        "longform": f"Everything you need to know: {topic}.",
        "clip": f"Wait for it... {topic}",
    }.get(kind, topic)
    beats = [
        f"First, the context: {topic}.",
        "Here's what is confirmed so far, and what is still speculation." if not verified else "This comes from a verified source.",
        "Why it matters for your GTA 6 playthrough.",
        "What to watch for next.",
        "My honest take on it.",
        "One detail most people missed.",
    ][:n_beats]
    tags = ["GTA 6", "GTA VI", "Rockstar Games", "Leonida", "Vice City"]
    if not verified:
        tags.append("GTA 6 rumor")
    return {
        "title": (f"{label}{topic}")[:90],
        "hook": hook,
        "beats": beats,
        "cta": "Follow for daily GTA 6 updates.",
        "description": f"{label}{topic}\n\nOriginal commentary. Sources are listed below where available.\n#GTA6 #GTAVI",
        "tags": tags,
        "provider": "template",
    }


def _parse(text, verified):
    out = json.loads(re.search(r"\{.*\}", text, re.S).group(0))
    for k in ("title", "hook", "beats", "cta", "description", "tags"):
        if k not in out:
            raise ValueError(f"LLM JSON missing '{k}'")
    if not verified and "unconfirmed" not in out["title"].lower() and "rumor" not in out["title"].lower():
        out["title"] = ("UNCONFIRMED: " + out["title"])[:90]
    return out


def _free_llm_calls_today():
    from datetime import datetime, timezone
    from sqlalchemy import func
    from .db import SessionLocal, Spend
    start = datetime.now(timezone.utc).replace(tzinfo=None).replace(hour=0, minute=0, second=0, microsecond=0)
    with SessionLocal() as s:
        return s.query(func.count(Spend.id)).filter(Spend.service == "llm-free", Spend.created_at >= start).scalar()


def write_script(topic, kind="shorts", verified=True, note="", n_beats=4, client=None):
    # 1) free OpenAI-compatible provider (zero-paid mode): capped calls/day, logged as $0 spend rows
    if settings.llm_base_url and settings.llm_model and _free_llm_calls_today() < settings.llm_max_calls_per_day:
        try:
            c = client or httpx.Client(timeout=90)
            r = c.post(f"{settings.llm_base_url}/chat/completions", headers={"Authorization": f"Bearer {settings.llm_api_key or 'none'}"},
                       json={"model": settings.llm_model, "temperature": 0.7, "messages": [
                           {"role": "system", "content": SYSTEM},
                           {"role": "user", "content": f"Format: {kind}, {n_beats} beats.\nTopic: {topic}\nVerified: {verified}\nVerification note: {note}"}]})
            r.raise_for_status()
            out = _parse(r.json()["choices"][0]["message"]["content"], verified)
            out["provider"] = "free-llm"
            from .db import SessionLocal, Spend
            with SessionLocal() as s:
                s.add(Spend(service="llm-free", usd=0, note=kind))
                s.commit()
            return out
        except Exception as e:
            log("warn", "llm", f"Free LLM failed, falling back: {e}")
    # 2) paid Claude: only with a key AND a budget > 0 that you set yourself
    if settings.anthropic_api_key and budget.can_spend(0.01):
        try:
            c = client or httpx.Client(timeout=60)
            r = c.post("https://api.anthropic.com/v1/messages", headers={
                "x-api-key": settings.anthropic_api_key, "anthropic-version": "2023-06-01",
                "content-type": "application/json"}, json={
                "model": settings.anthropic_model, "max_tokens": 1200, "system": SYSTEM,
                "messages": [{"role": "user", "content": f"Format: {kind}, {n_beats} beats.\nTopic: {topic}\nVerified: {verified}\nVerification note: {note}"}]})
            r.raise_for_status()
            data = r.json()
            u = data.get("usage", {})
            budget.charge("anthropic", u.get("input_tokens", 0) / 1e6 * PRICE_IN + u.get("output_tokens", 0) / 1e6 * PRICE_OUT, kind)
            out = _parse(data["content"][0]["text"], verified)
            out["provider"] = "claude"
            return out
        except Exception as e:
            log("warn", "llm", f"Claude failed, using template: {e}")
    return _template(topic, kind, verified, n_beats)
