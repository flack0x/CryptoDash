import { supabase } from "./supabase";
import type {
  MarketMood, IntelligenceAlert, TrendingCoin, Snapshot,
  Narrative, Coin, SocialBuzz, WhaleTransaction, DashboardData,
  EnrichedAlert,
} from "./types";

async function getLatestMood(): Promise<MarketMood | null> {
  const { data } = await supabase
    .from("market_mood")
    .select("*")
    .order("ts", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

async function getAlerts(): Promise<EnrichedAlert[]> {
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
  const coinMap = new Map((coins ?? []).map((c) => [c.id, c]));
  const validCoins = new Set(
    (coins ?? []).filter((c) => c.name !== c.id && c.symbol !== c.id).map((c) => c.id)
  );

  const filtered = candidates
    .filter((a) => validCoins.has(a.coin_id!))
    .slice(0, 6);

  // Enrich with latest price data
  const alertCoinIds = [...new Set(filtered.map((a) => a.coin_id!))];
  const { data: latestSnap } = await supabase
    .from("snapshots")
    .select("ts")
    .order("ts", { ascending: false })
    .limit(1);
  const batchStart = latestSnap?.[0]
    ? new Date(new Date(latestSnap[0].ts).getTime() - 10 * 60 * 1000).toISOString()
    : new Date(0).toISOString();
  const { data: snapshots } = await supabase
    .from("snapshots")
    .select("coin_id, price_usd, price_change_24h, market_cap")
    .in("coin_id", alertCoinIds)
    .gte("ts", batchStart);
  const snapMap = new Map(
    (snapshots ?? []).map((s) => [s.coin_id, s])
  );

  return filtered.map((a) => {
    const snap = snapMap.get(a.coin_id!);
    return {
      ...a,
      coin: coinMap.get(a.coin_id!),
      price_usd: snap?.price_usd,
      price_change_24h: snap?.price_change_24h ?? undefined,
      market_cap: snap?.market_cap,
    };
  });
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

// Specific coin IDs that are real coins but whose names/symbols cause false matches
const NOISE_COIN_IDS = new Set([
  "cash-4", "reallink", "stable-2", "base-protocol",
  "thetrumptoken", "aster-2", "story-2", "midnight-3",
  "four", "just", "rain",
]);

/** Returns true if the coin_id looks like a real coin (not noise) */
function isValidCoinId(coinId: string): boolean {
  if (coinId.startsWith("dex:")) return false;
  if (coinId.startsWith("_")) return false;
  if (NOISE_WORDS.has(coinId.toLowerCase())) return false;
  if (NOISE_COIN_IDS.has(coinId.toLowerCase())) return false;
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

  // Only show coins with proper names, price data, and meaningful market cap
  // Get latest snapshot batch to verify coin is currently in top 250
  const { data: latestSnap } = await supabase
    .from("snapshots")
    .select("ts")
    .order("ts", { ascending: false })
    .limit(1);
  const batchStart = latestSnap?.[0]
    ? new Date(new Date(latestSnap[0].ts).getTime() - 10 * 60 * 1000).toISOString()
    : new Date(0).toISOString();
  const { data: snapCoins } = await supabase
    .from("snapshots")
    .select("coin_id, market_cap")
    .gte("ts", batchStart);
  const validSnaps = new Map(
    (snapCoins ?? []).map((s) => [s.coin_id, s.market_cap ?? 0])
  );

  return sorted
    .filter(([coin_id]) => {
      if (STABLECOIN_COIN_IDS.has(coin_id)) return false; // Stablecoin sentiment is meaningless
      const coin = coinMap.get(coin_id);
      if (!coin || coin.name === coin.id || coin.symbol === coin.id) return false;
      const mktCap = validSnaps.get(coin_id) ?? 0;
      // Must have price data AND at least $50M market cap (filters junk coins)
      return mktCap >= 50_000_000;
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

// Stablecoins — not interesting for social buzz or whale signals (just cash moving around)
const STABLECOIN_SYMBOLS = new Set(["USDT", "USDC", "DAI", "TUSD", "BUSD", "USDP", "FRAX", "PYUSD"]);
const STABLECOIN_COIN_IDS = new Set(["tether", "usd-coin", "dai", "true-usd", "binance-usd", "pax-dollar", "frax", "paypal-usd"]);

async function getWhaleActivity(): Promise<WhaleTransaction[]> {
  // Only show recent whale activity — old transactions destroy trust
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("whale_transactions")
    .select("id, wallet_address, coin_id, token_symbol, amount, amount_usd, direction, label, entity_type, ts")
    .gte("ts", since)
    .order("amount_usd", { ascending: false })
    .limit(100);
  if (!data || data.length === 0) return [];

  // Deduplicate by wallet+token+amount+direction (same tx collected twice)
  const seen = new Set<string>();
  const deduped = data.filter((tx) => {
    const key = `${tx.wallet_address}-${tx.token_symbol}-${tx.amount}-${tx.direction}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Non-stablecoin transactions first (the interesting ones), then large stablecoin moves
  // Cap stablecoins at 3 max — exchange treasury ops (rebalancing, market making) are noise,
  // not trading signals. The actual token trades (COMP, FET, etc.) are what matters.
  const nonStable = deduped.filter((tx) => !STABLECOIN_SYMBOLS.has(tx.token_symbol?.toUpperCase()));
  const stableBig = deduped
    .filter((tx) => STABLECOIN_SYMBOLS.has(tx.token_symbol?.toUpperCase()))
    .filter((tx) => (tx.amount_usd ?? 0) >= 500_000) // Only $500K+ stablecoin moves
    .slice(0, 3); // Max 3 stablecoin entries — don't drown real token trades

  return [...nonStable, ...stableBig].slice(0, 10);
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
