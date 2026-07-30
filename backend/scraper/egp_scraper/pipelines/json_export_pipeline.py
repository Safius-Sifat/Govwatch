"""
JSON export pipeline.

Writes every item to a single newline-delimited JSON (NDJSON) file so
we can stream-load it into Cloudflare D1 and Vectorize.

NDJSON > a single JSON array because:
- We can `cat` it to inspect
- Partial files remain usable if the scraper crashes mid-run
- It maps 1:1 to SQL `INSERT` statements
"""

import json
import os
from datetime import datetime


class JsonExportPipeline:
    """Append each item to an NDJSON file."""

    def __init__(self, output_dir="data"):
        self.output_dir = output_dir
        self.filepath = None
        self.count = 0

    @classmethod
    def from_crawler(cls, crawler):
        return cls(output_dir=crawler.settings.get("SCRAPER_OUTPUT_DIR", "data"))

    def open_spider(self, spider):
        os.makedirs(self.output_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        spider_name = getattr(spider, "name", "egp_scraper")
        self.filepath = os.path.join(
            self.output_dir, f"{spider_name}_{timestamp}.ndjson"
        )
        spider.logger.info(f"[json] Writing to {self.filepath}")

    def process_item(self, item, spider):
        with open(self.filepath, "a", encoding="utf-8") as f:
            f.write(json.dumps(dict(item), ensure_ascii=False) + "\n")
        self.count += 1
        return item

    def close_spider(self, spider):
        spider.logger.info(
            f"[json] Wrote {self.count} items to {self.filepath}"
        )


class CollusionExportPipeline:
    """
    Separate NDJSON of just the beneficial-owner data, optimized for
    loading into a relational DB table for vendor-collusion queries.

    One vendor can win multiple contracts with multiple directors, so
    we explode to (tender_id, vendor_name, director_name, ownership_pct).
    """

    def __init__(self, output_dir="data"):
        self.output_dir = output_dir
        self.filepath = None
        self.count = 0

    @classmethod
    def from_crawler(cls, crawler):
        return cls(output_dir=crawler.settings.get("SCRAPER_OUTPUT_DIR", "data"))

    def open_spider(self, spider):
        os.makedirs(self.output_dir, exist_ok=True)
        self.filepath = os.path.join(self.output_dir, "vendor_directors.ndjson")

    def process_item(self, item, spider):
        winner = item.get("winner_name", "")
        tender_id = item.get("tender_id", "")
        owners = item.get("beneficial_owners") or []
        for o in owners:
            row = {
                "tender_id": tender_id,
                "vendor_name_normalized": winner,
                "director_name": o.get("name", ""),
                "designation": o.get("designation", ""),
                "ownership_pct": o.get("ownership_pct"),
                "country": o.get("country", ""),
                "district": item.get("procuring_entity_district", ""),
                "ministry": item.get("ministry", ""),
            }
            with open(self.filepath, "a", encoding="utf-8") as f:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
            self.count += 1
        return item

    def close_spider(self, spider):
        spider.logger.info(
            f"[collusion] Wrote {self.count} vendor-director links to {self.filepath}"
        )