"""Divergence detection — find when layers of the information chain disagree.

This is where the real intelligence lives. A coin that's trending on social
but has no on-chain activity is a different signal than one with whale
accumulation but zero social buzz.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from utils import utcnow

import db
from models import DivergenceAlert


def detect_divergences(window_hours: int = 24) -> list[DivergenceAlert]:
    """
    Scan for divergences between social, on-chain, and market layers.

    Returns alerts sorted by severity (high first).
    """
    now = utcnow()
    window = timedelta(hours=window_hours)

    # Gather data across all layers
    social_data = _aggregate_social(now, window)
    onchain_data = _aggregate_onchain(now, window)
    market_data = _aggregate_market(now, window)

    alerts = []

    # Get all coin_ids that appear in any layer
    all_coins = set(social_data.keys()) | set(onchain_data.keys()) | set(market_data.keys())

    for coin_id in all_coins:
        # Skip market-wide signals and DEX-specific tokens for now
        if coin_id.startswith("_") or coin_id.startswith("dex:"):
            continue

        social = social_data.get(coin_id, {"mentions": 0, "sentiment": 0})
        onchain = onchain_data.get(coin_id, {"tvl_change": 0, "has_data": False})
        market = market_data.get(coin_id, {"volume_change": 0, "price_change": 0})

        coin_alerts = _check_divergences(coin_id, social, onchain, market, now)
        alerts.extend(coin_alerts)

    # Sort by severity
    severity_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: severity_order.get(a.severity, 1))

    return alerts


def _aggregate_social(now: datetime, window: timedelta) -> dict:
    """Aggregate social signals per coin over the window."""
    signals = db.get_all_social_signals_since(now - window)

    result = defaultdict(lambda: {"mentions": 0, "sentiment": 0, "count": 0})
    for s in signals:
        result[s.coin_id]["mentions"] += s.mentions
        if s.sentiment_score is not None:
            result[s.coin_id]["sentiment"] += s.sentiment_score
            result[s.coin_id]["count"] += 1

    # Normalize sentiment
    for coin_id in result:
        count = result[coin_id]["count"]
        if count > 0:
            result[coin_id]["sentiment"] /= count

    return dict(result)


def _aggregate_onchain(now: datetime, window: timedelta) -> dict:
    """Aggregate on-chain metrics per coin over the window."""
    metrics = db.get_all_onchain_since(now - window)

    result = defaultdict(lambda: {"tvl_change": 0, "has_data": False, "latest_tvl": 0})

    # Group by coin and get latest TVL + change metrics
    for m in metrics:
        result[m.coin_id]["has_data"] = True
        if m.metric_type == "tvl":
            result[m.coin_id]["latest_tvl"] = m.value
        elif m.metric_type == "tvl_change_1d":
            result[m.coin_id]["tvl_change"] = m.value

    return dict(result)


def _aggregate_market(now: datetime, window: timedelta) -> dict:
    """Aggregate market data per coin over the window."""
    snapshots = db.get_all_snapshots_since(now - window)

    # Get earliest and latest snapshot per coin
    first = {}
    last = {}

    for s in snapshots:
        if s.coin_id not in first or s.timestamp < first[s.coin_id].timestamp:
            first[s.coin_id] = s
        if s.coin_id not in last or s.timestamp > last[s.coin_id].timestamp:
            last[s.coin_id] = s

    result = {}
    for coin_id in last:
        latest = last[coin_id]
        earliest = first.get(coin_id)

        volume_change = 0
        price_change = latest.price_change_24h or 0

        if earliest and earliest.volume_24h > 0:
            volume_change = ((latest.volume_24h - earliest.volume_24h) / earliest.volume_24h) * 100

        result[coin_id] = {
            "volume_change": volume_change,
            "price_change": price_change,
            "volume": latest.volume_24h,
        }

    return result


def _check_divergences(
    coin_id: str,
    social: dict,
    onchain: dict,
    market: dict,
    now: datetime,
) -> list[DivergenceAlert]:
    """Check for specific divergence patterns between layers."""
    alerts = []

    mentions = social.get("mentions", 0)
    sentiment = social.get("sentiment", 0)
    tvl_change = onchain.get("tvl_change", 0)
    has_onchain = onchain.get("has_data", False)
    vol_change = market.get("volume_change", 0)
    price_change = market.get("price_change", 0)

    # ── Pattern 1: Hype without substance ──
    # High social mentions but no on-chain activity or volume
    if mentions >= 10 and has_onchain and tvl_change < -5 and vol_change < 0:
        alerts.append(
            DivergenceAlert(
                timestamp=now,
                coin_id=coin_id,
                alert_type="hype_no_substance",
                description=f"Social mentions ({mentions}) high but TVL dropping ({tvl_change:.1f}%) and volume declining",
                social_signal=float(mentions),
                onchain_signal=tvl_change,
                severity="high" if mentions >= 50 else "medium",
            )
        )

    # ── Pattern 2: Stealth accumulation ──
    # Low social but on-chain activity is up
    if mentions <= 3 and has_onchain and tvl_change > 10:
        alerts.append(
            DivergenceAlert(
                timestamp=now,
                coin_id=coin_id,
                alert_type="stealth_accumulation",
                description=f"Quiet socially ({mentions} mentions) but TVL growing {tvl_change:.1f}% — possible smart money",
                social_signal=float(mentions),
                onchain_signal=tvl_change,
                severity="high" if tvl_change > 25 else "medium",
            )
        )

    # ── Pattern 3: Smart money buying fear ──
    # Negative sentiment + positive on-chain/volume
    if sentiment < -0.3 and (tvl_change > 5 or vol_change > 20):
        alerts.append(
            DivergenceAlert(
                timestamp=now,
                coin_id=coin_id,
                alert_type="smart_money_buying_fear",
                description=f"Sentiment negative ({sentiment:.2f}) but activity rising (TVL: {tvl_change:.1f}%, Vol: {vol_change:.1f}%)",
                social_signal=sentiment,
                onchain_signal=tvl_change,
                severity="medium",
            )
        )

    # ── Pattern 4: Dying project signal ──
    # Price/volume dropping significantly while social is still active
    if mentions >= 5 and price_change < -15 and vol_change < -20:
        alerts.append(
            DivergenceAlert(
                timestamp=now,
                coin_id=coin_id,
                alert_type="dying_project",
                description=f"Still being discussed ({mentions} mentions) but price down {price_change:.1f}% and volume collapsing",
                social_signal=float(mentions),
                onchain_signal=price_change,
                severity="high" if price_change < -25 else "medium",
            )
        )

    return alerts
