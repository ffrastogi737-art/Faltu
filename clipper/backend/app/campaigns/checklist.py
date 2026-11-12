"""Checks a clip/submission against a campaign's requirements. Things a program cannot verify are
marked manual and left for the user to confirm."""
import re
from datetime import datetime
from typing import Optional


def run_checklist(campaign: dict, rules: list[dict], *, clip_duration: Optional[float] = None,
                  platform: Optional[str] = None, caption: str = "", manual_checks: Optional[dict] = None,
                  now: Optional[datetime] = None) -> list[dict]:
    """Each item: {label, status: pass|fail|manual|unknown, detail, rule_id?}."""
    items: list[dict] = []
    manual_checks = manual_checks or {}

    def add(label: str, ok: Optional[bool], detail: str = "", **extra) -> None:
        items.append({"label": label, "status": "unknown" if ok is None else "pass" if ok else "fail", "detail": detail, **extra})

    lo, hi = campaign.get("min_duration"), campaign.get("max_duration")
    if lo is not None or hi is not None:
        want = f"{lo or 0:g}s to {f'{hi:g}s' if hi is not None else 'any length'}"
        if clip_duration is None:
            add(f"Clip length {want}", None, "No clip attached")
        else:
            add(f"Clip length {want}", (lo is None or clip_duration >= lo) and (hi is None or clip_duration <= hi),
                f"Clip is {clip_duration:.1f}s")
    allowed = [p.lower() for p in campaign.get("allowed_platforms") or []]
    if allowed:
        add("Platform is allowed", None if not platform else platform.lower() in allowed,
            f"{platform or 'No platform chosen'}; allowed: {', '.join(allowed)}")
    if campaign.get("deadline"):
        add("Before the deadline", (now or datetime.utcnow()) <= campaign["deadline"], f"Deadline {campaign['deadline']:%Y-%m-%d %H:%M} UTC")
    cap = caption.lower()
    tags = {t.lower() for t in re.findall(r"#[^\s#]+", caption)}
    for r in rules:
        val = r["value"].strip()
        if r["kind"] == "hashtag":
            tag = "#" + val.lstrip("#").lower()
            add(f"Caption has {tag}", tag in tags, "" if caption else "No caption entered yet")
        elif r["kind"] == "caption":
            add(f"Caption includes \"{val}\"", val.lower() in cap, "" if caption else "No caption entered yet")
        else:  # branding and free-form rules need human eyes
            done = bool(manual_checks.get(str(r["id"])))
            items.append({"label": val, "status": "pass" if done else "manual", "rule_id": r["id"],
                          "detail": "Confirmed by you" if done else "Check this yourself, then tick it"})
    return items
