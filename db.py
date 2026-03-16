"""Supabase database layer for CryptoDash."""

import json
import logging
from datetime import datetime
from typing import Optional

from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_SERVICE_KEY
from models import (
    Coin,
    DevActivity,
    IntelligenceAlert,
    MarketMood,
    MarketSnapshot,
    OnChainMetric,
    SocialSignal,
    TrackedWallet,
    TrendingCoin,
    WhaleTransaction,
)

logger = logging.getLogger(__name__)

_client: Client | None = None


def get_client() -> Client:
    """Get or create the Supabase client."""
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _client


def init_db():
    """Verify connection to Supabase. Schema is managed via migrations."""
    client = get_client()
    # Quick connectivity check
    result = client.table("market_mood").select("id").limit(1).execute()
    logger.info("Supabase connection verified")


# ── Coins ──────────────────────────────────────────────────────────────

def upsert_coin(coin: Coin):
    client = get_client()
    client.table("coins").upsert({
        "id": coin.id,
        "symbol": coin.symbol,
        "name": coin.name,
        "categories": coin.categories,
    }).execute()


def upsert_coins(coins: list[Coin]):
    if not coins:
        return
    client = get_client()
    rows = [
        {"id": c.id, "symbol": c.symbol, "name": c.name, "categories": c.categories}
        for c in coins
    ]
    client.table("coins").upsert(rows).execute()


def ensure_coins_exist(coin_ids: list[str]):
    """Create placeholder coin entries if they don't already exist.

    Uses ON CONFLICT DO NOTHING so existing coins with proper names
    from CoinGecko are never overwritten.
    """
    if not coin_ids:
        return
    client = get_client()
    rows = [{"id": cid, "symbol": cid, "name": cid, "categories": []} for cid in coin_ids]
    client.table("coins").upsert(rows, ignore_duplicates=True).execute()


def get_coin(coin_id: str) -> Optional[Coin]:
    client = get_client()
    result = client.table("coins").select("*").eq("id", coin_id).limit(1).execute()
    if result.data:
        r = result.data[0]
        return Coin(id=r["id"], symbol=r["symbol"], name=r["name"], categories=r.get("categories", []))
    return None


def get_all_coins() -> list[Coin]:
    client = get_client()
    result = client.table("coins").select("*").execute()
    return [
        Coin(id=r["id"], symbol=r["symbol"], name=r["name"], categories=r.get("categories", []))
        for r in result.data
    ]


# ── Market Snapshots ──────────────────────────────────────────────────

def insert_snapshots(snapshots: list[MarketSnapshot]):
    if not snapshots:
        return
    client = get_client()
    rows = [
        {
            "coin_id": s.coin_id,
            "ts": s.timestamp.isoformat(),
            "price_usd": s.price_usd,
            "volume_24h": s.volume_24h,
            "market_cap": s.market_cap,
            "price_change_24h": s.price_change_24h,
            "rank": s.rank,
        }
        for s in snapshots
    ]
    # Insert in batches of 500 to avoid payload limits
    for i in range(0, len(rows), 500):
        client.table("snapshots").insert(rows[i:i+500]).execute()


def get_latest_snapshot(coin_id: str) -> Optional[MarketSnapshot]:
    client = get_client()
    result = (
        client.table("snapshots")
        .select("*")
        .eq("coin_id", coin_id)
        .order("ts", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        r = result.data[0]
        return MarketSnapshot(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            price_usd=r["price_usd"],
            volume_24h=r["volume_24h"],
            market_cap=r["market_cap"],
            price_change_24h=r["price_change_24h"],
            rank=r["rank"],
        )
    return None


def get_latest_market_caps(coin_ids: list[str]) -> dict[str, float]:
    """Bulk fetch latest market cap for a list of coins. Returns {coin_id: market_cap}."""
    if not coin_ids:
        return {}
    client = get_client()
    result = (
        client.table("snapshots")
        .select("coin_id, market_cap")
        .in_("coin_id", coin_ids)
        .not_.is_("market_cap", "null")
        .order("ts", desc=True)
        .limit(len(coin_ids) * 2)
        .execute()
    )
    caps = {}
    for r in result.data or []:
        if r["coin_id"] not in caps and r["market_cap"]:
            caps[r["coin_id"]] = r["market_cap"]
    return caps


def get_latest_prices(coin_ids: list[str]) -> dict[str, float]:
    """Bulk fetch latest price_usd for a list of coins. Returns {coin_id: price_usd}."""
    if not coin_ids:
        return {}
    client = get_client()
    result = (
        client.table("snapshots")
        .select("coin_id, price_usd")
        .in_("coin_id", coin_ids)
        .not_.is_("price_usd", "null")
        .order("ts", desc=True)
        .limit(len(coin_ids) * 2)
        .execute()
    )
    prices = {}
    for r in result.data or []:
        if r["coin_id"] not in prices and r["price_usd"]:
            prices[r["coin_id"]] = r["price_usd"]
    return prices


def get_snapshots_since(coin_id: str, since: datetime) -> list[MarketSnapshot]:
    client = get_client()
    result = (
        client.table("snapshots")
        .select("*")
        .eq("coin_id", coin_id)
        .gte("ts", since.isoformat())
        .order("ts")
        .execute()
    )
    return [
        MarketSnapshot(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            price_usd=r["price_usd"],
            volume_24h=r["volume_24h"],
            market_cap=r["market_cap"],
            price_change_24h=r["price_change_24h"],
            rank=r["rank"],
        )
        for r in result.data
    ]


# ── Social Signals ────────────────────────────────────────────────────

def insert_social_signals(signals: list[SocialSignal]):
    if not signals:
        return
    client = get_client()
    rows = [
        {
            "coin_id": s.coin_id,
            "ts": s.timestamp.isoformat(),
            "source": s.source,
            "mentions": s.mentions,
            "sentiment_score": s.sentiment_score,
            "engagement": s.engagement,
            "raw_data": json.loads(s.raw_data) if isinstance(s.raw_data, str) else s.raw_data,
        }
        for s in signals
    ]
    for i in range(0, len(rows), 500):
        client.table("social_signals").insert(rows[i:i+500]).execute()


def get_social_signals_since(coin_id: str, since: datetime) -> list[SocialSignal]:
    client = get_client()
    result = (
        client.table("social_signals")
        .select("*")
        .eq("coin_id", coin_id)
        .gte("ts", since.isoformat())
        .order("ts")
        .execute()
    )
    return [
        SocialSignal(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            source=r["source"],
            mentions=r["mentions"],
            sentiment_score=r["sentiment_score"],
            engagement=r["engagement"],
            raw_data=json.dumps(r["raw_data"]) if r.get("raw_data") else None,
        )
        for r in result.data
    ]


# ── On-Chain Metrics ──────────────────────────────────────────────────

def insert_onchain_metrics(metrics: list[OnChainMetric]):
    if not metrics:
        return
    client = get_client()
    rows = [
        {
            "coin_id": m.coin_id,
            "ts": m.timestamp.isoformat(),
            "metric_type": m.metric_type,
            "value": m.value,
            "source": m.source,
            "raw_data": json.loads(m.raw_data) if isinstance(m.raw_data, str) else m.raw_data,
        }
        for m in metrics
    ]
    for i in range(0, len(rows), 500):
        client.table("on_chain").insert(rows[i:i+500]).execute()


def get_onchain_since(coin_id: str, metric_type: str, since: datetime) -> list[OnChainMetric]:
    client = get_client()
    result = (
        client.table("on_chain")
        .select("*")
        .eq("coin_id", coin_id)
        .eq("metric_type", metric_type)
        .gte("ts", since.isoformat())
        .order("ts")
        .execute()
    )
    return [
        OnChainMetric(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            metric_type=r["metric_type"],
            value=r["value"],
            source=r["source"],
            raw_data=json.dumps(r["raw_data"]) if r.get("raw_data") else None,
        )
        for r in result.data
    ]


# ── Dev Activity ──────────────────────────────────────────────────────

def insert_dev_activity(activities: list[DevActivity]):
    if not activities:
        return
    client = get_client()
    rows = [
        {
            "coin_id": a.coin_id,
            "ts": a.timestamp.isoformat(),
            "commits_7d": a.commits_7d,
            "contributors_7d": a.contributors_7d,
            "repo_url": a.repo_url,
            "source": a.source,
        }
        for a in activities
    ]
    client.table("dev_activity").insert(rows).execute()


# ── Market Mood ───────────────────────────────────────────────────────

def insert_market_mood(mood: MarketMood):
    client = get_client()
    client.table("market_mood").insert({
        "ts": mood.timestamp.isoformat(),
        "value": mood.value,
        "label": mood.label,
    }).execute()


def get_latest_mood() -> Optional[MarketMood]:
    client = get_client()
    result = (
        client.table("market_mood")
        .select("*")
        .order("ts", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        r = result.data[0]
        return MarketMood(
            timestamp=datetime.fromisoformat(r["ts"]),
            value=r["value"],
            label=r["label"],
        )
    return None


# ── Trending ──────────────────────────────────────────────────────────

def insert_trending(trending: list[TrendingCoin]):
    if not trending:
        return
    client = get_client()
    rows = [
        {
            "coin_id": t.coin_id,
            "ts": t.timestamp.isoformat(),
            "source": t.source,
            "rank": t.rank,
            "score": t.score,
        }
        for t in trending
    ]
    client.table("trending").insert(rows).execute()


def get_trending_since(since: datetime, source: Optional[str] = None) -> list[TrendingCoin]:
    client = get_client()
    query = client.table("trending").select("*").gte("ts", since.isoformat())
    if source:
        query = query.eq("source", source).order("rank")
    else:
        query = query.order("ts", desc=True).order("rank")

    result = query.execute()
    return [
        TrendingCoin(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            source=r["source"],
            rank=r["rank"],
            score=r["score"],
        )
        for r in result.data
    ]


# ── Narratives ────────────────────────────────────────────────────────

def upsert_narrative(narrative_id: str, name: str, description: str, coin_ids: list[str], momentum: Optional[float] = None):
    client = get_client()
    client.table("narratives").upsert({
        "id": narrative_id,
        "name": name,
        "description": description,
        "coin_ids": coin_ids,
        "momentum": momentum,
    }).execute()


def get_all_narratives():
    client = get_client()
    result = client.table("narratives").select("*").execute()
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "coin_ids": r.get("coin_ids", []),
            "momentum": r["momentum"],
        }
        for r in result.data
    ]


# ── Utility ───────────────────────────────────────────────────────────

def get_all_social_signals_since(since: datetime) -> list[SocialSignal]:
    """Get social signals for ALL coins since a timestamp."""
    client = get_client()
    result = (
        client.table("social_signals")
        .select("*")
        .gte("ts", since.isoformat())
        .order("ts")
        .execute()
    )
    return [
        SocialSignal(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            source=r["source"],
            mentions=r["mentions"],
            sentiment_score=r["sentiment_score"],
            engagement=r["engagement"],
            raw_data=json.dumps(r["raw_data"]) if r.get("raw_data") else None,
        )
        for r in result.data
    ]


def get_all_snapshots_since(since: datetime) -> list[MarketSnapshot]:
    """Get market snapshots for ALL coins since a timestamp."""
    client = get_client()
    result = (
        client.table("snapshots")
        .select("*")
        .gte("ts", since.isoformat())
        .order("ts")
        .execute()
    )
    return [
        MarketSnapshot(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            price_usd=r["price_usd"],
            volume_24h=r["volume_24h"],
            market_cap=r["market_cap"],
            price_change_24h=r["price_change_24h"],
            rank=r["rank"],
        )
        for r in result.data
    ]


def get_all_onchain_since(since: datetime) -> list[OnChainMetric]:
    """Get on-chain metrics for ALL coins since a timestamp."""
    client = get_client()
    result = (
        client.table("on_chain")
        .select("*")
        .gte("ts", since.isoformat())
        .order("ts")
        .execute()
    )
    return [
        OnChainMetric(
            coin_id=r["coin_id"],
            timestamp=datetime.fromisoformat(r["ts"]),
            metric_type=r["metric_type"],
            value=r["value"],
            source=r["source"],
            raw_data=json.dumps(r["raw_data"]) if r.get("raw_data") else None,
        )
        for r in result.data
    ]


# ── Tracked Wallets ──────────────────────────────────────────────────

def get_tracked_wallets(chain: str = None, active_only: bool = True) -> list[TrackedWallet]:
    client = get_client()
    query = client.table("tracked_wallets").select("*")
    if chain:
        query = query.eq("chain", chain)
    if active_only:
        query = query.eq("is_active", True)
    result = query.execute()
    return [
        TrackedWallet(
            address=r["address"],
            chain=r["chain"],
            label=r["label"],
            entity_type=r["entity_type"],
            source=r.get("source", "seed"),
            is_active=r.get("is_active", True),
            last_checked=datetime.fromisoformat(r["last_checked"]) if r.get("last_checked") else None,
        )
        for r in result.data
    ]


def upsert_tracked_wallets(wallets: list[TrackedWallet]):
    if not wallets:
        return
    client = get_client()
    rows = [
        {
            "address": w.address,
            "chain": w.chain,
            "label": w.label,
            "entity_type": w.entity_type,
            "source": w.source,
            "is_active": w.is_active,
        }
        for w in wallets
    ]
    client.table("tracked_wallets").upsert(rows, on_conflict="address,chain").execute()


def update_wallet_last_checked(address: str, chain: str):
    from utils import utcnow
    client = get_client()
    client.table("tracked_wallets").update({
        "last_checked": utcnow().isoformat(),
    }).eq("address", address).eq("chain", chain).execute()


# ── Whale Transactions ──────────────────────────────────────────────

def insert_whale_transactions(transactions: list[WhaleTransaction]):
    if not transactions:
        return
    client = get_client()

    # Deduplicate: skip transactions we already have (same tx_hash + wallet_address)
    tx_hashes = [t.tx_hash for t in transactions if t.tx_hash]
    existing_keys: set[tuple[str, str]] = set()
    if tx_hashes:
        # Batch query — Supabase IN filter
        for i in range(0, len(tx_hashes), 100):
            batch = tx_hashes[i:i+100]
            existing = (
                client.table("whale_transactions")
                .select("tx_hash, wallet_address")
                .in_("tx_hash", batch)
                .execute()
            )
            for r in (existing.data or []):
                existing_keys.add((r["tx_hash"], r["wallet_address"]))

    new_txs = [t for t in transactions if (t.tx_hash, t.wallet_address) not in existing_keys]
    if not new_txs:
        return

    rows = [
        {
            "wallet_address": t.wallet_address,
            "coin_id": t.coin_id,
            "token_symbol": t.token_symbol,
            "token_address": t.token_address,
            "amount": t.amount,
            "amount_usd": t.amount_usd,
            "direction": t.direction,
            "chain": t.chain,
            "label": t.label,
            "entity_type": t.entity_type,
            "tx_hash": t.tx_hash,
            "block_number": t.block_number,
            "counterparty": t.counterparty,
            "counterparty_label": t.counterparty_label,
            "source": t.source,
            "ts": t.timestamp.isoformat() if t.timestamp else None,
        }
        for t in new_txs
    ]
    for i in range(0, len(rows), 500):
        try:
            client.table("whale_transactions").insert(rows[i:i+500]).execute()
        except Exception as e:
            if "23505" in str(e):
                # Unique constraint caught a duplicate — insert one-by-one, skip conflicts
                for row in rows[i:i+500]:
                    try:
                        client.table("whale_transactions").insert([row]).execute()
                    except Exception:
                        pass  # Duplicate, skip
            else:
                raise


def get_whale_transactions_since(since: datetime) -> list[WhaleTransaction]:
    client = get_client()
    result = (
        client.table("whale_transactions")
        .select("*")
        .gte("ts", since.isoformat())
        .order("ts", desc=True)
        .execute()
    )
    return [_row_to_whale_tx(r) for r in result.data]


def _row_to_whale_tx(r: dict) -> WhaleTransaction:
    return WhaleTransaction(
        wallet_address=r["wallet_address"],
        coin_id=r.get("coin_id"),
        token_symbol=r.get("token_symbol", ""),
        token_address=r.get("token_address", ""),
        amount=r["amount"],
        amount_usd=r.get("amount_usd"),
        direction=r["direction"],
        chain=r.get("chain", "ethereum"),
        label=r.get("label", ""),
        entity_type=r.get("entity_type", ""),
        tx_hash=r.get("tx_hash", ""),
        block_number=r.get("block_number", 0),
        counterparty=r.get("counterparty", ""),
        counterparty_label=r.get("counterparty_label"),
        source=r["source"],
        timestamp=datetime.fromisoformat(r["ts"]) if r.get("ts") else None,
    )


# ── Intelligence Alerts ─────────────────────────────────────────────

DIRECTION_MAP = {
    "stealth_accumulation": "bullish",
    "smart_money_buying_fear": "bullish",
    "empty_hype": "bearish",
    "smart_money_exit_hype": "bearish",
}


def insert_intelligence_alerts(alerts: list[IntelligenceAlert]):
    if not alerts:
        return
    client = get_client()
    rows = [
        {
            "ts": a.timestamp.isoformat(),
            "alert_type": a.alert_type,
            "coin_id": a.coin_id,
            "severity": a.severity,
            "headline": a.headline,
            "brief": a.brief,
            "social_mentions": a.social_mentions,
            "social_sentiment": a.social_sentiment,
            "social_avg_mentions": a.social_avg_mentions,
            "whale_volume_usd": a.whale_volume_usd,
            "whale_direction": a.whale_direction,
            "whale_entities": a.whale_entities,
            "confidence": a.confidence,
            "raw_data": json.loads(a.raw_data) if isinstance(a.raw_data, str) else a.raw_data,
            "price_at_detection": a.price_at_detection,
            "predicted_direction": DIRECTION_MAP.get(a.alert_type),
        }
        for a in alerts
    ]
    client.table("intelligence_alerts").insert(rows).execute()


def get_intelligence_alerts_for_coin(coin_id: str, alert_type: str, since: datetime) -> list[dict]:
    client = get_client()
    result = (
        client.table("intelligence_alerts")
        .select("*")
        .eq("coin_id", coin_id)
        .eq("alert_type", alert_type)
        .gte("ts", since.isoformat())
        .order("ts", desc=True)
        .execute()
    )
    return result.data


# ── Signal Outcome Tracking ───────────────────────────────────────────

def get_pending_outcome_checks(checkpoint: str, cutoff: datetime) -> list[dict]:
    """Get alerts needing outcome checks.

    checkpoint: "24h" or "48h"
    cutoff: alerts must be older than this to be eligible
    """
    client = get_client()
    query = (
        client.table("intelligence_alerts")
        .select("id, coin_id, alert_type, confidence, severity, "
                "price_at_detection, predicted_direction, ts")
        .not_.is_("price_at_detection", "null")
        .lte("ts", cutoff.isoformat())
        .limit(200)
    )
    if checkpoint == "24h":
        query = query.is_("checked_24h_at", "null")
    elif checkpoint == "48h":
        query = query.not_.is_("checked_24h_at", "null").is_("checked_48h_at", "null")
    return query.order("ts").execute().data or []


def update_alert_outcome(alert_id: int, updates: dict):
    """Update an intelligence alert with outcome data."""
    client = get_client()
    client.table("intelligence_alerts").update(updates).eq("id", alert_id).execute()


def get_outcome_stats() -> list[dict]:
    """Fetch all evaluated outcomes for hit rate calculation."""
    client = get_client()
    result = (
        client.table("intelligence_alerts")
        .select("alert_type, confidence, severity, predicted_direction, "
                "change_pct_24h, change_pct_48h, direction_correct_24h, direction_correct_48h")
        .not_.is_("checked_24h_at", "null")
        .order("ts", desc=True)
        .limit(1000)
        .execute()
    )
    return result.data or []
