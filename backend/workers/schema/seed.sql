-- ============================================================
-- Sample seed data for local development.
-- ============================================================
-- After running schema.sql, run this to verify the schema works
-- with a couple of hand-crafted records.

INSERT INTO contracts (
  tender_id, pkg_lot_id, tender_ref_no, package_name, detail_url,
  ministry, division, agency, procuring_entity_name, procuring_entity_district,
  procurement_method, procurement_category, contract_price_bdt,
  winner_name, winner_name_normalized,
  advertisement_date, contract_signing_date, contract_completion_date,
  median_bdt, price_z_score, is_price_outlier, search_text, source
) VALUES
(
  '1299703', '2063662', 'Biram/Poura/Engg/Special/2025/01',
  'Construction of Road by Cement Concrete (CC) start from Charkai Hindupara Road to Debipur Road Via Hazardag in ward no 01',
  'https://www.eprocure.gov.bd/resources/common/ViewAwardedContracts.jsp?pkgLotId=2063662&tenderid=1299703',
  'Ministry of Local Government, Rural Development and Co-operatives',
  'Local Government Division', 'Birampur Paurashava',
  'Office of the Birampur Pourashava, Dinajpur', 'Dinajpur',
  'LTM', 'Works', 1919866.516,
  'M/S CHOWDHURY CONSTRUCTION', 'ms chowdhury construction',
  '17-Jun-2026 17:00', '30-Jul-2026', '26-Jan-2027',
  1500000.0, 0.45, 0,
  'Tender ID: 1299703. Construction of Road by Cement Concrete in Dinajpur. LTM contract awarded to M/S CHOWDHURY CONSTRUCTION for BDT 1,919,866.',
  'egp'
),
(
  '1309468', '2074761', 'DPHE/Habiganj/TubeWell/2024/08',
  'Installation of 500 Deep Tube Wells under DPHE Habiganj',
  'https://www.eprocure.gov.bd/resources/common/ViewAwardedContracts.jsp?pkgLotId=2074761&tenderid=1309468',
  'Ministry of Local Government, Rural Development and Co-operatives',
  'Local Government Division', 'Department of Public Health Engineering',
  'Office of the Executive Engineer, DPHE, Habiganj', 'Habiganj',
  'OTM', 'Works', 45000000.0,
  'M/S RAHMAN ENTERPRISE', 'ms rahman enterprise',
  '12-Aug-2024 14:00', '15-Sep-2024', '30-Jun-2025',
  14000000.0, 3.20, 1,
  'Tender ID: 1309468. DPHE Habiganj deep tube well installation. OTM contract awarded to M/S RAHMAN ENTERPRISE for BDT 45,000,000 — 310% above median.',
  'egp'
);

INSERT INTO vendor_directors (tender_id, vendor_name, vendor_name_normalized, director_name, designation, ownership_pct, country, district, ministry)
VALUES
  ('1299703', 'M/S CHOWDHURY CONSTRUCTION', 'ms chowdhury construction',
   'Md Mohibub Ul Elahi Chowdhury', 'Proprietor', 100.0, 'Bangladesh', 'Dinajpur',
   'Ministry of Local Government, Rural Development and Co-operatives'),
  ('1309468', 'M/S RAHMAN ENTERPRISE', 'ms rahman enterprise',
   'Mohammad Rahman', 'Proprietor', 100.0, 'Bangladesh', 'Habiganj',
   'Ministry of Local Government, Rural Development and Co-operatives');