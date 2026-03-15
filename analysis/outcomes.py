"""Signal outcome tracker — did the predicted direction come true?

Runs as part of every main.py execution. Checks alerts that are now 24h/48h old,
finds the closest available price snapshot, and records whether the signal was correct.

Direction semantics:
  stealth_accumulation / smart_money_buying_fear → bullish (expect price UP)
  empty_hype / smart_money_exit_hype → bearish (expect price DOWN)
"""

import logging
from datetime import datetime, timedelta

import db
from utils import utcnow

logger = logging.getLogger(__name__)

# Price must move beyond this band to count as "correct"
# Flat movement = signal didn't deliver value
NEUTRAL_BAND_PCT = 0.5


def check_outcomes():
    """Check pending outcomes that are now 24h or 48h old."""
    now = utcnow()

    checked_24 = _check_checkpoint(now, "24h", timedelta(hours=24))
    checked_48 = _check_checkpoint(now, "48h", timedelta(hours=48))

    if checked_24 or checked_48:
        logger.info(f"Outcome checks: {checked_24} at 24h, {checked_48} at 48h")


def _check_checkpoint(now: datetime, checkpoint: str, offset: timedelta) -> int:
    """Check all pending alerts for a given checkpoint (24h or 48h)."""
    cutoff = now - offset
    pending = db.get_pending_outcome_checks(checkpoint, cutoff)

    if not pending:
        return 0

    logger.info(f"Checking {len(pending)} outcomes at {checkpoint} mark")
    checked = 0

    for outcome in pending:
        detected_at = datetime.fromisoformat(outcome["ts"])
        target_time = detected_at + offset

        # Find price closest to the target time (±2h window, widen to ±6h if overdue)
        price = _find_closest_price(outcome["coin_id"], target_time, tolerance_hours=2)
        if price is None and (now - target_time) > timedelta(hours=6):
            price = _find_closest_price(outcome["coin_id"], target_time, tolerance_hours=6)
        if price is None:
            continue

        detection_price = outcome["price_at_detection"]
        change_pct = ((price - detection_price) / detection_price) * 100
        direction_correct = _evaluate_direction(outcome["predicted_direction"], change_pct)

        if checkpoint == "24h":
            updates = {
                "price_24h": price,
                "change_pct_24h": round(change_pct, 4),
                "direction_correct_24h": direction_correct,
                "checked_24h_at": now.isoformat(),
            }
        else:
            updates = {
                "price_48h": price,
                "change_pct_48h": round(change_pct, 4),
                "direction_correct_48h": direction_correct,
                "checked_48h_at": now.isoformat(),
            }

        db.update_alert_outcome(outcome["id"], updates)
        checked += 1

    return checked


def _find_closest_price(coin_id: str, target_time: datetime, tolerance_hours: int = 2) -> float | None:
    """Find the price snapshot closest to target_time within tolerance."""
    window_start = target_time - timedelta(hours=tolerance_hours)
    window_end = target_time + timedelta(hours=tolerance_hours)

    snapshots = db.get_snapshots_since(coin_id, window_start)
    if not snapshots:
        return None

    best = None
    best_delta = None
    for snap in snapshots:
        if snap.timestamp > window_end:
            break
        delta = abs((snap.timestamp - target_time).total_seconds())
        if best_delta is None or delta < best_delta:
            best = snap
            best_delta = delta

    return best.price_usd if best else None


def _evaluate_direction(predicted: str, change_pct: float) -> bool:
    """Did price move in the predicted direction beyond the neutral band?"""
    if predicted == "bullish":
        return change_pct > NEUTRAL_BAND_PCT
    elif predicted == "bearish":
        return change_pct < -NEUTRAL_BAND_PCT
    return False


def compute_hit_rates() -> dict:
    """Compute hit rates overall and per alert_type.

    Returns:
        {
            "overall_24h": {"total": N, "correct": N, "rate": 0.XX},
            "overall_48h": {"total": N, "correct": N, "rate": 0.XX},
            "by_type_24h": {"stealth_accumulation": {"total": N, "correct": N, "rate": 0.XX}, ...},
            "by_type_48h": {...},
        }
    """
    stats = db.get_outcome_stats()
    if not stats:
        return {"overall_24h": {"total": 0, "correct": 0, "rate": 0.0}}

    result = {
        "overall_24h": {"total": 0, "correct": 0},
        "overall_48h": {"total": 0, "correct": 0},
        "by_type_24h": {},
        "by_type_48h": {},
    }

    for s in stats:
        if s.get("direction_correct_24h") is not None:
            result["overall_24h"]["total"] += 1
            if s["direction_correct_24h"]:
                result["overall_24h"]["correct"] += 1

            at = s["alert_type"]
            if at not in result["by_type_24h"]:
                result["by_type_24h"][at] = {"total": 0, "correct": 0}
            result["by_type_24h"][at]["total"] += 1
            if s["direction_correct_24h"]:
                result["by_type_24h"][at]["correct"] += 1

        if s.get("direction_correct_48h") is not None:
            result["overall_48h"]["total"] += 1
            if s["direction_correct_48h"]:
                result["overall_48h"]["correct"] += 1

            at = s["alert_type"]
            if at not in result["by_type_48h"]:
                result["by_type_48h"][at] = {"total": 0, "correct": 0}
            result["by_type_48h"][at]["total"] += 1
            if s["direction_correct_48h"]:
                result["by_type_48h"][at]["correct"] += 1

    # Calculate rates
    for key in ["overall_24h", "overall_48h"]:
        t = result[key]["total"]
        result[key]["rate"] = result[key]["correct"] / t if t > 0 else 0.0

    for bucket in ["by_type_24h", "by_type_48h"]:
        for counts in result[bucket].values():
            t = counts["total"]
            counts["rate"] = counts["correct"] / t if t > 0 else 0.0

    return result
