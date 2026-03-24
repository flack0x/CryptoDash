-- 72h outcome tracking + mood at detection
-- Extends signal performance system to 72h and records market context on each alert

ALTER TABLE intelligence_alerts
    ADD COLUMN IF NOT EXISTS price_72h DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS change_pct_72h DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS direction_correct_72h BOOLEAN,
    ADD COLUMN IF NOT EXISTS checked_72h_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS mood_at_detection INTEGER;

-- Partial index for 72h outcome checker (mirrors 24h/48h pattern from 20260316)
CREATE INDEX IF NOT EXISTS idx_alerts_pending_72h ON intelligence_alerts (ts)
    WHERE price_at_detection IS NOT NULL
      AND checked_48h_at IS NOT NULL
      AND checked_72h_at IS NULL;
