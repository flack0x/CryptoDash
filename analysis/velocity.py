"""Velocity detection — what's accelerating unusually fast?

Computes rate-of-change for mentions, volume, price, and TVL.
Flags anything moving significantly faster than its baseline.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from utils import utcnow

import config
import db
from models import VelocityAlert


def detect_velocity_alerts(window_hours: int | None = None, threshold: float | None = None) -> list[VelocityAlert]:
    """
    Find coins/metrics that are accelerating beyond their baseline.

    Compares the most recent data window against the prior window
    to find unusual rate-of-change.
    """
    window = window_hours or config.VELOCITY_WINDOW_HOURS
    thresh = threshold or config.VELOCITY_THRESHOLD
    now = utcnow()
    half_window = timedelta(hours=window / 2)
    full_window = timedelta(hours=window)

    alerts = []

    # ── Social mention velocity ──
    alerts.extend(_social_velocity(now, half_window, full_window, thresh))

    # ── Volume velocity ──
    alerts.extend(_volume_velocity(now, half_window, full_window, thresh))

    # ── Price velocity ──
    alerts.extend(_price_velocity(now, half_window, full_window, thresh))

    # ── TVL velocity ──
    alerts.extend(_tvl_velocity(now, half_window, full_window, thresh))

    # Sort by multiplier (most extreme first)
    alerts.sort(key=lambda a: abs(a.multiplier), reverse=True)
    return alerts


def _social_velocity(now, half_window, full_window, threshold) -> list[VelocityAlert]:
    """Detect spikes in social mentions."""
    alerts = []

    recent_signals = db.get_all_social_signals_since(now - half_window)
    older_signals = db.get_all_social_signals_since(now - full_window)

    # Count mentions per coin in each window
    recent_mentions = defaultdict(int)
    older_mentions = defaultdict(int)

    for s in recent_signals:
        recent_mentions[s.coin_id] += s.mentions

    for s in older_signals:
        if s.timestamp < now - half_window:
            older_mentions[s.coin_id] += s.mentions

    for coin_id, recent_count in recent_mentions.items():
        baseline = older_mentions.get(coin_id, 0)
        if baseline > 0:
            multiplier = recent_count / baseline
            if multiplier >= threshold:
                alerts.append(
                    VelocityAlert(
                        timestamp=now,
                        coin_id=coin_id,
                        metric="mentions",
                        current_value=recent_count,
                        baseline_value=baseline,
                        multiplier=multiplier,
                        direction="up",
                    )
                )
            elif multiplier <= 1 / threshold and baseline >= 5:
                alerts.append(
                    VelocityAlert(
                        timestamp=now,
                        coin_id=coin_id,
                        metric="mentions",
                        current_value=recent_count,
                        baseline_value=baseline,
                        multiplier=multiplier,
                        direction="down",
                    )
                )

    return alerts


def _volume_velocity(now, half_window, full_window, threshold) -> list[VelocityAlert]:
    """Detect unusual volume changes."""
    alerts = []

    recent_snaps = db.get_all_snapshots_since(now - half_window)
    older_snaps = db.get_all_snapshots_since(now - full_window)

    # Average volume per coin in each window
    recent_vol = defaultdict(list)
    older_vol = defaultdict(list)

    for s in recent_snaps:
        if s.volume_24h > 0:
            recent_vol[s.coin_id].append(s.volume_24h)

    for s in older_snaps:
        if s.timestamp < now - half_window and s.volume_24h > 0:
            older_vol[s.coin_id].append(s.volume_24h)

    for coin_id, recent_vals in recent_vol.items():
        older_vals = older_vol.get(coin_id, [])
        if not older_vals:
            continue

        recent_avg = sum(recent_vals) / len(recent_vals)
        older_avg = sum(older_vals) / len(older_vals)

        if older_avg > 0:
            multiplier = recent_avg / older_avg
            if multiplier >= threshold:
                alerts.append(
                    VelocityAlert(
                        timestamp=now,
                        coin_id=coin_id,
                        metric="volume",
                        current_value=recent_avg,
                        baseline_value=older_avg,
                        multiplier=multiplier,
                        direction="up",
                    )
                )

    return alerts


def _price_velocity(now, half_window, full_window, threshold) -> list[VelocityAlert]:
    """Detect unusual price movements."""
    alerts = []

    recent_snaps = db.get_all_snapshots_since(now - half_window)
    older_snaps = db.get_all_snapshots_since(now - full_window)

    recent_prices = {}
    older_prices = {}

    for s in recent_snaps:
        if s.price_usd > 0:
            recent_prices[s.coin_id] = s.price_usd  # Latest price

    for s in older_snaps:
        if s.timestamp < now - half_window and s.price_usd > 0:
            if s.coin_id not in older_prices:
                older_prices[s.coin_id] = s.price_usd  # Earliest price in window

    for coin_id, recent_price in recent_prices.items():
        old_price = older_prices.get(coin_id)
        if not old_price or old_price <= 0:
            continue

        multiplier = recent_price / old_price
        if multiplier >= threshold:
            alerts.append(
                VelocityAlert(
                    timestamp=now,
                    coin_id=coin_id,
                    metric="price",
                    current_value=recent_price,
                    baseline_value=old_price,
                    multiplier=multiplier,
                    direction="up",
                )
            )
        elif multiplier <= 1 / threshold:
            alerts.append(
                VelocityAlert(
                    timestamp=now,
                    coin_id=coin_id,
                    metric="price",
                    current_value=recent_price,
                    baseline_value=old_price,
                    multiplier=multiplier,
                    direction="down",
                )
            )

    return alerts


def _tvl_velocity(now, half_window, full_window, threshold) -> list[VelocityAlert]:
    """Detect unusual TVL changes."""
    alerts = []

    recent_metrics = db.get_all_onchain_since(now - half_window)
    older_metrics = db.get_all_onchain_since(now - full_window)

    recent_tvl = {}
    older_tvl = {}

    for m in recent_metrics:
        if m.metric_type == "tvl":
            recent_tvl[m.coin_id] = m.value

    for m in older_metrics:
        if m.metric_type == "tvl" and m.timestamp < now - half_window:
            if m.coin_id not in older_tvl:
                older_tvl[m.coin_id] = m.value

    for coin_id, recent_val in recent_tvl.items():
        old_val = older_tvl.get(coin_id)
        if not old_val or old_val <= 0:
            continue

        multiplier = recent_val / old_val
        if multiplier >= threshold:
            alerts.append(
                VelocityAlert(
                    timestamp=now,
                    coin_id=coin_id,
                    metric="tvl",
                    current_value=recent_val,
                    baseline_value=old_val,
                    multiplier=multiplier,
                    direction="up",
                )
            )
        elif multiplier <= 1 / threshold:
            alerts.append(
                VelocityAlert(
                    timestamp=now,
                    coin_id=coin_id,
                    metric="tvl",
                    current_value=recent_val,
                    baseline_value=old_val,
                    multiplier=multiplier,
                    direction="down",
                )
            )

    return alerts
