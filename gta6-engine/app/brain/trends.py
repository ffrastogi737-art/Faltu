"""Trend research. Sources are pluggable; each returns dicts:
{title, urls, signals, published_at, source}. All are free-tier.

- youtube: YouTube Data API search (needs YOUTUBE_API_KEY, free 10k units/day)
- rss: any news RSS feeds (NEWS_RSS_FEEDS)
- evergreen: built-in GTA 6 guide ideas so the long-form engine never starves
"""
import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from ..config import settings
from ..db import SessionLocal, Topic, log
from .scoring import score_topic
from .verify import verify

EVERGREEN = [
    "GTA 6 map size compared to every GTA game",
    "GTA 6 Leonida: every real Florida location explained",
    "GTA 6 best ways to make money early (based on confirmed features)",
    "GTA 6 vs GTA 5: every confirmed difference",
    "GTA 6 trailer details you missed",
    "GTA 6 Jason and Lucia: what we know so far",
    "GTA 6 editions and pre-order guide",
    "GTA 6 hidden easter eggs in the trailers",
]


def fingerprint(title):
    norm = re.sub(r"[^a-z0-9 ]", "", title.lower())
    norm = " ".join(sorted(set(w for w in norm.split() if len(w) > 2)))
    return hashlib.sha256(norm.encode()).hexdigest()[:32]


def from_youtube(query="GTA 6", client=None):
    if not settings.youtube_api_key:
        return []
    c = client or httpx.Client(timeout=20)
    r = c.get("https://www.googleapis.com/youtube/v3/search", params={
        "part": "snippet", "q": query, "type": "video", "order": "viewCount",
        "publishedAfter": datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat().replace("+00:00", "Z"),
        "maxResults": 25, "key": settings.youtube_api_key})
    r.raise_for_status()
    items = r.json().get("items", [])
    ids = ",".join(i["id"]["videoId"] for i in items)
    stats = {}
    if ids:
        s = c.get("https://www.googleapis.com/youtube/v3/videos", params={"part": "statistics,snippet", "id": ids, "key": settings.youtube_api_key})
        s.raise_for_status()
        stats = {v["id"]: v for v in s.json().get("items", [])}
    out = []
    for vid, v in stats.items():
        pub = datetime.fromisoformat(v["snippet"]["publishedAt"].replace("Z", "+00:00"))
        hours = max((datetime.now(timezone.utc) - pub).total_seconds() / 3600, 1)
        views = int(v["statistics"].get("viewCount", 0))
        out.append({"title": v["snippet"]["title"], "urls": [f"https://youtube.com/watch?v={vid}"],
                    "signals": {"views_per_hour": views / hours, "search_volume": views, "competing_videos": len(items)},
                    "published_at": pub, "source": "youtube"})
    return out


def parse_rss(xml_text, source="rss"):
    out = []
    root = ET.fromstring(xml_text)
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        if "gta" not in title.lower():
            continue
        pub = None
        if item.findtext("pubDate"):
            try:
                pub = parsedate_to_datetime(item.findtext("pubDate"))
            except Exception:
                pub = None
        out.append({"title": title, "urls": [link], "signals": {}, "published_at": pub, "source": source})
    return out


def from_rss(client=None):
    c = client or httpx.Client(timeout=20, follow_redirects=True)
    out = []
    for url in settings.news_rss_feeds:
        try:
            out += parse_rss(c.get(url).text, source=url)
        except Exception as e:
            log("warn", "brain", f"RSS failed {url}: {e}")
    return out


def from_evergreen():
    return [{"title": t, "urls": [], "signals": {}, "published_at": None, "source": "evergreen", "kind": "guide"} for t in EVERGREEN]


def merge_sources(items):
    """Same story from several outlets -> one topic with all URLs (helps verification)."""
    merged = {}
    for it in items:
        fp = fingerprint(it["title"])
        if fp in merged:
            merged[fp]["urls"] = list(dict.fromkeys(merged[fp]["urls"] + it["urls"]))
        else:
            merged[fp] = dict(it)
    return list(merged.values())


def ingest(items):
    """Score, verify and store topics. Returns number of new topics."""
    new = 0
    with SessionLocal() as s:
        for it in merge_sources(items):
            fp = fingerprint(it["title"])
            if s.query(Topic).filter_by(fingerprint=fp).first():
                continue
            scores, total = score_topic(it["title"], it.get("signals"), it.get("published_at"))
            if it.get("kind") == "guide":
                v = {"verified": True, "kind": "guide", "note": "Evergreen guide — must only use confirmed facts"}
            else:
                v = verify(it["title"], it["urls"])
            s.add(Topic(title=it["title"], fingerprint=fp, source=it.get("source"), source_urls=it["urls"],
                        signals=it.get("signals") or {}, scores=scores, total_score=total,
                        verified=v["verified"], verification_note=v["note"], kind=v["kind"]))
            new += 1
        s.commit()
    return new


def research():
    items = from_evergreen()
    for fn in (from_youtube, from_rss):
        try:
            items += fn()
        except Exception as e:
            log("error", "brain", f"{fn.__name__}: {e}")
    n = ingest(items)
    log("info", "brain", f"Research done: {len(items)} items, {n} new topics")
    return n
