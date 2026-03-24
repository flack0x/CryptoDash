"""Data models for CryptoDash."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Coin:
    id: str                          # coingecko id (e.g. "bitcoin")
    symbol: str                      # e.g. "btc"
    name: str                        # e.g. "Bitcoin"
    categories: list[str] = field(default_factory=list)  # narrative tags


@dataclass
class MarketSnapshot:
    coin_id: str
    timestamp: datetime
    price_usd: float
    volume_24h: float
    market_cap: float
    price_change_24h: Optional[float] = None
    rank: Optional[int] = None


@dataclass
class SocialSignal:
    coin_id: str
    timestamp: datetime
    source: str                      # "reddit", "lunarcrush", "free_crypto_news", etc.
    mentions: int = 0
    sentiment_score: Optional[float] = None  # -1.0 to 1.0
    engagement: Optional[int] = None
    raw_data: Optional[str] = None   # JSON string for extra fields


@dataclass
class OnChainMetric:
    coin_id: str
    timestamp: datetime
    metric_type: str                 # "tvl", "whale_flow", "exchange_inflow", "active_addresses", etc.
    value: float
    source: str                      # "defillama", "dune", "glassnode"
    raw_data: Optional[str] = None


@dataclass
class DevActivity:
    coin_id: str
    timestamp: datetime
    commits_7d: int = 0
    contributors_7d: int = 0
    repo_url: Optional[str] = None
    source: str = "github"


@dataclass
class Narrative:
    id: str                          # slug, e.g. "ai-tokens"
    name: str                        # "AI Tokens"
    description: str
    coin_ids: list[str] = field(default_factory=list)
    momentum: Optional[float] = None  # positive = rising, negative = fading


@dataclass
class MarketMood:
    timestamp: datetime
    value: int                       # 0-100
    label: str                       # "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"


@dataclass
class TrendingCoin:
    coin_id: str
    timestamp: datetime
    source: str                      # "coingecko", "lunarcrush", etc.
    rank: int
    score: Optional[float] = None


@dataclass
class DivergenceAlert:
    """When layers of the information chain disagree."""
    timestamp: datetime
    coin_id: str
    alert_type: str                  # "hype_no_substance", "stealth_accumulation", "dying_project", "smart_money_buying_fear"
    description: str
    social_signal: Optional[float] = None
    onchain_signal: Optional[float] = None
    dev_signal: Optional[float] = None
    severity: str = "medium"         # "low", "medium", "high"


@dataclass
class VelocityAlert:
    """When a metric is accelerating unusually fast."""
    timestamp: datetime
    coin_id: str
    metric: str                      # "mentions", "volume", "price", "tvl"
    current_value: float
    baseline_value: float
    multiplier: float                # current / baseline
    direction: str = "up"            # "up" or "down"


@dataclass
class TrackedWallet:
    address: str
    chain: str = "ethereum"
    label: str = ""
    entity_type: str = "whale"       # "whale", "vc", "exchange", "fund", "protocol"
    source: str = "seed"
    is_active: bool = True
    last_checked: Optional[datetime] = None


@dataclass
class WhaleTransaction:
    wallet_address: str
    coin_id: Optional[str]
    token_symbol: str
    token_address: str
    amount: float
    amount_usd: Optional[float]
    direction: str                   # "in" (to exchange=sell), "out" (from exchange=buy), "transfer"
    chain: str
    label: str
    entity_type: str
    tx_hash: str
    block_number: int
    counterparty: str
    counterparty_label: Optional[str] = None
    source: str = "etherscan"
    timestamp: Optional[datetime] = None


@dataclass
class IntelligenceAlert:
    """Smart money divergence signal."""
    timestamp: datetime
    alert_type: str                  # "stealth_accumulation", "empty_hype", "smart_money_buying_fear", "smart_money_exit_hype"
    coin_id: Optional[str] = None
    severity: str = "medium"         # "low", "medium", "high", "critical"
    headline: str = ""
    brief: str = ""
    social_mentions: Optional[int] = None
    social_sentiment: Optional[float] = None
    social_avg_mentions: Optional[float] = None
    whale_volume_usd: Optional[float] = None
    whale_direction: Optional[str] = None
    whale_entities: Optional[list] = None
    confidence: float = 0.0
    raw_data: Optional[str] = None
    price_at_detection: Optional[float] = None
    mood_at_detection: Optional[int] = None
