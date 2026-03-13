"""Etherscan wallet tracker — monitors known whale/VC/exchange wallets for token transfers."""

import logging
from datetime import timezone, datetime
from typing import Optional

import config
import db
from models import WhaleTransaction, TrackedWallet
from utils import utcnow
from collectors.base import BaseCollector

logger = logging.getLogger(__name__)

# Map common ERC-20 symbols to CoinGecko IDs
TOKEN_SYMBOL_MAP = {
    "WETH": "ethereum", "ETH": "ethereum",
    "USDC": "usd-coin", "USDT": "tether", "DAI": "dai",
    "WBTC": "wrapped-bitcoin", "AAVE": "aave", "UNI": "uniswap",
    "LINK": "chainlink", "MKR": "maker", "CRV": "curve-dao-token",
    "LDO": "lido-dao", "ARB": "arbitrum", "OP": "optimism",
    "PEPE": "pepe", "SHIB": "shiba-inu", "ENS": "ethereum-name-service",
    "RPL": "rocket-pool", "SNX": "synthetix-network-token",
    "COMP": "compound-governance-token", "SUSHI": "sushi",
    "1INCH": "1inch", "BAL": "balancer", "FET": "fetch-ai",
    "RNDR": "render-token", "GRT": "the-graph", "IMX": "immutable-x",
    "ONDO": "ondo-finance", "PENDLE": "pendle",
    "STETH": "staked-ether", "RETH": "rocket-pool-eth",
    "CBETH": "coinbase-wrapped-staked-eth",
    "DOGE": "dogecoin", "MATIC": "matic-network",
    "FIL": "filecoin", "SAND": "the-sandbox",
    "MANA": "decentraland", "AXS": "axie-infinity",
    "TAO": "bittensor", "WLD": "worldcoin",
}


class WhaleTrackerCollector(BaseCollector):
    name = "whale_tracker"
    ETHERSCAN_API = "https://api.etherscan.io/v2/api"

    def __init__(self):
        super().__init__()
        self.api_key = config.ETHERSCAN_API_KEY

    def collect(self):
        logger.info(f"[{self.name}] Tracking whale wallets...")
        wallets = db.get_tracked_wallets(chain="ethereum", active_only=True)
        if not wallets:
            logger.warning(f"[{self.name}] No tracked wallets found. Run --seed-wallets first.")
            return

        total_txs = 0
        # Process wallets in batches to stay within rate limits
        for wallet in wallets[:20]:  # Check up to 20 wallets per cycle
            txs = self._track_wallet(wallet)
            total_txs += txs
            db.update_wallet_last_checked(wallet.address, wallet.chain)

        logger.info(f"[{self.name}] Tracked {len(wallets[:20])} wallets, found {total_txs} transactions")

    def _track_wallet(self, wallet: TrackedWallet) -> int:
        """Fetch recent ERC-20 token transfers for a wallet. Returns count of new transactions."""
        # Get ERC-20 token transfers
        data = self.get(
            self.ETHERSCAN_API,
            params={
                "chainid": 1,  # Ethereum mainnet
                "module": "account",
                "action": "tokentx",
                "address": wallet.address,
                "page": 1,
                "offset": 25,  # Last 25 transfers
                "sort": "desc",
                "apikey": self.api_key,
            },
            min_interval=0.35,  # ~3 calls/sec
        )

        if not data or data.get("status") != "1":
            return 0

        transactions = []
        for tx in data.get("result", []):
            raw_dir = "in" if tx["to"].lower() == wallet.address.lower() else "out"

            # Semantic direction depends on entity type:
            # Exchange: tokens IN = someone depositing to sell; tokens OUT = someone withdrew (bought)
            # Fund/VC:  tokens IN = fund is receiving/buying; tokens OUT = fund is sending/selling
            if wallet.entity_type == "exchange":
                direction = "sell" if raw_dir == "in" else "buy"
            else:
                direction = "buy" if raw_dir == "in" else "sell"

            token_symbol = tx.get("tokenSymbol", "")
            amount_raw = int(tx.get("value", 0))
            decimals = int(tx.get("tokenDecimal", 18))
            amount = amount_raw / (10 ** decimals) if decimals > 0 else amount_raw

            coin_id = TOKEN_SYMBOL_MAP.get(token_symbol.upper())
            amount_usd = self._estimate_usd(coin_id, amount)

            # Only track transactions we can value and that are whale-sized
            if amount_usd is None or amount_usd < 10_000:
                continue

            transactions.append(WhaleTransaction(
                wallet_address=wallet.address,
                coin_id=coin_id,
                token_symbol=token_symbol,
                token_address=tx.get("contractAddress", ""),
                amount=amount,
                amount_usd=amount_usd,
                direction=direction,
                chain="ethereum",
                label=wallet.label,
                entity_type=wallet.entity_type,
                tx_hash=tx.get("hash", ""),
                block_number=int(tx.get("blockNumber", 0)),
                counterparty=tx["from"] if direction == "in" else tx["to"],
                source="etherscan",
                timestamp=datetime.fromtimestamp(int(tx.get("timeStamp", 0)), tz=timezone.utc),
            ))

        if transactions:
            db.insert_whale_transactions(transactions)

        return len(transactions)

    def _estimate_usd(self, coin_id: Optional[str], amount: float) -> Optional[float]:
        """Estimate USD value using latest price from our DB."""
        if not coin_id:
            return None
        # Stablecoins
        if coin_id in ("usd-coin", "tether", "dai"):
            return amount
        try:
            snapshot = db.get_latest_snapshot(coin_id)
            if snapshot and snapshot.price_usd > 0:
                return amount * snapshot.price_usd
        except Exception:
            pass
        return None
