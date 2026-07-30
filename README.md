# GovWatch

Civic intelligence platform for Bangladesh. Make government procurement data, gazettes, and public records queryable in plain Bangla and English using AI.

## What it does

Ask a question in Bangla or English like *"ঢাকায় গত ৬ মাসে কোন ঠিকাদার সবচেয়ে বেশি টেন্ডার পেয়েছে?"* and GovWatch retrieves the actual tenders, ranks them by relevance, flags price outliers, and writes a short answer with citations and links to the original PDFs.

## Architecture

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  next.js (Cloudflare     │  HTTP  │  Cloudflare Worker       │
│  Pages) — frontend        │ ─────► │  shotto-gateway          │
│  /api/chat → SSE proxy    │        │  /api/search (RAG + SSE) │
└──────────────────────────┘        │  /api/anomalies          │
                                    │  /api/vendors            │
                                    │  /api/stats              │
                                    │  /api/ingest (admin)     │
                                    └────────┬─────────────────┘
                                             │
                                ┌────────────┼────────────┐
                                ▼            ▼            ▼
                            ┌──────┐    ┌────────┐    ┌──────┐
                            │  D1  │    │Vectorize│    │  R2  │
                            │+FTS5 │    │ bge-m3  │    │ PDFs │
                            └──────┘    └────────┘    └──────┘
                  ▲
                  │ NDJSON
                  │
        ┌─────────┴────────┐
        │  Scrapy spider   │
        │  (egp contracts) │
        └──────────────────┘
```

## Repo layout

```
govwatch/
├── backend/
│   ├── scraper/              Python: eprocure.gov.bd spider + pipelines
│   └── workers/              TypeScript: Cloudflare Worker API gateway
│
├── frontend/                 Next.js 16 (App Router) — Consumer-of-Worker
│
├── rag.md                    Design notes for the RAG pipeline
├── technical-plan.md         Overall platform plan
└── ui.md                     UI design notes
```

## Quick start

### 1. Backend (Worker)

```bash
cd backend/workers
npm install
cp .dev.vars.example .dev.vars       # add your OPENAI_API_KEY
wrangler d1 execute shotto-db --file=./schema/schema.sql   # local
npx wrangler dev                      # http://127.0.0.1:8787
```

Verify:
```bash
curl http://127.0.0.1:8787/api/stats
```

### 2. Backend (Scraper)

```bash
cd backend/scraper
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
python run_scraper.py --test
python push_to_worker.py data/egp_contracts_*.ndjson \
  --gateway http://127.0.0.1:8787 --token test
```

### 3. Frontend

```bash
cd frontend
npm install
echo "WORKER_URL=http://127.0.0.1:8787" > .env.local
npm run dev                            # http://localhost:3000
```

## LLM provider

Backend supports two providers:

| Provider | Bangla quality | Cost | Default |
|---|---|---|---|
| **OpenAI** (gpt-4o-mini) | Excellent | Pay per token | ✅ |
| Workers AI (Llama 3.1 8B) | Mediocre | Free | fallback |

Force a specific provider:
```bash
# wrangler.toml / wrangler.local.toml
LLM_PROVIDER = "workersai"   # or "openai"
```

## Roles

- **Search** — natural-language Q&A over Bangla/English procurement data with streamed answers, citations, and outlier flagging.
- **Anomalies** — browsable list of price outliers (z-score > 2.5 vs ministry+district peers).
- **Vendors** — top vendors by total value, with shared-director edges for collusion signals.
- **Stats** — corpus counts.

## Data sources

- Primary: [eprocure.gov.bd](https://www.eprocure.gov.bd) — government e-tendering portal.
- Ingestion: Scrapy spider → NDJSON → Worker `/api/ingest-batch`.
- Storage: D1 (metadata + FTS5), Vectorize (bge-m3 embeddings), R2 (PDFs).

## Status

- Backend: 15/15 integration tests passing, end-to-end SSE verified.
- Frontend: builds clean, ships with BN/EN toggle and CF Pages config.
- Scrapy: a Twisted reactor issue currently blocks fresh crawls; existing NDJSON still ingests fine.

## License

Private.
