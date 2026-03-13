"use client";

import type { EnrichedAlert } from "@/lib/types";
import SeverityBadge from "./SeverityBadge";
import { timeAgo, formatPrice, formatPercent, formatUSD } from "@/lib/format";

const typeLabels: Record<string, { label: string; icon: string; color: string; description: string }> = {
  stealth_accumulation: {
    label: "Stealth Accumulation",
    icon: "🔍",
    color: "text-green-400",
    description: "Whales buying while crowd isn't paying attention",
  },
  empty_hype: {
    label: "Empty Hype",
    icon: "⚠",
    color: "text-yellow-400",
    description: "Social buzz with no smart money backing",
  },
  smart_money_buying_fear: {
    label: "Smart $ Buying Fear",
    icon: "💰",
    color: "text-cyan-400",
    description: "Whales accumulating during negative sentiment",
  },
  smart_money_exit_hype: {
    label: "Smart $ Exiting",
    icon: "🚪",
    color: "text-red-400",
    description: "Whales selling while crowd is euphoric",
  },
};

function formatCoinName(alert: EnrichedAlert): string {
  if (alert.coin?.name && alert.coin.name !== alert.coin.id) return alert.coin.name;
  if (!alert.coin_id) return "?";
  return alert.coin_id.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function buildSignalDescription(alert: EnrichedAlert): string {
  const mentions = alert.social_mentions;
  const avgMentions = alert.social_avg_mentions;
  const whaleUsd = alert.whale_volume_usd;

  if (alert.alert_type === "empty_hype") {
    if (mentions && avgMentions && avgMentions > 0) {
      const ratio = (mentions / avgMentions).toFixed(1);
      return `${ratio}x normal social activity (${mentions} mentions vs avg ${avgMentions}) — no whale buying detected`;
    }
    return "Elevated social buzz with no smart money backing";
  }

  if (alert.alert_type === "stealth_accumulation") {
    const usdStr = whaleUsd ? `$${(whaleUsd / 1_000_000).toFixed(1)}M` : "significant";
    return `${usdStr} whale inflows while only ${mentions ?? 0} social mentions (avg: ${avgMentions ?? 0})`;
  }

  if (alert.alert_type === "smart_money_buying_fear") {
    const usdStr = whaleUsd ? `$${(whaleUsd / 1_000_000).toFixed(1)}M` : "";
    return `Whales buying ${usdStr} during negative sentiment (score: ${(alert.social_sentiment ?? 0).toFixed(2)})`;
  }

  if (alert.alert_type === "smart_money_exit_hype") {
    const usdStr = whaleUsd ? `$${(whaleUsd / 1_000_000).toFixed(1)}M` : "";
    return `Whales selling ${usdStr} while sentiment is positive (score: ${(alert.social_sentiment ?? 0).toFixed(2)})`;
  }

  const brief = alert.brief || alert.headline;
  return brief.length > 100 ? brief.substring(0, 100) + "..." : brief;
}

export default function IntelligenceAlerts({ alerts }: { alerts: EnrichedAlert[] }) {
  // Check if all alerts are the same type (indicates limited data)
  const uniqueTypes = new Set(alerts.map((a) => a.alert_type));
  const isMonotone = alerts.length > 0 && uniqueTypes.size === 1;

  return (
    <div className="rounded-lg border border-red-900/50 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-red-400">
          Smart Money Intelligence
        </h2>
        {isMonotone && (
          <span className="text-xs text-gray-600">
            Limited signal diversity — whale tracking will improve coverage
          </span>
        )}
      </div>
      {alerts.length === 0 ? (
        <p className="text-gray-500">No intelligence alerts in the last 24h</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => {
            const typeInfo = typeLabels[a.alert_type] ?? {
              label: a.alert_type, icon: "?", color: "text-gray-400", description: "",
            };
            return (
              <div key={a.id} className="flex items-start gap-3 rounded-md border border-gray-800/60 bg-gray-800/20 px-3 py-2.5 hover:bg-gray-800/40 transition-colors">
                <div className="flex-shrink-0 mt-0.5">
                  <SeverityBadge severity={a.severity} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-100">
                      {formatCoinName(a)}
                      {a.coin?.symbol && a.coin.symbol !== a.coin.id && (
                        <span className="ml-1.5 text-gray-500 text-xs font-normal">{a.coin.symbol.toUpperCase()}</span>
                      )}
                    </span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${typeInfo.color} bg-gray-800`}>
                      {typeInfo.label}
                    </span>
                    {a.confidence != null && (
                      <span className="text-xs text-gray-500 tabular-nums">
                        {Math.round(a.confidence * 100)}% conf
                      </span>
                    )}
                  </div>
                  {a.price_usd != null && (
                    <div className="flex items-center gap-3 mt-0.5 text-xs">
                      <span className="text-gray-300 tabular-nums">{formatPrice(a.price_usd)}</span>
                      {a.price_change_24h != null && (
                        <span className={`tabular-nums ${a.price_change_24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {formatPercent(a.price_change_24h)}
                        </span>
                      )}
                      {a.market_cap != null && a.market_cap > 0 && (
                        <span className="text-gray-500">{formatUSD(a.market_cap)} mcap</span>
                      )}
                    </div>
                  )}
                  <p className="text-sm text-gray-400 mt-0.5">
                    {buildSignalDescription(a)}
                  </p>
                </div>
                <div className="flex-shrink-0 text-xs text-gray-600 whitespace-nowrap">
                  {timeAgo(a.ts)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
