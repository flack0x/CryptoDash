"use client";

import { useState } from "react";
import type { PaperTradingResult } from "@/lib/types";
import { formatPrice } from "@/lib/format";

const typeLabels: Record<string, string> = {
  smart_money_dip_buy: "Dip Buy",
  smart_money_exit_hype: "Exit Hype",
  smart_money_buying_fear: "Buying Fear",
  stealth_accumulation: "Stealth Accum",
  empty_hype: "Empty Hype",
};

export default function PaperTrading({ data }: { data: PaperTradingResult }) {
  const [expanded, setExpanded] = useState(false);

  if (data.totalTrades === 0) return null;

  const positive = data.totalPnlUsd >= 0;
  const pnlColor = positive ? "text-green-400" : "text-red-400";
  const borderColor = positive ? "border-green-800" : "border-red-800";

  // Equity curve as simple bar visualization
  const cumulatives = data.trades.map((t) => t.cumulative_usd);
  const maxCum = Math.max(...cumulatives, 0.01);
  const minCum = Math.min(...cumulatives, 0);
  const range = maxCum - minCum || 1;

  return (
    <div className={`rounded-lg border ${borderColor} bg-gray-900 p-4`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
          Paper Trading
          <span className="ml-2 text-xs font-normal text-gray-500">
            $1,000/trade &middot; spot only (Dip Buy)
          </span>
        </h2>
        <span className="text-xs text-gray-500">{expanded ? "collapse" : "expand"}</span>
      </button>

      {/* Summary stats — always visible */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className={`text-lg font-bold tabular-nums ${pnlColor}`}>
            {positive ? "+" : ""}${data.totalPnlUsd.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">Total P&L</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            {Math.round(data.winRate * 100)}%
          </div>
          <div className="text-xs text-gray-500">Win Rate</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            {data.profitFactor === Infinity ? "Inf" : data.profitFactor.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">Profit Factor</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            <span className="text-green-400">{data.winningTrades}</span>
            <span className="text-gray-600">/</span>
            <span className="text-red-400">{data.losingTrades}</span>
          </div>
          <div className="text-xs text-gray-500">W / L</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-red-400">
            -${data.maxDrawdownUsd.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500">Max Drawdown</div>
        </div>
      </div>

      {/* Equity curve — always visible */}
      <div className="mt-3">
        <div className="flex items-end gap-px h-12">
          {data.trades.map((t, i) => {
            const val = t.cumulative_usd;
            const pct = ((val - minCum) / range) * 100;
            const barColor = val >= 0 ? "bg-green-500" : "bg-red-500";
            return (
              <div
                key={i}
                className="flex-1 min-w-0 relative group"
                style={{ height: "100%" }}
              >
                <div
                  className={`absolute bottom-0 left-0 right-0 ${barColor} rounded-t-sm opacity-70 group-hover:opacity-100 transition-opacity`}
                  style={{ height: `${Math.max(pct, 2)}%` }}
                />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-xs text-gray-200 px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
                  {t.coin?.symbol?.toUpperCase() ?? t.coin_id}: ${val.toFixed(0)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-600">
          <span>Oldest</span>
          <span className={pnlColor}>
            Cumul: {positive ? "+" : ""}${data.totalPnlUsd.toFixed(2)}
          </span>
          <span>Latest</span>
        </div>
      </div>

      {/* Expanded: stats detail + trade log */}
      {expanded && (
        <div className="mt-4">
          {/* Extra stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
            <div className="text-center">
              <div className="text-sm font-medium text-green-400">+{data.avgWinPct.toFixed(2)}%</div>
              <div className="text-xs text-gray-500">Avg Win</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-red-400">{data.avgLossPct.toFixed(2)}%</div>
              <div className="text-xs text-gray-500">Avg Loss</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-green-400">+{data.bestTradePct.toFixed(2)}%</div>
              <div className="text-xs text-gray-500">Best Trade</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-red-400">{data.worstTradePct.toFixed(2)}%</div>
              <div className="text-xs text-gray-500">Worst Trade</div>
            </div>
          </div>

          {/* Trade log */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="pb-2 pr-3 font-medium">Coin</th>
                  <th className="pb-2 pr-3 text-right font-medium">Conf</th>
                  <th className="pb-2 pr-3 font-medium">Dir</th>
                  <th className="pb-2 pr-3 text-right font-medium">Entry</th>
                  <th className="pb-2 pr-3 text-right font-medium">Exit</th>
                  <th className="pb-2 pr-3 font-medium">Reason</th>
                  <th className="pb-2 pr-3 text-right font-medium">P&L</th>
                  <th className="pb-2 text-right font-medium">Cumul</th>
                </tr>
              </thead>
              <tbody>
                {data.trades.map((t, i) => {
                  const pc = t.net_pnl_usd > 0 ? "text-green-400" : "text-red-400";
                  const coinName = t.coin?.symbol?.toUpperCase() ?? t.coin_id;
                  return (
                    <tr key={`${t.coin_id}-${i}`} className="border-b border-gray-800/50">
                      <td className="py-1.5 pr-3 text-gray-200 text-xs">{coinName}</td>
                      <td className="py-1.5 pr-3 text-right text-gray-300 tabular-nums text-xs">
                        {Math.round(t.confidence * 100)}%
                      </td>
                      <td className="py-1.5 pr-3 text-xs">
                        <span className={t.direction === "sell" ? "text-red-400" : "text-green-400"}>
                          {t.direction.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-gray-300 tabular-nums text-xs">
                        {formatPrice(t.entry_price)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-gray-300 tabular-nums text-xs">
                        {formatPrice(t.exit_price)}
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-gray-400">
                        {t.exit_reason.includes("stop_loss") ? (
                          <span className="text-red-400">STOP LOSS</span>
                        ) : t.exit_reason.includes("profit_target") ? (
                          <span className="text-green-400">PROFIT TARGET</span>
                        ) : t.exit_reason}
                      </td>
                      <td className={`py-1.5 pr-3 text-right tabular-nums text-xs font-medium ${pc}`}>
                        {t.net_pnl_usd > 0 ? "+" : ""}${t.net_pnl_usd.toFixed(2)}
                      </td>
                      <td className={`py-1.5 text-right tabular-nums text-xs ${t.cumulative_usd >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {t.cumulative_usd >= 0 ? "+" : ""}${t.cumulative_usd.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
