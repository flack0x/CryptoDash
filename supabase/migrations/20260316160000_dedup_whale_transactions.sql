-- Clean up duplicate whale transactions (same blockchain tx collected on multiple runs).
-- Keep the OLDEST row per tx_hash + wallet_address, delete the rest.
DELETE FROM whale_transactions a
USING whale_transactions b
WHERE a.tx_hash = b.tx_hash
  AND a.wallet_address = b.wallet_address
  AND a.tx_hash IS NOT NULL
  AND a.tx_hash != ''
  AND a.id > b.id;

-- Prevent future duplicates: unique constraint on tx_hash + wallet_address
CREATE UNIQUE INDEX IF NOT EXISTS idx_whale_tx_dedup
ON whale_transactions(tx_hash, wallet_address)
WHERE tx_hash IS NOT NULL AND tx_hash != '';
