"""CryptoDash — Crypto Intelligence System.

Usage:
    python main.py              Run one collection cycle + show summary
    python main.py --daemon     Run continuously on schedule
    python main.py --collect    Only collect data (no analysis)
    python main.py --analyze    Only run analysis on existing data
"""

import argparse
import logging
import sys
from utils import utcnow

from dotenv import load_dotenv
load_dotenv()

import db
from scheduler import create_scheduler, get_all_collectors
from analysis.summary import generate_summary
from output.cli import print_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def run_all_collectors():
    """Run all collectors once."""
    collectors = get_all_collectors()
    for collector in collectors:
        try:
            logger.info(f"Running {collector.name}...")
            collector.collect()
        except Exception as e:
            logger.error(f"{collector.name} failed: {e}", exc_info=True)
        finally:
            collector.close()


def run_analysis():
    """Run the analysis engine and display results."""
    summary = generate_summary()
    print_summary(summary)


def run_outcome_checks():
    """Check signal outcomes for alerts that have aged 24h/48h."""
    try:
        from analysis.outcomes import check_outcomes
        check_outcomes()
    except Exception as e:
        logger.error(f"Outcome check failed: {e}", exc_info=True)


def run_paper_trading():
    """Run paper trading simulation and display results."""
    try:
        from analysis.paper_trading import simulate
        from output.cli import print_paper_trading
        result = simulate()
        if result.total_trades > 0:
            print_paper_trading(result)
    except Exception as e:
        logger.error(f"Paper trading sim failed: {e}", exc_info=True)


def seed_wallets():
    """Load whale wallet seed data from data/whale_wallets.json."""
    import json
    from pathlib import Path
    from models import TrackedWallet

    seed_file = Path(__file__).parent / "data" / "whale_wallets.json"
    if not seed_file.exists():
        logger.error(f"Seed file not found: {seed_file}")
        return

    with open(seed_file) as f:
        wallets_data = json.load(f)

    wallets = [
        TrackedWallet(
            address=w["address"],
            chain=w.get("chain", "ethereum"),
            label=w["label"],
            entity_type=w["entity_type"],
            source="seed",
        )
        for w in wallets_data
    ]

    db.upsert_tracked_wallets(wallets)
    logger.info(f"Seeded {len(wallets)} tracked wallets into DB")


def main():
    parser = argparse.ArgumentParser(description="CryptoDash — Crypto Intelligence System")
    parser.add_argument("--daemon", action="store_true", help="Run continuously on schedule")
    parser.add_argument("--collect", action="store_true", help="Only collect data")
    parser.add_argument("--analyze", action="store_true", help="Only analyze existing data")
    parser.add_argument("--seed-wallets", action="store_true", help="Load whale wallet seed data into DB")
    args = parser.parse_args()

    # Initialize database
    db.init_db()
    logger.info("Database initialized")

    # Always sync wallet list — upsert is safe (ON CONFLICT DO NOTHING on address+chain)
    seed_wallets()

    if args.seed_wallets:
        return

    if args.daemon:
        # Run initial collection, then start scheduler
        logger.info("Starting initial collection...")
        run_all_collectors()
        run_analysis()
        run_outcome_checks()
        run_paper_trading()

        logger.info("Starting scheduler (Ctrl+C to stop)...")
        scheduler = create_scheduler()
        # Reschedule all jobs to run immediately on next interval
        for job in scheduler.get_jobs():
            job.modify(next_run_time=utcnow())
        try:
            scheduler.start()
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            scheduler.shutdown()

    elif args.collect:
        run_all_collectors()

    elif args.analyze:
        run_analysis()
        run_outcome_checks()
        run_paper_trading()

    else:
        # Default: collect + analyze once
        run_all_collectors()
        run_analysis()
        run_outcome_checks()
        run_paper_trading()


if __name__ == "__main__":
    main()
