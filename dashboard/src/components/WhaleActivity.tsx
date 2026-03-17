"use client";

import { useState } from "react";
import type { WhaleTransaction, WhaleNetFlow } from "@/lib/types";
import { formatUSD, timeAgo } from "@/lib/format";

const directionStyle: Record<string, { label: string; color: string }> = {
  buy: { label: "BUY", color: "text-green-400" },
  sell: { label: "SELL", color: "text-red-400" },
  in: { label: "IN", color: "text-blue-400" },
  out: { label: "OUT", color: "text-yellow-400" },
  transfer: { label: "XFER", color: "text-gray-400" },
};

function NetFlowView({ flows }: { flows: WhaleNetFlow[] }) {
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const maxVolume = flows.length > 0 ? Math.max(...flows.map((f) => f.buy_usd + f.sell_usd)) : 1;

  return (
    <div className="space-y-1.5">
      {flows.map((flow) => {
        const totalVol = flow.buy_usd + flow.sell_usd;
        const buyPct = totalVol > 0 ? (flow.buy_usd / totalVol) * 100 : 50;
        const barWidth = Math.max((totalVol / maxVolume) * 100, 8);
        const isExpanded = expandedToken === flow.token_symbol;

        return (
          <div key={flow.token_symbol}>
            <button
              onClick={() => setExpandedToken(isExpanded ? null : flow.token_symbol)}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-gray-800/40 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-200">{flow.token_symbol}</span>
                  <span className="text-xs text-gray-600">{flow.tx_count} tx{flow.tx_count !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums">
                  <span className={flow.net_usd >= 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                    Net: {flow.net_usd >= 0 ? "+" : ""}{formatUSD(Math.abs(flow.net_usd))}
                  </span>
                  <span className="text-gray-600">{isExpanded ? "[-]" : "[+]"}</span>
                </div>
              </div>
              {/* Buy/sell bar */}
              <div className="h-2 rounded-full bg-gray-800 overflow-hidden" style={{ width: `${barWidth}%` }}>
                <div className="flex h-full">
                  <div
                    className="bg-green-500/70 h-full"
                    style={{ width: `${buyPct}%` }}
                  />
                  <div
                    className="bg-red-500/70 h-full"
                    style={{ width: `${100 - buyPct}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between mt-0.5 text-xs text-gray-500 tabular-nums">
                <span>Buy: {formatUSD(flow.buy_usd)}</span>
                <span>Sell: {formatUSD(flow.sell_usd)}</span>
              </div>
            </button>

            {/* Entity breakdown */}
            {isExpanded && flow.entities.length > 0 && (
              <div className="ml-3 mt-1 mb-2 space-y-0.5 border-l border-gray-800 pl-3">
                {flow.entities.slice(0, 8).map((ent, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 truncate mr-2">{ent.label}</span>
                    <div className="flex items-center gap-3 tabular-nums">
                      {ent.buy_usd > 0 && (
                        <span className="text-green-400/80">+{formatUSD(ent.buy_usd)}</span>
                      )}
                      {ent.sell_usd > 0 && (
                        <span className="text-red-400/80">-{formatUSD(ent.sell_usd)}</span>
                      )}
                      <span className={`font-medium ${ent.net_usd >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {ent.net_usd >= 0 ? "+" : ""}{formatUSD(Math.abs(ent.net_usd))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransactionsView({ transactions }: { transactions: WhaleTransaction[] }) {
  return (
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
                <td className="py-1.5 whitespace-nowrap text-xs">
                  {tx.tx_hash ? (
                    <a
                      href={`https://etherscan.io/tx/${tx.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400/70 hover:text-blue-400 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {timeAgo(tx.ts)}
                    </a>
                  ) : (
                    <span className="text-gray-500">{timeAgo(tx.ts)}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function WhaleActivity({
  transactions,
  netFlows,
}: {
  transactions: WhaleTransaction[];
  netFlows: WhaleNetFlow[];
}) {
  const [view, setView] = useState<"flow" | "txs">("flow");

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-blue-400">
          Whale Activity
        </h2>
        <div className="flex rounded-md bg-gray-800 p-0.5 text-xs">
          <button
            onClick={() => setView("flow")}
            className={`rounded px-2 py-1 transition-colors ${view === "flow" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"}`}
          >
            Net Flow
          </button>
          <button
            onClick={() => setView("txs")}
            className={`rounded px-2 py-1 transition-colors ${view === "txs" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-300"}`}
          >
            Transactions
          </button>
        </div>
      </div>

      {transactions.length === 0 && netFlows.length === 0 ? (
        <div className="text-gray-500 text-sm space-y-1">
          <p>No whale movements detected in tracked wallets.</p>
          <p className="text-gray-600 text-xs">Monitoring 105 wallets (exchanges, VCs, funds). Data appears when large token transfers occur.</p>
        </div>
      ) : view === "flow" ? (
        <NetFlowView flows={netFlows} />
      ) : (
        <TransactionsView transactions={transactions} />
      )}
    </div>
  );
}
