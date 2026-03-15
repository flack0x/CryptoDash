export interface MarketMood {
  id: number;
  ts: string;
  value: number;
  label: string;
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
  whale_entities: string[] | null;
  confidence: number | null;
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
}

export interface SocialBuzz {
  coin_id: string;
  coin?: Coin;
  totalMentions: number;
  avgSentiment: number;
  sources: string[];
}

export interface SignalPerformance {
  total24h: number;
  correct24h: number;
  hitRate24h: number | null;
  total48h: number;
  correct48h: number;
  hitRate48h: number | null;
  pendingEvaluation: number;
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
  signalPerformance: SignalPerformance;
  lastUpdated: string;
}
