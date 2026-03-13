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
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let { data } = await supabase
    .from("intelligence_alerts")
    .select("*")
    .gte("ts", since)
    .order("confidence", { ascending: false })
    .limit(50);

  if (!data || data.length === 0) {
    const { data: fallback } = await supabase
      .from("intelligence_alerts")
      .select("*")
      .order("ts", { ascending: false })
      .limit(50);
    data = fallback ?? [];
  }

  // Filter out noise coins and deduplicate by coin_id (keep highest confidence)
  const seen = new Set<string>();
  const candidates: typeof data = [];
  for (const a of data) {
    if (!a.coin_id || !isValidCoinId(a.coin_id)) continue;
    if (seen.has(a.coin_id)) continue;
    seen.add(a.coin_id);
    candidates.push(a);
  }

  // Only show alerts for coins that exist in our coins table with proper names
  const coinIds = candidates.map((a) => a.coin_id!);
  const { data: coins } = await supabase
    .from("coins")
    .select("id, symbol, name")
    .in("id", coinIds);
  const validCoins = new Set(
    (coins ?? []).filter((c) => c.name !== c.id && c.symbol !== c.id).map((c) => c.id)
  );

  return candidates
    .filter((a) => validCoins.has(a.coin_id!))
    .slice(0, 6);
}

async function getTrending(): Promise<(TrendingCoin & { coin?: Coin })[]> {
  // Get recent trending, excluding DEX pool addresses, from any source
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("trending")
    .select("*")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(200);

  if (!data || data.length === 0) return [];

  // Filter out DEX addresses, deduplicate by coin_id (keep most recent)
  const seen = new Set<string>();
  const filtered: typeof data = [];
  for (const t of data) {
    if (t.coin_id.startsWith("dex:")) continue;
    if (seen.has(t.coin_id)) continue;
    seen.add(t.coin_id);
    filtered.push(t);
  }

  const top = filtered.slice(0, 15);
  if (top.length === 0) return [];

  const coinIds = [...new Set(top.map((t) => t.coin_id))];
  const { data: coins } = await supabase
    .from("coins")
    .select("id, symbol, name")
    .in("id", coinIds);
  const coinMap = new Map((coins ?? []).map((c) => [c.id, c]));

  return top.map((t, i) => ({ ...t, rank: i + 1, coin: coinMap.get(t.coin_id) }));
}

async function getMovers(): Promise<{ gainers: (Snapshot & { coin?: Coin })[]; losers: (Snapshot & { coin?: Coin })[] }> {
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

// Common English words and short strings that get false-matched as coin names
const NOISE_WORDS = new Set([
  // Common English
  "just", "cash", "next", "new", "now", "one", "any", "get", "can", "all",
  "day", "time", "way", "out", "back", "real", "link", "long", "not", "how",
  "big", "top", "pay", "run", "try", "win", "key", "free", "hot", "safe",
  "rain", "four", "map", "gas", "ace", "bit", "net", "orb", "lab", "hex",
  "arc", "ion", "amp", "core", "edge", "flux", "hive", "mask", "nest",
  "open", "play", "rise", "swap", "true", "unit", "vibe", "wave", "zero",
  "ever", "fire", "fuel", "gate", "high", "keep", "loom", "make", "move",
  "push", "rare", "seed", "turn", "wrap", "coin", "like", "hope", "live",
  "mine", "only", "over", "star", "stop", "that", "this", "some", "what",
  // Crypto jargon
  "moon", "pump", "buy", "sell", "hold", "bear", "bull", "rug", "dip",
  "hodl", "fomo", "ngmi", "wagmi", "gwei", "defi", "degen",
  // Meta
  "_market",
]);

/** Returns true if the coin_id looks like a real coin (not noise) */
function isValidCoinId(coinId: string): boolean {
  if (coinId.startsWith("dex:")) return false;
  if (coinId.startsWith("_")) return false;
  if (NOISE_WORDS.has(coinId.toLowerCase())) return false;
  // Reject IDs that are just numbers or very short
  if (coinId.length <= 2) return false;
  if (/^\d+$/.test(coinId)) return false;
  return true;
}

async function getSocialBuzz(): Promise<SocialBuzz[]> {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("social_signals")
    .select("coin_id, mentions, sentiment_score, source")
    .gte("ts", since)
    .order("mentions", { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return [];

  // Aggregate by coin_id, filtering out DEX addresses and noise
  const map = new Map<string, { mentions: number; sentimentSum: number; sentimentCount: number; sources: Set<string> }>();
  for (const s of data) {
    if (!isValidCoinId(s.coin_id)) continue;

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

  const sorted = [...map.entries()]
    .sort((a, b) => b[1].mentions - a[1].mentions)
    .slice(0, 30); // Fetch more so we can filter after coin lookup

  const coinIds = sorted.map(([id]) => id);
  if (coinIds.length === 0) return [];

  const { data: coins } = await supabase
    .from("coins")
    .select("id, symbol, name")
    .in("id", coinIds);
  const coinMap = new Map((coins ?? []).map((c) => [c.id, c]));

  // Only show coins that have proper names AND are in the top 250 (have a snapshot)
  const { data: snapCoins } = await supabase
    .from("snapshots")
    .select("coin_id")
    .order("ts", { ascending: false })
    .limit(500);
  const snapshotCoinIds = new Set((snapCoins ?? []).map((s) => s.coin_id));

  return sorted
    .filter(([coin_id]) => {
      const coin = coinMap.get(coin_id);
      if (!coin || coin.name === coin.id || coin.symbol === coin.id) return false;
      // Must have price data (i.e., in CoinGecko top 250)
      return snapshotCoinIds.has(coin_id);
    })
    .slice(0, 10)
    .map(([coin_id, agg]) => ({
      coin_id,
      coin: coinMap.get(coin_id),
      totalMentions: agg.mentions,
      avgSentiment: agg.sentimentCount > 0 ? agg.sentimentSum / agg.sentimentCount : 0,
      sources: [...agg.sources],
    }));
}

// Stablecoin movements aren't interesting whale signals — just cash moving around
const STABLECOIN_SYMBOLS = new Set(["USDT", "USDC", "DAI", "TUSD", "BUSD", "USDP", "FRAX", "PYUSD"]);

async function getWhaleActivity(): Promise<WhaleTransaction[]> {
  // Fetch more than needed so we can filter stablecoins and show the most interesting
  const { data } = await supabase
    .from("whale_transactions")
    .select("id, wallet_address, coin_id, token_symbol, amount, amount_usd, direction, label, entity_type, ts")
    .order("ts", { ascending: false })
    .limit(100);
  if (!data || data.length === 0) return [];

  // Split into non-stablecoin (priority) and stablecoin (filler)
  const nonStable = data.filter((tx) => !STABLECOIN_SYMBOLS.has(tx.token_symbol?.toUpperCase()));
  const stableOnly = data
    .filter((tx) => STABLECOIN_SYMBOLS.has(tx.token_symbol?.toUpperCase()))
    .filter((tx) => (tx.amount_usd ?? 0) >= 100_000); // Only large stablecoin moves

  // Show non-stablecoin first (sorted by value), then fill with large stablecoin moves
  const sorted = [
    ...nonStable.sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0)),
    ...stableOnly.sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0)),
  ];

  return sorted.slice(0, 10);
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
