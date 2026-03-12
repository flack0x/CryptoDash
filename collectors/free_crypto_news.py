"""CryptoCompare news collector — crypto news articles with categories.

Uses the free CryptoCompare news API (no key required).
Also provides social stats endpoint for coin-level social data.
"""

import json
import logging
from utils import utcnow

import db
from models import Coin, SocialSignal

from .base import BaseCollector

logger = logging.getLogger(__name__)

NEWS_URL = "https://min-api.cryptocompare.com/data/v2/news/"

# Map common category strings to coin IDs
CATEGORY_TO_COIN = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "XRP": "ripple", "ADA": "cardano", "DOGE": "dogecoin",
    "DOT": "polkadot", "AVAX": "avalanche-2", "MATIC": "matic-network",
    "LINK": "chainlink", "UNI": "uniswap", "AAVE": "aave",
    "LTC": "litecoin", "BNB": "binancecoin", "ATOM": "cosmos",
    "NEAR": "near", "ARB": "arbitrum", "OP": "optimism",
    "SUI": "sui", "APT": "aptos", "FIL": "filecoin",
    "RENDER": "render-token", "FET": "fetch-ai", "INJ": "injective-protocol",
    "TIA": "celestia", "PEPE": "pepe", "SHIB": "shiba-inu",
    "BONK": "bonk", "MKR": "maker", "CRV": "curve-dao-token",
    "LDO": "lido-dao", "ONDO": "ondo-finance", "PENDLE": "pendle",
}


class CryptoNewsCollector(BaseCollector):
    name = "crypto_news"

    def collect(self):
        """Fetch latest crypto news from CryptoCompare."""
        logger.info(f"[{self.name}] Collecting crypto news...")
        now = utcnow()

        data = self.get(NEWS_URL, params={"lang": "EN"})

        if not data or data.get("Response") == "Error":
            logger.warning(f"[{self.name}] API returned error or no data")
            return

        articles = data.get("Data", [])
        if isinstance(articles, dict):
            articles = list(articles.values())

        if not articles:
            logger.warning(f"[{self.name}] No articles returned")
            return

        signals = []
        for article in articles:
            categories = article.get("categories", "")
            title = article.get("title", "")

            # Parse categories (comma-separated, e.g. "BTC|ETH|Trading")
            cat_list = [c.strip() for c in categories.split("|")] if categories else []

            # Map categories to coin IDs
            matched_coins = set()
            for cat in cat_list:
                coin_id = CATEGORY_TO_COIN.get(cat.upper())
                if coin_id:
                    matched_coins.add(coin_id)

            if matched_coins:
                for coin_id in matched_coins:
                    signals.append(
                        SocialSignal(
                            coin_id=coin_id,
                            timestamp=now,
                            source="cryptocompare_news",
                            mentions=1,
                            sentiment_score=None,
                            engagement=None,
                            raw_data=json.dumps({"title": title[:200]}),
                        )
                    )
            else:
                # General market news
                signals.append(
                    SocialSignal(
                        coin_id="_market",
                        timestamp=now,
                        source="cryptocompare_news",
                        mentions=1,
                        sentiment_score=None,
                        engagement=None,
                        raw_data=json.dumps({"title": title[:200]}),
                    )
                )

        if signals:
            # Ensure _market coin exists
            db.upsert_coin(Coin(id="_market", symbol="_market", name="General Market", categories=["meta"]))
            db.insert_social_signals(signals)
            logger.info(f"[{self.name}] Stored {len(signals)} news signals from {len(articles)} articles")
