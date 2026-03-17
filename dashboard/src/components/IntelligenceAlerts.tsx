"use client";

import { useState } from "react";
import type { EnrichedAlert, WhaleEntity } from "@/lib/types";
import SeverityBadge from "./SeverityBadge";
import { timeAgo, formatPrice, formatPercent, formatUSD } from "@/lib/format";

const typeLabels: Record<string, { label: string; icon: string; color: string; description: string }> = {
  stealth_accumulation: {
    label: "Stealth Accumulation",
    icon: "?",
    color: "text-green-400",
    description: "Whales buying while crowd isn't paying attention",
  },
  empty_hype: {
    label: "Empty Hype",
    icon: "!",
    color: "text-yellow-400",
    description: "Social buzz with no smart money backing",
  },
  smart_money_buying_fear: {
    label: "Smart $ Buying Fear",
    icon: "$",
    color: "text-cyan-400",
    description: "Whales accumulating during negative sentiment",
  },
  smart_money_exit_hype: {
    label: "Smart $ Exiting",
    icon: "X",
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
      return `${ratio}x normal social activity (${mentions} mentions vs avg ${avgMentions}) -- no whale buying detected`;
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

function directionBadge(dir: string | null): { text: string; color: string } {
  if (dir === "bullish") return { text: "Bullish", color: "text-green-400 bg-green-400/10" };
  if (dir === "bearish") return { text: "Bearish", color: "text-red-400 bg-red-400/10" };
  return { text: "", color: "" };
}

function whaleDirectionLabel(dir: string | null): { text: string; color: string } {
  if (dir === "accumulating") return { text: "Accumulating", color: "text-green-400" };
  if (dir === "dumping") return { text: "Dumping", color: "text-red-400" };
  return { text: "Neutral", color: "text-gray-400" };
}

function AlertCard({ alert }: { alert: EnrichedAlert }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo = typeLabels[alert.alert_type] ?? {
    label: alert.alert_type, icon: "?", color: "text-gray-400", description: "",
  };
  const entities = (alert.whale_entities ?? []) as WhaleEntity[];
  const predicted = directionBadge(alert.predicted_direction);
  const whaleDir = whaleDirectionLabel(alert.whale_direction);

  return (
    <div
      className="rounded-md border border-gray-800/60 bg-gray-800/20 hover:bg-gray-800/40 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Collapsed row */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="flex-shrink-0 mt-0.5">
          <SeverityBadge severity={alert.severity} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-100">
              {formatCoinName(alert)}
              {alert.coin?.symbol && alert.coin.symbol !== alert.coin.id && (
                <span className="ml-1.5 text-gray-500 text-xs font-normal">{alert.coin.symbol.toUpperCase()}</span>
              )}
            </span>
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${typeInfo.color} bg-gray-800`}>
              {typeInfo.label}
            </span>
            {alert.confidence != null && (
              <span className="text-xs text-gray-500 tabular-nums">
                {Math.round(alert.confidence * 100)}% conf
              </span>
            )}
            {predicted.text && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${predicted.color}`}>
                {predicted.text}
              </span>
            )}
          </div>
          {alert.price_usd != null && (
            <div className="flex items-center gap-3 mt-0.5 text-xs">
              <span className="text-gray-300 tabular-nums">{formatPrice(alert.price_usd)}</span>
              {alert.price_change_24h != null && (
                <span className={`tabular-nums ${alert.price_change_24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {formatPercent(alert.price_change_24h)}
                </span>
              )}
              {alert.market_cap != null && alert.market_cap > 0 && (
                <span className="text-gray-500">{formatUSD(alert.market_cap)} mcap</span>
              )}
              {alert.price_at_detection != null && (
                <span className="text-gray-600">@ detect: {formatPrice(alert.price_at_detection)}</span>
              )}
            </div>
          )}
          <p className="text-sm text-gray-400 mt-0.5">
            {buildSignalDescription(alert)}
          </p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className="text-xs text-gray-600 whitespace-nowrap">{timeAgo(alert.ts)}</span>
          <span className="text-xs text-gray-700">{expanded ? "[-]" : "[+]"}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800/40 px-3 py-3 space-y-3 text-xs">
          {/* Full brief */}
          {alert.brief && (
            <div>
              <div className="text-gray-500 font-medium mb-1">Analysis Brief</div>
              <p className="text-gray-300 leading-relaxed">{alert.brief}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Whale flow detail */}
            {alert.whale_volume_usd != null && (
              <div>
                <div className="text-gray-500 font-medium mb-1">Whale Flow</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Volume:</span>
                    <span className="text-gray-200 font-medium tabular-nums">{formatUSD(alert.whale_volume_usd)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Direction:</span>
                    <span className={whaleDir.color}>{whaleDir.text}</span>
                  </div>
                  {entities.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {entities.slice(0, 5).map((e, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-gray-400 truncate mr-2">{e.label}</span>
                          <span className={`tabular-nums font-medium ${e.net_usd >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {e.net_usd >= 0 ? "+" : ""}{formatUSD(Math.abs(e.net_usd))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Social context */}
            <div>
              <div className="text-gray-500 font-medium mb-1">Social Context</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Current mentions:</span>
                  <span className="text-gray-200 tabular-nums">{alert.social_mentions ?? 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Baseline avg:</span>
                  <span className="text-gray-200 tabular-nums">{alert.social_avg_mentions ?? 0}</span>
                </div>
                {alert.social_sentiment != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Sentiment:</span>
                    <span className={`tabular-nums ${alert.social_sentiment > 0.08 ? "text-green-400" : alert.social_sentiment < -0.08 ? "text-red-400" : "text-gray-300"}`}>
                      {alert.social_sentiment >= 0 ? "+" : ""}{alert.social_sentiment.toFixed(3)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntelligenceAlerts({ alerts }: { alerts: EnrichedAlert[] }) {
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
        <p className="text-gray-500">No active signals — monitoring 105 wallets across 7 data sources</p>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}
    </div>
  );
}
