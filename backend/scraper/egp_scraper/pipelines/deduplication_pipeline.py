"""
Deduplication pipeline.

The same tender can show up in multiple pages of the listing, or in
both the listing and a retry. We keep an in-memory set of tender_ids
already yielded and drop any duplicates.
"""

from scrapy.exceptions import DropItem


class DeduplicationPipeline:
    def __init__(self):
        self.seen = set()

    def process_item(self, item, spider):
        tender_id = item.get("tender_id")
        if not tender_id:
            raise DropItem("Missing tender_id")

        if tender_id in self.seen:
            raise DropItem(f"Duplicate tender_id: {tender_id}")

        self.seen.add(tender_id)
        return item

    def close_spider(self, spider):
        spider.logger.info(f"[dedup] Saw {len(self.seen)} unique tender_ids")