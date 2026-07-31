# ShottoPrakash Scraper

A Scrapy-based crawler that extracts **awarded government contracts** and
**eCMS work-status/progress records** from Bangladesh's
[e-Government Procurement (e-GP) portal](https://www.eprocure.gov.bd), then
normalizes them into a clean, queryable corpus.

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

The `egp_ecms` spider complements award notices with lifecycle data:

| Field | Meaning |
|------|---------|
| `work_status` | Completed / Ongoing / Cancelled |
| `physical_progress_pct` | Reported physical completion percentage |
| `financial_progress_pct` | Reported financial completion percentage, when published |
| `progress_gap`, `is_progress_anomaly` | Difference between physical and financial progress; flagged above 50 points |
| `contract_start_date`, `contract_end_date` | Actual eCMS contract dates |
| `contract_value_bdt` | eCMS contract value |
| `remarks`, `pe_comments` | Status commentary from the procuring entity |

Award and eCMS records are joined by `tender_id` in D1. eCMS rows are stored in
the `contract_progress` table.

## Architecture

```
egp_contracts spider                       egp_ecms spider
       │                                          │
       ├─► GET AdvSearchNOA.jsp                   ├─► GET AdvSearchNOA.jsp
       │   (warm session — JSESSIONID)            │   (warm session)
       │                                          │
       ├─► POST SearchNoaServlet                  ├─► POST AdvSearcheCMSServlet
       │   (keyword=&pageNo=&size=)               │   (action=geteCMSList,...
       │     │                                    │   statusTab=eTenders,...)
       │     └─► parse rows → enqueue detail      │     │
       │           │                              │     └─► parse rows → enqueue detail
       │           └─► ... walk pages              │           │
       │                                          │           └─► ... walk pages
       └─► For each detail URL:                   └─► For each detail URL:
             GET ViewAwardedContracts.jsp?...           GET VieweCmsDetails.jsp?...
                   │                                    │
                   └─► parse tables, owner table       └─► parse form tables, owner table,
                         │                              progress %, lifecycle dates
                         ▼                                    ▼
                  yield ContractAward item          yield EcmsWorkStatus item
                                  │                                    │
                                  └──────────────┬─────────────────────┘
                                                 ▼
       ┌──── Pipelines (shared) ────┐
       │  100: Dedup       │ ← drop duplicate tender_ids
       │  200: search_text │ ← build embeddable text (template chosen by item.source)
       │  300: anomaly     │ ← buffer items, write data/{spider}_anomaly_overrides.ndjson
       │  900: json export │ ← {spider}_{ts}.ndjson
       │  910: collusion   │ ← vendor_directors.ndjson
       └───────────────────┘
                                  │
                                  ▼
                load_to_d1.py reads each NDJSON file
                and merges anomaly sidecar when emitting
                d1_load.sql → Cloudflare D1
                  ├─ contracts         (from egp_contracts spider)
                  └─ contract_progress (from egp_ecms spider)
```

The `egp_contracts` and `egp_ecms` spiders share the same session portal
and run through the same pipelines. The new pipelines branch on
`item.get("source")` to pick the right `search_text` template and sidecar
filename.

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

#### Spider variants

The scraper has two spiders, selected with `--spider`:

| Spider | What it crawls | Listing endpoint |
|---|---|---|
| `egp_contracts` (default) | Award notices + beneficial ownership | `POST /SearchNoaServlet` |
| `egp_ecms` | Work status + physical/financial progress | `POST /AdvSearcheCMSServlet` |

```bash
# Crawl eCMS work status instead of award notices
python run_scraper.py --spider egp_ecms --max-pages=1 --page-size=10
```

The `egp_ecms` spider warms the same `JSESSIONID` and uses the same
detail-parser pattern (`formStyle_1` tables + `viewShareholdersTable`).
Output files are named after the spider, e.g.
`data/egp_ecms_<ts>.ndjson` and `data/egp_ecms_anomaly_overrides.ndjson`.

### 3. Verify the output

```bash
python verify_output.py data/egp_contracts_*.ndjson
python verify_output.py data/egp_ecms_*.ndjson
```

This prints summary stats: districts, ministries, methods, top winners,
and the number of records flagged as price outliers.

### 4. Generate the D1 SQL script

```bash
python load_to_d1.py data/egp_contracts_*.ndjson \
                     data/egp_ecms_*.ndjson \
                     --use-sqlite-validate \
                     --out data/d1_load.sql
```

The loader auto-detects whether each NDJSON is from `egp_contracts` or
`egp_ecms` (filename + schema) and emits the right `INSERT`s. Records are
deduped within each spider, and the matching `{spider}_anomaly_overrides.ndjson`
sidecar is merged in.

The `--use-sqlite-validate` flag runs the SQL through an in-memory SQLite
instance first so you catch any escaping bugs before shipping.

### 5. Full crawl (production)

```bash
python run_scraper.py --spider egp_contracts --max-pages 40 --page-size 500
python run_scraper.py --spider egp_ecms     --max-pages 20 --page-size 500
```

At ~1.5s/contract this will take **8–12 hours** for 40 pages × 500 = ~20,000 contracts.
Run it in the background:

```bash
nohup python run_scraper.py --spider egp_contracts --max-pages 40 > data/crawl.log 2>&1 &
tail -f data/crawl.log
```

### 6. Load into Cloudflare D1

```bash
wrangler d1 create shotto-db
wrangler d1 execute shotto-db --file=data/d1_load.sql
wrangler d1 execute shotto-db --command="SELECT COUNT(*) FROM contracts;"
wrangler d1 execute shotto-db --command="SELECT COUNT(*) FROM contract_progress;"
```

You should see `20000` (or however many you crawled) for `contracts`, and
the eCMS row count for `contract_progress`.

## File layout

```
backend/scraper/
├── README.md                          ← this file
├── requirements.txt
├── setup.py
├── run_scraper.py                     ← entry point (--spider flag)
├── verify_output.py                   ← sanity check on output
├── load_to_d1.py                      ← NDJSON → D1 SQL
├── data/                              ← output goes here
└── egp_scraper/
    ├── __init__.py
    ├── items.py                       ← ContractAward + EcmsWorkStatus schemas
    ├── middlewares.py
    ├── settings.py
    ├── pipelines/
    │   ├── __init__.py
    │   ├── deduplication_pipeline.py
    │   ├── search_text_pipeline.py   ← source-aware template selection
    │   ├── anomaly_pipeline.py        ← writes per-spider sidecar
    │   └── json_export_pipeline.py
    └── spiders/
        ├── __init__.py
        ├── egp_contracts.py           ← POST /SearchNoaServlet
        └── egp_ecms.py                ← POST /AdvSearcheCMSServlet
```

## Important caveats

1. **Requires Scrapy 2.13 or later.** Scrapy 2.13 changed the spider
   entry-point from the synchronous `start_requests()` to an async
   `start()` method. This scraper defines both: `start()` is an async
   generator that forwards to `start_requests()`. On Scrapy < 2.13
   only `start_requests()` is called; on Scrapy 2.13+ only `start()`
   is invoked. Pin in `requirements.txt`:
   ```
   scrapy>=2.13,<3.0
   ```

2. **Listing endpoint is the AJAX servlet, not the JSP.** The portal's
   `AdvSearchNOA.jsp` is the search form; the actual paginated rows
   are returned by `POST /SearchNoaServlet` with body
   `keyword=&pageNo=<n>&size=<n>`. The spider hits the servlet
   directly. The JSP page is only fetched once (the warmup GET) to
   establish the `JSESSIONID` cookie.

3. **e-GP rate-limits aggressively.** The 1.5s `DOWNLOAD_DELAY` in
   `settings.py` is tuned to stay under their threshold. If you get
   429s, bump it to 3s.

4. **Session cookies matter.** The spider warms the session with a
   GET before the first POST. Don't skip this — without it, ~90% of
   POSTs fail.

5. **Beneficial ownership is the gold.** The `viewShareholdersTable`
   row exposes vendor directors with their ownership %. Cross-referencing
   these across multiple contracts is how you'll detect dummy companies
   bidding on the same tenders.

6. **Anomaly pipeline writes a sidecar file.** Because z-scores are
   computed at `close_spider` (after all items have been buffered),
   the computed `median_bdt`, `price_z_score`, and `is_price_outlier`
   fields are written to `data/anomaly_overrides.ndjson` rather than
   being mutated on the original items. The D1 loader (`load_to_d1.py`)
   automatically merges this sidecar back when generating SQL. You
   almost never need to touch this — just know that the fields exist
   in the SQL but not in the raw NDJSON.

7. **Anomaly grouping is naive in v1.** We group by
   `(procurement-method-bucket, simplified-package-category)`. Good
   enough for the demo. For production, you'd want a proper NLP-based
   item taxonomy.

8. **LTM contracts dominate.** Most e-GP contracts are LTM (Limited
   Tender Method) with values under 5 lakh BDT. To find big-ticket
   anomalies, filter for `OTM` and above.

9. **`egp_ecms` financial progress is often blank.** Small and very old
   contracts do not always publish a financial progress percentage.
   The loader emits `NULL` in those rows, and `is_progress_anomaly`
   stays `FALSE` (only computed when both percentages are present).

10. **`egp_ecms` rows join to `contracts` by `tender_id`.** Make sure
    your eCMS crawl covers at least the same tender_ids present in the
    contracts table — otherwise `contract_progress.tender_id` will not
    match any row and the FK (if you create one) will reject the insert.
    For exploratory use, omit the FK on `contract_progress.tender_id`.