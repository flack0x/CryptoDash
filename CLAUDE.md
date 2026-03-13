# CryptoDash — Project Context

## What This Is

Crypto intelligence system: **"Where is smart money going that the crowd hasn't noticed yet?"**

Two inputs: what the crowd thinks (social sentiment) + what informed actors do (on-chain whale movements). The gap between them = the actionable signal.

## Architecture

```
Python Backend (runs locally)
  ├── collectors/     → 9 data collectors on schedules
  ├── analysis/       → smart money intelligence engine
  └── output/         → CLI display, intelligence briefs
         ↕
    Supabase (PostgreSQL, ap-south-1)
         ↕
Next.js Dashboard (deployed on Vercel)
  └── dashboard/      → reads Supabase via anon key (RLS read-only)
```

- **Python collectors** use the **service role key** (bypasses RLS, writes data)
- **Dashboard** uses the **anon key** (public, read-only via RLS policies)
- No custom API routes — Supabase JS client handles everything

## Deployments & URLs

- **GitHub**: https://github.com/flack0x/CryptoDash (public, user: flack0x)
- **Vercel**: https://dashboard-six-rouge-13.vercel.app (user: snmehanna-9643)
- **Supabase**: project ref `baptgroflunptsjqfsfx`, region ap-south-1
- **Vercel project**: linked in `dashboard/` subdirectory, auto-deploys from GitHub (`vercel git connect`)

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

# Default: collect + analyze once
python main.py

# Dev server for Next.js dashboard
cd dashboard && npm run dev

# Deploy dashboard to Vercel (auto-deploys on git push)
cd dashboard && vercel --prod

# Push to GitHub (triggers Vercel auto-deploy)
git add -A && git commit -m "message" && git push
```

### Daemon Mode Details
- Runs initial collection + analysis at startup
- Scheduler then runs collectors on their intervals + analysis every 30 min
- Analysis (`smart_money_analysis` job) generates fresh intelligence alerts from accumulated data
- Logs output to `collector.log` when using `start_collector.bat`

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
| `tracked_wallets` | 50 whale wallet addresses being monitored |
| `whale_transactions` | Detected whale token movements (>= $10K, valued only) |
| `intelligence_alerts` | Smart money signals (the core output) |

Schema in `supabase/migrations/`. RLS enabled on all tables with public SELECT policies for dashboard access.

## Smart Money Intelligence Engine

`analysis/smart_money.py` cross-references whale activity vs social sentiment to detect 4 patterns:

1. **stealth_accumulation** — whales buying, crowd not talking about it (bullish signal)
2. **empty_hype** — crowd hyping, no whale backing (bearish/caution signal)
3. **smart_money_buying_fear** — whales buying during fear/dips (contrarian bullish)
4. **smart_money_exit_hype** — whales selling during euphoria (contrarian bearish)

### Tuning & Filters
- **Stablecoins excluded**: USDT, USDC, DAI, etc. never generate alerts (stablecoin movements aren't position signals)
- **Major coins (BTC, ETH, SOL, etc.)** need 5x higher social mention threshold to trigger empty hype (they always have high mentions)
- **Empty hype confidence capped at 0.70** — weakest signal type (no whale confirmation, just absence of buying)
- **Severity thresholds**: critical >= 0.75, high >= 0.50, medium >= 0.25, low < 0.25
- **Minimum confidence 0.15** to generate any alert
- **Analysis re-runs every 30 min** in daemon mode (scheduled job in `scheduler.py`)
- **Whale direction is semantic**: "buy"/"sell" not raw "in"/"out". Exchange wallets: in=sell/out=buy. Fund/VC wallets: in=buy/out=sell. See `whale_tracker.py`.

### Dashboard Data Quality Filters
- **Intelligence Alerts**: Enriched with price data (price, 24h change, market cap) via `EnrichedAlert` type. Only shows coins in CoinGecko top 250 with proper names.
- **Social Buzz**: Requires $50M+ market cap. NOISE_WORDS (80+), NOISE_COIN_IDS blocklist, and coins table validation.
- **Whale Activity**: 48h time window, sorted by value, stablecoins only shown if >= $500K.
- **VADER Sentiment thresholds**: Bullish > 0.08, Bearish < -0.08 (lowered from 0.2 because aggregated 4chan/reddit scores cluster near zero).

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
- `upsert_tracked_wallets()` uses `on_conflict="address,chain"`
- NOISE_WORDS filter (80+ words) in `queries.ts` to exclude common English words from social buzz
- DEX pool addresses (`dex:` prefix) filtered from trending and social queries
- Social Buzz and Intelligence Alerts require coins to have price snapshots (i.e., in CoinGecko top 250) — eliminates obscure noise coins
- System fonts (no Google Fonts) to avoid build failures on Vercel
- ISR with `revalidate = 300` (5 min) on server + client-side setInterval refresh
- Etherscan **V2 API** (`api.etherscan.io/v2/api` with `chainid=1`) — V1 is deprecated

## Bugs Fixed (important to not reintroduce)

- **Coin name corruption**: 4chan/reddit collectors used to upsert `Coin(id=x, name=x, symbol=x)` overwriting CoinGecko's proper names. Fixed with `db.ensure_coins_exist()` using ON CONFLICT DO NOTHING. **Never use `db.upsert_coins()` from social collectors.**
- **Etherscan V1 deprecated**: Whale tracker now uses V2 API at `api.etherscan.io/v2/api` with `chainid=1` parameter.
- **Reddit set/list bug**: `_collect_subreddit()` was converting sets to lists after first subreddit, causing `.add()` to fail. Set-to-list conversion moved to `collect()` method.
- **Whale dust transactions**: Threshold raised to $10K and requires USD valuation (`amount_usd is None` → skip). Unknown tokens without price data are excluded.
- **Social false positives**: "just", "rain", "cash", "four" etc. matched as coin names. Fixed with 80+ word NOISE_WORDS set in `queries.ts`, 60+ word `_EXCLUDED_DB_SYMBOLS`/`_EXCLUDED_DB_NAMES` sets in `sentiment.py`, word-boundary matching for short names (<7 chars), NOISE_COIN_IDS blocklist (e.g. "thetrumptoken", "aster-2"), $50M market cap minimum for Social Buzz, and requiring coins to exist in CoinGecko top 250 with proper names.
- **Whale direction inverted for funds**: Raw "in"/"out" direction was always interpreted as exchange logic. Fixed: direction is now semantic ("buy"/"sell") based on `entity_type` — exchanges: in=sell/out=buy; funds/VCs: in=buy/out=sell. **Never store raw "in"/"out" direction — always convert to semantic "buy"/"sell".**
- **Dollar formatting overflow**: `$999,950` displayed as `$1000.0K`. Fixed threshold to `>= 999_950` → M format.
- **Old whale transactions surfaced**: Sorting by value showed 729-day-old transactions. Fixed with 48h time filter + stablecoin filtering (non-stables first, stables only if >= $500K).
- **All sentiment "Neutral"**: VADER aggregated scores cluster near 0 for 4chan/reddit. Lowered thresholds from 0.2 to 0.08.
- **Analysis went stale in daemon mode**: `scheduler.py` only scheduled collectors, not analysis. Fixed: added `smart_money_analysis` job running every 30 min.

## Known Issues & Future Work

- **Whale Alert API key**: not yet configured (needs paid plan from https://whale-alert.io)
- **Intelligence quality improves with data volume**: system needs to run continuously for days/weeks to build reliable baselines for social mention averages
- **Reddit rate limits**: Reddit API has strict rate limits; the "redittest" app is registered for personal use
- **GeckoTerminal trending**: returns DEX pool addresses as coin_ids — filtered in dashboard queries but stored raw in DB
- **Sentiment false positives**: `analysis/sentiment.py` has extensive exclusion lists but new common-word coins can still slip through — check Social Buzz after adding new coin data sources
- **Not yet built**: `output/api.py` (FastAPI endpoints), `output/dashboard.py` (Streamlit)
- **Potential improvements**: historical price charts, portfolio tracking, alert notifications (email/telegram), more whale wallets, multi-chain support (not just Ethereum)

## Design Intent

This is a **personal trading tool** — the goal is to generate actionable signals you can bet real money on. Every data quality improvement and filter exists to eliminate noise so the remaining signals are trustworthy. Intelligence alerts show price context (current price, 24h change, market cap) so you can evaluate whether to act immediately.

## File Structure

```
CryptoDash/
├── main.py                  # Entry point (--collect, --dashboard, --scheduler)
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
│   ├── whale_tracker.py     # Etherscan V2 wallet tracking (>= $10K, valued only)
│   └── whale_alert.py       # Whale Alert API (not configured)
│
├── analysis/                # Intelligence engine
│   ├── smart_money.py       # Core: whale vs social cross-reference (excludes stablecoins + major coin thresholds)
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
│   └── whale_wallets.json   # 50 verified Ethereum addresses (exchanges, funds, VCs)
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
