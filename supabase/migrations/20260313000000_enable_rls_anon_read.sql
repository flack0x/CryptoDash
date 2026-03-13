-- Enable RLS on all tables and grant read-only access to anon role (public dashboard)

ALTER TABLE coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE on_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_mood ENABLE ROW LEVEL SECURITY;
ALTER TABLE trending ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE whale_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence_alerts ENABLE ROW LEVEL SECURITY;

-- Public read-only policies (anon key can SELECT, nothing else)
CREATE POLICY "Public read access" ON coins FOR SELECT USING (true);
CREATE POLICY "Public read access" ON snapshots FOR SELECT USING (true);
CREATE POLICY "Public read access" ON social_signals FOR SELECT USING (true);
CREATE POLICY "Public read access" ON on_chain FOR SELECT USING (true);
CREATE POLICY "Public read access" ON dev_activity FOR SELECT USING (true);
CREATE POLICY "Public read access" ON narratives FOR SELECT USING (true);
CREATE POLICY "Public read access" ON market_mood FOR SELECT USING (true);
CREATE POLICY "Public read access" ON trending FOR SELECT USING (true);
CREATE POLICY "Public read access" ON tracked_wallets FOR SELECT USING (true);
CREATE POLICY "Public read access" ON whale_transactions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON intelligence_alerts FOR SELECT USING (true);
