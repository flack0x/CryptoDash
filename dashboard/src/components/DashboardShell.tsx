"use client";

import { useEffect, useState, useCallback } from "react";
import type { DashboardData } from "@/lib/types";
import { fetchDashboardData } from "@/lib/queries";
import MarketMood from "./MarketMood";
import IntelligenceAlerts from "./IntelligenceAlerts";
import SignalTrackRecord from "./SignalTrackRecord";
import TopMovers from "./TopMovers";
import TrendingCoins from "./TrendingCoins";
import NarrativeMomentum from "./NarrativeMomentum";
import SocialBuzz from "./SocialBuzz";
import WhaleActivity from "./WhaleActivity";
import RefreshIndicator from "./RefreshIndicator";
import SystemHealth from "./SystemHealth";
import PaperTrading from "./PaperTrading";

const REFRESH_INTERVAL = 5 * 60 * 1000;

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
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            CryptoDash Intelligence
          </h1>
          <p className="text-sm text-gray-500">
            Where is smart money going that the crowd hasn&apos;t noticed yet?
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-xs text-cyan-400 animate-pulse">Refreshing...</span>
          )}
          <SystemHealth health={data.systemHealth} />
          <RefreshIndicator lastUpdated={data.lastUpdated} />
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Market Mood */}
      <MarketMood mood={data.mood} />

      {/* Intelligence Alerts — THE primary section */}
      <IntelligenceAlerts alerts={data.alerts} lastSignalTs={data.lastSignalTs} />

      {/* Signal Track Record */}
      <SignalTrackRecord
        performance={data.signalPerformance}
        signals={data.evaluatedSignals}
      />

      {/* Paper Trading P&L */}
      <PaperTrading data={data.paperTrading} />

      {/* Top Movers */}
      <TopMovers gainers={data.gainers} losers={data.losers} />

      {/* Social Buzz + Whale Activity side by side */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SocialBuzz buzz={data.socialBuzz} />
        <WhaleActivity
          transactions={data.whaleActivity}
          netFlows={data.whaleNetFlows}
        />
      </div>

      {/* Trending */}
      <TrendingCoins trending={data.trending} />

      {/* Narratives */}
      <NarrativeMomentum narratives={data.narratives} />

      {/* Footer */}
      <div className="border-t border-gray-800 pt-4 text-center text-xs text-gray-600">
        CryptoDash — Crypto intelligence powered by on-chain + social data
      </div>
    </div>
  );
}
