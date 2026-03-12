"""Whale Alert collector — monitors large crypto transactions across chains."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import config
import db
from models import WhaleTransaction
from utils import utcnow
from collectors.base import BaseCollector

logger = logging.getLogger(__name__)

# Map Whale Alert symbols to CoinGecko IDs
SYMBOL_MAP = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "USDT": "tether", "USDC": "usd-coin", "XRP": "ripple",
    "ADA": "cardano", "DOT": "polkadot", "AVAX": "avalanche-2",
    "MATIC": "matic-network", "LINK": "chainlink", "UNI": "uniswap",
    "DOGE": "dogecoin", "SHIB": "shiba-inu", "LTC": "litecoin",
    "BNB": "binancecoin", "ATOM": "cosmos", "NEAR": "near",
    "ARB": "arbitrum", "OP": "optimism", "TRX": "tron",
    "ALGO": "algorand", "FIL": "filecoin", "HBAR": "hedera-hashgraph",
    "AAVE": "aave", "MKR": "maker",
}


class WhaleAlertCollector(BaseCollector):
    name = "whale_alert"
    API_URL = "https://api.whale-alert.io/v1/transactions"

    def __init__(self):
        super().__init__()
        self.api_key = config.WHALE_ALERT_API_KEY

    def collect(self):
        logger.info(f"[{self.name}] Fetching large transactions...")

        now = utcnow()
        start_ts = int((now - timedelta(minutes=10)).timestamp())

        data = self.get(
            self.API_URL,
            params={
                "api_key": self.api_key,
                "min_value": 500000,  # Only txs >= $500K USD
                "start": start_ts,
            },
            min_interval=6.0,  # 10 req/min
        )

        if not data or data.get("result") != "success":
            msg = data.get("message", "unknown") if data else "no response"
            logger.warning(f"[{self.name}] API returned: {msg}")
            return

        transactions = []
        for tx in data.get("transactions", []):
            symbol = tx.get("symbol", "").upper()
            amount = tx.get("amount", 0)
            amount_usd = tx.get("amount_usd", 0)
            blockchain = tx.get("blockchain", "unknown")

            from_info = tx.get("from", {})
            to_info = tx.get("to", {})
            from_owner = from_info.get("owner", "unknown")
            to_owner = to_info.get("owner", "unknown")
            from_type = from_info.get("owner_type", "unknown")
            to_type = to_info.get("owner_type", "unknown")

            direction = self._classify_direction(from_type, to_type)
            entity_type = self._classify_entity(from_type, to_type)
            coin_id = SYMBOL_MAP.get(symbol)

            transactions.append(WhaleTransaction(
                wallet_address=from_info.get("address", ""),
                coin_id=coin_id,
                token_symbol=symbol,
                token_address="",
                amount=amount,
                amount_usd=amount_usd,
                direction=direction,
                chain=blockchain,
                label=f"{from_owner} -> {to_owner}",
                entity_type=entity_type,
                tx_hash=tx.get("hash", ""),
                block_number=0,
                counterparty=to_info.get("address", ""),
                counterparty_label=to_owner,
                source="whale_alert",
                timestamp=datetime.fromtimestamp(tx.get("timestamp", 0), tz=timezone.utc),
            ))

        if transactions:
            db.insert_whale_transactions(transactions)
            logger.info(f"[{self.name}] Stored {len(transactions)} large transactions")
        else:
            logger.info(f"[{self.name}] No new large transactions in the last 10 minutes")

    @staticmethod
    def _classify_direction(from_type: str, to_type: str) -> str:
        if to_type == "exchange":
            return "in"       # To exchange = potential sell pressure
        elif from_type == "exchange":
            return "out"      # From exchange = accumulation
        return "transfer"

    @staticmethod
    def _classify_entity(from_type: str, to_type: str) -> str:
        if from_type == "exchange" or to_type == "exchange":
            return "exchange"
        return "whale"
