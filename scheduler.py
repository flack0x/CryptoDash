"""Scheduler — runs all collectors on their defined intervals."""

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger

import config
from collectors.coingecko import CoinGeckoCollector
from collectors.alternative_me import FearGreedCollector
from collectors.free_crypto_news import CryptoNewsCollector
from collectors.defillama import DeFiLlamaCollector
from collectors.geckoterminal import GeckoTerminalCollector
from collectors.fourchan import FourChanCollector

logger = logging.getLogger(__name__)


def run_collector(collector):
    """Wrapper to run a collector with error handling."""
    try:
        collector.collect()
    except Exception as e:
        logger.error(f"[{collector.name}] Collection failed: {e}", exc_info=True)


def run_analysis():
    """Run smart money analysis and persist new alerts."""
    try:
        from analysis.summary import generate_summary
        from output.cli import print_summary
        summary = generate_summary()
        print_summary(summary)
        logger.info(f"Analysis complete: {len(summary.intelligence_alerts)} alerts generated")
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)


def create_scheduler() -> BlockingScheduler:
    """Create and configure the scheduler with all collectors."""
    scheduler = BlockingScheduler()

    # Initialize collectors
    coingecko = CoinGeckoCollector()
    fear_greed = FearGreedCollector()
    crypto_news = CryptoNewsCollector()
    defillama = DeFiLlamaCollector()
    geckoterminal = GeckoTerminalCollector()

    # Schedule each collector
    scheduler.add_job(
        run_collector,
        IntervalTrigger(seconds=config.SCHEDULES["coingecko_markets"]),
        args=[coingecko],
        id="coingecko",
        name="CoinGecko Markets & Trending",
        next_run_time=None,  # Don't run immediately — main.py handles first run
    )

    scheduler.add_job(
        run_collector,
        IntervalTrigger(seconds=config.SCHEDULES["fear_greed"]),
        args=[fear_greed],
        id="fear_greed",
        name="Fear & Greed Index",
        next_run_time=None,
    )

    scheduler.add_job(
        run_collector,
        IntervalTrigger(seconds=config.SCHEDULES["free_crypto_news"]),
        args=[crypto_news],
        id="free_crypto_news",
        name="Free Crypto News",
        next_run_time=None,
    )

    scheduler.add_job(
        run_collector,
        IntervalTrigger(seconds=config.SCHEDULES["defillama"]),
        args=[defillama],
        id="defillama",
        name="DeFiLlama TVL",
        next_run_time=None,
    )

    scheduler.add_job(
        run_collector,
        IntervalTrigger(seconds=config.SCHEDULES["geckoterminal"]),
        args=[geckoterminal],
        id="geckoterminal",
        name="GeckoTerminal DEX",
        next_run_time=None,
    )

    # 4chan /biz/ — no API key needed
    fourchan = FourChanCollector()
    scheduler.add_job(
        run_collector,
        IntervalTrigger(seconds=config.SCHEDULES["fourchan"]),
        args=[fourchan],
        id="fourchan",
        name="4chan /biz/ Sentiment",
        next_run_time=None,
    )

    # Reddit — needs OAuth credentials
    if config.REDDIT_CLIENT_ID and config.REDDIT_CLIENT_SECRET:
        from collectors.reddit import RedditCollector
        reddit = RedditCollector()
        scheduler.add_job(
            run_collector,
            IntervalTrigger(seconds=config.SCHEDULES["reddit"]),
            args=[reddit],
            id="reddit",
            name="Reddit Sentiment",
            next_run_time=None,
        )

    # Etherscan whale tracker — needs API key
    if config.ETHERSCAN_API_KEY:
        from collectors.whale_tracker import WhaleTrackerCollector
        whale_tracker = WhaleTrackerCollector()
        scheduler.add_job(
            run_collector,
            IntervalTrigger(seconds=config.SCHEDULES["whale_tracker"]),
            args=[whale_tracker],
            id="whale_tracker",
            name="Etherscan Whale Tracker",
            next_run_time=None,
        )

    # Whale Alert — needs API key
    if config.WHALE_ALERT_API_KEY:
        from collectors.whale_alert import WhaleAlertCollector
        whale_alert = WhaleAlertCollector()
        scheduler.add_job(
            run_collector,
            IntervalTrigger(seconds=config.SCHEDULES["whale_alert"]),
            args=[whale_alert],
            id="whale_alert",
            name="Whale Alert Large Transactions",
            next_run_time=None,
        )

    # Smart money analysis — re-runs every 30 min to generate fresh alerts
    scheduler.add_job(
        run_analysis,
        IntervalTrigger(seconds=config.SCHEDULES["smart_money_analysis"]),
        id="smart_money_analysis",
        name="Smart Money Analysis",
        next_run_time=None,  # main.py runs it once at startup
    )

    return scheduler


def get_all_collectors():
    """Return a list of all collector instances (for one-shot runs)."""
    collectors = [
        CoinGeckoCollector(),
        FearGreedCollector(),
        CryptoNewsCollector(),
        DeFiLlamaCollector(),
        GeckoTerminalCollector(),
        FourChanCollector(),
    ]

    if config.REDDIT_CLIENT_ID and config.REDDIT_CLIENT_SECRET:
        from collectors.reddit import RedditCollector
        collectors.append(RedditCollector())

    if config.ETHERSCAN_API_KEY:
        from collectors.whale_tracker import WhaleTrackerCollector
        collectors.append(WhaleTrackerCollector())

    if config.WHALE_ALERT_API_KEY:
        from collectors.whale_alert import WhaleAlertCollector
        collectors.append(WhaleAlertCollector())

    return collectors
