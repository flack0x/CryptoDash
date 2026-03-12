"""Alternative.me collector — Fear & Greed Index."""

import logging
from utils import utcnow

import db
from models import MarketMood

from .base import BaseCollector

logger = logging.getLogger(__name__)

FEAR_GREED_URL = "https://api.alternative.me/fng/"


class FearGreedCollector(BaseCollector):
    name = "fear_greed"

    def collect(self):
        """Fetch the current Fear & Greed Index."""
        logger.info(f"[{self.name}] Collecting Fear & Greed Index...")

        data = self.get(FEAR_GREED_URL, params={"limit": 1})
        if not data or "data" not in data:
            return

        entry = data["data"][0]
        mood = MarketMood(
            timestamp=utcnow(),
            value=int(entry.get("value", 0)),
            label=entry.get("value_classification", "Unknown"),
        )

        db.insert_market_mood(mood)
        logger.info(f"[{self.name}] Market mood: {mood.value} ({mood.label})")
