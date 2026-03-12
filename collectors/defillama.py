"""DeFiLlama collector — TVL by protocol/chain, DeFi metrics."""

import logging
from utils import utcnow

import db
from models import Coin, OnChainMetric

from .base import BaseCollector

logger = logging.getLogger(__name__)

BASE_URL = "https://api.llama.fi"

# Map DeFiLlama protocol names to CoinGecko coin IDs where possible.
# This grows as we discover mappings.
PROTOCOL_TO_COIN = {
    "lido": "lido-dao",
    "aave": "aave",
    "makerdao": "maker",
    "uniswap": "uniswap",
    "curve-dex": "curve-dao-token",
    "compound": "compound-governance-token",
    "rocket-pool": "rocket-pool",
    "eigenlayer": "eigenlayer",
    "jito": "jito-governance-token",
    "raydium": "raydium",
    "jupiter": "jupiter-exchange-solana",
    "ondo-finance": "ondo-finance",
    "ethena": "ethena",
    "pendle": "pendle",
    "morpho": "morpho",
}


class DeFiLlamaCollector(BaseCollector):
    name = "defillama"

    def collect(self):
        """Collect TVL data for top protocols and chains."""
        self.collect_protocols()
        self.collect_chains()

    def collect_protocols(self):
        """Fetch TVL for top DeFi protocols."""
        logger.info(f"[{self.name}] Collecting protocol TVL data...")
        now = utcnow()

        data = self.get(f"{BASE_URL}/protocols")
        if not data:
            return

        metrics = []
        coins_to_upsert = []
        # Take top 100 by TVL
        sorted_protocols = sorted(data, key=lambda p: p.get("tvl") or 0, reverse=True)[:100]

        for protocol in sorted_protocols:
            slug = protocol.get("slug", "")
            tvl = protocol.get("tvl")
            if not tvl or tvl <= 0:
                continue

            # Try to map to a coin_id, otherwise use the protocol slug
            coin_id = PROTOCOL_TO_COIN.get(slug, slug)
            name = protocol.get("name", slug)
            symbol = protocol.get("symbol", slug).lower()

            coins_to_upsert.append(Coin(id=coin_id, symbol=symbol, name=name, categories=["defi"]))

            metrics.append(
                OnChainMetric(
                    coin_id=coin_id,
                    timestamp=now,
                    metric_type="tvl",
                    value=tvl,
                    source="defillama",
                    raw_data=None,
                )
            )

            # Also capture 1d change if available
            change_1d = protocol.get("change_1d")
            if change_1d is not None:
                metrics.append(
                    OnChainMetric(
                        coin_id=coin_id,
                        timestamp=now,
                        metric_type="tvl_change_1d",
                        value=change_1d,
                        source="defillama",
                        raw_data=None,
                    )
                )

        if coins_to_upsert:
            db.upsert_coins(coins_to_upsert)
        if metrics:
            db.insert_onchain_metrics(metrics)
            logger.info(f"[{self.name}] Stored {len(metrics)} protocol metrics")

    def collect_chains(self):
        """Fetch TVL by chain (Ethereum, Solana, etc.)."""
        logger.info(f"[{self.name}] Collecting chain TVL data...")
        now = utcnow()

        data = self.get(f"{BASE_URL}/v2/chains")
        if not data:
            return

        # Map chain names to coin IDs
        chain_to_coin = {
            "Ethereum": "ethereum",
            "Solana": "solana",
            "BSC": "binancecoin",
            "Avalanche": "avalanche-2",
            "Polygon": "matic-network",
            "Arbitrum": "arbitrum",
            "Optimism": "optimism",
            "Base": "base-protocol",
            "Sui": "sui",
            "Aptos": "aptos",
            "Near": "near",
            "Tron": "tron",
            "Fantom": "fantom",
            "Cardano": "cardano",
        }

        metrics = []
        coins_to_upsert = []
        for chain in data:
            chain_name = chain.get("name", "")
            tvl = chain.get("tvl")
            if not tvl or tvl <= 0:
                continue

            coin_id = chain_to_coin.get(chain_name)
            if not coin_id:
                continue  # Only track chains we can map to known coins

            coins_to_upsert.append(Coin(id=coin_id, symbol=chain_name.lower(), name=chain_name, categories=["l1"]))
            metrics.append(
                OnChainMetric(
                    coin_id=coin_id,
                    timestamp=now,
                    metric_type="chain_tvl",
                    value=tvl,
                    source="defillama",
                    raw_data=None,
                )
            )

        if coins_to_upsert:
            db.upsert_coins(coins_to_upsert)
        if metrics:
            db.insert_onchain_metrics(metrics)
            logger.info(f"[{self.name}] Stored {len(metrics)} chain TVL metrics")
