"""GeckoTerminal collector — DEX activity, trending pools, new tokens."""

import json
import logging
from utils import utcnow

import db
from models import Coin, OnChainMetric, TrendingCoin

from .base import BaseCollector

logger = logging.getLogger(__name__)

BASE_URL = "https://api.geckoterminal.com/api/v2"


class GeckoTerminalCollector(BaseCollector):
    name = "geckoterminal"

    def collect(self):
        """Collect trending pools and new token activity."""
        self.collect_trending_pools()
        self.collect_new_pools()

    def collect_trending_pools(self):
        """Fetch trending pools across all networks — shows what's getting DEX volume."""
        logger.info(f"[{self.name}] Collecting trending pools...")
        now = utcnow()

        data = self.get(
            f"{BASE_URL}/networks/trending_pools",
            headers={"Accept": "application/json"},
            min_interval=6.0,  # 10 req/min limit
        )

        if not data or "data" not in data:
            return

        trending = []
        metrics = []

        for i, pool in enumerate(data["data"][:20], 1):
            attrs = pool.get("attributes", {})
            name = attrs.get("name", "")
            volume_24h = float(attrs.get("volume_usd", {}).get("h24", 0) or 0)
            price_change = float(attrs.get("price_change_percentage", {}).get("h24", 0) or 0)

            # Extract the base token as the "coin"
            token_name = name.split("/")[0].strip() if "/" in name else name
            pool_id = pool.get("id", f"pool-{i}")

            # Use pool address as coin_id since these are DEX tokens
            coin_id = f"dex:{pool_id}"

            db.upsert_coin(Coin(id=coin_id, symbol=token_name.lower(), name=token_name, categories=["dex"]))

            trending.append(
                TrendingCoin(
                    coin_id=coin_id,
                    timestamp=now,
                    source="geckoterminal",
                    rank=i,
                    score=volume_24h,
                )
            )

            if volume_24h > 0:
                metrics.append(
                    OnChainMetric(
                        coin_id=coin_id,
                        timestamp=now,
                        metric_type="dex_volume_24h",
                        value=volume_24h,
                        source="geckoterminal",
                        raw_data=json.dumps({"price_change_24h": price_change, "pool_name": name}),
                    )
                )

        if trending:
            db.insert_trending(trending)
        if metrics:
            db.insert_onchain_metrics(metrics)
            logger.info(f"[{self.name}] Stored {len(trending)} trending pools, {len(metrics)} volume metrics")

    def collect_new_pools(self):
        """Fetch newly created pools — early signal of new token launches."""
        logger.info(f"[{self.name}] Collecting new pools...")
        now = utcnow()

        data = self.get(
            f"{BASE_URL}/networks/new_pools",
            headers={"Accept": "application/json"},
            min_interval=6.0,
        )

        if not data or "data" not in data:
            return

        metrics = []
        for pool in data["data"][:30]:
            attrs = pool.get("attributes", {})
            name = attrs.get("name", "unknown")
            pool_id = pool.get("id", "")
            reserve = float(attrs.get("reserve_in_usd", 0) or 0)

            if reserve > 10_000:  # Only track pools with meaningful liquidity
                coin_id = f"dex:{pool_id}"
                token_name = name.split("/")[0].strip() if "/" in name else name

                db.upsert_coin(Coin(id=coin_id, symbol=token_name.lower(), name=token_name, categories=["dex", "new"]))

                metrics.append(
                    OnChainMetric(
                        coin_id=coin_id,
                        timestamp=now,
                        metric_type="new_pool_liquidity",
                        value=reserve,
                        source="geckoterminal",
                        raw_data=json.dumps({"pool_name": name, "pool_id": pool_id}),
                    )
                )

        if metrics:
            db.insert_onchain_metrics(metrics)
            logger.info(f"[{self.name}] Stored {len(metrics)} new pool metrics")
