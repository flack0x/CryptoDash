"use client";

import type { TrendingCoin, Coin } from "@/lib/types";
import { timeAgo } from "@/lib/format";

type TrendingRow = TrendingCoin & { coin?: Coin };

export default function TrendingCoins({ trending }: { trending: TrendingRow[] }) {
  const dataTs = trending[0]?.ts;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-purple-400">
          Trending Right Now
        </h2>
        {dataTs && (
          <span className="text-xs text-gray-600">data from {timeAgo(dataTs)}</span>
        )}
      </div>
      {trending.length === 0 ? (
        <p className="text-gray-500">No trending data yet. Start your collectors with <code className="text-gray-400 bg-gray-800 px-1 rounded">python main.py</code></p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="pb-2 pr-3 w-12 text-right font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Coin</th>
              <th className="pb-2 pr-3 font-medium">Symbol</th>
              <th className="pb-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {trending.map((t, i) => (
              <tr key={`${t.coin_id}-${t.source}-${i}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="py-1.5 pr-3 text-right text-gray-500 tabular-nums">{t.rank}</td>
                <td className="py-1.5 pr-3 font-medium text-gray-200">{t.coin?.name ?? t.coin_id}</td>
                <td className="py-1.5 pr-3 text-gray-400">{t.coin?.symbol?.toUpperCase() ?? ""}</td>
                <td className="py-1.5 text-gray-500">{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
