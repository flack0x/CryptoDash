"use client";

import type { SocialBuzz as SocialBuzzType } from "@/lib/types";

function sentimentColor(score: number): string {
  if (score > 0.08) return "text-green-400";
  if (score > 0.03) return "text-emerald-400";
  if (score > -0.03) return "text-gray-400";
  if (score > -0.08) return "text-orange-400";
  return "text-red-400";
}

function sentimentLabel(score: number): string {
  if (score > 0.25) return "Very Bullish";
  if (score > 0.08) return "Bullish";
  if (score > 0.03) return "Leaning Bullish";
  if (score > -0.03) return "Neutral";
  if (score > -0.08) return "Leaning Bearish";
  if (score > -0.25) return "Bearish";
  return "Very Bearish";
}

function formatScore(score: number): string {
  const sign = score >= 0 ? "+" : "";
  return `${sign}${score.toFixed(2)}`;
}

const sourceDisplayName: Record<string, string> = {
  reddit: "Reddit",
  "4chan_biz": "4chan /biz/",
  fourchan: "4chan /biz/",
  cryptocompare: "CryptoCompare",
};

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

            // Check if sources diverge in sentiment (one bullish, one bearish)
            const showPerSource = b.perSource && b.perSource.length >= 2;
            const hasDivergence = showPerSource && b.perSource.some(
              (ps) => (ps.sentiment > 0.03) !== (b.perSource[0].sentiment > 0.03)
            );

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
                      {sentimentLabel(b.avgSentiment)} <span className="text-gray-500">({formatScore(b.avgSentiment)})</span>
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
                {/* Per-source breakdown when 2+ sources present */}
                {showPerSource ? (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {b.perSource.map((ps) => (
                      <span key={ps.source} className="text-gray-500">
                        <span className="text-gray-600">{sourceDisplayName[ps.source] ?? ps.source}:</span>{" "}
                        <span className={sentimentColor(ps.sentiment)}>
                          {sentimentLabel(ps.sentiment)}
                        </span>
                        {" "}
                        <span className="text-gray-600 tabular-nums">({ps.mentions})</span>
                      </span>
                    ))}
                    {hasDivergence && (
                      <span className="text-yellow-500/70 font-medium">sources diverge</span>
                    )}
                  </div>
                ) : (
                  <div className="mt-0.5 text-xs text-gray-600">
                    {b.sources.join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
