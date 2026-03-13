"use client";

import type { TrendingCoin, Coin } from "@/lib/types";

type TrendingRow = TrendingCoin & { coin?: Coin };

export default function TrendingCoins({ trending }: { trending: TrendingRow[] }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-purple-400">
        Trending Right Now
      </h2>
      {trending.length === 0 ? (
        <p className="text-gray-500">No trending data yet</p>
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
              <tr key={`${t.coin_id}-${t.source}-${i}`} className="border-b border-gray-800/50">
                <td className="py-1.5 pr-3 text-right text-gray-500">{t.rank}</td>
                <td className="py-1.5 pr-3 text-gray-200">{t.coin?.name ?? t.coin_id}</td>
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
