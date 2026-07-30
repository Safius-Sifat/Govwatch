#!/usr/bin/env python3
"""
Top-level runner for the e-GP scraper.

Usage:
    # Test mode — fetch just 1 listing page (≈500 contracts) and exit.
    python run_scraper.py --test

    # Production mode — crawl max_pages listing pages.
    python run_scraper.py --max-pages 20

    # Default (no flags) — caps at 5 pages for safety.
    python run_scraper.py
"""

import argparse
import os
import sys

# Add the scraper package to the path so scrapy can find it.
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def run(max_pages: int, page_size: int, output_dir: str, test: bool):
    if test:
        max_pages = 1

    os.makedirs(output_dir, exist_ok=True)

    # We invoke Scrapy programmatically rather than via `scrapy crawl` to
    # make it easy to pass settings and avoid PATH issues.
    import scrapy
    from scrapy.cmdline import execute

    settings_overrides = {
        "SCRAPER_OUTPUT_DIR": output_dir,
        "LOG_LEVEL": "INFO",
    }

    args = [
        "scrapy",
        "crawl",
        "egp_contracts",
        "-a",
        f"max_pages={max_pages}",
        "-a",
        f"page_size={page_size}",
        "-s",
        f"SCRAPER_OUTPUT_DIR={output_dir}",
    ]

    sys.argv = args
    try:
        execute()
    except SystemExit:
        pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the e-GP scraper.")
    parser.add_argument("--max-pages", type=int, default=5,
                        help="Number of listing pages to crawl (each ≈500 contracts).")
    parser.add_argument("--page-size", type=int, default=500,
                        help="Rows per listing POST.")
    parser.add_argument("--output-dir", type=str, default="data",
                        help="Directory to write NDJSON output.")
    parser.add_argument("--test", action="store_true",
                        help="Run a tiny test crawl (1 page, ~30 contracts).")
    args = parser.parse_args()

    run(
        max_pages=args.max_pages,
        page_size=args.page_size,
        output_dir=args.output_dir,
        test=args.test,
    )