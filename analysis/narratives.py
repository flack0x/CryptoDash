"""Narrative clustering — group coins into themes and track momentum.

Predefined narratives based on known crypto sectors, updated as the market evolves.
Tracks momentum per narrative: is it rising, stable, or fading?
"""

from collections import defaultdict
from datetime import datetime, timedelta

from utils import utcnow

import db
from models import Narrative


# Predefined narratives — the major themes in crypto as of early 2026.
# Each maps a narrative slug to its name, description, and known coin_ids.
NARRATIVE_DEFINITIONS: list[dict] = [
    {
        "id": "ai-tokens",
        "name": "AI & Machine Learning",
        "description": "Tokens related to AI infrastructure, compute, and AI agents",
        "coin_ids": [
            "render-token", "fetch-ai", "ocean-protocol", "singularitynet",
            "bittensor", "akash-network", "worldcoin", "artificial-superintelligence-alliance",
            "virtual-protocol", "ai16z", "grass", "io-net",
        ],
    },
    {
        "id": "l2-scaling",
        "name": "Layer 2 Scaling",
        "description": "Layer 2 solutions for Ethereum and other chains",
        "coin_ids": [
            "arbitrum", "optimism", "polygon-ecosystem-token", "starknet",
            "mantle", "immutable-x", "zksync", "base-protocol", "scroll", "linea",
        ],
    },
    {
        "id": "rwa",
        "name": "Real World Assets",
        "description": "Tokenized real-world assets — bonds, real estate, commodities",
        "coin_ids": [
            "ondo-finance", "mantra-dao", "centrifuge", "maple-finance",
            "goldfinch", "clearpool", "polymesh", "pendle",
        ],
    },
    {
        "id": "depin",
        "name": "DePIN (Decentralized Physical Infrastructure)",
        "description": "Decentralized networks for physical infrastructure — compute, wireless, storage, sensors",
        "coin_ids": [
            "helium", "filecoin", "arweave", "render-token", "akash-network",
            "theta-token", "hivemapper", "io-net", "grass",
        ],
    },
    {
        "id": "memecoins",
        "name": "Memecoins",
        "description": "Community-driven, meme-based tokens",
        "coin_ids": [
            "dogecoin", "shiba-inu", "pepe", "bonk", "floki",
            "dogwifcoin", "brett", "mog-coin", "popcat",
        ],
    },
    {
        "id": "defi-blue-chips",
        "name": "DeFi Blue Chips",
        "description": "Established DeFi protocols with proven track records",
        "coin_ids": [
            "aave", "uniswap", "maker", "curve-dao-token", "compound-governance-token",
            "lido-dao", "rocket-pool", "synthetix-network-token", "1inch",
        ],
    },
    {
        "id": "restaking",
        "name": "Restaking & Liquid Staking",
        "description": "Restaking protocols and liquid staking derivatives",
        "coin_ids": [
            "eigenlayer", "lido-dao", "rocket-pool", "ether-fi",
            "puffer-finance", "renzo", "kelp-dao", "jito-governance-token",
        ],
    },
    {
        "id": "gaming-metaverse",
        "name": "Gaming & Metaverse",
        "description": "Blockchain gaming, metaverse platforms, and virtual worlds",
        "coin_ids": [
            "immutable-x", "the-sandbox", "axie-infinity", "gala",
            "illuvium", "beam-2", "ronin", "pixels",
        ],
    },
    {
        "id": "l1-alt",
        "name": "Alternative L1s",
        "description": "Non-Ethereum Layer 1 blockchains competing for market share",
        "coin_ids": [
            "solana", "avalanche-2", "cardano", "polkadot", "near",
            "sui", "aptos", "sei-network", "celestia", "injective-protocol",
            "kaspa", "toncoin", "cosmos",
        ],
    },
    {
        "id": "btc-ecosystem",
        "name": "Bitcoin Ecosystem",
        "description": "Bitcoin L2s, ordinals, BRC-20, and Bitcoin DeFi",
        "coin_ids": [
            "bitcoin", "stacks", "lightning-bitcoin", "core-dao",
            "alex-lab", "ordi", "sats-ordinals",
        ],
    },
]


def update_narratives(window_hours: int = 24):
    """
    Update all narrative definitions in the DB and compute momentum.

    Momentum = how the aggregate social/market signals for a narrative's
    coins are changing compared to the prior period.
    """
    now = utcnow()
    half_window = timedelta(hours=window_hours / 2)
    full_window = timedelta(hours=window_hours)

    for narrative_def in NARRATIVE_DEFINITIONS:
        coin_ids = narrative_def["coin_ids"]

        # Compute momentum from social signal trends
        momentum = _compute_narrative_momentum(coin_ids, now, half_window, full_window)

        db.upsert_narrative(
            narrative_id=narrative_def["id"],
            name=narrative_def["name"],
            description=narrative_def["description"],
            coin_ids=coin_ids,
            momentum=momentum,
        )


def _compute_narrative_momentum(coin_ids: list[str], now: datetime, half_window: timedelta, full_window: timedelta) -> float:
    """
    Compute momentum for a narrative based on its coins' social + market signals.

    Positive = narrative gaining attention/momentum.
    Negative = narrative fading.
    Near zero = stable.
    """
    # Get social signals for all coins in this narrative
    recent_signals = db.get_all_social_signals_since(now - half_window)
    older_signals = db.get_all_social_signals_since(now - full_window)

    recent_mentions = 0
    older_mentions = 0

    for s in recent_signals:
        if s.coin_id in coin_ids:
            recent_mentions += s.mentions

    for s in older_signals:
        if s.coin_id in coin_ids and s.timestamp < now - half_window:
            older_mentions += s.mentions

    # Also factor in volume changes
    recent_snaps = db.get_all_snapshots_since(now - half_window)
    older_snaps = db.get_all_snapshots_since(now - full_window)

    recent_vol = 0
    older_vol = 0

    for s in recent_snaps:
        if s.coin_id in coin_ids:
            recent_vol += s.volume_24h

    for s in older_snaps:
        if s.coin_id in coin_ids and s.timestamp < now - half_window:
            older_vol += s.volume_24h

    # Compute momentum as a weighted score
    mention_momentum = 0
    if older_mentions > 0:
        mention_momentum = (recent_mentions - older_mentions) / older_mentions

    vol_momentum = 0
    if older_vol > 0:
        vol_momentum = (recent_vol - older_vol) / older_vol

    # Weight social mentions more than volume (60/40)
    return round(mention_momentum * 0.6 + vol_momentum * 0.4, 3)


def get_narrative_rankings() -> list[dict]:
    """Get all narratives sorted by momentum (strongest first)."""
    narratives = db.get_all_narratives()
    return sorted(narratives, key=lambda n: n.get("momentum") or 0, reverse=True)


def get_narrative_for_coin(coin_id: str) -> list[str]:
    """Return which narratives a coin belongs to."""
    result = []
    for n in NARRATIVE_DEFINITIONS:
        if coin_id in n["coin_ids"]:
            result.append(n["name"])
    return result
