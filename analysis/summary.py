"""Summary generator — "What's happening right now" in crypto.

Pulls together all analysis layers into a single structured output.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from utils import utcnow

import db
from models import DivergenceAlert, IntelligenceAlert, MarketMood, VelocityAlert

from .divergence import detect_divergences
from .narratives import get_narrative_rankings, update_narratives
from .smart_money import detect_smart_money_signals
from .velocity import detect_velocity_alerts
from output.intelligence_brief import generate_brief


@dataclass
class CryptoSummary:
    """The complete 'what's happening' output."""

    timestamp: datetime
    market_mood: MarketMood | None

    # What's trending right now
    trending_coins: list[dict] = field(default_factory=list)

    # Narratives sorted by momentum
    narratives: list[dict] = field(default_factory=list)

    # What's accelerating unusually fast
    velocity_alerts: list[VelocityAlert] = field(default_factory=list)

    # Where layers of the information chain disagree
    divergence_alerts: list[DivergenceAlert] = field(default_factory=list)

    # Top movers by price
    top_gainers: list[dict] = field(default_factory=list)
    top_losers: list[dict] = field(default_factory=list)

    # Smart money intelligence alerts
    intelligence_alerts: list[IntelligenceAlert] = field(default_factory=list)


def generate_summary(window_hours: int = 24) -> CryptoSummary:
    """Generate a full intelligence summary from all available data."""
    now = utcnow()

    # Bulk-fetch all coins once to avoid N+1 queries
    all_coins = db.get_all_coins()
    coin_map = {c.id: c for c in all_coins}

    # Update narrative momentum scores
    update_narratives(window_hours)

    # Get components
    mood = db.get_latest_mood()
    trending = _get_trending(now, coin_map)
    narratives = get_narrative_rankings()
    velocity = detect_velocity_alerts(window_hours)
    divergences = detect_divergences(window_hours)
    gainers, losers = _get_top_movers(now, coin_map)

    # Smart money intelligence
    smart_money_alerts = detect_smart_money_signals(window_hours)
    for alert in smart_money_alerts:
        alert.brief = generate_brief(alert, window_hours)

    # Persist intelligence alerts
    if smart_money_alerts:
        db.insert_intelligence_alerts(smart_money_alerts)

    return CryptoSummary(
        timestamp=now,
        market_mood=mood,
        trending_coins=trending,
        narratives=narratives,
        velocity_alerts=velocity[:20],  # Top 20
        divergence_alerts=divergences[:15],  # Top 15
        top_gainers=gainers[:10],
        top_losers=losers[:10],
        intelligence_alerts=smart_money_alerts[:20],
    )


def _get_trending(now: datetime, coin_map: dict) -> list[dict]:
    """Get currently trending coins across all sources."""
    since = now - timedelta(hours=1)
    trending = db.get_trending_since(since)

    # Deduplicate by coin_id, keeping the best rank per source
    seen = {}
    for t in trending:
        key = t.coin_id
        if key not in seen or t.rank < seen[key]["rank"]:
            coin = coin_map.get(t.coin_id)
            seen[key] = {
                "coin_id": t.coin_id,
                "name": coin.name if coin else t.coin_id,
                "symbol": coin.symbol if coin else "",
                "rank": t.rank,
                "source": t.source,
                "score": t.score,
            }

    return sorted(seen.values(), key=lambda x: x["rank"])


def _get_top_movers(now: datetime, coin_map: dict) -> tuple[list[dict], list[dict]]:
    """Get top gainers and losers from the latest snapshot."""
    since = now - timedelta(minutes=30)
    snapshots = db.get_all_snapshots_since(since)

    # Get latest snapshot per coin
    latest = {}
    for s in snapshots:
        if s.coin_id not in latest or s.timestamp > latest[s.coin_id].timestamp:
            latest[s.coin_id] = s

    movers = []
    for coin_id, snap in latest.items():
        if snap.price_change_24h is not None and snap.market_cap > 1_000_000:  # Filter dust
            coin = coin_map.get(coin_id)
            movers.append({
                "coin_id": coin_id,
                "name": coin.name if coin else coin_id,
                "symbol": coin.symbol if coin else "",
                "price": snap.price_usd,
                "change_24h": snap.price_change_24h,
                "volume": snap.volume_24h,
                "market_cap": snap.market_cap,
            })

    movers.sort(key=lambda x: x["change_24h"], reverse=True)

    gainers = [m for m in movers if m["change_24h"] > 0][:10]
    losers = [m for m in movers if m["change_24h"] < 0]
    losers.sort(key=lambda x: x["change_24h"])
    losers = losers[:10]

    return gainers, losers
