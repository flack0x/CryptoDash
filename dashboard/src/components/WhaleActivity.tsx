"use client";

import type { WhaleTransaction } from "@/lib/types";
import { formatUSD, timeAgo } from "@/lib/format";

const directionStyle: Record<string, { label: string; color: string }> = {
  buy: { label: "BUY", color: "text-green-400" },
  sell: { label: "SELL", color: "text-red-400" },
  // Legacy fallbacks for old data
  in: { label: "IN", color: "text-blue-400" },
  out: { label: "OUT", color: "text-yellow-400" },
  transfer: { label: "XFER", color: "text-gray-400" },
};

export default function WhaleActivity({ transactions }: { transactions: WhaleTransaction[] }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-blue-400">
        Whale Activity
      </h2>
      {transactions.length === 0 ? (
        <div className="text-gray-500 text-sm space-y-1">
          <p>No whale movements detected in tracked wallets.</p>
          <p className="text-gray-600 text-xs">Monitoring 105 wallets (exchanges, VCs, funds). Data appears when large token transfers occur.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="pb-2 pr-3 font-medium">Direction</th>
                <th className="pb-2 pr-3 font-medium">Token</th>
                <th className="pb-2 pr-3 text-right font-medium">Value</th>
                <th className="pb-2 pr-3 font-medium">Entity</th>
                <th className="pb-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => {
                const dir = directionStyle[tx.direction] ?? directionStyle.transfer;
                return (
                  <tr key={tx.id} className="border-b border-gray-800/50">
                    <td className={`py-1.5 pr-3 font-semibold text-xs ${dir.color}`}>
                      {dir.label}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-200">
                      {tx.token_symbol?.toUpperCase() || tx.coin_id || "?"}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-300 tabular-nums">
                      {tx.amount_usd ? formatUSD(tx.amount_usd) : `${tx.amount.toLocaleString()} tokens`}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-400 text-xs">
                      <span className="text-gray-300">{tx.label}</span>
                      {tx.entity_type && (
                        <span className="ml-1 text-gray-600">({tx.entity_type})</span>
                      )}
                    </td>
                    <td className="py-1.5 whitespace-nowrap text-gray-500 text-xs">
                      {timeAgo(tx.ts)}
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
