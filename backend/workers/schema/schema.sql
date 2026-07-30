-- ============================================================
-- ShottoPrakash D1 Schema
-- ============================================================
-- Cloudflare D1 = SQLite at the edge.
-- This schema holds all structured metadata for awarded contracts.
-- Embeddings live in Vectorize; raw PDFs live in R2.

-- ============================================================
-- 1. Core table: contracts
-- ============================================================

CREATE TABLE IF NOT EXISTS contracts (
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
  procuring_entity_code TEXT,

  procurement_method TEXT,
  procurement_category TEXT,
  budget_type TEXT,
  funding_source TEXT,

  contract_price_bdt REAL,
  contract_price_raw TEXT,

  winner_name TEXT,
  winner_name_normalized TEXT,
  winner_tenderer_id TEXT,
  winner_business_address TEXT,
  delivery_location TEXT,

  advertisement_date TEXT,
  notification_award_date TEXT,
  contract_signing_date TEXT,
  contract_start_date TEXT,
  contract_completion_date TEXT,

  authorised_officer_name TEXT,
  authorised_officer_designation TEXT,

  -- Anomaly detection (computed by Python pipeline)
  median_bdt REAL,
  price_z_score REAL,
  is_price_outlier INTEGER DEFAULT 0,

  -- Embeddable text (built by Python pipeline)
  search_text TEXT,

  source TEXT DEFAULT 'egp',
  scraped_at TEXT,
  ingested_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. Beneficial ownership (vendor directors)
-- ============================================================
-- One vendor can win multiple contracts. One contract can have
-- multiple beneficial owners. Cross-referencing these is the
-- basis for vendor-collusion detection.

CREATE TABLE IF NOT EXISTS vendor_directors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tender_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  vendor_name_normalized TEXT,
  director_name TEXT NOT NULL,
  designation TEXT,
  ownership_pct REAL,
  country TEXT,
  district TEXT,
  ministry TEXT,

  FOREIGN KEY (tender_id) REFERENCES contracts(tender_id)
);

-- ============================================================
-- 3. FTS5 virtual table for keyword search
-- ============================================================
-- Backs the BM25 sparse-retrieval leg of hybrid search.

DROP TABLE IF EXISTS contracts_fts;
CREATE VIRTUAL TABLE contracts_fts USING fts5(
  tender_id, tender_ref_no, package_name, ministry, division,
  agency, procuring_entity_name, procuring_entity_district,
  procurement_method, winner_name, search_text,
  content='contracts', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
);

-- Triggers to keep FTS5 in sync with the contracts table.
DROP TRIGGER IF EXISTS contracts_ai;
CREATE TRIGGER contracts_ai AFTER INSERT ON contracts BEGIN
  INSERT INTO contracts_fts(rowid, tender_id, tender_ref_no, package_name, ministry, division,
                           agency, procuring_entity_name, procuring_entity_district,
                           procurement_method, winner_name, search_text)
  VALUES (new.rowid, new.tender_id, new.tender_ref_no, new.package_name, new.ministry,
          new.division, new.agency, new.procuring_entity_name,
          new.procuring_entity_district, new.procurement_method, new.winner_name,
          new.search_text);
END;

DROP TRIGGER IF EXISTS contracts_ad;
CREATE TRIGGER contracts_ad AFTER DELETE ON contracts BEGIN
  INSERT INTO contracts_fts(contracts_fts, rowid, tender_id, tender_ref_no, package_name,
                            ministry, division, agency, procuring_entity_name,
                            procuring_entity_district, procurement_method, winner_name,
                            search_text)
  VALUES ('delete', old.rowid, old.tender_id, old.tender_ref_no, old.package_name,
          old.ministry, old.division, old.agency, old.procuring_entity_name,
          old.procuring_entity_district, old.procurement_method, old.winner_name,
          old.search_text);
END;

DROP TRIGGER IF EXISTS contracts_au;
CREATE TRIGGER contracts_au AFTER UPDATE ON contracts BEGIN
  INSERT INTO contracts_fts(contracts_fts, rowid, tender_id, tender_ref_no, package_name,
                            ministry, division, agency, procuring_entity_name,
                            procuring_entity_district, procurement_method, winner_name,
                            search_text)
  VALUES ('delete', old.rowid, old.tender_id, old.tender_ref_no, old.package_name,
          old.ministry, old.division, old.agency, old.procuring_entity_name,
          old.procuring_entity_district, old.procurement_method, old.winner_name,
          old.search_text);
  INSERT INTO contracts_fts(rowid, tender_id, tender_ref_no, package_name, ministry, division,
                           agency, procuring_entity_name, procuring_entity_district,
                           procurement_method, winner_name, search_text)
  VALUES (new.rowid, new.tender_id, new.tender_ref_no, new.package_name, new.ministry,
          new.division, new.agency, new.procuring_entity_name,
          new.procuring_entity_district, new.procurement_method, new.winner_name,
          new.search_text);
END;

-- ============================================================
-- 4. Indexes for common filter shapes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_district ON contracts(procuring_entity_district);
CREATE INDEX IF NOT EXISTS idx_ministry ON contracts(ministry);
CREATE INDEX IF NOT EXISTS idx_method ON contracts(procurement_method);
CREATE INDEX IF NOT EXISTS idx_winner ON contracts(winner_name_normalized);
CREATE INDEX IF NOT EXISTS idx_outlier ON contracts(is_price_outlier);
CREATE INDEX IF NOT EXISTS idx_signing_date ON contracts(contract_signing_date);
CREATE INDEX IF NOT EXISTS idx_price ON contracts(contract_price_bdt);

CREATE INDEX IF NOT EXISTS idx_vd_vendor ON vendor_directors(vendor_name_normalized);
CREATE INDEX IF NOT EXISTS idx_vd_director ON vendor_directors(director_name);
CREATE INDEX IF NOT EXISTS idx_vd_tender ON vendor_directors(tender_id);

-- ============================================================
-- 5. Query log (for the demo "popular questions" widget)
-- ============================================================

CREATE TABLE IF NOT EXISTS query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_text TEXT NOT NULL,
  query_language TEXT,
  results_count INTEGER,
  latency_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);