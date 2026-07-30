"""
Scrapy settings for the e-GP scraper.

Tuned to be polite to eprocure.gov.bd (which is a real government portal)
while still being fast enough to crawl tens of thousands of records
within a few hours.
"""

BOT_NAME = "egp_scraper"

SPIDER_MODULES = ["egp_scraper.spiders"]
NEWSPIDER_MODULE = "egp_scraper.spiders"

# === Politeness ===
ROBOTSTXT_OBEY = False  # government portal, no robots.txt check needed
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 2
DOWNLOAD_DELAY = 1.5          # seconds between requests
RANDOMIZE_DOWNLOAD_DELAY = True
COOKIES_ENABLED = True        # session cookies matter for ASP.NET viewstate

# === Retries ===
RETRY_ENABLED = True
RETRY_TIMES = 3
RETRY_HTTP_CODES = [500, 502, 503, 504, 408, 429]

# === Headers ===
DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
    "Accept-Encoding": "gzip, deflate",
    "Cache-Control": "no-cache",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

# === Encoding ===
# e-GP serves Bengali text; force UTF-8 to be safe.
FEED_EXPORT_ENCODING = "utf-8"

# === Output pipelines ===
ITEM_PIPELINES = {
    "egp_scraper.pipelines.deduplication_pipeline.DeduplicationPipeline": 100,
    "egp_scraper.pipelines.search_text_pipeline.SearchTextPipeline": 200,
    "egp_scraper.pipelines.anomaly_pipeline.AnomalyPreComputePipeline": 300,
    "egp_scraper.pipelines.json_export_pipeline.JsonExportPipeline": 900,
    "egp_scraper.pipelines.json_export_pipeline.CollusionExportPipeline": 910,
}

# Where scraped files land.
SCRAPER_OUTPUT_DIR = "data"

# === Logging ===
LOG_LEVEL = "INFO"