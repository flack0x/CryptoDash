# CryptoDash — Project Context

## What This Is

Crypto intelligence system: **"Where is smart money going that the crowd hasn't noticed yet?"**

Two inputs: what the crowd thinks (social sentiment) + what informed actors do (on-chain whale movements). The gap between them = the actionable signal.

## Architecture

```
Python Backend (runs locally)
  ├── collectors/     → 7 data collectors on schedules
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

- **GitHub**: https://github.com/flack0x/CryptoDash (public)
- **Vercel**: https://dashboard-six-rouge-13.vercel.app
- **Supabase**: project ref `baptgroflunptsjqfsfx`, region ap-south-1
- **Vercel project**: linked in `dashboard/` subdirectory

## Running the System

```bash
# Start all collectors (runs continuously with APScheduler)
python main.py

# Run collectors once
python main.py --collect

# CLI dashboard output
python main.py --dashboard

# Run a specific collector
python main.py --collect --collector coingecko

# Dev server for Next.js dashboard
cd dashboard && npm run dev

# Deploy dashboard to Vercel
cd dashboard && vercel --prod

# Push to GitHub
git add -A && git commit -m "message" && git push
```

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
| `whale_tracker.py` | Etherscan | conditional | ETHERSCAN_API_KEY |
| `whale_alert.py` | Whale Alert | conditional | WHALE_ALERT_API_KEY |

Conditional collectors are skipped by `scheduler.py` if their API keys are missing from `.env`.

## API Keys in `.env`

```
SUPABASE_URL=https://baptgroflunptsjqfsfx.supabase.co
SUPABASE_KEY=<service role key>
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
| `coins` | Master coin list (id, symbol, name) |
| `snapshots` | Price snapshots (price, market_cap, volume, price_change_24h) |
| `trending` | Trending coins from multiple sources |
| `market_mood` | Fear & Greed Index |
| `social_signals` | Social mentions + sentiment per coin per source |
| `on_chain` | DeFi protocol TVL data |
| `narratives` | Narrative themes + momentum scores |
| `tracked_wallets` | Whale wallet addresses being monitored |
| `whale_transactions` | Detected whale token movements |
| `intelligence_alerts` | Smart money signals (the core output) |

Schema in `supabase/migrations/`. RLS enabled on all tables with public SELECT policies for dashboard access.

## Smart Money Intelligence Engine

`analysis/smart_money.py` cross-references whale activity vs social sentiment to detect 4 patterns:

1. **stealth_accumulation** — whales buying, crowd not talking about it (bullish signal)
2. **empty_hype** — crowd hyping, no whale backing (bearish signal)
3. **smart_money_buying_fear** — whales buying during fear/dips (contrarian bullish)
4. **smart_money_exit_hype** — whales selling during euphoria (contrarian bearish)

Alerts are stored in `intelligence_alerts` with severity (low/medium/high/critical) and confidence scores.

## Dashboard Components

| Component | Section |
|-----------|---------|
| `DashboardShell.tsx` | Client wrapper, holds state, auto-refresh every 5 min |
| `MarketMood.tsx` | Fear & Greed gauge (0-100) |
| `IntelligenceAlerts.tsx` | Smart money signals table (primary section) |
| `TopMovers.tsx` | Gainers/Losers side-by-side cards |
| `SocialBuzz.tsx` | Social mention counts + sentiment |
| `WhaleActivity.tsx` | Whale transaction feed |
| `TrendingCoins.tsx` | Trending coins across sources |
| `NarrativeMomentum.tsx` | Narrative momentum bars |
| `RefreshIndicator.tsx` | "Last updated X min ago" |
| `SeverityBadge.tsx` | Reusable severity color badge |

## Key Technical Decisions

- `utils.utcnow()` everywhere for timezone-aware datetimes
- ASCII chars for Windows terminal compatibility in CLI
- Bulk coin fetching via `coin_map` dict (avoids N+1 queries)
- FK constraint handling: upsert coins before inserting referencing records
- Force UTF-8 stdout wrapper in `cli.py` for Windows
- `upsert_tracked_wallets()` uses `on_conflict="address,chain"`
- NOISE_WORDS filter in `queries.ts` to exclude common English words from social buzz
- DEX pool addresses (`dex:` prefix) filtered from trending and social queries
- System fonts (no Google Fonts) to avoid build failures on Vercel
- ISR with `revalidate = 300` (5 min) on server + client-side setInterval refresh

## Known Issues & Future Work

- **Whale Alert API key**: not yet configured (needs paid plan from https://whale-alert.io)
- **Whale tracker**: scans Etherscan wallets but finds 0 transactions when tracked wallets haven't moved recently — this is normal
- **Intelligence alerts**: quality depends on data volume — more collectors running = better cross-referencing
- **Reddit rate limits**: Reddit API has strict rate limits; the "redittest" app is registered for personal use
- **GeckoTerminal trending**: returns DEX pool addresses as coin_ids — these are filtered in dashboard queries but stored raw in DB
- **Not yet built**: `output/api.py` (FastAPI endpoints), `output/dashboard.py` (Streamlit)

## File Structure

```
CryptoDash/
├── main.py                  # Entry point (--collect, --dashboard, --scheduler)
├── config.py                # Configuration
├── models.py                # Pydantic data models
├── db.py                    # Supabase client + DB operations
├── utils.py                 # Utilities (utcnow, etc.)
├── scheduler.py             # APScheduler job registration
├── requirements.txt         # Python dependencies
├── .env                     # API keys (not committed)
├── .gitignore
├── CLAUDE.md                # This file
│
├── collectors/              # Data collection
│   ├── base.py              # Base collector class
│   ├── coingecko.py         # CoinGecko prices + trending
│   ├── alternative_me.py    # Fear & Greed Index
│   ├── free_crypto_news.py  # CryptoCompare news
│   ├── defillama.py         # DeFi Llama TVL
│   ├── geckoterminal.py     # DEX trending/new pools
│   ├── fourchan.py          # 4chan /biz/ sentiment
│   ├── reddit.py            # Reddit PRAW sentiment
│   ├── whale_tracker.py     # Etherscan wallet tracking
│   └── whale_alert.py       # Whale Alert API
│
├── analysis/                # Intelligence engine
│   ├── smart_money.py       # Core: whale vs social cross-reference
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
│   └── whale_wallets.json   # 40 verified Ethereum addresses
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
        ├── components/       # 10 React components (see above)
        └── lib/
            ├── supabase.ts   # Supabase client (anon key)
            ├── types.ts      # TypeScript interfaces
            ├── queries.ts    # All data fetching logic
            └── format.ts     # USD/number/time formatting
```
