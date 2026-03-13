"use client";

import type { Snapshot, Coin } from "@/lib/types";
import { formatPrice, formatPercent, formatUSD } from "@/lib/format";

type Mover = Snapshot & { coin?: Coin };

function MoverTable({ title, movers, colorClass }: { title: string; movers: Mover[]; colorClass: string }) {
  if (movers.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className={`mb-2 text-sm font-semibold uppercase tracking-wider ${colorClass}`}>{title}</h3>
        <p className="text-gray-500">No data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className={`mb-3 text-sm font-semibold uppercase tracking-wider ${colorClass}`}>{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left text-gray-400">
            <th className="pb-2 pr-3 font-medium">Coin</th>
            <th className="pb-2 pr-3 text-right font-medium">Price</th>
            <th className="pb-2 pr-3 text-right font-medium">24h</th>
            <th className="pb-2 text-right font-medium">Volume</th>
          </tr>
        </thead>
        <tbody>
          {movers.map((m) => (
            <tr key={m.id} className="border-b border-gray-800/50">
              <td className="py-1.5 pr-3 text-gray-200">
                {m.coin ? `${m.coin.name} (${m.coin.symbol.toUpperCase()})` : m.coin_id}
              </td>
              <td className="py-1.5 pr-3 text-right text-gray-300">{formatPrice(m.price_usd)}</td>
              <td className={`py-1.5 pr-3 text-right font-medium ${(m.price_change_24h ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {formatPercent(m.price_change_24h ?? 0)}
              </td>
              <td className="py-1.5 text-right text-gray-400">{formatUSD(m.volume_24h)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TopMovers({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <MoverTable title="Top Gainers (24h)" movers={gainers} colorClass="text-green-400" />
      <MoverTable title="Top Losers (24h)" movers={losers} colorClass="text-red-400" />
    </div>
  );
}
