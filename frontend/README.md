# GovWatch

> An AI-powered civic intelligence platform for Bangladesh government procurement.

GovWatch makes government procurement data, gazettes, and public records queryable in plain Bangla or English. Every answer is grounded in real records with exact citations — nothing is fabricated.

This is the **frontend**, a fork of [Morphic](https://github.com/miurla/morphic) (open-source AI search engine) trimmed down to talk to our Cloudflare Worker backend.

## Stack

- **Frontend**: Next.js 16, React 19, Tailwind 4, shadcn/ui
- **Backend**: Cloudflare Workers + D1 + Vectorize + R2 + Workers AI ([`../backend/workers`](../backend/workers))
- **Scraper**: Scrapy (Python) for eprocure.gov.bd ([`../backend/scraper`](../backend/scraper))
- **Deploy**: Cloudflare Pages

## Architecture

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Browser    │ ←→ │ Next.js (Pages)  │ ←→ │ Cloudflare Worker   │
│              │    │  app/api/* proxy │    │ D1 + Vectorize + R2 │
└──────────────┘    └──────────────────┘    └─────────────────────┘
                                                       ↑
                                              ┌────────┴────────┐
                                              │  Scrapy e-GP    │
                                              │  crawler        │
                                              └─────────────────┘
```

The frontend never talks to the Worker directly. All requests go through Next.js route handlers in `app/api/*` so we keep one origin (no CORS) and centralize headers/auth/streaming.

## Endpoints (frontend)

| Path | Forwards to |
|---|---|
| `POST /api/chat` | `POST {WORKER_URL}/api/search` (SSE) |
| `GET /api/worker/stats` | `GET {WORKER_URL}/api/stats` |
| `GET /api/worker/anomalies` | `GET {WORKER_URL}/api/anomalies` |
| `GET /api/worker/vendors` | `GET {WORKER_URL}/api/vendors` |
| `GET /api/worker/ministries` | `GET {WORKER_URL}/api/ministries` |
| `GET /api/worker/districts` | `GET {WORKER_URL}/api/districts` |
| `GET /api/pdfs/[tenderId]` | `GET {WORKER_URL}/api/pdfs/:tenderId` |

## Pages

- `/` — landing with chat + stats sidebar
- `/search?q=...` — search results
- `/stats` — stats dashboard
- `/about` — about + data sources

## Local development

### 1. Start the Worker backend

```bash
cd ../backend/workers
npm install
npm run dev     # starts on http://127.0.0.1:8787
```

### 2. Start the frontend

```bash
npm install --legacy-peer-deps
cp .env.local.example .env.local
npm run dev     # starts on http://localhost:3000
```

Visit <http://localhost:3000/>.

## Cloudflare Pages deploy

```bash
npm run build:pages      # produces .vercel/output/static
npm run preview:pages    # local preview with wrangler pages dev
npm run deploy           # deploy to Cloudflare Pages
```

Set the following env var in your Cloudflare Pages dashboard:

- `WORKER_URL` — your deployed Worker URL, e.g. `https://govwatch-api.your-account.workers.dev`

## What's different from upstream Morphic

Morphic was a general-purpose AI search engine. For GovWatch we:

- **Use our own Cloudflare Worker backend** instead of OpenAI/Anthropic/etc.
- **Replaced the AI SDK chat** with a simple SSE consumer (`lib/govwatch/use-search-stream.ts`)
- **Added GovWatch-specific UI** — citations card, anomaly alert card, language toggle, stats sidebar
- **Added Bengali as default** with a cookie-based `bn`/`en` toggle
- **Kept all Morphic features intact** but unused (auth, DB, file upload, SearXNG, model selector) — they'll simply not be invoked in this build

This keeps the diff small, avoids breaking anything, and makes future upgrades easy.

## License

Apache-2.0 (inherited from upstream Morphic).