"use client";

import type { Narrative } from "@/lib/types";

export default function NarrativeMomentum({ narratives }: { narratives: Narrative[] }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-cyan-400">
        Narrative Momentum
      </h2>
      {narratives.length === 0 ? (
        <p className="text-gray-500">No narrative data yet</p>
      ) : (
        <div className="space-y-3">
          {narratives.map((n) => {
            const mom = n.momentum ?? 0;
            const absWidth = Math.min(Math.abs(mom) * 100, 100);
            const isPositive = mom > 0;
            const color = mom > 0.1
              ? "text-green-400"
              : mom < -0.1
                ? "text-red-400"
                : "text-gray-500";
            const barColor = mom > 0.1
              ? "bg-green-500"
              : mom < -0.1
                ? "bg-red-500"
                : "bg-gray-600";
            const trend = mom > 0.1 ? "Rising" : mom < -0.1 ? "Fading" : "Stable";
            const coins = n.coin_ids?.slice(0, 5) ?? [];
            const extra = (n.coin_ids?.length ?? 0) > 5 ? ` +${n.coin_ids.length - 5} more` : "";

            return (
              <div key={n.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-200">{n.name}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${color}`}>{trend}</span>
                    <span className={`text-xs font-medium ${color}`}>
                      {isPositive ? "+" : ""}{(mom * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-gray-800">
                  <div
                    className={`h-2 rounded-full ${barColor} transition-all duration-500`}
                    style={{ width: `${Math.max(absWidth, 2)}%` }}
                  />
                </div>
                {coins.length > 0 && (
                  <div className="mt-1 text-xs text-gray-600">
                    {coins.join(", ")}{extra}
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
