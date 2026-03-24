"""CryptoDash configuration — API keys, schedules, and settings."""

import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).parent

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://baptgroflunptsjqfsfx.supabase.co")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# API Keys (set via environment variables)
COINGECKO_API_KEY = os.getenv("COINGECKO_API_KEY", "")  # Optional, free demo key
DUNE_API_KEY = os.getenv("DUNE_API_KEY", "")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")  # Optional, increases rate limit
LUNARCRUSH_API_KEY = os.getenv("LUNARCRUSH_API_KEY", "")  # Phase 2

# Reddit OAuth (create "script" app at https://www.reddit.com/prefs/apps)
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT", "CryptoDash/1.0")

# Etherscan (register at https://etherscan.io/apis)
ETHERSCAN_API_KEY = os.getenv("ETHERSCAN_API_KEY", "")

# Whale Alert (register at https://whale-alert.io/signup)
WHALE_ALERT_API_KEY = os.getenv("WHALE_ALERT_API_KEY", "")

# Collection schedules (in seconds)
SCHEDULES = {
    "coingecko_trending": 300,      # 5 min
    "coingecko_markets": 300,       # 5 min
    "fear_greed": 3600,             # 1 hour
    "free_crypto_news": 900,        # 15 min
    "defillama": 1800,              # 30 min
    "geckoterminal": 600,           # 10 min
    "dune": 3600,                   # 1 hour
    "github": 21600,                # 6 hours
    "reddit": 600,                  # 10 min
    "fourchan": 900,                # 15 min
    "whale_tracker": 1800,          # 30 min
    "whale_alert": 600,             # 10 min
    "smart_money_analysis": 1800,   # 30 min
}

# Reddit config
REDDIT_SUBREDDITS = ["cryptocurrency", "bitcoin", "ethtrader", "defi", "altcoin"]
REDDIT_POSTS_PER_SUB = 50
REDDIT_COMMENTS_PER_POST = 10

# CoinGecko rate limiting
COINGECKO_RATE_LIMIT = 30          # calls per minute (free tier)
COINGECKO_MONTHLY_CAP = 10_000     # calls per month

# How many top coins to track by default
TOP_COINS_LIMIT = 250

# Velocity detection thresholds
VELOCITY_THRESHOLD = 3.0           # Flag if metric changes 3x from baseline
VELOCITY_WINDOW_HOURS = 24         # Lookback window for baseline

# Smart money thresholds
WHALE_MIN_USD = 50_000             # Minimum USD for whale move to count (was 500K, lowered to match our 105-wallet observation window)
STEALTH_MENTION_RATIO = 0.5       # Below this = "quiet"
HYPE_MENTION_RATIO = 2.0          # Above this = "hyped"
SMART_MONEY_WINDOW_HOURS = 48     # Lookback for smart money analysis

# Confidence formula denominators — scale to our observation capability
# With 105 wallets, typical non-stablecoin flow is $50-500K per token in 48h
STEALTH_CONFIDENCE_DENOM = 1_000_000    # Was effectively $10M hardcoded. $100K flow → 10% base confidence
EXIT_FEAR_CONFIDENCE_DENOM = 500_000    # Was effectively $5M hardcoded. $100K flow → 20% base confidence

# Sentiment thresholds for signal patterns
EXIT_HYPE_SENTIMENT = 0.2         # Was 0.3 — VADER aggregated scores cluster near 0, +0.2 IS positive
BUYING_FEAR_SENTIMENT = -0.1      # Was -0.2 — same reason, -0.1 IS genuinely negative for our sources

# Market-cap-relative whale threshold multiplier
MCAP_WHALE_MULTIPLIER = 0.00005   # Was 0.001 (0.1%). Now 0.005%. Confidence formula handles proportionality

# Paper trading exit rules
PROFIT_TARGET_PCT = 0.05          # 5% profit target — lock in gains early
STOP_LOSS_PCT = 0.08              # 8% stop-loss — limit damage
