"""Central config. Everything comes from environment variables so the same code
runs locally, in GitHub Actions, and on a cloud web host."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _env(name, default=None):
    v = os.environ.get(name)
    return v if v not in (None, "") else default


class Settings:
    def __init__(self):
        self.database_url = _env("DATABASE_URL", f"sqlite:///{ROOT / 'data' / 'engine.db'}")
        self.media_dir = Path(_env("MEDIA_DIR", str(ROOT / "data" / "media")))
        self.dashboard_token = _env("DASHBOARD_TOKEN")  # no default: dashboard stays locked until a strong one is set
        self.public_url = (_env("PUBLIC_URL", "") or "").rstrip("/")  # for the YouTube OAuth redirect
        self.gh_token = _env("GH_DISPATCH_TOKEN")  # fine-grained PAT, Actions:write on one repo -> "run worker now"
        self.gh_repo = _env("GH_REPO")             # owner/name
        self.inline_worker = _env("INLINE_WORKER", "false").lower() == "true"  # render inside the web process (off: too small)
        # AI providers (all optional — engine falls back to offline templates)
        self.anthropic_api_key = _env("ANTHROPIC_API_KEY")
        self.anthropic_model = _env("ANTHROPIC_MODEL", "claude-haiku-4-5")
        # Optional OpenAI-compatible LLM (Groq / Gemini-compat / Ollama / OpenRouter). YOU declare it free; we cap calls/day.
        self.llm_base_url = (_env("LLM_BASE_URL", "") or "").rstrip("/")
        self.llm_api_key = _env("LLM_API_KEY")
        self.llm_model = _env("LLM_MODEL")
        self.llm_max_calls_per_day = int(_env("LLM_MAX_CALLS_PER_DAY", "20"))
        self.tts_provider = _env("TTS_PROVIDER", "silent")  # silent | edge
        self.tts_voice = _env("TTS_VOICE", "en-IN-PrabhatNeural")
        # Research sources
        self.youtube_api_key = _env("YOUTUBE_API_KEY")
        self.news_rss_feeds = [u for u in _env("NEWS_RSS_FEEDS", "").split(",") if u]
        # YouTube OAuth (publishing)
        self.yt_client_id = _env("YT_CLIENT_ID")
        self.yt_client_secret = _env("YT_CLIENT_SECRET")
        self.yt_refresh_token = _env("YT_REFRESH_TOKEN")
        # Safety / business controls
        self.daily_budget_usd = float(_env("DAILY_BUDGET_USD", "0"))  # 0 = no paid calls at all
        self.require_approval = _env("REQUIRE_APPROVAL", "true").lower() != "false"
        self.max_uploads_per_day = int(_env("MAX_UPLOADS_PER_DAY", "3"))
        self.max_job_attempts = int(_env("MAX_JOB_ATTEMPTS", "3"))
        self.media_dir.mkdir(parents=True, exist_ok=True)

    def token_ok(self):
        return bool(self.dashboard_token) and len(self.dashboard_token) >= 12 and self.dashboard_token != "change-me"

    def missing_credentials(self):
        """What the config page shows: which integrations are not yet usable."""
        checks = {
            "ANTHROPIC_API_KEY": (self.anthropic_api_key, "AI script writing (else offline templates)"),
            "LLM_BASE_URL": (self.llm_base_url and self.llm_model, "Free OpenAI-compatible LLM for scripts (LLM_BASE_URL + LLM_API_KEY + LLM_MODEL)"),
            "YOUTUBE_API_KEY": (self.youtube_api_key, "Trend research via YouTube Data API"),
            "NEWS_RSS_FEEDS": (self.news_rss_feeds, "News verification sources (comma-separated RSS URLs)"),
            "YT_CLIENT_ID": (self.yt_client_id, "YouTube upload OAuth client"),
            "YT_CLIENT_SECRET": (self.yt_client_secret, "YouTube upload OAuth client secret"),
            "YT_REFRESH_TOKEN": (self.yt_refresh_token, "YouTube upload refresh token"),
            "DASHBOARD_TOKEN": (self.token_ok(), "Dashboard login token (>=12 chars; dashboard is locked without it)"),
            "PUBLIC_URL": (self.public_url, "Dashboard https URL (YouTube OAuth redirect)"),
            "GH_DISPATCH_TOKEN": (self.gh_token and self.gh_repo, "'Run worker now' button (GH_DISPATCH_TOKEN + GH_REPO)"),
        }
        return [{"name": k, "purpose": p, "set": bool(v)} for k, (v, p) in checks.items()]


settings = Settings()
