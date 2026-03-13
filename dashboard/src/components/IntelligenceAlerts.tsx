"use client";

import type { IntelligenceAlert } from "@/lib/types";
import SeverityBadge from "./SeverityBadge";
import { timeAgo } from "@/lib/format";

const typeLabels: Record<string, { label: string; color: string }> = {
  stealth_accumulation: { label: "Stealth Accumulation", color: "text-green-400" },
  empty_hype: { label: "Empty Hype", color: "text-yellow-400" },
  smart_money_buying_fear: { label: "Smart Money Buying Fear", color: "text-cyan-400" },
  smart_money_exit_hype: { label: "Smart Money Exit", color: "text-red-400" },
};

function formatCoinName(coinId: string | null): string {
  if (!coinId) return "?";
  // Clean up coin IDs: "bitcoin" -> "Bitcoin", "ethereum-classic" -> "Ethereum Classic"
  return coinId.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function shortenBrief(alert: IntelligenceAlert): string {
  // Extract the actionable signal from the verbose brief
  const brief = alert.brief || alert.headline;

  // Pull out key metrics if present
  const mentionMatch = brief.match(/(\d+\.?\d*)x above average/);
  const mentionsCount = brief.match(/\((\d+) vs normal (\d+)\)/);

  if (mentionMatch && mentionsCount) {
    const multiplier = mentionMatch[1];
    const current = mentionsCount[1];
    const normal = mentionsCount[2];

    if (alert.alert_type === "empty_hype") {
      return `Social mentions ${multiplier}x above normal (${current} vs ${normal}) with no whale backing`;
    }
    if (alert.alert_type === "stealth_accumulation") {
      return `Whales accumulating while social mentions only ${current} (normal: ${normal})`;
    }
  }

  // Fallback: truncate if too long
  if (brief.length > 120) {
    return brief.substring(0, brief.indexOf(".") > 0 ? brief.indexOf(".") + 1 : 120);
  }
  return brief;
}

export default function IntelligenceAlerts({ alerts }: { alerts: IntelligenceAlert[] }) {
  return (
    <div className="rounded-lg border border-red-900/50 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-red-400">
        Smart Money Intelligence
      </h2>
      {alerts.length === 0 ? (
        <p className="text-gray-500">No intelligence alerts in the last 24h</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="pb-2 pr-2 font-medium w-20">Severity</th>
                <th className="pb-2 pr-2 font-medium w-12">Conf</th>
                <th className="pb-2 pr-2 font-medium w-28">Coin</th>
                <th className="pb-2 pr-2 font-medium">Signal</th>
                <th className="pb-2 font-medium w-16">When</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const typeInfo = typeLabels[a.alert_type] ?? { label: a.alert_type, color: "text-gray-400" };
                return (
                  <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 pr-2">
                      <SeverityBadge severity={a.severity} />
                    </td>
                    <td className="py-2 pr-2 text-gray-300 tabular-nums">
                      {a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "?"}
                    </td>
                    <td className="py-2 pr-2 font-medium text-gray-200">
                      {formatCoinName(a.coin_id)}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`text-xs font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                      <span className="ml-2 text-gray-400">{shortenBrief(a)}</span>
                    </td>
                    <td className="py-2 whitespace-nowrap text-gray-500 text-xs">
                      {timeAgo(a.ts)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
