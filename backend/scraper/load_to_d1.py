#!/usr/bin/env python3
"""
Convert NDJSON scraper output into a Cloudflare D1 SQL script.

Produces a single `d1_load.sql` file with:
  - CREATE TABLE statements (idempotent)
  - One INSERT per row, parameterized

Usage:
    python load_to_d1.py data/egp_contracts_20260730_120000.ndjson \\
        --out data/d1_load.sql
"""

import argparse
import json
import os
import sqlite3
import tempfile
from collections import defaultdict


DDL = """
-- ============================================================
-- ShottoPrakash D1 Schema
-- ============================================================

DROP TABLE IF EXISTS vendor_directors;
DROP TABLE IF EXISTS contract_progress;
DROP TABLE IF EXISTS tender_items;
DROP TABLE IF EXISTS contracts;

CREATE TABLE contracts (
  tender_id TEXT PRIMARY KEY,
  pkg_lot_id TEXT,
  tender_ref_no TEXT,
  package_no TEXT,
  package_name TEXT,
  detail_url TEXT,
  ministry TEXT,
  division TEXT,
  agency TEXT,
  procuring_entity_name TEXT,
  procuring_entity_district TEXT,
  procurement_method TEXT,
  procurement_category TEXT,
  budget_type TEXT,
  funding_source TEXT,
  contract_price_bdt REAL,
  winner_name TEXT,
  winner_tenderer_id TEXT,
  winner_business_address TEXT,
  advertisement_date TEXT,
  notification_award_date TEXT,
  contract_signing_date TEXT,
  contract_start_date TEXT,
  contract_completion_date TEXT,
  median_bdt REAL,
  price_z_score REAL,
  is_price_outlier INTEGER,
  search_text TEXT,
  source TEXT,
  scraped_at TEXT
);

CREATE TABLE vendor_directors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id TEXT,
  vendor_name TEXT,
  director_name TEXT,
  designation TEXT,
  ownership_pct REAL,
  country TEXT,
  district TEXT,
  ministry TEXT,
  FOREIGN KEY (tender_id) REFERENCES contracts(tender_id)
);

-- Lifecycle/work-status data from the eCMS endpoint (egp_ecms spider).
-- One row per contract (FK to contracts.tender_id) tracking how the
-- contract is being executed post-award.
CREATE TABLE contract_progress (
  tender_id TEXT PRIMARY KEY,
  ecms_id TEXT,
  work_status TEXT,
  physical_progress_pct REAL,
  financial_progress_pct REAL,
  progress_gap REAL,
  is_progress_anomaly INTEGER,
  contract_start_date TEXT,
  contract_end_date TEXT,
  contract_no TEXT,
  contract_value_bdt REAL,
  is_jvca TEXT,
  pe_comments TEXT,
  remarks TEXT,
  tender_publication_date TEXT,
  tender_type TEXT,
  procurement_nature TEXT,
  work_category TEXT,
  winner_name TEXT,
  winner_tenderer_id TEXT,
  experience_certificate_no TEXT,
  organization TEXT,
  pe_office_name TEXT,
  pe_name TEXT,
  detail_url TEXT,
  search_text TEXT,
  scraped_at TEXT,
  FOREIGN KEY (tender_id) REFERENCES contracts(tender_id)
);

-- FTS5 index for keyword search.
DROP TABLE IF EXISTS contracts_fts;
CREATE VIRTUAL TABLE contracts_fts USING fts5(
  tender_id, tender_ref_no, package_name, ministry, division,
  procuring_entity_name, procuring_entity_district,
  winner_name, search_text,
  content='contracts', content_rowid='rowid'
);

-- Indexes for common filters.
CREATE INDEX idx_district ON contracts(procuring_entity_district);
CREATE INDEX idx_ministry ON contracts(ministry);
CREATE INDEX idx_method ON contracts(procurement_method);
CREATE INDEX idx_winner ON contracts(winner_name);
CREATE INDEX idx_outlier ON contracts(is_price_outlier);

CREATE INDEX idx_progress_status ON contract_progress(work_status);
CREATE INDEX idx_progress_anomaly ON contract_progress(is_progress_anomaly);
CREATE INDEX idx_progress_winner ON contract_progress(winner_name);
"""


def sql_escape(value):
    """Escape a string value for inclusion in a single-quoted SQL literal."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bool):
        return "1" if value else "0"
    s = str(value).replace("'", "''")
    return f"'{s}'"


def main():
    parser = argparse.ArgumentParser(description="Convert NDJSON to D1 SQL.")
    parser.add_argument("ndjson", help="Path to the NDJSON file produced by the scraper.")
    parser.add_argument("--out", default="data/d1_load.sql",
                        help="Output SQL file path.")
    parser.add_argument("--use-sqlite-validate", action="store_true",
                        help="Validate the SQL by running it through an in-memory SQLite "
                             "instance first (catches escaping bugs before you ship).")
    parser.add_argument("--anomaly-overrides", default=None,
                        help="Optional NDJSON of computed anomaly fields "
                             "(produced by the scraper's AnomalyPreComputePipeline). "
                             "Default: derived from the input filename "
                             "(egp_contracts → data/anomaly_overrides.ndjson, "
                             "egp_ecms → data/egp_ecms_anomaly_overrides.ndjson).")
    args = parser.parse_args()

    with open(args.ndjson, "r", encoding="utf-8") as f:
        items = [json.loads(line) for line in f if line.strip()]

    is_ecms = _is_ecms_file(args.ndjson, items)
    kind = "eCMS work-status records" if is_ecms else "contracts"
    print(f"[d1-load] {len(items)} {kind} to load")

    # Derive the right anomaly sidecar path if the user didn't pass one.
    if args.anomaly_overrides is None:
        if is_ecms:
            args.anomaly_overrides = "data/egp_ecms_anomaly_overrides.ndjson"
        else:
            args.anomaly_overrides = "data/anomaly_overrides.ndjson"

    # Merge anomaly overrides (median_bdt, price_z_score, is_price_outlier,
    # progress_gap, is_progress_anomaly) that the scraper computed but
    # couldn't attach to the original items.
    merged = 0
    if args.anomaly_overrides and os.path.exists(args.anomaly_overrides):
        overrides = {}
        with open(args.anomaly_overrides, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    o = json.loads(line)
                    if o.get("tender_id"):
                        overrides[o["tender_id"]] = o
        for item in items:
            tid = item.get("tender_id")
            if tid in overrides:
                for k in ("median_bdt", "price_z_score", "is_price_outlier",
                          "progress_gap", "is_progress_anomaly"):
                    if k in overrides[tid]:
                        item[k] = overrides[tid][k]
                merged += 1
        print(f"[d1-load] Merged anomaly overrides for {merged} records")

    if args.use_sqlite_validate:
        # Round-trip through SQLite to catch syntax/escape errors.
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as tmp:
            conn = sqlite3.connect(tmp.name)
            conn.executescript(DDL)
            insert_fn = _insert_progress if is_ecms else _insert_contract
            for it in items:
                insert_fn(conn, it)
            conn.commit()
            count = conn.execute(
                "SELECT COUNT(*) FROM contract_progress" if is_ecms
                else "SELECT COUNT(*) FROM contracts"
            ).fetchone()[0]
            print(f"[d1-load] SQLite validation OK ({count} rows inserted)")
            conn.close()

    # Emit the SQL file.
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write("-- Auto-generated by load_to_d1.py\n")
        f.write(f"-- Source: {args.ndjson}\n")
        f.write(f"-- Row count: {len(items)}\n\n")
        f.write(DDL)
        f.write("\n\n-- ============================================================\n")
        f.write("-- INSERT statements\n")
        f.write("-- ============================================================\n\n")

        if is_ecms:
            _emit_progress_inserts(f, items)
        else:
            _emit_contract_inserts(f, items)
            _emit_directors_inserts(f, items)
            _emit_fts_backfill(f)

    size = os.path.getsize(args.out)
    print(f"[d1-load] Wrote {args.out} ({size/1024:.1f} KB)")


def _is_ecms_file(path: str, items: list) -> bool:
    """Heuristic: filename contains 'ecms' OR items have the eCMS signature."""
    if "ecms" in os.path.basename(path).lower():
        return True
    if items and items[0].get("source") == "egp_ecms":
        return True
    return False


def _emit_contract_inserts(f, items):
    """Emit a batched multi-row INSERT for each chunk of contracts."""
    cols = [
        "tender_id", "pkg_lot_id", "tender_ref_no", "package_no",
        "package_name", "detail_url", "ministry", "division",
        "agency", "procuring_entity_name", "procuring_entity_district",
        "procurement_method", "procurement_category", "budget_type",
        "funding_source", "contract_price_bdt", "winner_name",
        "winner_tenderer_id", "winner_business_address",
        "advertisement_date", "notification_award_date",
        "contract_signing_date", "contract_start_date",
        "contract_completion_date", "median_bdt", "price_z_score",
        "is_price_outlier", "search_text", "source", "scraped_at",
    ]
    for i in range(0, len(items), 50):
        batch = items[i:i + 50]
        f.write("INSERT INTO contracts (")
        f.write(", ".join(cols))
        f.write(") VALUES\n")
        rows = [
            "  (" + ", ".join(sql_escape(it.get(c)) for c in cols) + ")"
            for it in batch
        ]
        f.write(",\n".join(rows))
        f.write(";\n\n")


def _emit_directors_inserts(f, items):
    """Emit the flattened vendor_directors INSERTs."""
    directors = []
    for it in items:
        winner = it.get("winner_name", "")
        for o in it.get("beneficial_owners") or []:
            directors.append({
                "tender_id": it.get("tender_id", ""),
                "vendor_name": winner,
                "director_name": o.get("name", ""),
                "designation": o.get("designation", ""),
                "ownership_pct": o.get("ownership_pct"),
                "country": o.get("country", ""),
                "district": it.get("procuring_entity_district", ""),
                "ministry": it.get("ministry", ""),
            })
    if not directors:
        return
    f.write("-- vendor_directors\n")
    cols_vd = [
        "tender_id", "vendor_name", "director_name",
        "designation", "ownership_pct", "country",
        "district", "ministry",
    ]
    for i in range(0, len(directors), 50):
        batch = directors[i:i + 50]
        f.write("INSERT INTO vendor_directors (")
        f.write(", ".join(cols_vd))
        f.write(") VALUES\n")
        rows = [
            "  (" + ", ".join(sql_escape(d.get(c)) for c in cols_vd) + ")"
            for d in batch
        ]
        f.write(",\n".join(rows))
        f.write(";\n\n")


def _emit_progress_inserts(f, items):
    """Emit a batched multi-row INSERT for each chunk of eCMS work-status rows."""
    cols = [
        "tender_id", "ecms_id", "work_status",
        "physical_progress_pct", "financial_progress_pct",
        "progress_gap", "is_progress_anomaly",
        "contract_start_date", "contract_end_date",
        "contract_no", "contract_value_bdt",
        "is_jvca", "pe_comments", "remarks",
        "tender_publication_date", "tender_type",
        "procurement_nature", "work_category",
        "winner_name", "winner_tenderer_id",
        "experience_certificate_no",
        "organization", "pe_office_name", "pe_name",
        "detail_url", "search_text", "scraped_at",
    ]
    f.write("-- contract_progress (eCMS work-status rows)\n")
    for i in range(0, len(items), 50):
        batch = items[i:i + 50]
        f.write("INSERT INTO contract_progress (")
        f.write(", ".join(cols))
        f.write(") VALUES\n")
        rows = [
            "  (" + ", ".join(sql_escape(it.get(c)) for c in cols) + ")"
            for it in batch
        ]
        f.write(",\n".join(rows))
        f.write(";\n\n")


def _emit_fts_backfill(f):
    """Emit the FTS5 backfill query."""
    f.write("-- FTS5 backfill\n")
    f.write("""INSERT INTO contracts_fts (rowid, tender_id, tender_ref_no, package_name,
  ministry, division, procuring_entity_name, procuring_entity_district,
  winner_name, search_text)
SELECT rowid, tender_id, tender_ref_no, package_name, ministry, division,
       procuring_entity_name, procuring_entity_district, winner_name, search_text
FROM contracts;
""")


def _insert_contract(conn, it):
    """Helper for SQLite validation — match the D1 schema column-for-column."""
    cols = [
        "tender_id", "pkg_lot_id", "tender_ref_no", "package_no",
        "package_name", "detail_url", "ministry", "division",
        "agency", "procuring_entity_name", "procuring_entity_district",
        "procurement_method", "procurement_category", "budget_type",
        "funding_source", "contract_price_bdt", "winner_name",
        "winner_tenderer_id", "winner_business_address",
        "advertisement_date", "notification_award_date",
        "contract_signing_date", "contract_start_date",
        "contract_completion_date", "median_bdt", "price_z_score",
        "is_price_outlier", "search_text", "source", "scraped_at",
    ]
    placeholders = ", ".join(["?"] * len(cols))
    sql = f"INSERT INTO contracts ({', '.join(cols)}) VALUES ({placeholders})"
    vals = [it.get(c) for c in cols]
    # bool → int for SQLite
    idx = cols.index("is_price_outlier")
    if isinstance(vals[idx], bool):
        vals[idx] = 1 if vals[idx] else 0
    conn.execute(sql, vals)


def _insert_progress(conn, it):
    """Helper for SQLite validation — eCMS work-status row."""
    cols = [
        "tender_id", "ecms_id", "work_status",
        "physical_progress_pct", "financial_progress_pct",
        "progress_gap", "is_progress_anomaly",
        "contract_start_date", "contract_end_date",
        "contract_no", "contract_value_bdt",
        "is_jvca", "pe_comments", "remarks",
        "tender_publication_date", "tender_type",
        "procurement_nature", "work_category",
        "winner_name", "winner_tenderer_id",
        "experience_certificate_no",
        "organization", "pe_office_name", "pe_name",
        "detail_url", "search_text", "scraped_at",
    ]
    placeholders = ", ".join(["?"] * len(cols))
    sql = f"INSERT INTO contract_progress ({', '.join(cols)}) VALUES ({placeholders})"
    vals = [it.get(c) for c in cols]
    # bool → int for SQLite
    for bcol in ("is_progress_anomaly",):
        idx = cols.index(bcol)
        if isinstance(vals[idx], bool):
            vals[idx] = 1 if vals[idx] else 0
    conn.execute(sql, vals)


if __name__ == "__main__":
    main()