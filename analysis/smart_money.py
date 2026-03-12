"""Smart money analysis — find where informed actors diverge from crowd sentiment.

Core patterns:
1. STEALTH ACCUMULATION: Whales buying, crowd hasn't noticed
2. EMPTY HYPE: Crowd excited, no whale activity
3. SMART MONEY BUYING FEAR: Negative sentiment + whale accumulation
4. SMART MONEY EXIT HYPE: Positive sentiment + whale dumping
"""

import logging
from collections import defaultdict
from datetime import timedelta

import config
import db
from models import IntelligenceAlert
from utils import utcnow

logger = logging.getLogger(__name__)


def detect_smart_money_signals(window_hours: int = None) -> list[IntelligenceAlert]:
    """Cross-reference whale activity against social sentiment to find the gap."""
    window = window_hours or config.SMART_MONEY_WINDOW_HOURS
    now = utcnow()
    window_td = timedelta(hours=window)

    # Layer 1: Aggregate social data per coin
    social = _aggregate_social(now, window_td)

    # Layer 2: Aggregate whale transaction data per coin
    whale = _aggregate_whale_activity(now, window_td)

    # Layer 3: Cross-reference for divergences
    alerts = []
    all_coins = set(social.keys()) | set(whale.keys())

    for coin_id in all_coins:
        if coin_id.startswith("_") or coin_id.startswith("dex:"):
            continue

        s = social.get(coin_id, {"mentions": 0, "sentiment": 0, "avg_mentions": 0})
        w = whale.get(coin_id, {"net_usd": 0, "buy_usd": 0, "sell_usd": 0, "entities": []})

        coin_alerts = _detect_patterns(coin_id, s, w, now)
        alerts.extend(coin_alerts)

    alerts.sort(key=lambda a: a.confidence, reverse=True)
    logger.info(f"Smart money analysis found {len(alerts)} signals")
    return alerts


def _aggregate_social(now, window) -> dict:
    """Get mentions, sentiment, and baseline for each coin."""
    signals = db.get_all_social_signals_since(now - window)
    midpoint = now - (window / 2)

    result = defaultdict(lambda: {
        "mentions": 0, "sentiment": 0, "sent_count": 0,
        "recent_mentions": 0, "older_mentions": 0,
    })

    for s in signals:
        r = result[s.coin_id]
        r["mentions"] += s.mentions
        if s.sentiment_score is not None:
            r["sentiment"] += s.sentiment_score
            r["sent_count"] += 1
        if s.timestamp >= midpoint:
            r["recent_mentions"] += s.mentions
        else:
            r["older_mentions"] += s.mentions

    # Normalize
    for coin_id, r in result.items():
        if r["sent_count"] > 0:
            r["sentiment"] = r["sentiment"] / r["sent_count"]
        r["avg_mentions"] = r["older_mentions"] if r["older_mentions"] > 0 else r["mentions"]

    return dict(result)


def _aggregate_whale_activity(now, window) -> dict:
    """Aggregate whale transactions per coin: net flow, buy/sell USD, which entities."""
    transactions = db.get_whale_transactions_since(now - window)

    result = defaultdict(lambda: {
        "net_usd": 0, "buy_usd": 0, "sell_usd": 0, "tx_count": 0, "entities": [],
    })
    entity_tracker = defaultdict(lambda: defaultdict(float))

    for tx in transactions:
        if not tx.coin_id or not tx.amount_usd:
            continue

        r = result[tx.coin_id]
        r["tx_count"] += 1

        if tx.direction == "out":  # OUT of exchange = buying/accumulating
            r["buy_usd"] += tx.amount_usd
            r["net_usd"] += tx.amount_usd
            entity_tracker[tx.coin_id][tx.label] += tx.amount_usd
        elif tx.direction == "in":  # IN to exchange = selling/dumping
            r["sell_usd"] += tx.amount_usd
            r["net_usd"] -= tx.amount_usd
            entity_tracker[tx.coin_id][tx.label] -= tx.amount_usd

    # Attach entity summaries
    for coin_id, entities in entity_tracker.items():
        result[coin_id]["entities"] = [
            {"label": label, "net_usd": net}
            for label, net in sorted(entities.items(), key=lambda x: abs(x[1]), reverse=True)
        ][:10]

    return dict(result)


def _detect_patterns(coin_id, social, whale, now) -> list[IntelligenceAlert]:
    alerts = []

    mentions = social["mentions"]
    sentiment = social["sentiment"]
    avg_mentions = social["avg_mentions"]
    net_whale = whale["net_usd"]
    buy_usd = whale["buy_usd"]
    sell_usd = whale["sell_usd"]
    entities = whale["entities"]
    min_usd = config.WHALE_MIN_USD

    mention_ratio = mentions / avg_mentions if avg_mentions > 0 else 0

    # === STEALTH ACCUMULATION ===
    # Whale buying significant, social mentions below average
    if net_whale > min_usd and mention_ratio < config.STEALTH_MENTION_RATIO:
        confidence = min(1.0, net_whale / 5_000_000) * (1 - mention_ratio)
        alerts.append(IntelligenceAlert(
            timestamp=now,
            alert_type="stealth_accumulation",
            coin_id=coin_id,
            severity=_severity(confidence),
            headline=f"Stealth accumulation detected in {coin_id}",
            social_mentions=mentions,
            social_sentiment=sentiment,
            social_avg_mentions=avg_mentions,
            whale_volume_usd=net_whale,
            whale_direction="accumulating",
            whale_entities=entities,
            confidence=round(confidence, 3),
        ))

    # === EMPTY HYPE ===
    # Social mentions way above average, whales not buying
    if mention_ratio > config.HYPE_MENTION_RATIO and mentions > 20 and net_whale < 100_000:
        confidence = min(1.0, mention_ratio / 5.0)
        if sell_usd > buy_usd:
            confidence = min(1.0, confidence + 0.2)
        alerts.append(IntelligenceAlert(
            timestamp=now,
            alert_type="empty_hype",
            coin_id=coin_id,
            severity=_severity(confidence),
            headline=f"Empty hype detected in {coin_id}",
            social_mentions=mentions,
            social_sentiment=sentiment,
            social_avg_mentions=avg_mentions,
            whale_volume_usd=net_whale,
            whale_direction="neutral" if net_whale >= 0 else "dumping",
            whale_entities=entities,
            confidence=round(confidence, 3),
        ))

    # === SMART MONEY BUYING FEAR ===
    # Negative sentiment but whales accumulating
    if sentiment < -0.2 and net_whale > min_usd:
        confidence = min(1.0, abs(sentiment) * (net_whale / 2_000_000))
        alerts.append(IntelligenceAlert(
            timestamp=now,
            alert_type="smart_money_buying_fear",
            coin_id=coin_id,
            severity=_severity(confidence),
            headline=f"Smart money buying fear in {coin_id}",
            social_mentions=mentions,
            social_sentiment=sentiment,
            social_avg_mentions=avg_mentions,
            whale_volume_usd=net_whale,
            whale_direction="accumulating",
            whale_entities=entities,
            confidence=round(confidence, 3),
        ))

    # === SMART MONEY EXIT HYPE ===
    # Positive sentiment but whales dumping
    if sentiment > 0.3 and net_whale < -min_usd:
        confidence = min(1.0, sentiment * (abs(net_whale) / 2_000_000))
        alerts.append(IntelligenceAlert(
            timestamp=now,
            alert_type="smart_money_exit_hype",
            coin_id=coin_id,
            severity=_severity(confidence),
            headline=f"Smart money exiting {coin_id} despite positive sentiment",
            social_mentions=mentions,
            social_sentiment=sentiment,
            social_avg_mentions=avg_mentions,
            whale_volume_usd=abs(net_whale),
            whale_direction="dumping",
            whale_entities=entities,
            confidence=round(confidence, 3),
        ))

    return alerts


def _severity(confidence: float) -> str:
    if confidence >= 0.8:
        return "critical"
    elif confidence >= 0.5:
        return "high"
    elif confidence >= 0.3:
        return "medium"
    return "low"
