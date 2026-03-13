"""Reddit collector — scrapes crypto subreddits for mentions and sentiment."""

import json
import logging

import praw

import config
import db
from models import SocialSignal
from utils import utcnow
from analysis.sentiment import SentimentAnalyzer
from collectors.base import BaseCollector

logger = logging.getLogger(__name__)


class RedditCollector(BaseCollector):
    name = "reddit"

    def __init__(self):
        super().__init__()
        self.reddit = praw.Reddit(
            client_id=config.REDDIT_CLIENT_ID,
            client_secret=config.REDDIT_CLIENT_SECRET,
            user_agent=config.REDDIT_USER_AGENT,
        )
        self.sentiment = SentimentAnalyzer()

    def collect(self):
        logger.info(f"[{self.name}] Collecting from Reddit...")
        all_signals = {}  # coin_id -> {mentions, sentiments, engagement, posts}
        now = utcnow()

        for sub_name in config.REDDIT_SUBREDDITS:
            try:
                self._collect_subreddit(sub_name, all_signals)
            except Exception as e:
                logger.error(f"[{self.name}] Error scraping r/{sub_name}: {e}")

        # Convert sets to lists for JSON serialization (must happen before json.dumps)
        for data in all_signals.values():
            if isinstance(data["subreddits"], set):
                data["subreddits"] = list(data["subreddits"])

        # Convert aggregated signals to SocialSignal objects
        signals = []
        for coin_id, data in all_signals.items():
            avg_sentiment = sum(data["sentiments"]) / len(data["sentiments"]) if data["sentiments"] else 0
            signals.append(SocialSignal(
                coin_id=coin_id,
                timestamp=now,
                source="reddit",
                mentions=data["mentions"],
                sentiment_score=round(avg_sentiment, 4),
                engagement=data["engagement"],
                raw_data=json.dumps({
                    "subreddits": data["subreddits"],
                    "sample_titles": data["titles"][:5],
                }),
            ))

        if signals:
            # Ensure coins exist (placeholder only — won't overwrite proper names from CoinGecko)
            db.ensure_coins_exist([s.coin_id for s in signals])
            db.insert_social_signals(signals)
            logger.info(f"[{self.name}] Stored {len(signals)} coin signals from Reddit")

    def _collect_subreddit(self, sub_name: str, all_signals: dict):
        subreddit = self.reddit.subreddit(sub_name)

        for post in subreddit.hot(limit=config.REDDIT_POSTS_PER_SUB):
            text = f"{post.title} {post.selftext}"

            # Extract mentioned coins
            mentioned = self.sentiment.extract_coin_mentions(text)
            if not mentioned:
                continue

            # Score post sentiment
            post_sentiment = self.sentiment.score(text)

            # Sample top comments for richer sentiment
            comment_sentiments = []
            try:
                post.comments.replace_more(limit=0)
                for comment in post.comments[:config.REDDIT_COMMENTS_PER_POST]:
                    comment_sentiments.append(self.sentiment.score(comment.body))
                    # Also check comments for additional coin mentions
                    mentioned.update(self.sentiment.extract_coin_mentions(comment.body))
            except Exception:
                pass

            all_scores = [post_sentiment] + comment_sentiments
            avg_sentiment = sum(all_scores) / len(all_scores)
            engagement = post.score + post.num_comments

            for coin_id in mentioned:
                if coin_id not in all_signals:
                    all_signals[coin_id] = {
                        "mentions": 0,
                        "sentiments": [],
                        "engagement": 0,
                        "subreddits": set(),
                        "titles": [],
                    }
                all_signals[coin_id]["mentions"] += 1
                all_signals[coin_id]["sentiments"].append(avg_sentiment)
                all_signals[coin_id]["engagement"] += engagement
                all_signals[coin_id]["subreddits"].add(sub_name)
                all_signals[coin_id]["titles"].append(post.title[:100])

        # No-op: sets converted to lists in collect() before JSON serialization
