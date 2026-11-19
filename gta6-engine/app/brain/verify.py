"""News verification. Rule: a 'news' claim needs either an official source or
two independent outlets. Anything else is labelled RUMOR and scripts must say so.
No claim is ever presented as fact without passing this gate."""
from urllib.parse import urlparse

OFFICIAL_DOMAINS = {"rockstargames.com", "take2games.com", "playstation.com", "xbox.com"}
OFFICIAL_ACCOUNTS = ["x.com/rockstargames", "twitter.com/rockstargames", "youtube.com/@rockstargames"]
REPUTABLE_DOMAINS = {"ign.com", "gamespot.com", "polygon.com", "eurogamer.net", "kotaku.com",
                     "theverge.com", "pcgamer.com", "gamesradar.com", "videogameschronicle.com",
                     "bloomberg.com", "reuters.com", "thegamer.com", "dexerto.com", "insider-gaming.com"}
RUMOR_WORDS = ["leak", "rumor", "rumour", "insider", "reportedly", "allegedly", "unconfirmed"]


def _domain(url):
    d = urlparse(url).netloc.lower()
    return d[4:] if d.startswith("www.") else d


def verify(title, urls):
    domains = {_domain(u) for u in urls if u}
    official = [d for d in domains if any(d == o or d.endswith("." + o) for o in OFFICIAL_DOMAINS)]
    official += [u for u in urls if any(a in u.lower().replace("www.", "") for a in OFFICIAL_ACCOUNTS)]
    reputable = [d for d in domains if d in REPUTABLE_DOMAINS]
    rumorish = any(w in title.lower() for w in RUMOR_WORDS)
    if official:
        return {"verified": True, "kind": "news", "note": f"Official source: {official[0]}"}
    if len(reputable) >= 2 and not rumorish:
        return {"verified": True, "kind": "news", "note": f"Confirmed by {len(reputable)} outlets: {', '.join(sorted(reputable))}"}
    note = "Unverified — must be framed as rumor/speculation" if domains else "No sources — cannot be used as news"
    return {"verified": False, "kind": "rumor", "note": note}
