"""
Pre-computes price anomaly signals per scraping run.

This pipeline accumulates all items, then at spider close:

  1. Groups contracts by (procurement_method, simplified_package_name).
  2. Computes the median contract_price_bdt per group.
  3. Tags every item with:
        median_bdt      — median of the group's prices
        price_z_score   — z-score of this item vs the group's distribution
        is_price_outlier — True if z > 2.5

This makes the demo query "show me suspicious high-value contracts"
instant — no need to wait for a separate analytics job. The UI can
just filter on `is_price_outlier=True` and sort by `price_z_score`.
"""

import statistics
from collections import defaultdict
import re


# Procurement methods that should NOT be compared against each other.
# LTM contracts are tiny (<5 lakh); OTM contracts are 10x+ bigger.
METHOD_COMPATIBLE_GROUPS = {
    "LTM": "small",
    "RFQ": "small",
    "OTM": "medium",
    "DPM": "medium",
    "TSTM": "medium",
    "Tender": "large",
    "Direct Procurement": "large",
    "International": "large",
}


def _simplify_package_name(name: str) -> str:
    """
    Reduce 'Construction of Road by Cement Concrete...' to a category
    token like 'road_construction'. Naive bag-of-words match is fine
    for v1 — we'll improve with proper NLP later.
    """
    if not name:
        return ""
    text = name.lower()
    rules = [
        (r"\b(road|path|street)\b", "road"),
        (r"\b(bridge|culvert)\b", "bridge"),
        (r"\b(building|construction|school|college)\b", "building"),
        (r"\b(boundary wall|wall|fencing)\b", "boundary_wall"),
        (r"\b(road by cement concrete|cc road)\b", "cc_road"),
        (r"\b(repair|renovation|maintenance)\b", "repair"),
        (r"\b(electric|electrical|wiring)\b", "electrical"),
        (r"\b(water|sanitation|tube well|plumbing)\b", "water"),
        (r"\b(furniture|chair|table)\b", "furniture"),
        (r"\b(chemical|acid|fertilizer)\b", "chemical_supply"),
    ]
    for pattern, label in rules:
        if re.search(pattern, text):
            return label
    return "other"


class AnomalyPreComputePipeline:
    """Buffer items, compute z-scores at close_spider."""

    def __init__(self):
        self.items_buffer = []

    def process_item(self, item, spider):
        # Buffer; don't mutate yet.
        self.items_buffer.append(dict(item))
        return item

    def close_spider(self, spider):
        if not self.items_buffer:
            return

        # Group by (compatible-method-bucket, simplified_package_name).
        groups = defaultdict(list)
        for it in self.items_buffer:
            method = it.get("procurement_method") or "Unknown"
            bucket = METHOD_COMPATIBLE_GROUPS.get(method, "unknown")
            cat = _simplify_package_name(it.get("package_name") or "")
            groups[(bucket, cat)].append(it)

        # For each group with >= 5 items, compute median + stddev.
        for (bucket, cat), items in groups.items():
            prices = [
                it.get("contract_price_bdt", 0) or 0
                for it in items
            ]
            prices = [p for p in prices if p > 0]
            if len(prices) < 5:
                for it in items:
                    it["median_bdt"] = None
                    it["price_z_score"] = None
                    it["is_price_outlier"] = False
                continue

            median = statistics.median(prices)
            stdev = statistics.stdev(prices) if len(prices) > 1 else 0
            for it in items:
                it["median_bdt"] = median
                if stdev > 0 and it.get("contract_price_bdt"):
                    z = (it["contract_price_bdt"] - median) / stdev
                    it["price_z_score"] = round(z, 2)
                    it["is_price_outlier"] = z > 2.5
                else:
                    it["price_z_score"] = None
                    it["is_price_outlier"] = False

        # Count outliers for logging.
        outliers = [it for it in self.items_buffer if it.get("is_price_outlier")]
        spider.logger.info(
            f"[anomaly] Grouped {len(self.items_buffer)} contracts into "
            f"{len(groups)} buckets; flagged {len(outliers)} as price outliers"
        )