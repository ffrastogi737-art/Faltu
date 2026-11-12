"""Earnings maths and CSV import. Estimates are always labelled with the view count they came from."""
import csv
import io
from datetime import datetime
from typing import Optional


def estimate(campaign: dict, views: int) -> float:
    """Estimated payout for one submission under the campaign's payment model. Never exceeds max_payout."""
    model = campaign.get("payment_model")
    if model == "per_1000_views":
        amount = max(0, views) / 1000 * float(campaign.get("rate_per_1000") or 0)
    elif model == "flat_per_clip":
        amount = float(campaign.get("flat_rate") or 0)
    else:
        amount = 0.0
    cap = campaign.get("max_payout")
    return round(min(amount, cap) if cap is not None else amount, 2)


def latest_views(metrics: list[dict]) -> dict:
    """View counts are cumulative, so the newest record of each kind is the current figure."""
    out: dict[str, Optional[int]] = {"self_reported": None, "verified": None}
    for m in sorted(metrics, key=lambda m: (m["recorded_at"], m["id"])):
        out[m["kind"]] = m["views"]
    return out


def submission_estimate(campaign: dict, metrics: list[dict]) -> dict:
    v = latest_views(metrics)
    basis = "verified" if v["verified"] is not None else "self_reported" if v["self_reported"] is not None else "none"
    views = v[basis] if basis != "none" else 0
    return {"self_reported_views": v["self_reported"] or 0, "verified_views": v["verified"] or 0,
            "estimate_basis": basis, "estimated": estimate(campaign, views or 0)}


def _date(value: str) -> datetime:
    value = value.strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    raise ValueError(f"unrecognised date '{value}' (use YYYY-MM-DD)")


def parse_csv(kind: str, text: str) -> tuple[list[dict], list[str]]:
    """kind 'metrics': submission_id,views,kind,date,note   kind 'payments': campaign_id,amount,date,note,submission_id
    Returns (good rows, per-line error messages). Bad lines are reported, never guessed at."""
    rows, errors = [], []
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    need = {"metrics": {"submission_id", "views"}, "payments": {"campaign_id", "amount"}}[kind]
    fields = {f.strip().lower() for f in reader.fieldnames or []}
    if not need <= fields:
        return [], [f"Missing column(s): {', '.join(sorted(need - fields))}"]
    for n, raw in enumerate(reader, start=2):
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        try:
            when = _date(r["date"]) if r.get("date") else None
            if kind == "metrics":
                mk = r.get("kind") or "self_reported"
                if mk not in ("self_reported", "verified"):
                    raise ValueError("kind must be self_reported or verified")
                views = int(r["views"])
                if views < 0:
                    raise ValueError("views cannot be negative")
                rows.append({"submission_id": int(r["submission_id"]), "views": views, "kind": mk,
                             "recorded_at": when, "note": r.get("note", "")})
            else:
                amount = float(r["amount"])
                if amount <= 0:
                    raise ValueError("amount must be positive")
                rows.append({"campaign_id": int(r["campaign_id"]), "amount": amount, "received_at": when,
                             "note": r.get("note", ""), "submission_id": int(r["submission_id"]) if r.get("submission_id") else None})
        except (ValueError, KeyError) as e:
            errors.append(f"Line {n}: {e}")
    return rows, errors
