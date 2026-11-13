"""Telegram notifications and the daily PDF. Every message carries a timestamp and its data source."""
import logging
import os

import httpx
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlalchemy import insert, select

from . import DISCLAIMER
from .db import notifications, now, rows

log = logging.getLogger("marketintel")


def notify(eng, cfg, key, kind, text, source, transport=None):
    """Send once per key. Without Telegram credentials the message is only stored (and shown on the dashboard)."""
    if rows(eng, select(notifications.c.key).where(notifications.c.key == key)):
        return False
    body = f"[{kind}] {text}\n{now()} IST | source: {source}\nResearch only, not investment advice."
    sent = False
    if cfg.telegram_token and cfg.telegram_chat:
        try:
            r = httpx.Client(transport=transport, timeout=15).post(
                f"https://api.telegram.org/bot{cfg.telegram_token}/sendMessage",
                json={"chat_id": cfg.telegram_chat, "text": body[:4000]})
            sent = r.status_code == 200
            if not sent:
                log.error("telegram send failed: HTTP %s", r.status_code)
        except httpx.HTTPError as e:
            log.error("telegram send failed: %s", type(e).__name__)
    with eng.begin() as c:
        c.execute(insert(notifications), {"key": key, "created_at": now(), "kind": kind, "text": body, "sent": sent})
    return True


def pct(x, signed=False):
    return "-" if x is None else f"{x * 100:+.1f}%" if signed else f"{x * 100:.0f}%"


def summary_text(rep):
    r = rep["rankings"]
    line = lambda xs, k: ", ".join(f"{x['symbol']} ({pct(x[k])})" for x in xs[:5]) or "none qualified"
    return (f"{rep['kind'].title()} report for {rep['as_of']}. Regime: {rep['regime']['label']}. "
            f"Scanned {len(rep['stocks'])}, skipped {len(rep['skipped'])}.\n"
            f"Bullish: {line(r['bullish']['items'], 'p_bull')}\nBearish: {line(r['bearish']['items'], 'p_bear')}")


def write_pdf(rep, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    st = getSampleStyleSheet()
    P = lambda t, s="BodyText": Paragraph(str(t), st[s])
    grid = TableStyle([("GRID", (0, 0), (-1, -1), 0.25, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
                       ("FONTSIZE", (0, 0), (-1, -1), 8)])
    tbl = lambda data: Table(data, style=grid, repeatRows=1)
    reg = rep["regime"]
    el = [P(f"Indian Market Research Report: {rep['as_of']} ({rep['kind']})", "Title"),
          P(f"Generated {rep['generated_at']} IST. Sources: {', '.join(rep['sources']) or 'none'}."), P(DISCLAIMER),
          Spacer(1, 8), P("Market regime", "Heading2"),
          P(f"{reg['label']}; high volatility: {reg['high_volatility']}; benchmark close {reg['close']:.2f}"),
          P(f"Scanned {len(rep['stocks'])} stocks, skipped {len(rep['skipped'])} for failed data checks. "
            f"Calibration sample: {rep['calibration']['samples']} finished past predictions.")]
    for w in rep.get("warnings", []):
        el.append(P(f"Warning: {w}"))
    if rep.get("macro"):
        el += [P("Global markets", "Heading2"), tbl([["Name", "Last", "Change", "Date", "Stale"]] + [
            [m["name"], f"{m['last']:.2f}", pct(m["change"], True), m["date"], "YES" if m["stale"] else ""] for m in rep["macro"]])]
    for key, title in (("bullish", "Top bullish"), ("bearish", "Top bearish"), ("breakout", "Breakout candidates"),
                       ("breakdown", "Breakdown candidates"), ("momentum", "Momentum"), ("long_term", "Long-term fundamental"),
                       ("avoid", "Stocks to avoid")):
        rk = rep["rankings"][key]
        el += [P(title, "Heading2"), P(f"Rule: {rk['rule']}")]
        el.append(tbl([["Symbol", "Sector", "Price", "P(up)", "P(down)", "Confidence", "Risk"]] + [
            [x["symbol"], (x["sector"] or "")[:24], f"{x['price']:.2f}", pct(x["p_bull"]), pct(x["p_bear"]), x["confidence"], x["risk"]]
            for x in rk["items"]]) if rk["items"] else P("No stock met this rule today."))
    el.append(P("Trade setups (positional)", "Heading2"))
    el.append(P("Intraday setups are not produced (no intraday feed). Delivery ideas are the long-term list above."))
    for s in rep["setups"]:
        el += [P(f"{s['direction']} {s['symbol']}: last close {s['price']:.2f} ({s['price_date']})", "Heading3"),
               P(f"Entry {s['entry_low']}-{s['entry_high']} | Target 1 {s['target1']} | Target 2 {s['target2']} | Stop {s['stop']} | "
                 f"R:R {s['rr1']} / {s['rr2']} | {s['holding_period']}"),
               P(f"P(up) {pct(s['p_bull'])}, P(down) {pct(s['p_bear'])}, P(flat) {pct(s['p_neutral'])} from {s['samples']} similar past cases. "
                 f"Middle half of past outcomes: {pct(s['expected_return_range'][0], True)} to {pct(s['expected_return_range'][1], True)}."),
               P("Technical: " + "; ".join(s["technical_reasoning"])), P("Fundamental: " + s["fundamental_reasoning"]),
               P("News: " + s["news"]), P("Risks: " + "; ".join(s["risks"])), P("Invalid if: " + "; ".join(s["invalidation"]))]
        if s["short_selling_note"]:
            el.append(P(s["short_selling_note"]))
    perf = rep.get("performance")
    if perf and perf.get("trades"):
        el += [P("Tracked performance", "Heading2"),
               P(f"{perf['trades']} closed calls, win rate {pct(perf['win_rate'])}, average return {pct(perf['avg_return'], True)}, "
                 f"total {pct(perf['total_return'], True)} vs NIFTY {pct(perf['benchmark_return'], True)}, "
                 f"max drawdown {pct(perf['max_drawdown'], True)}, Brier {perf.get('brier')}.")]
    SimpleDocTemplate(path, pagesize=A4, title=f"Market report {rep['as_of']}").build(el)
    return path
