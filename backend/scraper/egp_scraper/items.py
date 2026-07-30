"""
Item definitions for e-GP contract awards.

Each scraped contract award is normalized into these fields so they can be:
1. Inserted directly into Cloudflare D1
2. Embedded into Cloudflare Vectorize
3. Used to compute z-score anomalies offline
"""

import scrapy


class ContractAward(scrapy.Item):
    """A single awarded contract from e-GP."""

    # === Identity ===
    tender_id = scrapy.Field()           # e.g. "1299703"
    pkg_lot_id = scrapy.Field()          # e.g. "2063662" (used in detail URL)
    tender_ref_no = scrapy.Field()       # e.g. "Biram/Poura/Engg/Special/2025/01"
    package_no = scrapy.Field()          # e.g. "Bira/spacial/ADP/ 2025-26/W-  05"
    package_name = scrapy.Field()       # full descriptive title
    detail_url = scrapy.Field()          # canonical detail page URL

    # === Procuring entity ===
    ministry = scrapy.Field()            # e.g. "Ministry of Local Government, Rural Development and Co-operatives"
    division = scrapy.Field()            # e.g. "Local Government Division"
    agency = scrapy.Field()              # e.g. "Birampur Paurashava"
    procuring_entity_name = scrapy.Field()
    procuring_entity_district = scrapy.Field()
    procuring_entity_code = scrapy.Field()
    authorised_officer_name = scrapy.Field()
    authorised_officer_designation = scrapy.Field()

    # === Classification ===
    procurement_method = scrapy.Field()  # LTM, OTM, RFQ, etc.
    procurement_category = scrapy.Field()  # Works / Goods / Services
    budget_type = scrapy.Field()         # Revenue / Development
    funding_source = scrapy.Field()      # Government / Development Partner
    development_partner = scrapy.Field()
    project_code = scrapy.Field()
    project_name = scrapy.Field()

    # === Dates ===
    advertisement_date = scrapy.Field()
    notification_award_date = scrapy.Field()
    contract_signing_date = scrapy.Field()
    contract_start_date = scrapy.Field()
    contract_completion_date = scrapy.Field()

    # === Winner / Economic operator ===
    winner_name = scrapy.Field()         # e.g. "M/S CHOWDHURY CONSTRUCTION"
    winner_tenderer_id = scrapy.Field()  # e.g. "1191723"
    winner_business_address = scrapy.Field()
    delivery_location = scrapy.Field()

    # === Financial ===
    contract_price_bdt = scrapy.Field()  # numeric, in BDT
    contract_price_raw = scrapy.Field()  # raw text e.g. "1919866.516 (BDT)"

    # === Beneficial ownership (THE KEY ANTI-COLLUSION DATA) ===
    beneficial_owners = scrapy.Field()   # list of dicts: {name, designation, ownership_pct, country}

    # === Search optimization ===
    search_text = scrapy.Field()         # concatenated searchable text for embedding

    # === Provenance ===
    scraped_at = scrapy.Field()          # ISO timestamp
    source = scrapy.Field()              # always "egp"


class EcmsWorkStatus(scrapy.Item):
    """
    A single work-status record from the eCMS (e-Contract Monitoring System).

    Each record represents a contract being tracked over its lifecycle — it
    tells you whether the work is still ongoing, what % is physically done,
    what % has been paid out, and whether the vendor was a JV/Consortium.

    The data is keyed by tender_id (which matches ContractAward.tender_id)
    so it can be joined to the award-notices table at load time. Multiple
    eCMS rows may share the same tender_id (the portal tracks each
    contract-progress update as a separate row), but for v1 we keep only
    the most recent one per tender_id via DeduplicationPipeline.
    """

    # === Identity (joins to ContractAward.tender_id) ===
    tender_id = scrapy.Field()           # e.g. "1249315"
    ecms_id = scrapy.Field()             # e-GP internal Id (for the detail URL)
    detail_url = scrapy.Field()          # VieweCmsDetails.jsp?wcs=...&Id=...
    experience_certificate_no = scrapy.Field()  # e.g. "GD_08_2025-26/e-GP/..."

    # === Procuring entity (mostly mirrors ContractAward; denormalized for fast lookup) ===
    ministry = scrapy.Field()
    organization = scrapy.Field()
    pe_office_name = scrapy.Field()
    pe_name = scrapy.Field()             # the individual PE officer

    # === Tender metadata ===
    tender_ref_no = scrapy.Field()
    package_name = scrapy.Field()
    package_no = scrapy.Field()
    procurement_nature = scrapy.Field()  # Goods / Works / Services
    procurement_method = scrapy.Field()  # OTM / RFQ / LTM / ...
    work_category = scrapy.Field()
    name_of_work = scrapy.Field()
    tender_publication_date = scrapy.Field()
    tender_type = scrapy.Field()         # "e-GP" / Others

    # === Winner (denormalized) ===
    winner_name = scrapy.Field()
    winner_tenderer_id = scrapy.Field()
    is_jvca = scrapy.Field()             # YES / NO (Joint Venture / Consortium)

    # === Lifecycle / status (THE KEY NEW DATA) ===
    work_status = scrapy.Field()         # Completed / Ongoing / Cancelled / ...
    physical_progress_pct = scrapy.Field()       # e.g. 100.00
    financial_progress_pct = scrapy.Field()      # e.g. 50.00
    date_of_physical_progress = scrapy.Field()   # last date progress was reported
    date_of_financial_progress = scrapy.Field()

    # === Contract dates (ACTUAL, not proposed) ===
    contract_start_date = scrapy.Field()      # actual, when contract took effect
    contract_end_date = scrapy.Field()        # actual, when contract completed/will complete
    contract_no = scrapy.Field()
    contract_value_bdt = scrapy.Field()       # numeric BDT

    # === Free-form commentary ===
    remarks = scrapy.Field()
    pe_comments = scrapy.Field()

    # === Beneficial ownership (same shape as ContractAward — for cross-reference) ===
    beneficial_owners = scrapy.Field()

    # === Search optimization ===
    search_text = scrapy.Field()             # built by SearchTextPipeline

    # === Provenance ===
    scraped_at = scrapy.Field()
    source = scrapy.Field()                  # always "egp_ecms"