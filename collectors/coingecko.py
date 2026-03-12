"""CoinGecko collector — prices, trending coins, market data."""

import logging
from utils import utcnow

import config
import db
from models import Coin, MarketSnapshot, TrendingCoin

from .base import BaseCollector

logger = logging.getLogger(__name__)

BASE_URL = "https://api.coingecko.com/api/v3"


class CoinGeckoCollector(BaseCollector):
    name = "coingecko"

    def __init__(self):
        super().__init__()
        self.headers = {}
        if config.COINGECKO_API_KEY:
            self.headers["x-cg-demo-api-key"] = config.COINGECKO_API_KEY

    def collect(self):
        """Run full collection: markets + trending."""
        self.collect_markets()
        self.collect_trending()

    def collect_markets(self):
        """Fetch top coins by market cap with prices, volumes, and changes."""
        logger.info(f"[{self.name}] Collecting market data...")
        now = utcnow()

        page = 1
        all_coins = []
        all_snapshots = []

        while len(all_coins) < config.TOP_COINS_LIMIT:
            data = self.get(
                f"{BASE_URL}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "order": "market_cap_desc",
                    "per_page": 250,
                    "page": page,
                    "sparkline": "false",
                    "price_change_percentage": "24h",
                },
                headers=self.headers,
            )

            if not data:
                break

            for item in data:
                coin = Coin(
                    id=item["id"],
                    symbol=item.get("symbol", ""),
                    name=item.get("name", ""),
                    categories=[],
                )
                all_coins.append(coin)

                snapshot = MarketSnapshot(
                    coin_id=item["id"],
                    timestamp=now,
                    price_usd=item.get("current_price") or 0,
                    volume_24h=item.get("total_volume") or 0,
                    market_cap=item.get("market_cap") or 0,
                    price_change_24h=item.get("price_change_percentage_24h"),
                    rank=item.get("market_cap_rank"),
                )
                all_snapshots.append(snapshot)

            if len(data) < 250:
                break
            page += 1

        if all_coins:
            db.upsert_coins(all_coins)
            db.insert_snapshots(all_snapshots)
            logger.info(f"[{self.name}] Stored {len(all_coins)} coins, {len(all_snapshots)} snapshots")

    def collect_trending(self):
        """Fetch trending coins (what CoinGecko users are searching for)."""
        logger.info(f"[{self.name}] Collecting trending coins...")
        now = utcnow()

        data = self.get(f"{BASE_URL}/search/trending", headers=self.headers)
        if not data or "coins" not in data:
            return

        trending_list = []
        coins_to_upsert = []

        for i, item in enumerate(data["coins"], 1):
            coin_data = item.get("item", {})
            coin_id = coin_data.get("id", "")
            if not coin_id:
                continue

            coins_to_upsert.append(
                Coin(
                    id=coin_id,
                    symbol=coin_data.get("symbol", ""),
                    name=coin_data.get("name", ""),
                    categories=[],
                )
            )

            trending_list.append(
                TrendingCoin(
                    coin_id=coin_id,
                    timestamp=now,
                    source="coingecko",
                    rank=i,
                    score=coin_data.get("score"),
                )
            )

        if coins_to_upsert:
            db.upsert_coins(coins_to_upsert)
        if trending_list:
            db.insert_trending(trending_list)
            logger.info(f"[{self.name}] Stored {len(trending_list)} trending coins")
