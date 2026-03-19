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

# Coins to NEVER generate alerts for (stablecoins, wrapped assets)
EXCLUDED_COINS = {
    "tether", "usd-coin", "dai", "true-usd", "paxos-standard",
    "frax", "usdd", "first-digital-usd", "paypal-usd",
    "staked-ether", "wrapped-bitcoin", "rocket-pool-eth",
    "coinbase-wrapped-staked-eth", "wrapped-steth",
}

# Major coins need higher thresholds (they always have high social mentions)
MAJOR_COINS = {
    "bitcoin", "ethereum", "binancecoin", "solana", "ripple",
    "cardano", "dogecoin", "toncoin", "tron", "avalanche-2",
}

# Coins we can ACTUALLY track whale activity for (ERC-20 tokens in our TOKEN_SYMBOL_MAP).
# Only these should generate empty_hype alerts — saying "no whale buying" for coins
# on other chains (Solana, Hyperliquid, Polkadot, etc.) is misleading because we're blind.
# Derived from collectors/whale_tracker.py TOKEN_SYMBOL_MAP values minus EXCLUDED_COINS.
TRACKABLE_COINS = {
    "ethereum", "aave", "uniswap", "chainlink", "maker", "curve-dao-token",
    "lido-dao", "arbitrum", "optimism", "pepe", "shiba-inu",
    "ethereum-name-service", "rocket-pool", "synthetix-network-token",
    "compound-governance-token", "sushi", "1inch", "balancer", "fetch-ai",
    "render-token", "the-graph", "immutable-x", "ondo-finance", "pendle",
    "dogecoin", "matic-network", "filecoin", "the-sandbox", "decentraland",
    "axie-infinity", "bittensor", "worldcoin",
}


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

    # Bulk fetch market caps for whale-active coins (needed for market-cap-relative thresholds)
    whale_coins = [c for c in all_coins if c in whale and not c.startswith("_") and not c.startswith("dex:")]
    market_caps = db.get_latest_market_caps(whale_coins) if whale_coins else {}

    for coin_id in all_coins:
        if coin_id.startswith("_") or coin_id.startswith("dex:"):
            continue
        if coin_id in EXCLUDED_COINS:
            continue

        s = social.get(coin_id, {"mentions": 0, "sentiment": 0, "avg_mentions": 0})
        w = whale.get(coin_id, {"net_usd": 0, "buy_usd": 0, "sell_usd": 0, "entities": []})

        is_major = coin_id in MAJOR_COINS
        mcap = market_caps.get(coin_id, 0)
        coin_alerts = _detect_patterns(coin_id, s, w, now, is_major=is_major, market_cap=mcap)
        alerts.extend(coin_alerts)

    alerts.sort(key=lambda a: a.confidence, reverse=True)

    # Deduplicate against existing alerts — don't re-insert same coin+type within 4h
    if alerts:
        dedup_window = now - timedelta(hours=4)
        existing_alerts = {}
        for a in alerts:
            if a.coin_id:
                recent = db.get_intelligence_alerts_for_coin(a.coin_id, a.alert_type, dedup_window)
                if recent:
                    existing_alerts[(a.coin_id, a.alert_type)] = True
        alerts = [a for a in alerts if (a.coin_id, a.alert_type) not in existing_alerts]

    # Enrich alerts with price_at_detection (bulk fetch, no N+1)
    alert_coin_ids = list({a.coin_id for a in alerts if a.coin_id})
    if alert_coin_ids:
        prices = db.get_latest_prices(alert_coin_ids)
        for alert in alerts:
            if alert.coin_id and alert.coin_id in prices:
                alert.price_at_detection = prices[alert.coin_id]

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

    # Deduplicate by tx_hash + wallet_address (same blockchain tx collected on multiple runs)
    seen_txs: set[tuple] = set()
    unique_txs = []
    for tx in transactions:
        if tx.tx_hash:
            key = (tx.tx_hash, tx.wallet_address)
        else:
            # Fallback for old data without tx_hash
            key = (tx.wallet_address, tx.token_symbol, tx.amount, tx.direction, str(tx.timestamp))
        if key in seen_txs:
            continue
        seen_txs.add(key)
        unique_txs.append(tx)
    transactions = unique_txs

    result = defaultdict(lambda: {
        "net_usd": 0, "buy_usd": 0, "sell_usd": 0, "tx_count": 0, "entities": [],
    })
    entity_tracker = defaultdict(lambda: defaultdict(float))

    for tx in transactions:
        if not tx.coin_id or not tx.amount_usd:
            continue

        r = result[tx.coin_id]
        r["tx_count"] += 1

        if tx.direction == "buy":
            r["buy_usd"] += tx.amount_usd
            r["net_usd"] += tx.amount_usd
            entity_tracker[tx.coin_id][tx.label] += tx.amount_usd
        elif tx.direction == "sell":
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


def _detect_patterns(coin_id, social, whale, now, is_major=False, market_cap=0) -> list[IntelligenceAlert]:
    alerts = []

    mentions = social["mentions"]
    sentiment = social["sentiment"]
    avg_mentions = social["avg_mentions"]
    net_whale = whale["net_usd"]
    buy_usd = whale["buy_usd"]
    sell_usd = whale["sell_usd"]
    entities = whale["entities"]

    # Market-cap-relative whale threshold — tiered so mega-caps need bigger moves
    if market_cap >= 5_000_000_000:       # >$5B: need 0.03% of mcap
        min_usd = max(config.WHALE_MIN_USD, market_cap * 0.0003)
    elif market_cap >= 500_000_000:       # >$500M: need 0.01% of mcap
        min_usd = max(config.WHALE_MIN_USD, market_cap * 0.0001)
    else:                                  # <$500M: use config default
        min_usd = max(config.WHALE_MIN_USD, market_cap * config.MCAP_WHALE_MULTIPLIER) if market_cap > 0 else config.WHALE_MIN_USD

    # Confidence denominators scale with market cap — $300K on a $3.6B coin is noise,
    # $300K on a $50M coin is a real signal. Scale proportionally.
    stealth_denom = max(config.STEALTH_CONFIDENCE_DENOM, market_cap * 0.001) if market_cap > 0 else config.STEALTH_CONFIDENCE_DENOM
    exit_fear_denom = max(config.EXIT_FEAR_CONFIDENCE_DENOM, market_cap * 0.001) if market_cap > 0 else config.EXIT_FEAR_CONFIDENCE_DENOM

    mention_ratio = mentions / avg_mentions if avg_mentions > 0 else 0

    # Social visibility: how confident are we that our social data reflects reality?
    # avg_mentions >= 10 = full visibility, 0 = blind. Scale linearly.
    # Without social visibility, we can't claim "the crowd hasn't noticed" — we just can't see.
    social_visibility = min(1.0, avg_mentions / 3)

    # Major coins need much higher thresholds — BTC/ETH always have high social mentions
    hype_ratio = config.HYPE_MENTION_RATIO * (5 if is_major else 1)
    min_mentions = 100 if is_major else 20

    # === STEALTH ACCUMULATION ===
    # Whale buying significant, social mentions below average
    # REQUIRES social visibility — "0 mentions with avg 0" is blindness, not stealth.
    if net_whale > min_usd and mention_ratio < config.STEALTH_MENTION_RATIO:
        confidence = min(0.95, (net_whale / stealth_denom) * (1 - mention_ratio))
        # Scale by social visibility: no social data = no stealth signal
        confidence *= social_visibility
        if confidence >= 0.15:
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
    # This is the weakest signal — no whale data to confirm, just absence of buying
    # ONLY for coins we can actually track (ERC-20s in our whale tracker).
    # Saying "no whale buying" for coins on other chains is misleading — we're blind, not informed.
    if (coin_id in TRACKABLE_COINS and
            mention_ratio > hype_ratio and mentions > min_mentions and net_whale < 100_000):
        confidence = min(0.70, mention_ratio / (10.0 if is_major else 6.0))
        if sell_usd > buy_usd:
            confidence = min(0.80, confidence + 0.15)
        if confidence >= 0.15:
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
    # REQUIRES multiple independent entities buying — a single entity (even $9M)
    # could be treasury ops or internal transfer. 0/5 hit rate with single-entity signals.
    if sentiment < config.BUYING_FEAR_SENTIMENT and net_whale > min_usd:
        # Count independent buying entities
        buying_entities = [e for e in entities if e["net_usd"] > 0]
        buying_entity_count = len(buying_entities)
        # Require at least 2 independent entities buying
        if buying_entity_count < 2:
            pass  # Skip — single entity buying is unreliable (treasury ops, internal transfers)
        else:
            # Check for single-entity dominance: if one entity is >80% of total buying, discount
            top_buyer_pct = (buying_entities[0]["net_usd"] / buy_usd) if buy_usd > 0 else 1.0
            entity_diversity = min(1.0, buying_entity_count / 3)  # 2 entities = 67%, 3+ = 100%
            if top_buyer_pct > 0.80:
                entity_diversity *= 0.5  # Heavy discount when one entity dominates

            confidence = min(0.95, abs(sentiment) * (net_whale / exit_fear_denom))
            confidence *= entity_diversity
            if confidence >= 0.15:
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
    if sentiment > config.EXIT_HYPE_SENTIMENT and net_whale < -min_usd:
        confidence = min(0.95, sentiment * (abs(net_whale) / exit_fear_denom))
        if confidence >= 0.15:
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
    if confidence >= 0.75:
        return "critical"
    elif confidence >= 0.50:
        return "high"
    elif confidence >= 0.25:
        return "medium"
    return "low"
