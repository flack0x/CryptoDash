"""CLI output — pretty terminal display of the intelligence summary."""

import sys
import io

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from analysis.summary import CryptoSummary

console = Console(force_terminal=True)


def print_summary(summary: CryptoSummary):
    """Print the full intelligence summary to the terminal."""
    console.clear()
    console.print()

    # ── Header ──
    console.print(
        Panel(
            f"[bold white]CryptoDash Intelligence Report[/bold white]\n"
            f"[dim]{summary.timestamp.strftime('%Y-%m-%d %H:%M UTC')}[/dim]",
            style="bold cyan",
        )
    )

    # ── Market Mood ──
    _print_mood(summary)

    # ── Intelligence Briefs (most important — smart money signals) ──
    if summary.intelligence_alerts:
        _print_intelligence_briefs(summary)

    # ── Divergence Alerts ──
    if summary.divergence_alerts:
        _print_divergences(summary)

    # ── Velocity Alerts ──
    if summary.velocity_alerts:
        _print_velocity(summary)

    # ── Narrative Momentum ──
    if summary.narratives:
        _print_narratives(summary)

    # ── Trending Coins ──
    if summary.trending_coins:
        _print_trending(summary)

    # ── Top Movers ──
    if summary.top_gainers or summary.top_losers:
        _print_movers(summary)

    console.print()


def _print_intelligence_briefs(summary: CryptoSummary):
    """Print smart money intelligence alerts as the primary output."""
    severity_style = {
        "critical": "[bold red]CRITICAL[/bold red]",
        "high": "[bold red]HIGH[/bold red]",
        "medium": "[yellow]MEDIUM[/yellow]",
        "low": "[dim]LOW[/dim]",
    }

    table = Table(
        title="Smart Money Intelligence",
        border_style="bold red",
        show_lines=True,
        title_style="bold white on red",
    )
    table.add_column("Severity", width=10, justify="center")
    table.add_column("Conf", width=6, justify="center")
    table.add_column("Brief", min_width=60)

    for alert in summary.intelligence_alerts[:15]:
        conf_str = f"{alert.confidence:.0%}" if alert.confidence else "?"
        brief_text = alert.brief or alert.headline
        table.add_row(
            severity_style.get(alert.severity, alert.severity),
            conf_str,
            brief_text,
        )

    console.print(table)
    console.print()


def _print_mood(summary: CryptoSummary):
    if not summary.market_mood:
        return

    mood = summary.market_mood
    value = mood.value

    if value <= 25:
        color = "red"
        icon = "!!"
    elif value <= 45:
        color = "yellow"
        icon = "!"
    elif value <= 55:
        color = "white"
        icon = "--"
    elif value <= 75:
        color = "green"
        icon = "+"
    else:
        color = "bold green"
        icon = "++"

    bar_filled = int(value / 2)
    bar = f"[{color}]{'#' * bar_filled}[/{color}][dim]{'.' * (50 - bar_filled)}[/dim]"

    console.print(
        Panel(
            f"  {icon} [{color}]{mood.label}[/{color}]  [{color}]{value}/100[/{color}]\n  {bar}",
            title="[bold]Market Mood (Fear & Greed)[/bold]",
            border_style="dim",
        )
    )


def _print_divergences(summary: CryptoSummary):
    table = Table(title="Divergence Alerts — Layers Disagreeing", border_style="red", show_lines=True)
    table.add_column("Severity", width=8, justify="center")
    table.add_column("Coin", width=20)
    table.add_column("Type", width=22)
    table.add_column("Description", min_width=40)

    type_labels = {
        "hype_no_substance": "[yellow]Hype, No Substance[/yellow]",
        "stealth_accumulation": "[green]Stealth Accumulation[/green]",
        "smart_money_buying_fear": "[cyan]Smart Money Buying Fear[/cyan]",
        "dying_project": "[red]Dying Project Signal[/red]",
    }

    severity_style = {
        "high": "[bold red]HIGH[/bold red]",
        "medium": "[yellow]MED[/yellow]",
        "low": "[dim]LOW[/dim]",
    }

    for alert in summary.divergence_alerts[:10]:
        table.add_row(
            severity_style.get(alert.severity, alert.severity),
            alert.coin_id,
            type_labels.get(alert.alert_type, alert.alert_type),
            alert.description,
        )

    console.print(table)
    console.print()


def _print_velocity(summary: CryptoSummary):
    table = Table(title="Velocity Alerts — What's Accelerating", border_style="yellow")
    table.add_column("Coin", width=20)
    table.add_column("Metric", width=12)
    table.add_column("Direction", width=10, justify="center")
    table.add_column("Multiplier", width=12, justify="right")
    table.add_column("Current", width=15, justify="right")
    table.add_column("Baseline", width=15, justify="right")

    for alert in summary.velocity_alerts[:10]:
        direction = "[green]UP[/green]" if alert.direction == "up" else "[red]DOWN[/red]"
        multiplier_str = f"[bold]{alert.multiplier:.1f}x[/bold]"

        table.add_row(
            alert.coin_id,
            alert.metric,
            direction,
            multiplier_str,
            _format_number(alert.current_value),
            _format_number(alert.baseline_value),
        )

    console.print(table)
    console.print()


def _print_narratives(summary: CryptoSummary):
    table = Table(title="Narrative Momentum — What Themes Are Moving", border_style="cyan")
    table.add_column("Narrative", width=30)
    table.add_column("Momentum", width=14, justify="center")
    table.add_column("Trend", width=10, justify="center")
    table.add_column("Coins", min_width=30)

    for n in summary.narratives:
        momentum = n.get("momentum") or 0
        coins = n.get("coin_ids", [])

        if momentum > 0.1:
            trend = "[green]Rising[/green]"
            mom_str = f"[green]+{momentum:.1%}[/green]"
        elif momentum < -0.1:
            trend = "[red]Fading[/red]"
            mom_str = f"[red]{momentum:.1%}[/red]"
        else:
            trend = "[dim]Stable[/dim]"
            mom_str = f"[dim]{momentum:.1%}[/dim]"

        coin_str = ", ".join(coins[:5])
        if len(coins) > 5:
            coin_str += f" +{len(coins) - 5} more"

        table.add_row(n["name"], mom_str, trend, coin_str)

    console.print(table)
    console.print()


def _print_trending(summary: CryptoSummary):
    table = Table(title="Trending Right Now", border_style="magenta")
    table.add_column("#", width=4, justify="right")
    table.add_column("Coin", width=25)
    table.add_column("Symbol", width=10)
    table.add_column("Source", width=15)

    for coin in summary.trending_coins[:15]:
        table.add_row(
            str(coin["rank"]),
            coin["name"],
            coin.get("symbol", "").upper(),
            coin["source"],
        )

    console.print(table)
    console.print()


def _print_movers(summary: CryptoSummary):
    if summary.top_gainers:
        table = Table(title="Top Gainers (24h)", border_style="green")
        table.add_column("Coin", width=20)
        table.add_column("Price", width=14, justify="right")
        table.add_column("Change", width=10, justify="right")
        table.add_column("Volume", width=16, justify="right")

        for m in summary.top_gainers[:5]:
            table.add_row(
                f"{m['name']} ({m['symbol'].upper()})",
                f"${m['price']:,.4f}" if m['price'] < 1 else f"${m['price']:,.2f}",
                f"[green]+{m['change_24h']:.1f}%[/green]",
                _format_number(m['volume']),
            )
        console.print(table)

    if summary.top_losers:
        table = Table(title="Top Losers (24h)", border_style="red")
        table.add_column("Coin", width=20)
        table.add_column("Price", width=14, justify="right")
        table.add_column("Change", width=10, justify="right")
        table.add_column("Volume", width=16, justify="right")

        for m in summary.top_losers[:5]:
            table.add_row(
                f"{m['name']} ({m['symbol'].upper()})",
                f"${m['price']:,.4f}" if m['price'] < 1 else f"${m['price']:,.2f}",
                f"[red]{m['change_24h']:.1f}%[/red]",
                _format_number(m['volume']),
            )
        console.print(table)

    console.print()


def _format_number(n: float) -> str:
    """Format large numbers with K/M/B suffixes."""
    if n >= 1_000_000_000:
        return f"${n / 1_000_000_000:.2f}B"
    elif n >= 1_000_000:
        return f"${n / 1_000_000:.2f}M"
    elif n >= 1_000:
        return f"${n / 1_000:.1f}K"
    else:
        return f"${n:.2f}"
