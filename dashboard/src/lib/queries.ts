import { supabase } from "./supabase";
import type { MarketMood, IntelligenceAlert, TrendingCoin, Snapshot, Narrative, Coin, DashboardData } from "./types";

async function getLatestMood(): Promise<MarketMood | null> {
  const { data } = await supabase
    .from("market_mood")
    .select("*")
    .order("ts", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function getAlerts(): Promise<IntelligenceAlert[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("intelligence_alerts")
    .select("*")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(20);
  return data ?? [];
}

async function getTrending(): Promise<(TrendingCoin & { coin?: Coin })[]> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("trending")
    .select("*")
    .gte("ts", since)
    .order("rank", { ascending: true })
    .limit(15);
  if (!data || data.length === 0) return [];

  const coinIds = [...new Set(data.map((t) => t.coin_id))];
  const { data: coins } = await supabase
    .from("coins")
    .select("id, symbol, name")
    .in("id", coinIds);
  const coinMap = new Map((coins ?? []).map((c) => [c.id, c]));

  return data.map((t) => ({ ...t, coin: coinMap.get(t.coin_id) }));
}

async function getMovers(): Promise<{ gainers: (Snapshot & { coin?: Coin })[]; losers: (Snapshot & { coin?: Coin })[] }> {
  // Get latest snapshots by using a recent window and distinct on coin_id
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("snapshots")
    .select("*")
    .gte("ts", since)
    .not("price_change_24h", "is", null)
    .order("ts", { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return { gainers: [], losers: [] };

  // Deduplicate: keep latest snapshot per coin
  const seen = new Set<string>();
  const unique: Snapshot[] = [];
  for (const s of data) {
    if (!seen.has(s.coin_id)) {
      seen.add(s.coin_id);
      unique.push(s);
    }
  }

  const sorted = unique
    .filter((s) => s.price_change_24h !== null)
    .sort((a, b) => (b.price_change_24h ?? 0) - (a.price_change_24h ?? 0));

  const topGainers = sorted.slice(0, 5);
  const topLosers = sorted.slice(-5).reverse();

  const coinIds = [...new Set([...topGainers, ...topLosers].map((s) => s.coin_id))];
  const { data: coins } = await supabase
    .from("coins")
    .select("id, symbol, name")
    .in("id", coinIds);
  const coinMap = new Map((coins ?? []).map((c) => [c.id, c]));

  return {
    gainers: topGainers.map((s) => ({ ...s, coin: coinMap.get(s.coin_id) })),
    losers: topLosers.map((s) => ({ ...s, coin: coinMap.get(s.coin_id) })),
  };
}

async function getNarratives(): Promise<Narrative[]> {
  const { data } = await supabase
    .from("narratives")
    .select("*")
    .order("momentum", { ascending: false, nullsFirst: false });
  return data ?? [];
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [mood, alerts, trending, movers, narratives] = await Promise.all([
    getLatestMood(),
    getAlerts(),
    getTrending(),
    getMovers(),
    getNarratives(),
  ]);

  return {
    mood,
    alerts,
    trending,
    gainers: movers.gainers,
    losers: movers.losers,
    narratives,
    lastUpdated: new Date().toISOString(),
  };
}
