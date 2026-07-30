#!/usr/bin/env python3
"""
Quick verification script — checks that the scraper output is sane
before you spend time loading it into Cloudflare.

Usage:
    python verify_output.py data/egp_contracts_*.ndjson
"""

import json
import sys
import os
from collections import Counter


REQUIRED_FIELDS = {
    "tender_id", "package_name", "winner_name",
    "contract_price_bdt", "procuring_entity_district", "procurement_method",
}


def verify(path: str):
    print(f"\n=== Verifying {path} ===")
    if not os.path.exists(path):
        print(f"  ❌ File not found")
        return False

    count = 0
    districts = Counter()
    ministries = Counter()
    methods = Counter()
    winners = Counter()
    missing_fields = []
    price_outliers = 0
    with_directors = 0

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"  ❌ Invalid JSON on line {count + 1}: {e}")
                return False
            count += 1
            for field in REQUIRED_FIELDS:
                if not item.get(field):
                    missing_fields.append((item.get("tender_id"), field))
            districts[item.get("procuring_entity_district", "Unknown")] += 1
            ministries[item.get("ministry", "Unknown")[:50]] += 1
            methods[item.get("procurement_method", "Unknown")] += 1
            winners[item.get("winner_name", "Unknown")] += 1
            if item.get("is_price_outlier"):
                price_outliers += 1
            if item.get("beneficial_owners"):
                with_directors += 1

    print(f"  ✓ {count} contracts parsed")
    print(f"  ✓ {with_directors} contracts have beneficial ownership data")
    print(f"  ✓ {price_outliers} contracts flagged as price outliers (z > 2.5)")

    if missing_fields:
        print(f"  ⚠️  {len(missing_fields)} missing field occurrences "
              f"(first 5: {missing_fields[:5]})")
    else:
        print(f"  ✓ All required fields populated")

    print(f"\n  Top 5 districts:")
    for k, v in districts.most_common(5):
        print(f"    {v:4d}  {k}")
    print(f"\n  Top 5 ministries:")
    for k, v in ministries.most_common(5):
        print(f"    {v:4d}  {k}")
    print(f"\n  Procurement methods:")
    for k, v in methods.most_common():
        print(f"    {v:4d}  {k}")
    print(f"\n  Top 5 winners (by contract count):")
    for k, v in winners.most_common(5):
        print(f"    {v:4d}  {k}")

    return count > 0


if __name__ == "__main__":
    paths = sys.argv[1:] or sorted([
        os.path.join("data", f)
        for f in os.listdir("data")
        if f.startswith("egp_contracts_") and f.endswith(".ndjson")
    ])
    if not paths:
        print("No NDJSON files to verify. Run the scraper first.")
        sys.exit(1)
    ok = all(verify(p) for p in paths)
    sys.exit(0 if ok else 1)