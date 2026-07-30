# ShottoPrakash Scraper

A Scrapy-based crawler that extracts **awarded government contracts** from
Bangladesh's [e-Government Procurement (e-GP) portal](https://www.eprocure.gov.bd)
and normalizes them into a clean, queryable corpus.

## What it produces

For every awarded contract, you get a structured JSON object with:

| Field | Source | Example |
|------|--------|--------|
| `tender_id`, `pkg_lot_id` | URL | `1299703` |
| `tender_ref_no`, `package_no` | Detail page | `Biram/Poura/Engg/Special/2025/01` |
| `package_name` | Detail page | `Construction of Road by Cement Concrete...` |
| `ministry`, `division`, `agency` | Detail page | `Ministry of Local Government, Rural Development and Co-operatives` |
| `procuring_entity_name`, `procuring_entity_district` | Detail page | `Office of the Birampur Pourashava, Dinajpur` |
| `procurement_method` | Detail page | `LTM` / `OTM` / `RFQ` |
| `procurement_category` | Detail page | `Works` / `Goods` / `Services` |
| `winner_name` | Detail page | `M/S CHOWDHURY CONSTRUCTION` |
| `winner_tenderer_id` | Detail page | `1191723` |
| `winner_business_address` | Detail page | `Holding No:15, Shop No:4,...` |
| `contract_price_bdt` | Detail page | `1919866.516` |
| `advertisement_date`, `contract_signing_date`, `contract_completion_date` | Detail page | `17-Jun-2026 17:00` |
| **`beneficial_owners`** | Detail page | `[{name, designation, ownership_pct, country}]` |
| `median_bdt`, `price_z_score`, `is_price_outlier` | Pre-computed | grouped by procurement method + simplified package category |
| `search_text` | Pre-computed | concatenated text used for embedding |

The `beneficial_owners` field is **the key anti-corruption data point** —
it's what makes vendor-collusion detection possible later.

## Architecture

```
egp_contracts spider
       │
       ├─► GET AdvSearchNOA.jsp (warm session)
       │
       ├─► POST AdvSearchNOA.jsp (pageNo=1, size=500)
       │     │
       │     └─► parse rows → enqueue detail requests
       │           │
       │           └─► POST AdvSearchNOA.jsp (pageNo=2, size=500)
       │                 └─► ... (up to max_pages)
       │
       └─► For each detail URL:
             GET ViewAwardedContracts.jsp?pkgLotId=...&tenderid=...
                   │
                   └─► parse tables, beneficial ownership, dates, amounts
                         │
                         └─► yield ContractAward item
                               │
                               ▼
       ┌──── Pipelines ────┐
       │  100: Dedup       │ ← drop duplicate tender_ids
       │  200: search_text │ ← build embeddable text
       │  300: anomaly     │ ← pre-compute z-scores
       │  900: json export │ ← contracts.ndjson
       │  910: collusion   │ ← vendor_directors.ndjson
       └───────────────────┘
```

## Quick start

### 1. Install dependencies

```bash
cd backend/scraper
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

### 2. Run a test crawl

Fetches 1 listing page (~500 contracts in the listing, but only a handful
of detail pages to keep it fast).

```bash
python run_scraper.py --test
```

Watch the logs — you should see `[detail-error]` lines disappear as the
detail pages succeed. After ~2 minutes, check `data/`:

```bash
ls -la data/
# egp_contracts_20260730_120000.ndjson
```

### 3. Verify the output

```bash
python verify_output.py data/egp_contracts_*.ndjson
```

This prints summary stats: districts, ministries, methods, top winners,
and the number of records flagged as price outliers.

### 4. Generate the D1 SQL script

```bash
python load_to_d1.py data/egp_contracts_*.ndjson --use-sqlite-validate --out data/d1_load.sql
```

The `--use-sqlite-validate` flag runs the SQL through an in-memory SQLite
instance first so you catch any escaping bugs before shipping.

### 5. Full crawl (production)

```bash
python run_scraper.py --max-pages 40 --page-size 500
```

At ~1.5s/contract this will take **8–12 hours** for 40 pages × 500 = ~20,000 contracts.
Run it in the background:

```bash
nohup python run_scraper.py --max-pages 40 > data/crawl.log 2>&1 &
tail -f data/crawl.log
```

### 6. Load into Cloudflare D1

```bash
wrangler d1 create shotto-db
wrangler d1 execute shotto-db --file=data/d1_load.sql
wrangler d1 execute shotto-db --command="SELECT COUNT(*) FROM contracts;"
```

You should see `20000` (or however many you crawled).

## File layout

```
backend/scraper/
├── README.md                          ← this file
├── requirements.txt
├── setup.py
├── run_scraper.py                     ← entry point
├── verify_output.py                   ← sanity check on output
├── load_to_d1.py                      ← NDJSON → D1 SQL
├── data/                              ← output goes here
└── egp_scraper/
    ├── __init__.py
    ├── items.py                       ← ContractAward schema
    ├── middlewares.py
    ├── settings.py
    ├── pipelines/
    │   ├── __init__.py
    │   ├── deduplication_pipeline.py
    │   ├── search_text_pipeline.py
    │   ├── anomaly_pipeline.py
    │   └── json_export_pipeline.py
    └── spiders/
        ├── __init__.py
        └── egp_contracts.py           ← the main spider
```

## Important caveats

1. **e-GP rate-limits aggressively.** The 1.5s `DOWNLOAD_DELAY` in
   `settings.py` is tuned to stay under their threshold. If you get
   429s, bump it to 3s.

2. **Session cookies matter.** The spider warms the ASP.NET session
   with a GET before the first POST. Don't skip this — without it,
   ~90% of POSTs fail.

3. **Beneficial ownership is the gold.** The `viewShareholdersTable`
   row exposes vendor directors with their ownership %. Cross-referencing
   these across multiple contracts is how you'll detect dummy companies
   bidding on the same tenders.

4. **Anomaly grouping is naive in v1.** We group by
   `(procurement-method-bucket, simplified-package-category)`. Good
   enough for the demo. For production, you'd want a proper NLP-based
   item taxonomy.

5. **LTM contracts dominate.** Most e-GP contracts are LTM (Limited
   Tender Method) with values under 5 lakh BDT. To find big-ticket
   anomalies, filter for `OTM` and above.