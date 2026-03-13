"""4chan /biz/ collector — monitors crypto threads for early retail sentiment."""

import json
import logging
import re
import time
from collections import defaultdict
from html import unescape

import db
from models import SocialSignal
from utils import utcnow
from analysis.sentiment import SentimentAnalyzer
from collectors.base import BaseCollector

logger = logging.getLogger(__name__)


class FourChanCollector(BaseCollector):
    name = "fourchan"
    API_BASE = "https://a.4cdn.org"
    BOARD = "biz"

    def __init__(self):
        super().__init__()
        self.sentiment = SentimentAnalyzer()

    def collect(self):
        logger.info(f"[{self.name}] Collecting from /biz/...")

        # Step 1: Get thread catalog
        catalog = self.get(f"{self.API_BASE}/{self.BOARD}/catalog.json", min_interval=1.0)
        if not catalog:
            logger.error(f"[{self.name}] Failed to fetch catalog")
            return

        # Step 2: Find threads with enough activity
        threads = []
        for page in catalog:
            for thread in page.get("threads", []):
                if thread.get("replies", 0) >= 5:
                    threads.append(thread)

        # Sort by reply count, take top 30
        threads.sort(key=lambda t: t.get("replies", 0), reverse=True)
        threads = threads[:30]

        # Step 3: Fetch and analyze each thread
        all_signals = defaultdict(lambda: {"mentions": 0, "sentiments": [], "engagement": 0})

        for thread in threads:
            thread_no = thread["no"]
            time.sleep(1.0)  # Strict 1 req/sec

            thread_data = self.get(
                f"{self.API_BASE}/{self.BOARD}/thread/{thread_no}.json",
                min_interval=1.0,
            )
            if not thread_data:
                continue

            for post in thread_data.get("posts", []):
                text = self._strip_html(post.get("com", ""))
                if not text or len(text) < 5:
                    continue

                mentioned = self.sentiment.extract_coin_mentions(text)
                if not mentioned:
                    continue

                score = self.sentiment.score(text)
                for coin_id in mentioned:
                    all_signals[coin_id]["mentions"] += 1
                    all_signals[coin_id]["sentiments"].append(score)
                    all_signals[coin_id]["engagement"] += 1

        # Step 4: Store signals
        now = utcnow()
        signals = []
        for coin_id, data in all_signals.items():
            avg_sentiment = sum(data["sentiments"]) / len(data["sentiments"]) if data["sentiments"] else 0
            signals.append(SocialSignal(
                coin_id=coin_id,
                timestamp=now,
                source="4chan_biz",
                mentions=data["mentions"],
                sentiment_score=round(avg_sentiment, 4),
                engagement=data["engagement"],
            ))

        if signals:
            # Ensure coins exist (placeholder only — won't overwrite proper names from CoinGecko)
            db.ensure_coins_exist([s.coin_id for s in signals])
            db.insert_social_signals(signals)
            logger.info(f"[{self.name}] Stored {len(signals)} coin signals from /biz/")

    @staticmethod
    def _strip_html(text: str) -> str:
        """Remove HTML tags and decode entities from 4chan post text."""
        clean = re.sub(r'<br\s*/?>', ' ', text)
        clean = re.sub(r'<[^>]+>', ' ', clean)
        clean = unescape(clean).strip()
        return re.sub(r'\s+', ' ', clean)
