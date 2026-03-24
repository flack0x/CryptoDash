"""Intelligence brief generator — converts alerts into natural language briefs."""

from datetime import timedelta
from utils import utcnow
import db

TEMPLATES = {
    "stealth_accumulation": (
        "STEALTH ACCUMULATION: {entities_summary} moved ${whale_volume:,.0f} into "
        "{coin_upper} in the last {window}h. Social mentions: {mentions} "
        "({mention_context}). {history_note}"
    ),
    "empty_hype": (
        "EMPTY HYPE WARNING: {coin_upper} social mentions are {mention_ratio:.1f}x above "
        "average ({mentions} vs normal {avg_mentions:.0f}), but whale wallets show "
        "{whale_summary}. {history_note}"
    ),
    "smart_money_buying_fear": (
        "SMART MONEY BUYING FEAR: Sentiment for {coin_upper} is negative "
        "({sentiment:.2f}), but {entities_summary} accumulated ${whale_volume:,.0f} "
        "in the last {window}h. {history_note}"
    ),
    "smart_money_dip_buy": (
        "CONFIRMED DIP BUY: {entities_summary} persistently accumulating "
        "${whale_volume:,.0f} of {coin_upper} during price dip. "
        "Whale buying confirmed across multiple analysis runs. {history_note}"
    ),
    "smart_money_exit_hype": (
        "SMART MONEY EXIT: While crowd sentiment for {coin_upper} is positive "
        "({sentiment:+.2f}), {entities_summary} moved ${whale_volume:,.0f} toward "
        "exchanges in the last {window}h. {history_note}"
    ),
}


def generate_brief(alert, window_hours: int = 48) -> str:
    """Generate a natural language brief for an IntelligenceAlert."""
    template = TEMPLATES.get(alert.alert_type, "{headline}")

    # Build entities summary
    entities = alert.whale_entities or []
    if entities:
        names = [e["label"] for e in entities[:3] if e.get("label")]
        entities_summary = ", ".join(names) if names else "Unknown wallets"
    else:
        entities_summary = "Unknown wallets"

    # Mention context
    avg = alert.social_avg_mentions or 0
    mentions = alert.social_mentions or 0
    if avg > 0:
        ratio = mentions / avg
        if ratio < 0.3:
            mention_context = f"far below average of {avg:.0f}"
        elif ratio < 0.7:
            mention_context = f"below average of {avg:.0f}"
        elif ratio < 1.3:
            mention_context = f"near average of {avg:.0f}"
        else:
            mention_context = f"{ratio:.1f}x above average of {avg:.0f}"
    else:
        mention_context = "no baseline available"

    # Whale summary for empty_hype
    if alert.whale_direction == "dumping":
        whale_summary = f"net ${abs(alert.whale_volume_usd or 0):,.0f} flowing to exchanges"
    elif alert.whale_direction == "neutral":
        whale_summary = "no significant whale activity"
    else:
        whale_summary = f"only ${alert.whale_volume_usd or 0:,.0f} in whale activity"

    # History note
    history_note = _history_note(alert.coin_id, alert.alert_type)

    mention_ratio = (mentions / avg) if avg > 0 else 0

    try:
        brief = template.format(
            coin_upper=(alert.coin_id or "").upper(),
            entities_summary=entities_summary,
            whale_volume=alert.whale_volume_usd or 0,
            mentions=mentions,
            avg_mentions=avg,
            mention_context=mention_context,
            mention_ratio=mention_ratio,
            sentiment=alert.social_sentiment or 0,
            whale_summary=whale_summary,
            window=window_hours,
            history_note=history_note,
            headline=alert.headline,
        )
    except (KeyError, ValueError):
        brief = alert.headline

    return brief


def _history_note(coin_id: str, alert_type: str) -> str:
    """Check if this pattern has appeared before."""
    if not coin_id:
        return ""
    since = utcnow() - timedelta(days=30)
    try:
        previous = db.get_intelligence_alerts_for_coin(coin_id, alert_type, since)
        if previous and len(previous) > 0:
            return f"This pattern has appeared {len(previous)} time(s) in the last 30 days."
        return "First time this pattern has been detected for this asset."
    except Exception:
        return ""
