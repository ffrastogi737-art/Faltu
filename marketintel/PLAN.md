# Implementation plan

Order was chosen so each step is testable before the next depends on it.

| # | Step | State |
|---|---|---|
| 1 | Inspect repo; new self-contained `marketintel/` folder, existing apps untouched | done |
| 2 | Indicators + no-look-ahead test | done |
| 3 | Scoring models (technical, quant, regime, fundamental, news) | done |
| 4 | Calibration, decision rules, setups, trade simulation, metrics | done |
| 5 | Walk-forward backtest + future-blindness test + no-signal control | done |
| 6 | Storage with append-only ledger (SQLite + PostgreSQL) | done |
| 7 | Connectors with rate limit, retries, timestamps; validation | done (mock-tested only) |
| 8 | Pipeline jobs, outcome scoring, alerts, PDF, Telegram | done |
| 9 | API + phone-first dashboard | done |
| 10 | Schedule on trading days | done |
| 11 | First live run against real sources; fix parsers | **next, needs open network** |
| 12 | Licensed data: fundamentals, intraday, point-in-time index membership | needs a vendor decision |
| 13 | Calibrate fundamentals/news once the ledger has months of history | later |
| 14 | Optional LLM for news summaries (never for probabilities) | later |
