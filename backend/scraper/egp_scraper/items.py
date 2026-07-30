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