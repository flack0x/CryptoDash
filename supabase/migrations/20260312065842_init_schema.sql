-- CryptoDash schema — crypto intelligence data pipeline

-- Coins / tokens we track
CREATE TABLE coins (
    id TEXT PRIMARY KEY,                    -- coingecko id e.g. "bitcoin"
    symbol TEXT NOT NULL,                   -- e.g. "btc"
    name TEXT NOT NULL,                     -- e.g. "Bitcoin"
    categories JSONB DEFAULT '[]'::jsonb,   -- narrative tags
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Price / market snapshots
CREATE TABLE snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coin_id TEXT NOT NULL REFERENCES coins(id),
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    price_usd DOUBLE PRECISION NOT NULL,
    volume_24h DOUBLE PRECISION DEFAULT 0,
    market_cap DOUBLE PRECISION DEFAULT 0,
    price_change_24h DOUBLE PRECISION,
    rank INTEGER
);

-- Social signals (mentions, sentiment, engagement)
CREATE TABLE social_signals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coin_id TEXT NOT NULL REFERENCES coins(id),
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL,                   -- "reddit", "lunarcrush", "free_crypto_news"
    mentions INTEGER DEFAULT 0,
    sentiment_score DOUBLE PRECISION,       -- -1.0 to 1.0
    engagement INTEGER,
    raw_data JSONB
);

-- On-chain metrics (TVL, whale flows, exchange flows, etc.)
CREATE TABLE on_chain (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coin_id TEXT NOT NULL REFERENCES coins(id),
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    metric_type TEXT NOT NULL,              -- "tvl", "whale_flow", "exchange_inflow", etc.
    value DOUBLE PRECISION NOT NULL,
    source TEXT NOT NULL,                   -- "defillama", "dune", "glassnode"
    raw_data JSONB
);

-- Developer activity
CREATE TABLE dev_activity (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coin_id TEXT NOT NULL REFERENCES coins(id),
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    commits_7d INTEGER DEFAULT 0,
    contributors_7d INTEGER DEFAULT 0,
    repo_url TEXT,
    source TEXT DEFAULT 'github'
);

-- Narrative themes (AI tokens, L2s, RWA, memecoins, etc.)
CREATE TABLE narratives (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    coin_ids JSONB DEFAULT '[]'::jsonb,
    momentum DOUBLE PRECISION,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Market mood (Fear & Greed index)
CREATE TABLE market_mood (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    value INTEGER NOT NULL,                 -- 0-100
    label TEXT NOT NULL                     -- "Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"
);

-- Trending coins across sources
CREATE TABLE trending (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coin_id TEXT NOT NULL REFERENCES coins(id),
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL,                   -- "coingecko", "lunarcrush", "geckoterminal"
    rank INTEGER NOT NULL,
    score DOUBLE PRECISION
);

-- Indexes for time-series queries
CREATE INDEX idx_snapshots_coin_ts ON snapshots(coin_id, ts DESC);
CREATE INDEX idx_snapshots_ts ON snapshots(ts DESC);
CREATE INDEX idx_social_coin_ts ON social_signals(coin_id, ts DESC);
CREATE INDEX idx_social_ts ON social_signals(ts DESC);
CREATE INDEX idx_onchain_coin_ts ON on_chain(coin_id, ts DESC);
CREATE INDEX idx_onchain_type_ts ON on_chain(metric_type, ts DESC);
CREATE INDEX idx_trending_ts ON trending(ts DESC);
CREATE INDEX idx_mood_ts ON market_mood(ts DESC);
CREATE INDEX idx_dev_coin_ts ON dev_activity(coin_id, ts DESC);

-- Auto-update updated_at on coins
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER coins_updated_at
    BEFORE UPDATE ON coins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER narratives_updated_at
    BEFORE UPDATE ON narratives
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
