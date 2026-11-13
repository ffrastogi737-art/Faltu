# Market Intelligence Agent (Indian equities)

Researches NSE/BSE stocks every trading day, ranks bullish and bearish candidates, writes trade
setups with entry / targets / stop, records every prediction in a ledger that cannot be edited,
and later scores those predictions against what actually happened.

**It is a research tool. It never places orders, it has no broker connection, and nothing it says
is a guarantee or investment advice.**

Built phone-first: the dashboard is laid out for a phone screen and reports and alerts arrive on Telegram.

## What works today (tested)

| Area | Status |
|---|---|
| Indicators: RSI, MACD, EMA 9/20/50/200, SMA 20/50/200, 20-session VWAP, Supertrend, ATR, ADX, Bollinger, relative volume, gaps, support/resistance, Fibonacci | tested |
| Models: technical, quantitative, market regime (calibrated); fundamentals and news (overlays that can veto a call) | tested |
| Probabilities = observed frequency in finished past predictions with a similar score, refit walk-forward | tested, incl. a no-signal control |
| 7 rankings with published rules; lists stay short or empty when few stocks qualify | tested |
| Positional trade setups (ATR-based), short-selling restrictions shown on every SELL | tested |
| Prediction ledger, append-only by database trigger (SQLite and PostgreSQL) | tested on both |
| Outcome scoring: win rate, average return, profit factor, drawdown, Sharpe, Brier, by sector, vs NIFTY, MFE/MAE | tested |
| Walk-forward backtest with next-open entry, costs, and a test proving it cannot see the future | tested |
| Data checks: duplicates, impossible OHLC, gaps, stale data, suspicious jumps; partial bars of a running session ignored | tested |
| Daily schedule in IST on trading days, Telegram messages, PDF report, API, dashboard | tested (Telegram and data sources against mocks) |

## What is not done, and why

- **Live data was never reached from the build environment** (its network blocks Yahoo, NSE and news sites).
  Connectors are tested against recorded-shape responses only. Expect to fix a parser on first real run.
- **Intraday setups**: none. There is no licensed intraday feed. Monitoring uses delayed quotes.
- **Fundamentals, corporate announcements, earnings dates, bulk/block deals, economic calendar, F&O list, GIFT Nifty**:
  no free source with clear usage rights, so these load from CSV files you supply (formats below). Without them the
  long-term list is empty and the report says so.
- **LLM provider**: not included. News sentiment is a word list. No LLM output is ever used as a probability.
- **Survivorship bias**: the backtest uses the symbols you give it. With today's index members only, results are optimistic.
- **Holidays**: weekends are known; exchange holidays need `data/holidays.csv` or `ENABLE_NSE_API=true`. Until then the
  report carries a warning. Muhurat and other special sessions are not modelled.
- **Telegram** is send-only (no chat commands). **Docker Compose** file is untested.
- Fundamentals and news do not change the probability (there is no point-in-time history to calibrate them on);
  they can only block or flag a call.

## Run it

```bash
pip install -e ".[dev]"        # add ,postgres for PostgreSQL
cp .env.example .env           # then: set -a; . ./.env; set +a
python -m pytest               # 39 tests, no network needed
python -m marketintel demo     # fills the DB with clearly labelled SYNTHETIC data
python -m marketintel serve    # dashboard at http://127.0.0.1:8000
python -m marketintel schedule # the daily loop
python -m marketintel backtest # walk-forward test on stored prices
```

**Phone only (Android + Termux)** — not tested by the author of this code:
`pkg install python python-numpy python-pandas python-pillow`, then `pip install -e .` in this folder, run
`python -m marketintel schedule` and `serve` in two Termux sessions, open `http://127.0.0.1:8000` in Chrome.
The dashboard is pre-built in `dashboard/dist`, so Node is not needed. Android may stop Termux in the background
(use `termux-wake-lock`); a small cloud server with `docker compose up -d` is more reliable for a daily schedule.

**Telegram**: create a bot with @BotFather, put its token in `TELEGRAM_BOT_TOKEN`, send the bot one message, and put
your chat id in `TELEGRAM_CHAT_ID`.

## Daily schedule (IST, NSE trading days only)

| Time | Job |
|---|---|
| 07:00 | load CSV files, index lists, global markets, FII/DII, news |
| 08:00 | pre-market summary |
| 08:30 | refresh all prices |
| 09:00 | preliminary report + PDF + Telegram; predictions recorded |
| 09:15–15:30 | every 15 min: stop / target / ±3% alerts on shortlisted and watchlist stocks |
| 15:45 | closing prices |
| 16:00 | final report, past predictions scored |

## How a call is made

1. `score = 0.5 × technical + 0.3 × quant + 0.2 × regime` (fixed weights; each part is in [-1, 1]).
2. Every past day of every stock gets the same score and its real outcome (buy next open, sell at the close
   `HORIZON_DAYS` later; "up"/"down" means beyond half the stock's usual move for that period).
3. Today's score is looked up among ten equal-sized score buckets of those finished cases: the share that went
   up, down, or nowhere is the probability. Fewer than 100 cases in the bucket: no probability, no call.
4. BUY if P(up) ≥ `MIN_PROB` and P(up) − P(down) ≥ `MIN_EDGE`; SELL the mirror; else WAIT.
5. Weak fundamentals or strongly negative news against a BUY (or the reverse) turn it into WAIT with the conflict shown.
6. Stale, missing or suspicious price data: the stock is skipped. Bad benchmark data: everything is WAIT.

"Confidence" is an evidence-strength index (0–100), not a probability.

## CSV files in `DATA_DIR` (all optional)

- `fundamentals.csv`: `symbol,as_of,source` + any of `revenue_growth,profit_growth,qoq_profit_growth,eps,roe,roce,debt_to_equity,operating_margin,operating_cash_flow,pe,pb,promoter_holding,pledged_pct` (percentages as numbers)
- `events.csv`: `date,type,title,source` + optional `symbol,url`
- `holidays.csv`: `date` + optional `description`
- `fno.csv`: `symbol`

## Data licensing

Yahoo Finance and nseindia.com are not licensed exchange feeds. They are optional, off-switchable, rate-limited,
and suitable for personal research only. Do not redistribute their data. For anything commercial, add a licensed
vendor connector in `marketintel/sources.py`.

## Layout

```
marketintel/   config, sources (connectors), validate, tradingdays, indicators, models (5 scorers),
               engine (calibration, decision, setups, backtest, metrics), pipeline (jobs + ledger),
               delivery (Telegram, PDF), api (FastAPI), __main__ (CLI + schedule), db, synthetic
dashboard/     React + TypeScript (Vite); built files in dashboard/dist
tests/         pytest
```
