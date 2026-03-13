import { supabase } from "./supabase";
import type {
  MarketMood, IntelligenceAlert, TrendingCoin, Snapshot,
  Narrative, Coin, SocialBuzz, WhaleTransaction, DashboardData,
} from "./types";

async function getLatestMood(): Promise<MarketMood | null> {
  const { data } = await supabase
    .from("market_mood")
    .select("*")
    .order("ts", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function getAlerts(): Promise<IntelligenceAlert[]> {
  // Try last 24h first, fall back to latest 20 ever
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("intelligence_alerts")
    .select("*")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(20);

  if (data && data.length > 0) return data;

  const { data: fallback } = await supabase
    .from("intelligence_alerts")
    .select("*")
    .order("ts", { ascending: false })
    .limit(20);
  return fallback ?? [];
}

async function getTrending(): Promise<(TrendingCoin & { coin?: Coin })[]> {
  // Get the most recent trending batch
  const { data: latest } = await supabase
    .from("trending")
    .select("ts")
    .order("ts", { ascending: false })
    .limit(1);

  if (!latest || latest.length === 0) return [];

  const latestTs = latest[0].ts;
  const { data } = await supabase
    .from("trending")
    .select("*")
    .eq("ts", latestTs)
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
  // Get the most recent snapshot batch
  const { data: latest } = await supabase
    .from("snapshots")
    .select("ts")
    .order("ts", { ascending: false })
    .limit(1);

  if (!latest || latest.length === 0) return { gainers: [], losers: [] };

  const latestTime = new Date(latest[0].ts).getTime();
  const batchStart = new Date(latestTime - 5 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("snapshots")
    .select("*")
    .gte("ts", batchStart)
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

async function getSocialBuzz(): Promise<SocialBuzz[]> {
  // Get social signals from last 6 hours, aggregate by coin
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("social_signals")
    .select("coin_id, mentions, sentiment_score, source")
    .gte("ts", since)
    .order("mentions", { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return [];

  // Aggregate by coin_id
  const map = new Map<string, { mentions: number; sentimentSum: number; sentimentCount: number; sources: Set<string> }>();
  for (const s of data) {
    const existing = map.get(s.coin_id);
    if (existing) {
      existing.mentions += s.mentions ?? 0;
      if (s.sentiment_score != null) {
        existing.sentimentSum += s.sentiment_score;
        existing.sentimentCount++;
      }
      existing.sources.add(s.source);
    } else {
      map.set(s.coin_id, {
        mentions: s.mentions ?? 0,
        sentimentSum: s.sentiment_score ?? 0,
        sentimentCount: s.sentiment_score != null ? 1 : 0,
        sources: new Set([s.source]),
      });
    }
  }

  // Sort by total mentions, take top 10
  const sorted = [...map.entries()]
    .sort((a, b) => b[1].mentions - a[1].mentions)
    .slice(0, 10);

  const coinIds = sorted.map(([id]) => id);
  const { data: coins } = await supabase
    .from("coins")
    .select("id, symbol, name")
    .in("id", coinIds);
  const coinMap = new Map((coins ?? []).map((c) => [c.id, c]));

  return sorted.map(([coin_id, agg]) => ({
    coin_id,
    coin: coinMap.get(coin_id),
    totalMentions: agg.mentions,
    avgSentiment: agg.sentimentCount > 0 ? agg.sentimentSum / agg.sentimentCount : 0,
    sources: [...agg.sources],
  }));
}

async function getWhaleActivity(): Promise<WhaleTransaction[]> {
  // Latest whale transactions
  const { data } = await supabase
    .from("whale_transactions")
    .select("id, wallet_address, coin_id, token_symbol, amount, amount_usd, direction, label, entity_type, ts")
    .order("ts", { ascending: false })
    .limit(10);
  return data ?? [];
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [mood, alerts, trending, movers, narratives, socialBuzz, whaleActivity] = await Promise.all([
    getLatestMood(),
    getAlerts(),
    getTrending(),
    getMovers(),
    getNarratives(),
    getSocialBuzz(),
    getWhaleActivity(),
  ]);

  return {
    mood,
    alerts,
    trending,
    gainers: movers.gainers,
    losers: movers.losers,
    narratives,
    socialBuzz,
    whaleActivity,
    lastUpdated: new Date().toISOString(),
  };
}
