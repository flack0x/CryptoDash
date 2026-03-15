-- Signal performance tracking: record price at detection, check 24h/48h later
-- Adds columns to intelligence_alerts for automated outcome evaluation

ALTER TABLE intelligence_alerts
    ADD COLUMN price_at_detection DOUBLE PRECISION,
    ADD COLUMN predicted_direction TEXT,
    ADD COLUMN price_24h DOUBLE PRECISION,
    ADD COLUMN price_48h DOUBLE PRECISION,
    ADD COLUMN change_pct_24h DOUBLE PRECISION,
    ADD COLUMN change_pct_48h DOUBLE PRECISION,
    ADD COLUMN direction_correct_24h BOOLEAN,
    ADD COLUMN direction_correct_48h BOOLEAN,
    ADD COLUMN checked_24h_at TIMESTAMPTZ,
    ADD COLUMN checked_48h_at TIMESTAMPTZ;

-- Partial indexes for the outcome checker to find pending work efficiently
CREATE INDEX idx_alerts_pending_24h ON intelligence_alerts (ts)
    WHERE price_at_detection IS NOT NULL
      AND checked_24h_at IS NULL;

CREATE INDEX idx_alerts_pending_48h ON intelligence_alerts (ts)
    WHERE price_at_detection IS NOT NULL
      AND checked_24h_at IS NOT NULL
      AND checked_48h_at IS NULL;
