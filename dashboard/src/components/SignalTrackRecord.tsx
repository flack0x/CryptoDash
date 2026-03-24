"use client";

import { useState } from "react";
import type { EvaluatedSignal, SignalPerformance } from "@/lib/types";
import { formatPrice, formatPercent } from "@/lib/format";

const typeLabels: Record<string, string> = {
  stealth_accumulation: "Stealth Accum",
  empty_hype: "Empty Hype",
  smart_money_buying_fear: "Buying Fear",
  smart_money_dip_buy: "Dip Buy",
  smart_money_exit_hype: "Smart $ Exit",
};

function directionLabel(dir: string | null): { text: string; color: string } {
  if (dir === "bullish") return { text: "Bullish", color: "text-green-400" };
  if (dir === "bearish") return { text: "Bearish", color: "text-red-400" };
  return { text: "—", color: "text-gray-500" };
}

function resultIcon(correct: boolean | null): string {
  if (correct === true) return "Y";
  if (correct === false) return "X";
  return "—";
}

function resultColor(correct: boolean | null): string {
  if (correct === true) return "text-green-400";
  if (correct === false) return "text-red-400";
  return "text-gray-500";
}

export default function SignalTrackRecord({
  performance,
  signals,
}: {
  performance: SignalPerformance;
  signals: EvaluatedSignal[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasData = performance.total24h > 0 || performance.pendingEvaluation > 0;

  if (!hasData && signals.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-purple-400">
          Signal Track Record
        </h2>
        <span className="text-xs text-gray-500">{expanded ? "collapse" : "expand"}</span>
      </button>

      {/* Summary cards — always visible */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            {performance.hitRate24h !== null ? `${Math.round(performance.hitRate24h * 100)}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">24h Hit Rate</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            {performance.hitRate48h !== null ? `${Math.round(performance.hitRate48h * 100)}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">48h Hit Rate</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            {performance.hitRate72h !== null ? `${Math.round(performance.hitRate72h * 100)}%` : "—"}
          </div>
          <div className="text-xs text-gray-500">72h Hit Rate</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            {performance.total24h}
          </div>
          <div className="text-xs text-gray-500">Evaluated</div>
        </div>
        <div className="rounded-md bg-gray-800/50 px-3 py-2 text-center">
          <div className="text-lg font-bold tabular-nums text-gray-100">
            {performance.pendingEvaluation}
          </div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
      </div>

      {/* Per-pattern breakdown */}
      {(performance.exitHypeCount > 0 || performance.buyingFearCount > 0 || performance.dipBuyCount > 0) && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          {performance.dipBuyCount > 0 && (
            <div className="rounded-md bg-green-900/30 border border-green-800/50 px-3 py-1.5 flex items-center justify-between">
              <span className="text-xs text-green-400 font-medium">Dip Buy</span>
              <span className="text-xs text-gray-300 tabular-nums">
                {performance.dipBuy24h !== null ? `${Math.round(performance.dipBuy24h * 100)}%` : "—"} / {performance.dipBuy48h !== null ? `${Math.round(performance.dipBuy48h * 100)}%` : "—"} / {performance.dipBuy72h !== null ? `${Math.round(performance.dipBuy72h * 100)}%` : "—"}
                <span className="text-gray-500 ml-1">({performance.dipBuyCount})</span>
              </span>
            </div>
          )}
          {performance.exitHypeCount > 0 && (
            <div className="rounded-md bg-gray-800/30 px-3 py-1.5 flex items-center justify-between">
              <span className="text-xs text-red-400 font-medium">Exit Hype</span>
              <span className="text-xs text-gray-300 tabular-nums">
                {performance.exitHype24h !== null ? `${Math.round(performance.exitHype24h * 100)}%` : "—"} / {performance.exitHype48h !== null ? `${Math.round(performance.exitHype48h * 100)}%` : "—"} / {performance.exitHype72h !== null ? `${Math.round(performance.exitHype72h * 100)}%` : "—"}
                <span className="text-gray-500 ml-1">({performance.exitHypeCount})</span>
              </span>
            </div>
          )}
          {performance.buyingFearCount > 0 && (
            <div className="rounded-md bg-gray-800/30 px-3 py-1.5 flex items-center justify-between">
              <span className="text-xs text-blue-400 font-medium">Buying Fear</span>
              <span className="text-xs text-gray-300 tabular-nums">
                {performance.buyingFear24h !== null ? `${Math.round(performance.buyingFear24h * 100)}%` : "—"} / {performance.buyingFear48h !== null ? `${Math.round(performance.buyingFear48h * 100)}%` : "—"} / {performance.buyingFear72h !== null ? `${Math.round(performance.buyingFear72h * 100)}%` : "—"}
                <span className="text-gray-500 ml-1">({performance.buyingFearCount})</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Expanded: outcomes table */}
      {expanded && signals.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="pb-2 pr-3 font-medium">Coin</th>
                <th className="pb-2 pr-3 font-medium">Type</th>
                <th className="pb-2 pr-3 text-right font-medium">Conf</th>
                <th className="pb-2 pr-3 font-medium">Predicted</th>
                <th className="pb-2 pr-3 text-right font-medium">Price@Detect</th>
                <th className="pb-2 pr-3 text-right font-medium">24h</th>
                <th className="pb-2 pr-3 text-right font-medium">48h</th>
                <th className="pb-2 text-right font-medium">72h</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((s, i) => {
                const dir = directionLabel(s.predicted_direction);
                const coinName = s.coin?.name && s.coin.name !== s.coin.id
                  ? s.coin.name
                  : s.coin_id;
                return (
                  <tr key={`${s.coin_id}-${s.alert_type}-${i}`} className="border-b border-gray-800/50">
                    <td className="py-1.5 pr-3 text-gray-200">
                      {coinName}
                      {s.coin?.symbol && (
                        <span className="ml-1 text-gray-500 text-xs">{s.coin.symbol.toUpperCase()}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-gray-400 text-xs">
                      {typeLabels[s.alert_type] ?? s.alert_type}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-300 tabular-nums text-xs">
                      {Math.round(s.confidence * 100)}%
                    </td>
                    <td className={`py-1.5 pr-3 text-xs font-medium ${dir.color}`}>
                      {dir.text}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-gray-300 tabular-nums text-xs">
                      {s.price_at_detection ? formatPrice(s.price_at_detection) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-xs">
                      <span className={resultColor(s.direction_correct_24h)}>
                        {s.change_pct_24h !== null ? formatPercent(s.change_pct_24h) : "—"}
                        {" "}{resultIcon(s.direction_correct_24h)}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right text-xs">
                      <span className={resultColor(s.direction_correct_48h)}>
                        {s.change_pct_48h !== null ? formatPercent(s.change_pct_48h) : "—"}
                        {" "}{resultIcon(s.direction_correct_48h)}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-xs">
                      <span className={resultColor(s.direction_correct_72h)}>
                        {s.change_pct_72h !== null ? formatPercent(s.change_pct_72h) : "—"}
                        {" "}{resultIcon(s.direction_correct_72h)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {expanded && signals.length === 0 && (
        <p className="mt-3 text-xs text-gray-500">No evaluated signals yet — outcomes appear after 24h.</p>
      )}
    </div>
  );
}
