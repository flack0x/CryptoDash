import { supabase } from "./supabase";
import type {
  MarketMood, TrendingCoin, Snapshot,
  Narrative, Coin, SocialBuzz, WhaleTransaction, DashboardData,
  EnrichedAlert, SignalPerformance, EvaluatedSignal,
  WhaleNetFlow, WhaleNetFlowEntity, SystemHealth, SystemHealthSource,
  PaperTrade, PaperTradingResult,
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
  // 4-hour window: alerts must be re-detected within recent analysis runs to stay visible.
  // Analysis runs every ~30-60 min via GitHub Actions, so a 4h window = 4-8 confirmation runs.
  // A signal detected once and never confirmed again disappears within 4 hours, not 24.
  // This prevents stale/false alerts from lingering on the dashboard.
  const since = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  let { data } = await supabase
    .from("intelligence_alerts")
    .select("*")
    .gte("ts", since)
    .order("confidence", { ascending: false })
    .limit(50);

  if (!data || data.length === 0) return [];

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

async function getEvaluatedSignals(): Promise<EvaluatedSignal[]> {
  const { data } = await supabase
    .from("intelligence_alerts")
    .select("coin_id, alert_type, confidence, severity, predicted_direction, price_at_detection, price_24h, price_48h, price_72h, change_pct_24h, change_pct_48h, change_pct_72h, direction_correct_24h, direction_correct_48h, direction_correct_72h, ts")
    .not("direction_correct_24h", "is", null)
    .order("ts", { ascending: false })
    .limit(100);

  if (!data || data.length === 0) return [];

  // Deduplicate by coin+type (keep most recent evaluation)
  const seen = new Set<string>();
  const unique: typeof data = [];
  for (const a of data) {
    const key = `${a.coin_id}:${a.alert_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }

  const top = unique.slice(0, 20);

  // Enrich with coin names
  const coinIds = [...new Set(top.map((a) => a.coin_id).filter(Boolean))];
  const { data: coins } = await supabase
    .from("coins")
    .select("id, symbol, name")
    .in("id", coinIds);
  const coinMap = new Map((coins ?? []).map((c) => [c.id, c]));

  return top.map((a) => ({
    ...a,
    coin: coinMap.get(a.coin_id),
  }));
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
  // Also track per-source breakdown
  const map = new Map<string, {
    mentions: number;
    sentimentSum: number;
    sentimentCount: number;
    sources: Set<string>;
    perSource: Map<string, { mentions: number; sentimentSum: number; sentimentCount: number }>;
  }>();
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
      // Per-source tracking
      const ps = existing.perSource.get(s.source);
      if (ps) {
        ps.mentions += s.mentions ?? 0;
        if (s.sentiment_score != null) {
          ps.sentimentSum += s.sentiment_score;
          ps.sentimentCount++;
        }
      } else {
        existing.perSource.set(s.source, {
          mentions: s.mentions ?? 0,
          sentimentSum: s.sentiment_score ?? 0,
          sentimentCount: s.sentiment_score != null ? 1 : 0,
        });
      }
    } else {
      const perSource = new Map();
      perSource.set(s.source, {
        mentions: s.mentions ?? 0,
        sentimentSum: s.sentiment_score ?? 0,
        sentimentCount: s.sentiment_score != null ? 1 : 0,
      });
      map.set(s.coin_id, {
        mentions: s.mentions ?? 0,
        sentimentSum: s.sentiment_score ?? 0,
        sentimentCount: s.sentiment_score != null ? 1 : 0,
        sources: new Set([s.source]),
        perSource,
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
      perSource: [...agg.perSource.entries()].map(([source, ps]) => ({
        source,
        mentions: ps.mentions,
        sentiment: ps.sentimentCount > 0 ? ps.sentimentSum / ps.sentimentCount : 0,
      })),
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
    .select("id, wallet_address, coin_id, token_symbol, amount, amount_usd, direction, label, entity_type, ts, tx_hash")
    .gte("ts", since)
    .order("amount_usd", { ascending: false })
    .limit(500);
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

async function getWhaleNetFlows(): Promise<WhaleNetFlow[]> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("whale_transactions")
    .select("wallet_address, token_symbol, amount, amount_usd, direction, label, tx_hash")
    .gte("ts", since)
    .not("amount_usd", "is", null)
    .order("amount_usd", { ascending: false })
    .limit(1000);

  if (!data || data.length === 0) return [];

  // Deduplicate by tx_hash+wallet (same as other queries)
  const txSeen = new Set<string>();
  const deduped = data.filter((tx) => {
    const key = `${tx.wallet_address}-${tx.token_symbol}-${tx.amount}-${tx.direction}`;
    if (txSeen.has(key)) return false;
    txSeen.add(key);
    return true;
  });

  // Aggregate per token
  const tokenMap = new Map<string, {
    buy_usd: number;
    sell_usd: number;
    tx_count: number;
    entities: Map<string, { buy_usd: number; sell_usd: number }>;
  }>();

  for (const tx of deduped) {
    const symbol = tx.token_symbol?.toUpperCase() || "?";
    const usd = tx.amount_usd ?? 0;

    let entry = tokenMap.get(symbol);
    if (!entry) {
      entry = { buy_usd: 0, sell_usd: 0, tx_count: 0, entities: new Map() };
      tokenMap.set(symbol, entry);
    }

    entry.tx_count++;
    if (tx.direction === "buy") {
      entry.buy_usd += usd;
    } else {
      entry.sell_usd += usd;
    }

    // Per-entity tracking
    const entityLabel = tx.label || "Unknown";
    let ent = entry.entities.get(entityLabel);
    if (!ent) {
      ent = { buy_usd: 0, sell_usd: 0 };
      entry.entities.set(entityLabel, ent);
    }
    if (tx.direction === "buy") {
      ent.buy_usd += usd;
    } else {
      ent.sell_usd += usd;
    }
  }

  // Convert to array and sort by total volume
  const flows: WhaleNetFlow[] = [...tokenMap.entries()]
    .map(([symbol, entry]) => ({
      token_symbol: symbol,
      buy_usd: entry.buy_usd,
      sell_usd: entry.sell_usd,
      net_usd: entry.buy_usd - entry.sell_usd,
      tx_count: entry.tx_count,
      entities: [...entry.entities.entries()]
        .map(([label, e]): WhaleNetFlowEntity => ({
          label,
          buy_usd: e.buy_usd,
          sell_usd: e.sell_usd,
          net_usd: e.buy_usd - e.sell_usd,
        }))
        .sort((a, b) => Math.abs(b.net_usd) - Math.abs(a.net_usd)),
    }))
    .sort((a, b) => (b.buy_usd + b.sell_usd) - (a.buy_usd + a.sell_usd))
    .slice(0, 15);

  return flows;
}

async function getSystemHealth(): Promise<SystemHealth> {
  const now = Date.now();
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  const sourceConfigs: { name: string; table: string }[] = [
    { name: "CoinGecko", table: "snapshots" },
    { name: "Whale Tracker", table: "whale_transactions" },
    { name: "Reddit", table: "social_signals" },
    { name: "Fear & Greed", table: "market_mood" },
    { name: "Trending", table: "trending" },
    { name: "Smart Money", table: "intelligence_alerts" },
    { name: "DeFi TVL", table: "on_chain" },
  ];

  const results = await Promise.all(
    sourceConfigs.map(async (src) => {
      const { data } = await supabase
        .from(src.table)
        .select("ts")
        .order("ts", { ascending: false })
        .limit(1);
      const lastTs = data?.[0]?.ts ?? null;
      let status: "green" | "yellow" | "red" = "red";
      if (lastTs) {
        const age = now - new Date(lastTs).getTime();
        if (age < TWO_HOURS) status = "green";
        else if (age < SIX_HOURS) status = "yellow";
      }
      return { name: src.name, table: src.table, lastTs, status } as SystemHealthSource;
    })
  );

  // Overall: red if any red, yellow if any yellow, green otherwise
  let overall: "green" | "yellow" | "red" = "green";
  for (const s of results) {
    if (s.status === "red") { overall = "red"; break; }
    if (s.status === "yellow") overall = "yellow";
  }

  return { sources: results, overallStatus: overall };
}

async function getSignalPerformance(): Promise<SignalPerformance> {
  // Fetch all alerts that have outcome data OR are pending evaluation
  // Order by ts DESC so dedup keeps most recent (matches getEvaluatedSignals)
  const { data: evaluated } = await supabase
    .from("intelligence_alerts")
    .select("coin_id, alert_type, direction_correct_24h, direction_correct_48h, direction_correct_72h")
    .not("direction_correct_24h", "is", null)
    .order("ts", { ascending: false });

  const { data: pending } = await supabase
    .from("intelligence_alerts")
    .select("coin_id, alert_type")
    .not("price_at_detection", "is", null)
    .is("direction_correct_24h", null);

  // Deduplicate: same coin+type = same signal (re-detected across runs)
  // Ordered by ts DESC so first seen = most recent evaluation
  const evalMap24 = new Map<string, boolean>();
  const evalMap48 = new Map<string, boolean>();
  const evalMap72 = new Map<string, boolean>();
  for (const a of evaluated ?? []) {
    const key = `${a.coin_id}:${a.alert_type}`;
    if (!evalMap24.has(key)) evalMap24.set(key, a.direction_correct_24h === true);
    if (a.direction_correct_48h != null && !evalMap48.has(key)) {
      evalMap48.set(key, a.direction_correct_48h === true);
    }
    if (a.direction_correct_72h != null && !evalMap72.has(key)) {
      evalMap72.set(key, a.direction_correct_72h === true);
    }
  }

  const pendingKeys = new Set<string>();
  for (const a of pending ?? []) {
    pendingKeys.add(`${a.coin_id}:${a.alert_type}`);
  }

  const rawEvaluated = evaluated?.length ?? 0;
  const total24h = evalMap24.size;
  const correct24h = [...evalMap24.values()].filter(Boolean).length;
  const total48h = evalMap48.size;
  const correct48h = [...evalMap48.values()].filter(Boolean).length;
  const total72h = evalMap72.size;
  const correct72h = [...evalMap72.values()].filter(Boolean).length;

  // Per-pattern breakdown (24h, 48h, 72h for each pattern)
  const filterPattern = (map: Map<string, boolean>, pat: string) =>
    [...map.entries()].filter(([k]) => k.endsWith(`:${pat}`));
  const countCorrect = (entries: [string, boolean][]) => entries.filter(([, v]) => v).length;

  const eh24 = filterPattern(evalMap24, "smart_money_exit_hype");
  const eh48 = filterPattern(evalMap48, "smart_money_exit_hype");
  const eh72 = filterPattern(evalMap72, "smart_money_exit_hype");
  const bf24 = filterPattern(evalMap24, "smart_money_buying_fear");
  const bf48 = filterPattern(evalMap48, "smart_money_buying_fear");
  const bf72 = filterPattern(evalMap72, "smart_money_buying_fear");
  const db24 = filterPattern(evalMap24, "smart_money_dip_buy");
  const db48 = filterPattern(evalMap48, "smart_money_dip_buy");
  const db72 = filterPattern(evalMap72, "smart_money_dip_buy");

  const rate = (entries: [string, boolean][]) =>
    entries.length > 0 ? countCorrect(entries) / entries.length : null;

  return {
    rawEvaluated,
    total24h, correct24h,
    hitRate24h: total24h > 0 ? correct24h / total24h : null,
    total48h, correct48h,
    hitRate48h: total48h > 0 ? correct48h / total48h : null,
    total72h, correct72h,
    hitRate72h: total72h > 0 ? correct72h / total72h : null,
    pendingEvaluation: pendingKeys.size,
    exitHype24h: rate(eh24), exitHype48h: rate(eh48), exitHype72h: rate(eh72),
    exitHypeCount: eh24.length,
    buyingFear24h: rate(bf24), buyingFear48h: rate(bf48), buyingFear72h: rate(bf72),
    buyingFearCount: bf24.length,
    dipBuy24h: rate(db24), dipBuy48h: rate(db48), dipBuy72h: rate(db72),
    dipBuyCount: db24.length,
  };
}

// ── Paper Trading Simulator ──────────────────────────────────────────
// Mirrors analysis/paper_trading.py logic — runs entirely client-side on evaluated signals

const PAPER_POSITION_SIZE = 1000;   // $1000 per trade
const PAPER_FEE_PCT = 0.001;       // 0.1% per side
const PAPER_STOP_LOSS = 0.08;      // 8% stop-loss
const PAPER_PROFIT_TARGET = 0.05;  // 5% profit target
const PAPER_MIN_CONFIDENCE = 0.15;
// SPOT-ONLY: Only trade dip_buy (temporally confirmed accumulation).
const PAPER_TRADEABLE = new Set(["smart_money_dip_buy"]);

async function getPaperTrading(): Promise<PaperTradingResult> {
  const { data } = await supabase
    .from("intelligence_alerts")
    .select("id, coin_id, alert_type, confidence, predicted_direction, price_at_detection, price_24h, price_48h, price_72h, change_pct_24h, change_pct_48h, change_pct_72h, ts")
    .not("price_at_detection", "is", null)
    .not("checked_24h_at", "is", null)
    .order("ts", { ascending: true })
    .limit(500);

  if (!data || data.length === 0) {
    return emptyPaperResult();
  }

  // Simulate trades
  const trades: PaperTrade[] = [];
  let cumulative = 0;

  for (const sig of data) {
    if (!PAPER_TRADEABLE.has(sig.alert_type)) continue;
    if ((sig.confidence ?? 0) < PAPER_MIN_CONFIDENCE) continue;
    if (!sig.price_at_detection || !sig.price_24h) continue;

    // SPOT-ONLY: all positions are long (buy coin, sell later)
    const direction: "sell" | "buy" = "buy";

    let exitPrice: number = sig.price_24h; // fallback
    let exitReason = "24h_close";

    // Check 24h: profit target or stop loss
    const change24 = (sig.price_24h - sig.price_at_detection) / sig.price_at_detection;
    if (change24 >= PAPER_PROFIT_TARGET) {
      exitPrice = sig.price_24h;
      exitReason = "24h_profit_target";
    } else if (change24 <= -PAPER_STOP_LOSS) {
      exitPrice = sig.price_24h;
      exitReason = "24h_stop_loss";
    }

    // Check 48h: profit target or stop loss
    if (exitReason === "24h_close" && sig.price_48h != null) {
      const change48 = (sig.price_48h - sig.price_at_detection) / sig.price_at_detection;
      if (change48 >= PAPER_PROFIT_TARGET) {
        exitPrice = sig.price_48h;
        exitReason = "48h_profit_target";
      } else if (change48 <= -PAPER_STOP_LOSS) {
        exitPrice = sig.price_48h;
        exitReason = "48h_stop_loss";
      }
    }

    // Check 72h: mandatory close
    if (exitReason === "24h_close" && sig.price_72h != null) {
      exitPrice = sig.price_72h;
      exitReason = "72h_close";
    }

    // Fallback — exitPrice already defaults to price_24h
    // Upgrade to 48h if available and no earlier exit triggered
    if (exitReason === "24h_close" && sig.price_48h != null) {
      exitPrice = sig.price_48h;
      exitReason = "48h_close";
    }

    // SPOT-ONLY: long position — profit when price goes UP
    const rawPnl = (exitPrice - sig.price_at_detection) / sig.price_at_detection;

    const fees = 2 * PAPER_FEE_PCT;
    const netPnlPct = rawPnl - fees;
    const netPnlUsd = Math.round(netPnlPct * PAPER_POSITION_SIZE * 100) / 100;
    cumulative = Math.round((cumulative + netPnlUsd) * 100) / 100;

    trades.push({
      coin_id: sig.coin_id,
      alert_type: sig.alert_type,
      confidence: sig.confidence ?? 0,
      direction,
      entry_price: sig.price_at_detection,
      exit_price: exitPrice,
      exit_reason: exitReason,
      net_pnl_pct: Math.round(netPnlPct * 10000) / 10000,
      net_pnl_usd: netPnlUsd,
      cumulative_usd: cumulative,
      ts: sig.ts,
    });
  }

  if (trades.length === 0) return emptyPaperResult();

  // Enrich with coin names
  const coinIds = [...new Set(trades.map(t => t.coin_id).filter(Boolean))];
  const { data: coins } = await supabase.from("coins").select("id, symbol, name").in("id", coinIds);
  const coinMap = new Map((coins ?? []).map(c => [c.id, c]));
  for (const t of trades) { t.coin = coinMap.get(t.coin_id); }

  // Stats
  const wins = trades.filter(t => t.net_pnl_usd > 0);
  const losses = trades.filter(t => t.net_pnl_usd <= 0);
  const grossWins = wins.reduce((s, t) => s + t.net_pnl_usd, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.net_pnl_usd, 0));

  let peak = 0, maxDd = 0, running = 0;
  for (const t of trades) {
    running += t.net_pnl_usd;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    trades,
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: wins.length / trades.length,
    totalPnlUsd: Math.round(cumulative * 100) / 100,
    avgWinPct: wins.length > 0 ? Math.round(wins.reduce((s, t) => s + t.net_pnl_pct, 0) / wins.length * 10000) / 100 : 0,
    avgLossPct: losses.length > 0 ? Math.round(losses.reduce((s, t) => s + t.net_pnl_pct, 0) / losses.length * 10000) / 100 : 0,
    profitFactor: grossLosses > 0 ? Math.round(grossWins / grossLosses * 100) / 100 : grossWins > 0 ? Infinity : 0,
    maxDrawdownUsd: Math.round(maxDd * 100) / 100,
    bestTradePct: Math.round(Math.max(...trades.map(t => t.net_pnl_pct)) * 10000) / 100,
    worstTradePct: Math.round(Math.min(...trades.map(t => t.net_pnl_pct)) * 10000) / 100,
  };
}

function emptyPaperResult(): PaperTradingResult {
  return {
    trades: [], totalTrades: 0, winningTrades: 0, losingTrades: 0,
    winRate: 0, totalPnlUsd: 0, avgWinPct: 0, avgLossPct: 0,
    profitFactor: 0, maxDrawdownUsd: 0, bestTradePct: 0, worstTradePct: 0,
  };
}

async function getLastAlertTs(): Promise<string | null> {
  const { data } = await supabase
    .from("intelligence_alerts")
    .select("ts")
    .order("ts", { ascending: false })
    .limit(1);
  return data?.[0]?.ts ?? null;
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const [mood, alerts, trending, movers, narratives, socialBuzz, whaleActivity, whaleNetFlows, evaluatedSignals, systemHealth, signalPerformance, paperTrading, lastSignalTs] = await Promise.all([
    getLatestMood(),
    getAlerts(),
    getTrending(),
    getMovers(),
    getNarratives(),
    getSocialBuzz(),
    getWhaleActivity(),
    getWhaleNetFlows(),
    getEvaluatedSignals(),
    getSystemHealth(),
    getSignalPerformance(),
    getPaperTrading(),
    getLastAlertTs(),
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
    whaleNetFlows,
    evaluatedSignals,
    systemHealth,
    signalPerformance,
    paperTrading,
    lastSignalTs,
    lastUpdated: new Date().toISOString(),
  };
}
