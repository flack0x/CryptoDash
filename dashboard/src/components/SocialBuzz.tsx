"use client";

import type { SocialBuzz as SocialBuzzType } from "@/lib/types";

function sentimentColor(score: number): string {
  if (score > 0.2) return "text-green-400";
  if (score < -0.2) return "text-red-400";
  return "text-gray-400";
}

function sentimentLabel(score: number): string {
  if (score > 0.5) return "Very Bullish";
  if (score > 0.2) return "Bullish";
  if (score > -0.2) return "Neutral";
  if (score > -0.5) return "Bearish";
  return "Very Bearish";
}

export default function SocialBuzz({ buzz }: { buzz: SocialBuzzType[] }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-400">
        Social Buzz (6h)
      </h2>
      {buzz.length === 0 ? (
        <p className="text-gray-500">No social signals yet</p>
      ) : (
        <div className="space-y-2">
          {buzz.map((b) => {
            const maxMentions = buzz[0]?.totalMentions || 1;
            const barWidth = Math.max((b.totalMentions / maxMentions) * 100, 3);
            const coinName = b.coin?.name ?? b.coin_id;
            const coinSymbol = b.coin?.symbol && b.coin.symbol !== b.coin.id
              ? b.coin.symbol.toUpperCase()
              : null;
            return (
              <div key={b.coin_id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-200 font-medium">
                    {coinName}
                    {coinSymbol && (
                      <span className="ml-1.5 text-gray-500 text-xs">{coinSymbol}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${sentimentColor(b.avgSentiment)}`}>
                      {sentimentLabel(b.avgSentiment)}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {b.totalMentions} mentions
                    </span>
                  </div>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800">
                  <div
                    className="h-1.5 rounded-full bg-amber-500/70 transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <div className="mt-0.5 text-xs text-gray-600">
                  {b.sources.join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
