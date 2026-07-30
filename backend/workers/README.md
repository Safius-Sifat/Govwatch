# GovWatch Backend (Cloudflare Workers)

The complete API gateway for the GovWatch civic-intelligence platform.

## LLM provider

The Worker supports two LLM providers for answer generation:

| Provider | Bangla quality | Cost | How to enable |
|---|---|---|---|
| **OpenAI** (default) | Excellent | Pay per token | Set `OPENAI_API_KEY` in `.dev.vars` (local) or `wrangler secret put OPENAI_API_KEY` (prod) |
| Workers AI (Llama 3.1 8B) | Mediocre | Free | Set `LLM_PROVIDER=workersai` |

Selection priority:
1. `LLM_PROVIDER` env var (forces a specific provider)
2. Otherwise: OpenAI if `OPENAI_API_KEY` is set, else Workers AI

To use a Bangladesh-local OpenAI-compatible gateway (e.g. lower latency from BD):
```
OPENAI_API_URL = "https://api.your-bd-gateway.com/v1/chat/completions"
```

If the LLM fails (401, network, etc.), the Worker gracefully falls back to a deterministic Bangla/English summary so the UI still has something to render.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge                             │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Worker: shotto-gateway (this codebase)                  │   │
│   │  ─────────────────────────────────────────────────────── │   │
│   │  /api/search          → RAG (Vectorize + D1 FTS → RRF → │   │
│   │                         Llama 3.1 8B stream)             │   │
│   │  /api/ingest          → write single contract            │   │
│   │  /api/ingest-batch    → write NDJSON batch               │   │
│   │  /api/anomalies       → top price outliers               │   │
│   │  /api/vendors/...     → vendor graph                     │   │
│   │  /api/pdf/<key>       → R2 proxy for side-pane viewer    │   │
│   │  /api/stats           → corpus counts                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│         │                │             │            │            │
│         ▼                ▼             ▼            ▼            │
│   ┌──────────┐    ┌───────────┐  ┌──────────┐  ┌──────────┐     │
│   │ Vectorize│    │    D1     │  │    R2    │  │ Workers  │     │
│   │ (embed)  │    │ (metadata │  │  (PDFs)  │  │   AI     │     │
│   │  bge-m3  │    │  + FTS5)  │  │          │  │ Llama 8B │     │
│   └──────────┘    └───────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────────────────────┘
         ▲
         │ NDJSON
         │
┌────────┴────────────────────────────────────────────────────────┐
│  Scrapy (runs locally or on Modal/Hetzner)                       │
│  ──────────────────────────────────────────────────────────────  │
│  egp_contracts spider → data/egp_contracts_*.ndjson              │
│  vendor_directors.ndjson                                         │
└─────────────────────────────────────────────────────────────────┘
```

## File layout

```
backend/
├── scraper/                          ← Python: e-GP scraping
│   ├── run_scraper.py
│   ├── verify_output.py
│   ├── load_to_d1.py                 ← old path; prefer push_to_worker.py
│   ├── push_to_worker.py             ← NDJSON → /api/ingest-batch
│   └── egp_scraper/
│       ├── items.py
│       ├── settings.py
│       ├── pipelines/
│       └── spiders/egp_contracts.py
│
└── workers/                          ← TypeScript: this directory
    ├── wrangler.toml                 ← Cloudflare bindings config
    ├── package.json
    ├── tsconfig.json
    ├── schema/
    │   ├── schema.sql                ← D1 schema (contracts, FTS5, ...)
    │   └── seed.sql                  ← sample data for local dev
    └── src/
        ├── index.ts                  ← router (entry point)
        ├── env.d.ts                  ← Env bindings type
        ├── lib/
        │   ├── types.ts              ← shared interfaces
        │   ├── text.ts               ← FTS5 query, vendor normalization
        │   ├── embedder.ts           ← Workers AI bge-m3 wrapper
        │   ├── cors.ts               ← CORS handling
        │   └── auth.ts               ← admin token check
        └── handlers/
            ├── search.ts             ← /api/search (RAG + SSE)
            ├── ingest.ts             ← /api/ingest, /api/ingest-batch
            ├── anomalies.ts          ← /api/anomalies
            ├── vendors.ts            ← /api/vendors/*
            ├── pdf.ts                ← /api/pdf/<key>
            └── stats.ts              ← /, /api/stats, /api/ministries, ...
```

## Setup

### 1. Install dependencies

```bash
cd backend/workers
npm install
```

### 2. Create Cloudflare resources

```bash
# D1 database
npx wrangler d1 create shotto-db
# Copy the database_id from the output and paste it into wrangler.toml.

# Vectorize index
npx wrangler vectorize create shotto-chunks --dimensions=1024 --metric=cosine

# R2 bucket (for PDF storage)
npx wrangler r2 bucket create shotto-storage

# Secrets
npx wrangler secret put ADMIN_TOKEN          # any random string, e.g. openssl rand -hex 32
npx wrangler secret put ALLOWED_ORIGIN       # e.g. http://localhost:3000 for dev
```

### 3. Apply the D1 schema

```bash
# Local (against wrangler dev's local D1)
npx wrangler d1 execute shotto-db --file=./schema/schema.sql

# Production
npx wrangler d1 execute shotto-db --remote --file=./schema/schema.sql
```

### 4. Deploy

```bash
npx wrangler deploy
```

Output looks like:
```
Published shotto-gateway (x.xx sec)
  https://shotto-gateway.<your-subdomain>.workers.dev
```

### 5. Smoke-test

```bash
GATEWAY="https://shotto-gateway.<your-subdomain>.workers.dev"

# Health
curl $GATEWAY/

# Stats (should return zeros on a fresh DB)
curl $GATEWAY/api/stats

# Ingest a single contract (admin)
curl -X POST $GATEWAY/api/ingest \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contract": {
      "tender_id": "TEST001",
      "package_name": "Test contract for verification",
      "winner_name": "M/S TEST CONSTRUCTION",
      "contract_price_bdt": 5000000,
      "procuring_entity_district": "Dhaka",
      "procurement_method": "OTM",
      "ministry": "Test Ministry",
      "search_text": "Test contract in Dhaka awarded to M/S TEST CONSTRUCTION for ৳50 lakh"
    }
  }'

# Search
curl -X POST $GATEWAY/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "ঢাকায় টেস্ট চুক্তি"}'

# Anomalies (returns 404 because no outliers yet)
curl $GATEWAY/api/anomalies
```

## The complete data flow

```
┌──────────────┐   1. scrape     ┌──────────────┐
│  Scrapy      │ ──────────────► │  NDJSON file │
│  (laptop /   │                 │  on disk     │
│   Modal)     │                 └──────┬───────┘
└──────────────┘                        │ 2. push
                                        ▼
                                ┌──────────────────┐
                                │ /api/ingest-batch │
                                │   (Worker)        │
                                └────────┬──────────┘
                                         │
                       ┌─────────────────┼─────────────────┐
                       ▼                 ▼                 ▼
                 ┌──────────┐      ┌──────────┐      ┌──────────┐
                 │   D1     │      │ Vectorize│      │  R2 (if  │
                 │ INSERT   │      │  UPSERT  │      │  PDFs)   │
                 │ contracts│      │ (bge-m3) │      │          │
                 │ +directors│     │          │      │          │
                 └──────────┘      └──────────┘      └──────────┘

                       ▲
                       │ 3. query
                       │
                ┌──────┴───────┐         ┌──────────────┐
                │ /api/search  │ ──────► │ Frontend     │
                │ (Worker)     │  SSE    │ (Next.js)    │
                │              │ stream  │              │
                │  Vectorize   │         │ Renders:     │
                │  + D1 FTS    │         │  - answer    │
                │  → RRF       │         │  - citations│
                │  → Llama 3.1 │         │  - anomaly  │
                └──────────────┘         │    card      │
                                         │  - PDF pane  │
                                         └──────────────┘
```

## API reference

### POST `/api/search`

Public. Hybrid RAG search with LLM streaming.

**Request:**
```json
{
  "query": "হবিগঞ্জে সম্প্রদতি জনস্বাস্থ্য প্রকৌশল অধিদপ্তরের নলকূপ সংক্রান্ত টেন্ডারগুলো কে পেয়েছে?",
  "language": "bn",        // optional, auto-detected from query
  "top_k": 7               // optional, default 7, max 20
}
```

**Response:** Server-Sent Events (SSE)

```
event: citations
data: [{"tender_id":"1299703","title":"...","winner":"...","is_price_outlier":false,...}]

event: anomaly
data: {"tender_id":"...","awarded_bdt":45000000,"median_bdt":14000000,"z_score":3.20,...}

event: text-delta
data: "২০২৪ সালের আগস্টে..."

event: text-delta
data: " জনস্বাস্থ্য প্রকৌশল..."

event: done
data: {"latency_ms":2147}
```

### POST `/api/ingest`

Admin (requires `X-Admin-Token`). Single contract.

**Request:**
```json
{
  "contract": {
    "tender_id": "1299703",
    "package_name": "...",
    "winner_name": "M/S RAHMAN ENTERPRISE",
    "contract_price_bdt": 45000000,
    "median_bdt": 14000000,
    "price_z_score": 3.2,
    "is_price_outlier": true,
    "search_text": "...",
    "procuring_entity_district": "Habiganj",
    "ministry": "Ministry of LGRD",
    "procurement_method": "OTM",
    "detail_url": "https://www.eprocure.gov.bd/..."
  },
  "beneficial_owners": [
    {
      "tender_id": "1299703",
      "vendor_name": "M/S RAHMAN ENTERPRISE",
      "director_name": "Mohammad Rahman",
      "designation": "Proprietor",
      "ownership_pct": 100.0,
      "country": "Bangladesh",
      "district": "Habiganj",
      "ministry": "Ministry of LGRD"
    }
  ]
}
```

**Response:**
```json
{
  "tender_id": "1299703",
  "embedded": true,
  "owners_inserted": 1
}
```

### POST `/api/ingest-batch`

Admin. NDJSON in the body (one record per line, format above).

**Response:**
```json
{
  "total": 500,
  "ok": 497,
  "failed": 3,
  "errors": [{"tender_id":"...","message":"..."}]
}
```

### GET `/api/anomalies?limit=20&ministry=...&district=...`

Public. Top price outliers.

**Response:**
```json
{
  "count": 12,
  "anomalies": [
    {
      "tender_id": "...",
      "title": "Construction of Road...",
      "winner": "M/S RAHMAN ENTERPRISE",
      "district": "Habiganj",
      "awarded_bdt": 45000000,
      "median_bdt": 14000000,
      "z_score": 3.20,
      "pct_above_median": 221.4
    }
  ]
}
```

### GET `/api/vendors/:name/collusion`

Public. Vendor + directors + shared-director edges.

### GET `/api/vendors/top?sort=value&limit=20`

Public. Top vendors by total value or contract count.

### GET `/api/pdf/:key`

Public. Streams a PDF from R2. The frontend's right-pane viewer hits this.

### GET `/api/stats`

Public. Corpus counts:
```json
{
  "contracts": 5000,
  "vendors": 1234,
  "outliers": 87,
  "directors": 2103,
  "vectors": 5000
}
```

## Cost estimates (Cloudflare free + paid tiers)

For 10,000 contracts and ~50,000 embedding calls/month:

| Resource | Free tier | Paid | Cost |
|----------|-----------|------|------|
| Workers requests | 100k/day | — | $0 |
| D1 reads | 5M/day | — | $0 |
| D1 writes | 100k/day | — | $0 |
| Vectorize queries | 30M/month | — | $0 |
| Vectorize upserts | — | — | included |
| R2 storage | 10GB | $0.015/GB | ~$0 |
| R2 egress | 10GB/month | $0 |
| Workers AI (Llama 8B) | 10k neurons/day free | $0.011/1k neurons | ~$5/mo |
| Workers AI (bge-m3) | 10k neurons/day free | $0.011/1k neurons | ~$3/mo |
| **Total** | | | **~$8/mo** |

## Development workflow

```bash
# Terminal 1: run the Worker locally
cd backend/workers
npx wrangler dev

# Terminal 2: run the scraper (test mode)
cd backend/scraper
python run_scraper.py --test

# Terminal 3: push results to the local Worker
python push_to_worker.py data/egp_contracts_*.ndjson \
  --gateway http://localhost:8787 \
  --token test

# Terminal 4: query the local Worker
curl -X POST http://localhost:8787/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "টেস্ট"}'
```

## Production deployment

```bash
# 1. Apply schema to remote D1
npx wrangler d1 execute shotto-db --remote --file=./schema/schema.sql

# 2. Deploy the Worker
npx wrangler deploy

# 3. Run a full scrape and push to production
cd ../scraper
python run_scraper.py --max-pages 20
GATEWAY=$(npx wrangler --cwd ../workers deployments list --json | jq -r '.[0].url')
python push_to_worker.py data/egp_contracts_*.ndjson --gateway $GATEWAY --token $ADMIN_TOKEN

# 4. Verify
curl $GATEWAY/api/stats
```

## Where to extend

- **Better chunking**: currently we embed the whole `search_text` as one vector. For 5,000+ contracts, switch to per-section chunks and store chunk_id in Vectorize metadata.
- **Background re-crawl**: wire the `scheduled()` handler in `src/index.ts` to dispatch the Python scraper to Modal. The scraper would push to a Cloudflare Queue; a queue consumer handler would call `/api/ingest-batch`.
- **Vendor graph in Neo4j**: if you outgrow the SQL joins for shared-director detection, the `vendor_directors` table is the right shape to migrate to a graph DB.
- **PDF viewer pane**: the `/api/pdf/:key` proxy is ready. The frontend just hits it with the `r2_key` from citation metadata.