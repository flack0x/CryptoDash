# CryptoDash — Project Context

## What This Is

Crypto intelligence system: **"Where is smart money going that the crowd hasn't noticed yet?"**

Two inputs: what the crowd thinks (social sentiment) + what informed actors do (on-chain whale movements). The gap between them = the actionable signal.

## Architecture

```
GitHub Actions (cron every 15 min — primary, runs 24/7 for free)
  └── python main.py  → 7 collectors + analysis engine
         ↕
    Supabase (PostgreSQL, ap-south-1)
         ↕
Next.js Dashboard (deployed on Vercel, auto-deploys from GitHub)
  └── dashboard/      → reads Supabase via anon key (RLS read-only)
```

- **Python collectors** use the **service role key** (bypasses RLS, writes data)
- **Dashboard** uses the **anon key** (public, read-only via RLS policies)
- No custom API routes — Supabase JS client handles everything

## Deployments & URLs

- **GitHub**: https://github.com/flack0x/CryptoDash (public, user: flack0x)
- **Vercel**: https://dashboard-six-rouge-13.vercel.app (user: snmehanna-9643)
- **Supabase**: project ref `baptgroflunptsjqfsfx`, region ap-south-1
- **Vercel project**: root directory set to `dashboard/` in project settings, auto-deploys from GitHub
- **GitHub Actions**: `.github/workflows/collect.yml` runs collectors + analysis every 15 min (free, public repo)

## Running the System

```bash
# Start all collectors + analysis (runs continuously with APScheduler)
python main.py --daemon

# Or use Windows batch scripts:
start_collector.bat          # Start daemon in background (writes .collector.pid)
stop_collector.bat           # Stop background daemon

# Run collectors once (no analysis)
python main.py --collect

# Run analysis only (on existing data)
python main.py --analyze

# Default: collect + analyze once (auto-seeds wallets from whale_wallets.json on every run)
python main.py

# Dev server for Next.js dashboard
cd dashboard && npm run dev

# Deploy dashboard to Vercel (auto-deploys on git push, or manual:)
vercel --prod  # Run from repo ROOT, not dashboard/ (root dir is set in Vercel settings)

# Push to GitHub (triggers Vercel auto-deploy)
git add -A && git commit -m "message" && git push
```

### GitHub Actions (Primary — runs 24/7 for free)
- `.github/workflows/collect.yml` runs every 15 min on cron
- **Actual interval is ~30-60 min** — GitHub throttles cron on public repos, doesn't guarantee exact timing. This is normal and sufficient.
- Public repo = unlimited free GitHub Actions minutes
- All secrets stored as GitHub repository secrets (SUPABASE_URL, SUPABASE_SERVICE_KEY, REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, ETHERSCAN_API_KEY)
- Manual trigger: `gh workflow run collect.yml` or from GitHub UI
- Each run: installs deps (pip cached), runs all collectors + analysis (~3 min)
- **Confirmed working as of 2026-03-15** (latest health-check 2026-03-15 ~09:00 UTC): all runs successful since launch (~40 hours), all collectors + analysis producing data. DB stats: 606 coins, 14,500 snapshots, 10,039 social signals, 3,302 whale txs, 105 tracked wallets (~172 whale txs/run), 2,380 trending, 8,660 on-chain. Index/table hit rate: 1.00. No errors. TRACKABLE_COINS filter active (correctly suppresses false empty hype for non-ERC-20 tokens).

### Local Daemon Mode (backup — only if needed)
- `python main.py --daemon` or `start_collector.bat` / `stop_collector.bat`
- Scheduler runs collectors on intervals + analysis every 30 min
- Only needed if GitHub Actions is insufficient

## Collectors (7 Active + 2 Conditional)

| Collector | Source | Schedule | API Key Needed |
|-----------|--------|----------|----------------|
| `coingecko.py` | CoinGecko | 5 min | No (free tier) |
| `alternative_me.py` | Alternative.me | 1 hour | No |
| `free_crypto_news.py` | CryptoCompare | 15 min | No |
| `defillama.py` | DeFi Llama | 30 min | No |
| `geckoterminal.py` | GeckoTerminal | 10 min | No |
| `fourchan.py` | 4chan /biz/ | 15 min | No |
| `reddit.py` | Reddit PRAW | 10 min | REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET |
| `whale_tracker.py` | Etherscan V2 | 30 min | ETHERSCAN_API_KEY |
| `whale_alert.py` | Whale Alert | conditional | WHALE_ALERT_API_KEY (not configured) |

Conditional collectors are skipped by `scheduler.py` if their API keys are missing from `.env`.

## API Keys in `.env`

```
SUPABASE_URL=https://baptgroflunptsjqfsfx.supabase.co
SUPABASE_SERVICE_KEY=<service role key>
REDDIT_CLIENT_ID=hmGsnwxDnE6BkUTLtKFiXw
REDDIT_CLIENT_SECRET=fyGd0VsemZtPORcTyNlZTNAgwNHIAQ
ETHERSCAN_API_KEY=BQ5FS9KZ7TSEYPTRBB8Y9C54FIR8CF8RW3
```

**Note:** `.env` is NOT present locally — the user runs everything via GitHub Actions. All keys are stored as GitHub repository secrets. Running `python main.py` locally will fail with `supabase_key is required`. This is by design.

Dashboard env is in `dashboard/.env.local` (not committed):
```
NEXT_PUBLIC_SUPABASE_URL=https://baptgroflunptsjqfsfx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Same env vars are set in Vercel project settings for production builds.

## Database Tables (11)

| Table | Purpose |
|-------|---------|
| `coins` | Master coin list (id, symbol, name) — CoinGecko is source of truth |
| `snapshots` | Price snapshots (price, market_cap, volume, price_change_24h) |
| `trending` | Trending coins from multiple sources |
| `market_mood` | Fear & Greed Index |
| `social_signals` | Social mentions + sentiment per coin per source |
| `on_chain` | DeFi protocol TVL data |
| `narratives` | Narrative themes + momentum scores |
| `tracked_wallets` | 105 whale wallet addresses being monitored (96 from JSON + 9 pre-existing) |
| `whale_transactions` | Detected whale token movements (>= $10K, valued only) |
| `intelligence_alerts` | Smart money signals (the core output) |
| `dev_activity` | GitHub dev activity (unused, 0 rows) |

Schema in `supabase/migrations/`. RLS enabled on all tables with public SELECT policies for dashboard access.

**All timestamp columns are named `ts`** (not `collected_at`/`created_at`/`detected_at`). When querying via REST API: `?order=ts.desc&limit=1`.

## Smart Money Intelligence Engine

`analysis/smart_money.py` cross-references whale activity vs social sentiment to detect 4 patterns:

1. **stealth_accumulation** — whales buying, crowd not talking about it (bullish signal)
2. **empty_hype** — crowd hyping, no whale backing (bearish/caution signal)
3. **smart_money_buying_fear** — whales buying during fear/dips (contrarian bullish)
4. **smart_money_exit_hype** — whales selling during euphoria (contrarian bearish)

### Tuning & Filters
- **Stablecoins excluded**: USDT, USDC, DAI, etc. never generate alerts (stablecoin movements aren't position signals)
- **Major coins (BTC, ETH, SOL, etc.)** need 5x higher social mention threshold to trigger empty hype (they always have high mentions)
- **Empty hype confidence**: base cap 0.70 (absence of buying), boosted to max 0.80 when whales are **actively selling** (`sell_usd > buy_usd`). Weakest signal type overall but the sell-boost variant is stronger.
- **Social visibility gate**: stealth accumulation confidence is scaled by `min(1.0, avg_mentions / 10)`. Coins with 0 social baseline get 0 confidence (no alert). Coins with 5 avg mentions get 50% of normal confidence. This prevents "we're blind to social" from being misinterpreted as "the crowd hasn't noticed." **Without social data, there is no divergence to measure.**
- **Market-cap-relative whale threshold**: `min_usd = max(WHALE_MIN_USD, market_cap * 0.001)`. A $1.2M move on SHIB ($3.4B mcap = 0.035%) is noise. A $1.2M move on a $50M coin (2.4%) is a real signal. Uses bulk `db.get_latest_market_caps()` to avoid N+1 queries.
- **Severity thresholds**: critical >= 0.75, high >= 0.50, medium >= 0.25, low < 0.25
- **Minimum confidence 0.15** to generate any alert
- **Analysis re-runs every 30 min** in daemon mode (scheduled job in `scheduler.py`)
- **Whale direction is semantic**: "buy"/"sell" not raw "in"/"out". Exchange wallets: in=sell/out=buy. Fund/VC wallets: in=buy/out=sell. See `whale_tracker.py`.

### Dashboard Data Quality Filters
- **Intelligence Alerts**: **4-hour window** (not 24h) — alerts must be re-detected by recent analysis runs to stay visible. Stale/false alerts disappear within 4 hours instead of lingering for a full day. Fallback shows latest alerts if none in 4h. Enriched with price data (price, 24h change, market cap) via `EnrichedAlert` type. Only shows coins in CoinGecko top 250 with proper names.
- **Social Buzz**: Requires $50M+ market cap. NOISE_WORDS (80+), NOISE_COIN_IDS blocklist, coins table validation, and **STABLECOIN_COIN_IDS filter** (tether, usd-coin, dai, etc. excluded — stablecoin sentiment is meaningless).
- **Whale Activity**: 48h time window, sorted by value, stablecoins only shown if >= $500K and **capped at 3 max** (exchange treasury rebalancing is noise, not trading signals). Deduped by `wallet_address + token_symbol + amount + direction` in `queries.ts`.
- **VADER Sentiment thresholds**: Bullish > 0.08, Bearish < -0.08 (lowered from 0.2 because aggregated 4chan/reddit scores cluster near zero).
- **Narrative Momentum**: Normalized by signal count (average mentions per signal, not raw sum). Volume snapshots deduplicated per coin per period. Prevents inflation when collection periods have different run counts.

## Dashboard Components

| Component | Section |
|-----------|---------|
| `DashboardShell.tsx` | Client wrapper, holds state, auto-refresh every 5 min |
| `MarketMood.tsx` | Fear & Greed gauge (0-100) |
| `IntelligenceAlerts.tsx` | Smart money signals — card layout with price context, max 6, coin-validated |
| `TopMovers.tsx` | Gainers/Losers side-by-side cards |
| `SocialBuzz.tsx` | Social mention counts + sentiment (top 250 coins only) |
| `WhaleActivity.tsx` | Whale transaction feed (real on-chain data) |
| `TrendingCoins.tsx` | Trending coins across sources |
| `NarrativeMomentum.tsx` | Narrative momentum bars |
| `RefreshIndicator.tsx` | "Last updated X min ago" |
| `SeverityBadge.tsx` | Reusable severity color badge |

## Key Technical Decisions

- `utils.utcnow()` everywhere for timezone-aware datetimes
- ASCII chars for Windows terminal compatibility in CLI
- Bulk coin fetching via `coin_map` dict (avoids N+1 queries)
- FK constraint handling: `db.ensure_coins_exist()` with `ignore_duplicates=True` (ON CONFLICT DO NOTHING) — social collectors create placeholder coins without overwriting CoinGecko's proper names
- Force UTF-8 stdout wrapper in `cli.py` for Windows
- `upsert_tracked_wallets()` uses `on_conflict="address,chain"` — called automatically on every `main.py` startup to sync `whale_wallets.json` into DB
- NOISE_WORDS filter (80+ words) in `queries.ts` to exclude common English words from social buzz
- DEX pool addresses (`dex:` prefix) filtered from trending and social queries
- Social Buzz and Intelligence Alerts require coins to have price snapshots (i.e., in CoinGecko top 250) — eliminates obscure noise coins
- System fonts (no Google Fonts) to avoid build failures on Vercel
- ISR with `revalidate = 300` (5 min) on server + client-side setInterval refresh
- Etherscan **V2 API** (`api.etherscan.io/v2/api` with `chainid=1`) — V1 is deprecated

## Bugs Fixed (important to not reintroduce)

- **Coin name corruption**: 4chan/reddit collectors used to upsert `Coin(id=x, name=x, symbol=x)` overwriting CoinGecko's proper names. Fixed with `db.ensure_coins_exist()` using ON CONFLICT DO NOTHING. **Never use `db.upsert_coins()` from social collectors.**
- **Etherscan V1 deprecated**: Whale tracker now uses V2 API at `api.etherscan.io/v2/api` with `chainid=1` parameter.
- **Reddit set serialization (TWO bugs, both fixed)**: (1) `_collect_subreddit()` was converting sets to lists after first subreddit, causing `.add()` to fail — moved set-to-list conversion to `collect()`. (2) The set-to-list conversion was placed AFTER `json.dumps()` which needs it — moved conversion BEFORE the signal-building loop. **Both must stay fixed — the conversion must happen before `json.dumps` in `collect()`.**
- **Whale dust transactions**: Threshold raised to $10K and requires USD valuation (`amount_usd is None` → skip). Unknown tokens without price data are excluded.
- **Social false positives**: "just", "rain", "cash", "four" etc. matched as coin names. Fixed with 80+ word NOISE_WORDS set in `queries.ts`, 60+ word `_EXCLUDED_DB_SYMBOLS`/`_EXCLUDED_DB_NAMES` sets in `sentiment.py`, word-boundary matching for short names (<7 chars), NOISE_COIN_IDS blocklist (e.g. "thetrumptoken", "aster-2"), $50M market cap minimum for Social Buzz, and requiring coins to exist in CoinGecko top 250 with proper names.
- **Whale direction inverted for funds**: Raw "in"/"out" direction was always interpreted as exchange logic. Fixed: direction is now semantic ("buy"/"sell") based on `entity_type` — exchanges: in=sell/out=buy; funds/VCs: in=buy/out=sell. **Never store raw "in"/"out" direction — always convert to semantic "buy"/"sell".**
- **Dollar formatting overflow**: `$999,950` displayed as `$1000.0K`. Fixed threshold to `>= 999_950` → M format.
- **Old whale transactions surfaced**: Sorting by value showed 729-day-old transactions. Fixed with 48h time filter + stablecoin filtering (non-stables first, stables only if >= $500K).
- **All sentiment "Neutral"**: VADER aggregated scores cluster near 0 for 4chan/reddit. Lowered thresholds from 0.2 to 0.08.
- **Analysis went stale in daemon mode**: `scheduler.py` only scheduled collectors, not analysis. Fixed: added `smart_money_analysis` job running every 30 min.
- **Vercel auto-deploy failing**: Root directory was `.` (repo root) instead of `dashboard`. Vercel couldn't find the `app` directory. Fixed via API: `rootDirectory: "dashboard"`. **Manual deploys from CLI must run from repo root, not `dashboard/`.**
- **ETC false positive**: "etc." in text matched as Ethereum Classic. Fixed: added "ETC" to `_AMBIGUOUS_SYMBOLS` in `sentiment.py` (only matches `$ETC`).
- **Narrative momentum inflation**: All narratives showed "Rising" +120% to +419%. Root cause: momentum summed raw mentions across ALL collection runs; recent half had more runs than older half, inflating the ratio. Fixed in `analysis/narratives.py`: normalized by signal count (average mentions per signal instead of raw sum) and deduplicated volume snapshots per coin (keep latest per period). **Never sum raw mentions across signals — always normalize by count.**
- **Whale transaction duplicates on dashboard**: Same blockchain tx collected multiple times showed as duplicates. Fixed in `queries.ts`: dedup by `wallet_address + token_symbol + amount + direction` key.
- **Stablecoins in Social Buzz**: USDC/USDT/DAI etc. appeared in Social Buzz with "Bullish"/"Very Bullish" sentiment — meaningless noise. Fixed: added `STABLECOIN_COIN_IDS` filter to `getSocialBuzz()` in `queries.ts`. Stablecoins were already filtered from Whale Activity and Intelligence Alerts but not Social Buzz.
- **False empty hype for non-ETH tokens**: Empty hype alerts fired for HYPE (Hyperliquid L1), DOT (Polkadot), etc. saying "no whale buying detected" — but we only track Ethereum wallets, so this was "we're blind" not "nobody's buying." Fixed: added `TRACKABLE_COINS` set to `smart_money.py`, empty hype only fires for ERC-20 tokens in our `TOKEN_SYMBOL_MAP`.
- **Whale tracker only checked 20/50 wallets per run**: `wallets[:20]` limit meant it took 3 runs (~1.5 hours) to check all wallets. Fixed: now checks ALL wallets every run. At 0.35s/call, 105 wallets = ~37 seconds, well within GitHub Actions budget.
- **New wallets not loading to DB**: `seed_wallets()` in `main.py` required `--seed-wallets` flag. GitHub Actions runs `python main.py` without flags, so new wallets added to `whale_wallets.json` never loaded. Fixed: `seed_wallets()` now runs automatically on every startup (upsert is safe — `ON CONFLICT DO NOTHING` on address+chain). `--seed-wallets` flag still works but exits after seeding without running collectors.
- **Stealth accumulation false confidence from zero social baseline**: Coins with NO social data (avg_mentions=0) automatically got 95% CRITICAL stealth accumulation alerts. "No mentions" meant "we're blind" not "the crowd hasn't noticed." Fixed: confidence now scaled by `social_visibility = min(1.0, avg_mentions / 10)`. Zero social baseline = zero confidence. **Stealth accumulation requires proven social visibility to be meaningful.**
- **Whale alerts on dust-relative-to-mcap**: $1.2M SHIB move (0.035% of $3.4B mcap) triggered Smart $ Exiting alert. Fixed: `min_usd = max(WHALE_MIN_USD, market_cap * 0.001)` — whale move must be at least 0.1% of market cap. Uses bulk `db.get_latest_market_caps()` to avoid N+1 queries.
- **Whale Activity section drowned by stablecoins**: 8/10 entries were USDT/USDC exchange treasury operations (rebalancing, market making). Fixed: stablecoins capped at 3 max entries in `queries.ts`. Non-stablecoin token trades always shown first.

## Health Check Commands

```bash
# GitHub Actions — check recent runs (should show "completed success" every ~30-60 min)
gh run list --workflow=collect.yml --limit=10

# GitHub Actions — view logs from latest run
gh run list --workflow=collect.yml --limit=1 --json databaseId -q '.[0].databaseId' | xargs -I{} gh run view {} --log 2>/dev/null | tail -80

# Supabase — row counts via REST API (uses anon key from dashboard/.env.local)
# Use curl with header: -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# Endpoint: https://baptgroflunptsjqfsfx.supabase.co/rest/v1/{table}?select=*&order=ts.desc&limit=1

# Supabase CLI — DB health (requires `supabase link` to project)
supabase inspect db table-stats --linked    # Table sizes + row counts
supabase inspect db index-stats --linked    # Index usage (look for unused indexes)
supabase inspect db cache-hit --linked      # Cache hit ratio (should be ~1.00)
supabase inspect db outliers --linked       # Slowest queries
supabase inspect db long-running-queries --linked  # Stuck queries
supabase inspect db bloat --linked          # Table/index bloat

# Supabase CLI — logs command NOT available in v2.75.0 (needs v2.78.1+)
# Use Supabase dashboard UI for logs: https://supabase.com/dashboard/project/baptgroflunptsjqfsfx/logs

# Vercel — check dashboard is live
curl -s "https://dashboard-six-rouge-13.vercel.app" -o /dev/null -w "HTTP status: %{http_code}\n"
```

## Known Issues & Future Work

- **Whale Alert API key**: not yet configured (needs paid plan from https://whale-alert.io)
- **Intelligence quality improves with data volume**: system needs to run continuously for days/weeks to build reliable baselines for social mention averages. **GitHub Actions started 2026-03-13 ~16:00 UTC.** After ~40 hours of continuous collection (as of 2026-03-15), social baselines are becoming reliable. Stealth accumulation and smart money fear/exit signals now have meaningful data. Full confidence in signals expected after 1 week of continuous collection.
- **Empty hype alerts now restricted to trackable ERC-20 tokens**: `TRACKABLE_COINS` set in `smart_money.py` ensures empty hype only fires for coins we can actually see whale activity for. Non-ERC-20 tokens (Solana-native, Polkadot-native, Hyperliquid, etc.) are excluded — "we can't see" is NOT a signal. **If you add new tokens to `TOKEN_SYMBOL_MAP` in `whale_tracker.py`, also add them to `TRACKABLE_COINS` in `smart_money.py`.**
- **CryptoCompare API intermittently returns empty data**: `[crypto_news] API returned error or no data` appears in logs occasionally. This is their API being flaky, not our code. Non-critical — other collectors cover the gap.
- **Reddit rate limits**: Reddit API has strict rate limits; the "redittest" app is registered for personal use
- **GeckoTerminal trending**: returns DEX pool addresses as coin_ids — filtered in dashboard queries but stored raw in DB
- **Sentiment false positives**: `analysis/sentiment.py` has extensive exclusion lists but new common-word coins can still slip through — check Social Buzz after adding new coin data sources
- **Narrative momentum needs data depth**: Shows 0.0% Stable when data window is < 24h (both halves of comparison window have similar or insufficient signals). Will differentiate naturally after 24-48 hours of continuous collection.
- **Social coverage has structural blind spots**: We only track reddit (5 subreddits) and 4chan (/biz/). Twitter/X, Telegram, Discord, YouTube are not tracked. Claiming "the crowd hasn't noticed" based on 2 sources is inherently limited. The `social_visibility` gate mitigates this for stealth accumulation (requires avg_mentions >= 10 for full confidence), but the underlying coverage gap remains. **Adding Twitter/X API would be the single biggest improvement to signal quality.**
- **Not yet built**: `output/api.py` (FastAPI endpoints), `output/dashboard.py` (Streamlit)
- **Potential improvements**: Twitter/X social tracking (biggest signal quality improvement), historical price charts, portfolio tracking, alert notifications (email/telegram), multi-chain wallet tracking (Solana DEX trades via Helius/Birdeye APIs, BSC, Arbitrum), more whale wallets beyond current 105

## Design Intent

This is a **personal trading tool** — the goal is to generate actionable signals you can bet real money on. Every data quality improvement and filter exists to eliminate noise so the remaining signals are trustworthy. Intelligence alerts show price context (current price, 24h change, market cap) so you can evaluate whether to act immediately.

## File Structure

```
CryptoDash/
├── main.py                  # Entry point (--collect, --analyze, --daemon; auto-seeds wallets every run)
├── config.py                # Configuration + thresholds
├── models.py                # Pydantic data models
├── db.py                    # Supabase client + DB operations (incl. ensure_coins_exist)
├── utils.py                 # Utilities (utcnow, etc.)
├── scheduler.py             # APScheduler job registration (collectors + analysis every 30min)
├── requirements.txt         # Python dependencies
├── .env                     # API keys (not committed)
├── .gitignore
├── start_collector.bat      # Start daemon in background (Windows)
├── stop_collector.bat       # Stop background daemon (Windows)
├── CLAUDE.md                # This file
│
├── collectors/              # Data collection
│   ├── base.py              # Base collector class
│   ├── coingecko.py         # CoinGecko prices + trending (source of truth for coin names)
│   ├── alternative_me.py    # Fear & Greed Index
│   ├── free_crypto_news.py  # CryptoCompare news
│   ├── defillama.py         # DeFi Llama TVL
│   ├── geckoterminal.py     # DEX trending/new pools
│   ├── fourchan.py          # 4chan /biz/ sentiment (uses ensure_coins_exist)
│   ├── reddit.py            # Reddit PRAW sentiment (uses ensure_coins_exist)
│   ├── whale_tracker.py     # Etherscan V2 wallet tracking (>= $10K, valued only, checks ALL wallets every run)
│   └── whale_alert.py       # Whale Alert API (not configured)
│
├── analysis/                # Intelligence engine
│   ├── smart_money.py       # Core: whale vs social cross-reference (TRACKABLE_COINS, stablecoin exclusion, major coin thresholds)
│   ├── sentiment.py         # VADER sentiment + coin extraction
│   ├── summary.py           # Bulk coin fetch helpers
│   ├── divergence.py        # Signal divergence detection
│   ├── velocity.py          # Velocity analysis
│   └── narratives.py        # Narrative trend tracking
│
├── output/                  # Display & output
│   ├── cli.py               # Rich CLI dashboard
│   └── intelligence_brief.py # Natural language briefs
│
├── data/
│   └── whale_wallets.json   # 96 verified Ethereum addresses (64 exchange, 17 fund, 7 VC, 8 whale — 30 entities)
│
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260312065842_init_schema.sql
│       ├── 20260312160000_smart_money_tables.sql
│       └── 20260313000000_enable_rls_anon_read.sql
│
└── dashboard/               # Next.js app (deployed on Vercel)
    ├── .env.local            # Supabase anon key (not committed)
    ├── next.config.ts
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── app/
        │   ├── layout.tsx    # Dark theme, system fonts
        │   ├── page.tsx      # Server component, ISR 5 min
        │   └── globals.css   # Dark theme CSS
        ├── components/       # 10 React components (see table above)
        └── lib/
            ├── supabase.ts   # Supabase client (anon key)
            ├── types.ts      # TypeScript interfaces (incl. EnrichedAlert with price context)
            ├── queries.ts    # All data fetching + noise filtering + coin validation
            └── format.ts     # USD/number/time formatting
```
