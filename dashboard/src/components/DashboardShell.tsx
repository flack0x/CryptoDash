"use client";

import { useEffect, useState, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
import { fetchDashboardData } from "@/lib/queries";
import MarketMood from "./MarketMood";
import IntelligenceAlerts from "./IntelligenceAlerts";
import TopMovers from "./TopMovers";
import TrendingCoins from "./TrendingCoins";
import NarrativeMomentum from "./NarrativeMomentum";
import RefreshIndicator from "./RefreshIndicator";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default function DashboardShell({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchDashboardData();
      setData(fresh);
    } catch (e) {
      console.error("Refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CryptoDash Intelligence</h1>
          <p className="text-sm text-gray-500">Where is smart money going that the crowd hasn&apos;t noticed yet?</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-xs text-cyan-400 animate-pulse">Refreshing...</span>
          )}
          <RefreshIndicator lastUpdated={data.lastUpdated} />
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded bg-gray-800 px-3 py-1 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Market Mood */}
      <MarketMood mood={data.mood} />

      {/* Intelligence Alerts — THE main section */}
      <IntelligenceAlerts alerts={data.alerts} />

      {/* Top Movers */}
      <TopMovers gainers={data.gainers} losers={data.losers} />

      {/* Trending */}
      <TrendingCoins trending={data.trending} />

      {/* Narratives */}
      <NarrativeMomentum narratives={data.narratives} />
    </div>
  );
}
