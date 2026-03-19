"""Paper trading simulator — answers "would following these signals make money?"

Takes all evaluated intelligence alerts and simulates trades with realistic rules:
- Entry at price_at_detection
- Exit at 48h (or 24h stop-loss if exceeded)
- Fees per side (0.1% = 0.2% round trip)
- Position sizing ($1000 default)
- Only trades patterns/confidence above threshold

This is NOT backtesting on historical data — it's forward-testing on live signals
that the system generated in real-time.
"""

import logging
from dataclasses import dataclass, field

import db

logger = logging.getLogger(__name__)

# ── Trading Rules ──────────────────────────────────────────────────────

POSITION_SIZE_USD = 1000      # dollars per trade
FEE_PCT = 0.001               # 0.1% per side (Binance/Coinbase tier 1)
STOP_LOSS_PCT = 0.08          # 8% stop-loss (exit at 24h if exceeded)
MIN_CONFIDENCE = 0.15         # minimum confidence to trade (match alert threshold)
# Which patterns to trade — exit_hype is the ONLY pattern with positive hit rate
TRADEABLE_PATTERNS = {"smart_money_exit_hype"}


@dataclass
class PaperTrade:
    signal_id: int
    coin_id: str
    alert_type: str
    confidence: float
    direction: str              # "short" or "long"
    entry_price: float
    exit_price: float
    exit_reason: str            # "48h_close", "24h_stop_loss", "24h_close"
    raw_pnl_pct: float          # before fees
    fees_pct: float
    net_pnl_pct: float          # after fees
    net_pnl_usd: float
    ts: str


@dataclass
class PaperTradingResult:
    trades: list[PaperTrade] = field(default_factory=list)
    total_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    win_rate: float = 0.0
    total_pnl_usd: float = 0.0
    total_pnl_pct: float = 0.0  # average per trade
    avg_win_pct: float = 0.0
    avg_loss_pct: float = 0.0
    profit_factor: float = 0.0  # gross wins / gross losses
    max_drawdown_usd: float = 0.0
    best_trade_pct: float = 0.0
    worst_trade_pct: float = 0.0
    cumulative_pnl: list[float] = field(default_factory=list)  # running total after each trade


def simulate() -> PaperTradingResult:
    """Run paper trading simulation on all evaluated signals."""
    signals = _fetch_evaluated_signals()
    if not signals:
        return PaperTradingResult()

    trades = []
    for sig in signals:
        trade = _simulate_single(sig)
        if trade:
            trades.append(trade)

    # Sort by timestamp (oldest first for cumulative tracking)
    trades.sort(key=lambda t: t.ts)

    return _compute_stats(trades)


def _fetch_evaluated_signals() -> list[dict]:
    """Fetch all evaluated signals with price data from DB."""
    client = db.get_client()
    result = (
        client.table("intelligence_alerts")
        .select("id, coin_id, alert_type, confidence, severity, "
                "predicted_direction, price_at_detection, "
                "price_24h, price_48h, change_pct_24h, change_pct_48h, "
                "direction_correct_24h, direction_correct_48h, ts")
        .not_.is_("price_at_detection", "null")
        .not_.is_("checked_24h_at", "null")
        .order("ts", desc=False)
        .limit(500)
        .execute()
    )
    return result.data or []


def _simulate_single(sig: dict) -> PaperTrade | None:
    """Simulate a single trade from an evaluated signal."""
    alert_type = sig["alert_type"]
    confidence = sig.get("confidence", 0) or 0

    # Filter: only trade configured patterns above threshold
    if alert_type not in TRADEABLE_PATTERNS:
        return None
    if confidence < MIN_CONFIDENCE:
        return None

    entry_price = sig.get("price_at_detection")
    price_24h = sig.get("price_24h")
    price_48h = sig.get("price_48h")
    change_24h = sig.get("change_pct_24h")

    if not entry_price or not price_24h:
        return None

    # Direction: exit_hype/empty_hype = short, stealth_acc/buying_fear = long
    if alert_type in ("smart_money_exit_hype", "empty_hype"):
        direction = "short"
    else:
        direction = "long"

    # Check 24h stop-loss
    exit_price = None
    exit_reason = None

    if change_24h is not None:
        change_frac = change_24h / 100.0
        # For shorts: loss when price goes UP. For longs: loss when price goes DOWN.
        if direction == "short" and change_frac > STOP_LOSS_PCT:
            exit_price = price_24h
            exit_reason = "24h_stop_loss"
        elif direction == "long" and change_frac < -STOP_LOSS_PCT:
            exit_price = price_24h
            exit_reason = "24h_stop_loss"

    if exit_price is None:
        if price_48h is not None:
            exit_price = price_48h
            exit_reason = "48h_close"
        else:
            # Only 24h data available, use it
            exit_price = price_24h
            exit_reason = "24h_close"

    # Calculate P&L
    if direction == "short":
        raw_pnl_pct = -(exit_price - entry_price) / entry_price
    else:
        raw_pnl_pct = (exit_price - entry_price) / entry_price

    fees = 2 * FEE_PCT  # round trip
    net_pnl_pct = raw_pnl_pct - fees
    net_pnl_usd = net_pnl_pct * POSITION_SIZE_USD

    return PaperTrade(
        signal_id=sig["id"],
        coin_id=sig["coin_id"],
        alert_type=alert_type,
        confidence=confidence,
        direction=direction,
        entry_price=entry_price,
        exit_price=exit_price,
        exit_reason=exit_reason,
        raw_pnl_pct=round(raw_pnl_pct, 6),
        fees_pct=round(fees, 6),
        net_pnl_pct=round(net_pnl_pct, 6),
        net_pnl_usd=round(net_pnl_usd, 2),
        ts=sig["ts"],
    )


def _compute_stats(trades: list[PaperTrade]) -> PaperTradingResult:
    """Compute aggregate statistics from a list of trades."""
    if not trades:
        return PaperTradingResult()

    wins = [t for t in trades if t.net_pnl_usd > 0]
    losses = [t for t in trades if t.net_pnl_usd <= 0]

    total_pnl = sum(t.net_pnl_usd for t in trades)
    gross_wins = sum(t.net_pnl_usd for t in wins) if wins else 0
    gross_losses = abs(sum(t.net_pnl_usd for t in losses)) if losses else 0

    # Cumulative P&L curve
    cumulative = []
    running = 0.0
    peak = 0.0
    max_dd = 0.0
    for t in trades:
        running += t.net_pnl_usd
        cumulative.append(round(running, 2))
        if running > peak:
            peak = running
        dd = peak - running
        if dd > max_dd:
            max_dd = dd

    return PaperTradingResult(
        trades=trades,
        total_trades=len(trades),
        winning_trades=len(wins),
        losing_trades=len(losses),
        win_rate=len(wins) / len(trades) if trades else 0,
        total_pnl_usd=round(total_pnl, 2),
        total_pnl_pct=round(sum(t.net_pnl_pct for t in trades) / len(trades) * 100, 2) if trades else 0,
        avg_win_pct=round(sum(t.net_pnl_pct for t in wins) / len(wins) * 100, 2) if wins else 0,
        avg_loss_pct=round(sum(t.net_pnl_pct for t in losses) / len(losses) * 100, 2) if losses else 0,
        profit_factor=round(gross_wins / gross_losses, 2) if gross_losses > 0 else float("inf") if gross_wins > 0 else 0,
        max_drawdown_usd=round(max_dd, 2),
        best_trade_pct=round(max(t.net_pnl_pct for t in trades) * 100, 2),
        worst_trade_pct=round(min(t.net_pnl_pct for t in trades) * 100, 2),
        cumulative_pnl=cumulative,
    )
