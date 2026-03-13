"""Sentiment analysis engine using VADER for social media text.

Provides:
1. Sentiment scoring (-1.0 to 1.0)
2. Coin mention extraction from natural text
"""

import re
import logging

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

logger = logging.getLogger(__name__)

# Static map of well-known tickers -> CoinGecko IDs
_SYMBOL_MAP = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "XRP": "ripple", "ADA": "cardano", "DOT": "polkadot",
    "AVAX": "avalanche-2", "LINK": "chainlink", "UNI": "uniswap",
    "AAVE": "aave", "MKR": "maker", "CRV": "curve-dao-token",
    "LDO": "lido-dao", "DOGE": "dogecoin", "SHIB": "shiba-inu",
    "PEPE": "pepe", "BONK": "bonk", "ARB": "arbitrum",
    "OP": "optimism", "MATIC": "matic-network", "NEAR": "near",
    "SUI": "sui", "APT": "aptos", "TIA": "celestia",
    "INJ": "injective-protocol", "FET": "fetch-ai",
    "RNDR": "render-token", "FIL": "filecoin",
    "ONDO": "ondo-finance", "PENDLE": "pendle",
    "ATOM": "cosmos", "BNB": "binancecoin",
    "LTC": "litecoin", "COMP": "compound-governance-token",
    "SNX": "synthetix-network-token", "SUSHI": "sushi",
    "BAL": "balancer", "GRT": "the-graph",
    "IMX": "immutable-x", "SAND": "the-sandbox",
    "AXS": "axie-infinity", "GALA": "gala",
    "RPL": "rocket-pool", "ENS": "ethereum-name-service",
    "TAO": "bittensor", "RENDER": "render-token",
    "FTM": "fantom", "ALGO": "algorand",
    "HBAR": "hedera-hashgraph", "VET": "vechain",
    "THETA": "theta-token", "AR": "arweave",
    "HNT": "helium", "KAS": "kaspa",
    "TON": "toncoin", "SEI": "sei-network",
    "WLD": "worldcoin", "PYTH": "pyth-network",
    "JUP": "jupiter-exchange-solana", "W": "wormhole",
    "STRK": "starknet", "MANTA": "manta-network",
    "TRX": "tron", "PI": "pi-network",
    "HYPE": "hyperliquid",
}

# Short symbols that are common English words — require $ prefix
_AMBIGUOUS_SYMBOLS = {"OP", "W", "AR", "PI", "SUI", "SEI", "NEAR"}

# Symbols/names loaded from DB that are common English words — never auto-match
# These are real coins but their tickers cause massive false positives on social media
_EXCLUDED_DB_SYMBOLS = {
    "REAL", "CASH", "SAFE", "TRUE", "OPEN", "PLAY", "RARE", "HIGH", "FIRE",
    "EVER", "FUEL", "GATE", "KEEP", "MOVE", "PUSH", "SEED", "TURN", "WRAP",
    "RISE", "SWAP", "UNIT", "WAVE", "ZERO", "EDGE", "FLUX", "HIVE", "MASK",
    "NEST", "CORE", "VIBE", "ACE", "AMP", "HEX", "ION", "ORB", "NET",
    "HOT", "KEY", "WIN", "RUN", "PAY", "GAS", "MAP", "RAY", "ANY",
    "ONE", "DAY", "TIME", "WAY", "BACK", "LONG", "FREE", "BIG", "TOP",
    "JUST", "RAIN", "FOUR", "STAR", "HOPE", "LIVE", "MINE", "LIKE",
    "PUMP", "MOON", "BEAR", "BULL", "DOGE", "NFT", "APE",
    "GREAT", "SUPER", "ALPHA", "BETA", "MAGIC", "OCEAN", "PIXEL",
    "SPELL", "TRIBE", "WING", "BONE", "CREAM", "FARM", "CAKE",
}

_EXCLUDED_DB_NAMES = {
    # Common English words that are also coin names — massive false positive risk
    "cash", "real", "safe", "true", "open", "play", "rare", "fire",
    "mask", "nest", "core", "vibe", "edge", "hive", "rise", "wave",
    "magic", "ocean", "alpha", "super", "spell", "cream", "farm",
    "reserve", "standard", "origin", "anchor", "aurora", "dawn",
    "just", "rain", "four", "aster", "night", "midnight", "story",
    "send", "hunt", "yield", "orbit", "blur", "meme", "coin",
    "fuel", "keep", "loom", "wrap", "turn", "push", "seed",
    "ever", "hope", "star", "mine", "like", "live", "only",
}

# Full name map (lowercase)
_NAME_MAP = {
    "bitcoin": "bitcoin", "ethereum": "ethereum", "solana": "solana",
    "cardano": "cardano", "polkadot": "polkadot", "chainlink": "chainlink",
    "uniswap": "uniswap", "aave": "aave", "dogecoin": "dogecoin",
    "arbitrum": "arbitrum", "optimism": "optimism", "avalanche": "avalanche-2",
    "cosmos": "cosmos", "polygon": "matic-network", "litecoin": "litecoin",
    "bittensor": "bittensor", "celestia": "celestia", "filecoin": "filecoin",
    "arweave": "arweave", "helium": "helium", "worldcoin": "worldcoin",
    "hyperliquid": "hyperliquid", "starknet": "starknet",
}


class SentimentAnalyzer:
    def __init__(self):
        self.vader = SentimentIntensityAnalyzer()
        self._db_vocab_loaded = False
        self._symbol_map = dict(_SYMBOL_MAP)
        self._name_map = dict(_NAME_MAP)

    def score(self, text: str) -> float:
        """Return compound sentiment score from -1.0 to 1.0."""
        if not text or len(text.strip()) < 3:
            return 0.0
        scores = self.vader.polarity_scores(text)
        return scores["compound"]

    def extract_coin_mentions(self, text: str) -> set[str]:
        """Extract CoinGecko IDs of coins mentioned in text."""
        if not self._db_vocab_loaded:
            self._load_db_vocab()

        found = set()
        text_upper = text.upper()
        text_lower = text.lower()

        # Check $ prefixed symbols (strongest signal, always match)
        for match in re.finditer(r'\$([A-Z]{2,10})', text_upper):
            symbol = match.group(1)
            if symbol in self._symbol_map:
                found.add(self._symbol_map[symbol])

        # Check standalone symbols (word-bounded)
        for symbol, coin_id in self._symbol_map.items():
            if symbol in _AMBIGUOUS_SYMBOLS:
                continue  # Skip ambiguous unless $ prefixed (handled above)
            if len(symbol) < 3:
                continue  # Skip very short symbols without $
            pattern = r'(?:^|\s)' + re.escape(symbol) + r'(?:\s|$|[.,!?;:\)])'
            if re.search(pattern, text_upper):
                found.add(coin_id)

        # Check full names (case-insensitive, word-bounded for short names)
        for name, coin_id in self._name_map.items():
            if len(name) < 4:
                continue
            if len(name) < 7:
                # Short names need word boundary to avoid "rain" in "training"
                if re.search(r'\b' + re.escape(name) + r'\b', text_lower):
                    found.add(coin_id)
            else:
                # Longer names (7+ chars) are specific enough for substring match
                if name in text_lower:
                    found.add(coin_id)

        return found

    def _load_db_vocab(self):
        """Augment vocabulary from coins in DB."""
        self._db_vocab_loaded = True
        try:
            import db
            coins = db.get_all_coins()
            for coin in coins:
                sym = coin.symbol.upper()
                if (len(sym) >= 3
                        and sym not in self._symbol_map
                        and sym not in _EXCLUDED_DB_SYMBOLS
                        and sym not in _AMBIGUOUS_SYMBOLS):
                    self._symbol_map[sym] = coin.id
                name = coin.name.lower()
                if (len(name) >= 4
                        and name not in self._name_map
                        and name not in _EXCLUDED_DB_NAMES):
                    self._name_map[name] = coin.id
        except Exception:
            pass  # DB may not be ready
