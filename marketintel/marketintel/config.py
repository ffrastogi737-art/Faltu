"""All settings come from environment variables. Secrets never live in code."""
import os
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")

# name -> Yahoo symbol. GIFT Nifty has no reliable free feed, so add one here only if you have it.
DEFAULT_MACRO = ("NIFTY 50=^NSEI,India VIX=^INDIAVIX,S&P 500=^GSPC,Nasdaq=^IXIC,Dow Jones=^DJI,"
                 "Nikkei 225=^N225,Hang Seng=^HSI,USD/INR=INR=X,Crude WTI=CL=F,Brent=BZ=F,Gold=GC=F")


def _b(name, default):
    return os.environ.get(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _pairs(raw):
    return dict(p.split("=", 1) for p in raw.split(",") if "=" in p)


@dataclass
class Settings:
    database_url: str = field(default_factory=lambda: os.environ.get("DATABASE_URL", "sqlite:///marketintel.db"))
    telegram_token: str = field(default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    telegram_chat: str = field(default_factory=lambda: os.environ.get("TELEGRAM_CHAT_ID", ""))
    api_key: str = field(default_factory=lambda: os.environ.get("API_KEY", ""))
    # Yahoo Finance is an unofficial research source: personal research use only, no redistribution.
    enable_yahoo: bool = field(default_factory=lambda: _b("ENABLE_YAHOO", True))
    # nseindia.com JSON endpoints are not a licensed feed. Off unless you have the right to use them.
    enable_nse_api: bool = field(default_factory=lambda: _b("ENABLE_NSE_API", False))
    enable_nse_lists: bool = field(default_factory=lambda: _b("ENABLE_NSE_LISTS", True))
    exchange: str = field(default_factory=lambda: os.environ.get("EXCHANGE", "NSE"))  # NSE or BSE
    indices: list = field(default_factory=lambda: os.environ.get("INDICES", "NIFTY 500").split(","))
    benchmark: str = field(default_factory=lambda: os.environ.get("BENCHMARK", "^NSEI"))
    macro: dict = field(default_factory=lambda: _pairs(os.environ.get("MACRO_SYMBOLS", DEFAULT_MACRO)))
    news_feeds: list = field(default_factory=lambda: [u for u in os.environ.get("NEWS_FEEDS", "").split(",") if u])
    data_dir: str = field(default_factory=lambda: os.environ.get("DATA_DIR", "data"))
    report_dir: str = field(default_factory=lambda: os.environ.get("REPORT_DIR", "reports"))
    history_range: str = field(default_factory=lambda: os.environ.get("HISTORY_RANGE", "5y"))
    requests_per_sec: float = field(default_factory=lambda: float(os.environ.get("REQUESTS_PER_SEC", "2")))
    # model
    horizon: int = field(default_factory=lambda: int(os.environ.get("HORIZON_DAYS", "5")))
    min_bars: int = 300
    min_prob: float = field(default_factory=lambda: float(os.environ.get("MIN_PROB", "0.40")))
    min_edge: float = field(default_factory=lambda: float(os.environ.get("MIN_EDGE", "0.08")))
    min_bin: int = 100           # calibration samples needed in a score bucket before a probability is shown
    max_stale_sessions: int = 0  # last bar must be the latest completed session
    news_max_age_days: int = 3
    cost_bps: float = field(default_factory=lambda: float(os.environ.get("COST_BPS", "20")))  # round trip
    top_n: int = 10
