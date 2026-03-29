export interface MarketMood {
  id: number;
  ts: string;
  value: number;
  label: string;
}

export interface WhaleEntity {
  label: string;
  net_usd: number;
}

export interface IntelligenceAlert {
  id: number;
  ts: string;
  alert_type: string;
  coin_id: string | null;
  severity: string;
  headline: string;
  brief: string;
  social_mentions: number | null;
  social_sentiment: number | null;
  social_avg_mentions: number | null;
  whale_volume_usd: number | null;
  whale_direction: string | null;
  whale_entities: WhaleEntity[] | null;
  confidence: number | null;
  predicted_direction: string | null;
  price_at_detection: number | null;
}

export interface Snapshot {
  id: number;
  coin_id: string;
  ts: string;
  price_usd: number;
  volume_24h: number;
  market_cap: number;
  price_change_24h: number | null;
  rank: number | null;
}

export interface TrendingCoin {
  id: number;
  coin_id: string;
  ts: string;
  source: string;
  rank: number;
  score: number | null;
}

export interface Narrative {
  id: string;
  name: string;
  description: string;
  coin_ids: string[];
  momentum: number | null;
}

export interface Coin {
  id: string;
  symbol: string;
  name: string;
}

export interface SocialSignal {
  id: number;
  coin_id: string;
  ts: string;
  source: string;
  mentions: number;
  sentiment_score: number | null;
  engagement: number | null;
}

export interface WhaleTransaction {
  id: number;
  wallet_address: string;
  coin_id: string | null;
  token_symbol: string;
  amount: number;
  amount_usd: number | null;
  direction: string;
  label: string;
  entity_type: string;
  ts: string;
  tx_hash: string | null;
}

export interface SourceSentiment {
  source: string;
  mentions: number;
  sentiment: number;
}

export interface SocialBuzz {
  coin_id: string;
  coin?: Coin;
  totalMentions: number;
  avgSentiment: number;
  sources: string[];
  perSource: SourceSentiment[];
}

export interface SignalPerformance {
  total24h: number;
  correct24h: number;
  hitRate24h: number | null;
  total48h: number;
  correct48h: number;
  hitRate48h: number | null;
  total72h: number;
  correct72h: number;
  hitRate72h: number | null;
  pendingEvaluation: number;
  rawEvaluated: number;
  exitHype24h: number | null;
  exitHype48h: number | null;
  exitHype72h: number | null;
  exitHypeCount: number;
  buyingFear24h: number | null;
  buyingFear48h: number | null;
  buyingFear72h: number | null;
  buyingFearCount: number;
  dipBuy24h: number | null;
  dipBuy48h: number | null;
  dipBuy72h: number | null;
  dipBuyCount: number;
}

export interface EvaluatedSignal {
  coin_id: string;
  coin?: Coin;
  alert_type: string;
  confidence: number;
  severity: string;
  predicted_direction: string | null;
  price_at_detection: number | null;
  price_24h: number | null;
  price_48h: number | null;
  price_72h: number | null;
  change_pct_24h: number | null;
  change_pct_48h: number | null;
  change_pct_72h: number | null;
  direction_correct_24h: boolean | null;
  direction_correct_48h: boolean | null;
  direction_correct_72h: boolean | null;
  ts: string;
}

export interface WhaleNetFlowEntity {
  label: string;
  buy_usd: number;
  sell_usd: number;
  net_usd: number;
}

export interface WhaleNetFlow {
  token_symbol: string;
  buy_usd: number;
  sell_usd: number;
  net_usd: number;
  tx_count: number;
  entities: WhaleNetFlowEntity[];
}

export interface SystemHealthSource {
  name: string;
  table: string;
  lastTs: string | null;
  status: "green" | "yellow" | "red";
}

export interface SystemHealth {
  sources: SystemHealthSource[];
  overallStatus: "green" | "yellow" | "red";
}

export interface PaperTrade {
  coin_id: string;
  coin?: Coin;
  alert_type: string;
  confidence: number;
  direction: "sell" | "buy";
  entry_price: number;
  exit_price: number;
  exit_reason: string;
  net_pnl_pct: number;
  net_pnl_usd: number;
  cumulative_usd: number;
  ts: string;
}

export interface PaperTradingResult {
  trades: PaperTrade[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnlUsd: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  maxDrawdownUsd: number;
  bestTradePct: number;
  worstTradePct: number;
}

export type EnrichedAlert = IntelligenceAlert & {
  coin?: Coin;
  price_usd?: number;
  price_change_24h?: number;
  market_cap?: number;
};

export interface DashboardData {
  mood: MarketMood | null;
  alerts: EnrichedAlert[];
  trending: (TrendingCoin & { coin?: Coin })[];
  gainers: (Snapshot & { coin?: Coin })[];
  losers: (Snapshot & { coin?: Coin })[];
  narratives: Narrative[];
  socialBuzz: SocialBuzz[];
  whaleActivity: WhaleTransaction[];
  whaleNetFlows: WhaleNetFlow[];
  evaluatedSignals: EvaluatedSignal[];
  systemHealth: SystemHealth;
  signalPerformance: SignalPerformance;
  paperTrading: PaperTradingResult;
  lastSignalTs: string | null;
  lastUpdated: string;
}
