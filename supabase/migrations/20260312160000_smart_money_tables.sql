-- Smart Money Pivot: new tables for whale tracking and intelligence alerts

-- Tracked whale/VC/fund/exchange wallets
CREATE TABLE tracked_wallets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    address TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'ethereum',
    label TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    source TEXT DEFAULT 'seed',
    is_active BOOLEAN DEFAULT true,
    last_checked TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(address, chain)
);

-- Individual whale transactions
CREATE TABLE whale_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    coin_id TEXT,
    token_symbol TEXT,
    token_address TEXT,
    amount DOUBLE PRECISION NOT NULL,
    amount_usd DOUBLE PRECISION,
    direction TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'ethereum',
    label TEXT,
    entity_type TEXT,
    tx_hash TEXT,
    block_number BIGINT,
    counterparty TEXT,
    counterparty_label TEXT,
    source TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Intelligence alerts (the output product)
CREATE TABLE intelligence_alerts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    alert_type TEXT NOT NULL,
    coin_id TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    headline TEXT NOT NULL,
    brief TEXT NOT NULL,
    social_mentions INTEGER,
    social_sentiment DOUBLE PRECISION,
    social_avg_mentions DOUBLE PRECISION,
    whale_volume_usd DOUBLE PRECISION,
    whale_direction TEXT,
    whale_entities JSONB,
    confidence DOUBLE PRECISION,
    raw_data JSONB
);

-- Indexes
CREATE INDEX idx_tracked_wallets_chain ON tracked_wallets(chain, is_active);
CREATE INDEX idx_tracked_wallets_entity ON tracked_wallets(entity_type);
CREATE INDEX idx_whale_tx_wallet ON whale_transactions(wallet_address, ts DESC);
CREATE INDEX idx_whale_tx_coin ON whale_transactions(coin_id, ts DESC);
CREATE INDEX idx_whale_tx_ts ON whale_transactions(ts DESC);
CREATE INDEX idx_intelligence_ts ON intelligence_alerts(ts DESC);
CREATE INDEX idx_intelligence_type ON intelligence_alerts(alert_type, ts DESC);
CREATE INDEX idx_intelligence_coin ON intelligence_alerts(coin_id, ts DESC);

-- Trigger for updated_at on tracked_wallets
CREATE TRIGGER tracked_wallets_updated_at
    BEFORE UPDATE ON tracked_wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
