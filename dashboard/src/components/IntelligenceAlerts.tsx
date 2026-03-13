"use client";

import type { IntelligenceAlert } from "@/lib/types";
import SeverityBadge from "./SeverityBadge";
import { timeAgo } from "@/lib/format";

const typeLabels: Record<string, string> = {
  stealth_accumulation: "Stealth Accumulation",
  empty_hype: "Empty Hype",
  smart_money_buying_fear: "Smart Money Buying Fear",
  smart_money_exit_hype: "Smart Money Exit",
};

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
                <th className="pb-2 pr-3 font-medium">Severity</th>
                <th className="pb-2 pr-3 font-medium">Conf</th>
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 font-medium">Brief</th>
                <th className="pb-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2 pr-3">
                    <SeverityBadge severity={a.severity} />
                  </td>
                  <td className="py-2 pr-3 text-gray-300">
                    {a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "?"}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-gray-400">
                    {typeLabels[a.alert_type] ?? a.alert_type}
                  </td>
                  <td className="py-2 pr-3 text-gray-200">
                    {a.brief || a.headline}
                  </td>
                  <td className="py-2 whitespace-nowrap text-gray-500">
                    {timeAgo(a.ts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
