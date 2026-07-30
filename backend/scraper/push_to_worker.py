#!/usr/bin/env python3
"""
Push NDJSON scraper output to the deployed Worker via /api/ingest-batch.

Usage:
    export SHOTTO_GATEWAY_URL=https://shotto-gateway.<account>.workers.dev
    export SHOTTO_ADMIN_TOKEN=<your-admin-token>
    python push_to_worker.py data/egp_contracts_*.ndjson

Reads each line of the NDJSON file and forwards it to the Worker.
The Worker handles embedding + Vectorize upsert.
"""

import argparse
import json
import os
import sys
import time
from urllib.parse import urljoin

import requests


def push_file(filepath: str, gateway_url: str, admin_token: str, batch_size: int = 100):
    """Push a single NDJSON file to the Worker in batches."""
    print(f"[push] Reading {filepath}")

    batch = []
    total = 0
    ok = 0
    failed = 0
    t0 = time.time()

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"  [skip] Invalid JSON: {e}")
                failed += 1
                continue

            # Split beneficial owners out (the /api/ingest-batch
            # endpoint expects them as a separate top-level field).
            owners = record.pop("beneficial_owners", [])
            payload = {"contract": record, "beneficial_owners": owners}
            batch.append(payload)
            total += 1

            if len(batch) >= batch_size:
                ok += push_batch(batch, gateway_url, admin_token)
                failed += len(batch) - ok
                batch = []

        if batch:
            ok += push_batch(batch, gateway_url, admin_token)
            failed += len(batch) - ok

    elapsed = time.time() - t0
    print(f"[push] Done: {ok}/{total} ok in {elapsed:.1f}s ({total/elapsed:.1f} contracts/s)")


def push_batch(batch: list, gateway_url: str, admin_token: str) -> int:
    """POST a batch of contracts to /api/ingest."""
    ndjson = "\n".join(json.dumps(r, ensure_ascii=False) for r in batch)

    url = urljoin(gateway_url.rstrip("/") + "/", "api/ingest-batch")
    headers = {
        "Content-Type": "application/x-ndjson",
        "X-Admin-Token": admin_token,
    }

    try:
        resp = requests.post(url, data=ndjson, headers=headers, timeout=120)
        if resp.status_code == 200:
            result = resp.json()
            return result.get("ok", 0)
        else:
            print(f"  [error] HTTP {resp.status_code}: {resp.text[:200]}")
            return 0
    except Exception as e:
        print(f"  [error] Network: {e}")
        return 0


def main():
    parser = argparse.ArgumentParser(description="Push NDJSON to ShottoPrakash Worker.")
    parser.add_argument("files", nargs="+", help="NDJSON files to push.")
    parser.add_argument(
        "--gateway",
        default=os.environ.get("SHOTTO_GATEWAY_URL"),
        help="Gateway URL (or set SHOTTO_GATEWAY_URL env var).",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("SHOTTO_ADMIN_TOKEN"),
        help="Admin token (or set SHOTTO_ADMIN_TOKEN env var).",
    )
    parser.add_argument(
        "--batch-size", type=int, default=50,
        help="Number of contracts per HTTP request (default: 50).",
    )
    args = parser.parse_args()

    if not args.gateway:
        print("ERROR: --gateway or SHOTTO_GATEWAY_URL required")
        sys.exit(1)
    if not args.token:
        print("WARNING: --token or SHOTTO_ADMIN_TOKEN not set; will fail at server.")

    for f in args.files:
        push_file(f, args.gateway, args.token, args.batch_size)


if __name__ == "__main__":
    main()