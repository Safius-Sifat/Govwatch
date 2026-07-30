"""
e-GP Awarded Contracts Spider.

Strategy:
1. GET the listing page once to establish an ASP.NET session cookie.
2. POST to AdvSearchNOA.jsp with `pageNo=1&size=<BIG>` to fetch the first
   big chunk of awarded contracts in one shot (the response includes a
   hidden `totalPages` input so we know how many pages exist).
3. For each contract row in the listing, enqueue a request for the
   detail page (ViewAwardedContracts.jsp) — but deduplicate by
   tender_id so we only fetch each contract once even if it appears in
   multiple pages.
4. Parse the detail page to extract the full schema, including the
   beneficial ownership table.
5. Yield a single ContractAward item per detail page.
"""

import re
from datetime import datetime, timezone
from urllib.parse import urljoin

import scrapy

from egp_scraper.items import ContractAward


BASE_URL = "https://www.eprocure.gov.bd"
LISTING_URL = f"{BASE_URL}/resources/common/AdvSearchNOA.jsp"
LISTING_API = f"{BASE_URL}/SearchNoaServlet"
DETAIL_PATH = "/resources/common/ViewAwardedContracts.jsp"


class EgpContractsSpider(scrapy.Spider):
    name = "egp_contracts"

    custom_settings = {
        "DOWNLOAD_DELAY": 1.2,
        "CONCURRENT_REQUESTS": 3,
    }

    def __init__(self, page_size=500, max_pages=5, *args, **kwargs):
        """
        Args:
            page_size: how many rows per listing POST (server caps at ~500).
            max_pages: cap the number of listing pages to crawl (for testing).
        """
        super().__init__(*args, **kwargs)
        self.page_size = int(page_size)
        self.max_pages = int(max_pages)
        self.seen_tender_ids = set()
        self.total_pages_seen = None

    async def start(self):
        # Step 1: warm the ASP.NET session with a GET to the listing page.
        # In Scrapy 2.13+ the engine calls `start()` (async) instead of
        # `start_requests()` (sync), so we forward here to keep both APIs alive.
        for req in self.start_requests():
            yield req

    def start_requests(self):
        # Step 1: warm the ASP.NET session with a GET to the listing page.
        yield scrapy.Request(
            url=LISTING_URL,
            callback=self.after_warmup,
            dont_filter=True,
            meta={"phase": "warmup"},
        )

    def after_warmup(self, response):
        """After warming the session, kick off the first POST."""
        self.logger.info(f"[warmup] Got session cookies; response status {response.status}")
        yield from self.fetch_listing_page(page_no=1)

    def fetch_listing_page(self, page_no):
        """POST to the SearchNoaServlet endpoint to fetch a page of contract rows.

        The portal's JSP page (/AdvSearchNOA.jsp) is just the search form; the
        actual results are returned by the AJAX servlet /SearchNoaServlet.
        """
        payload = {
            "keyword": "",
            "pageNo": str(page_no),
            "size": str(self.page_size),
        }

        yield scrapy.FormRequest(
            url=LISTING_API,
            formdata=payload,
            callback=self.parse_listing,
            dont_filter=True,
            meta={"page_no": page_no},
        )

    def parse_listing(self, response):
        page_no = response.meta["page_no"]

        # Discover total pages from the hidden input (only present on first page).
        if self.total_pages_seen is None:
            total_raw = response.xpath(
                "//input[@id='totalPages']/@value"
            ).get()
            if total_raw:
                self.total_pages_seen = int(total_raw)
                self.logger.info(
                    f"[listing] Server reports {self.total_pages_seen} total listing pages"
                )
            else:
                self.logger.warning(
                    "[listing] Could not find totalPages input; using max_pages cap"
                )

        # Parse each row in the listing table.
        rows = response.xpath("//tr[contains(@class,'bgColor-')]")
        self.logger.info(
            f"[listing] page {page_no}: {len(rows)} rows"
        )

        for row in rows:
            # The detail link is the one pointing at ViewAwardedContracts.jsp.
            detail_href = row.xpath(
                ".//a[contains(@href, 'ViewAwardedContracts.jsp')]/@href"
            ).get()
            if not detail_href:
                continue

            # Extract tender_id and pkg_lot_id from the URL.
            url_match = re.search(r"tenderid=(\d+)&.*?pkgLotId=(\d+)", detail_href)
            if not url_match:
                # Try the other order, just in case.
                url_match = re.search(r"pkgLotId=(\d+)&tenderid=(\d+)", detail_href)
                if url_match:
                    tender_id = url_match.group(2)
                    pkg_lot_id = url_match.group(1)
                else:
                    self.logger.warning(f"[listing] Could not parse IDs from {detail_href}")
                    continue
            else:
                tender_id = url_match.group(1)
                pkg_lot_id = url_match.group(2)

            # Deduplicate.
            if tender_id in self.seen_tender_ids:
                continue
            self.seen_tender_ids.add(tender_id)

            detail_url = urljoin(BASE_URL, detail_href)

            # Pre-extract the listing-level fields so we have them even
            # if the detail page fetch fails (graceful degradation).
            listing_data = self.parse_listing_row(row, tender_id, pkg_lot_id, detail_url)

            yield scrapy.Request(
                url=detail_url,
                callback=self.parse_detail,
                errback=self.handle_detail_error,
                dont_filter=True,
                meta={
                    "tender_id": tender_id,
                    "pkg_lot_id": pkg_lot_id,
                    "listing_data": listing_data,
                },
            )

        # Decide whether to fetch the next page.
        next_page = page_no + 1
        should_continue = (
            next_page <= self.max_pages
            and (
                self.total_pages_seen is None
                or next_page <= self.total_pages_seen
            )
        )
        if should_continue:
            yield from self.fetch_listing_page(page_no=next_page)
        else:
            self.logger.info(
                f"[listing] Stopping at page {page_no}; "
                f"total tender_ids seen: {len(self.seen_tender_ids)}"
            )

    # ------------------------------------------------------------------
    # Listing-level parsing (extracts everything we can see without
    # fetching the detail page — useful for fallback / fast mode).
    # ------------------------------------------------------------------

    def parse_listing_row(self, row, tender_id, pkg_lot_id, detail_url):
        """Extract the row-level data from the listing table."""
        cells = row.xpath(".//td")

        def cell_text(idx):
            if idx < len(cells):
                return " ".join(cells[idx].xpath(".//text()").getall()).strip()
            return ""

        def cell_xpath_text(idx, xpath):
            if idx < len(cells):
                return " ".join(cells[idx].xpath(xpath).getall()).strip()
            return ""

        ministry_raw = cell_text(1)
        # Ministry and Division are separated by <br/>
        parts = re.split(r"\s*\b(and|এবং)\b\s*|\n|<br\s*/?>", ministry_raw, flags=re.IGNORECASE)
        ministry = parts[0].strip() if parts else ministry_raw
        division = parts[-1].strip() if len(parts) > 1 else ""

        # Title / ref / package name all live in cell 2.
        tender_ref_no = cell_xpath_text(2, ".//p/text()").strip()
        package_name = cell_xpath_text(2, ".//span[@class='more']/text()").strip()
        advertisement_date = cell_xpath_text(2, ".//span/text()[last()]").strip()

        # Cell 3: procuring entity + procurement method (separated by <br/>)
        pe_raw = cell_text(3)
        pe_lines = [l.strip() for l in re.split(r"<br\s*/?>|\n", pe_raw) if l.strip()]
        procuring_entity_listing = pe_lines[0] if pe_lines else ""
        procurement_method_listing = pe_lines[1] if len(pe_lines) > 1 else ""

        district = cell_text(4)
        signing_date = cell_text(5)
        winner = cell_text(6)
        contract_amount_raw = cell_text(7)

        # Normalize the contract amount (in crore).
        amount_match = re.search(r"([\d.]+)", contract_amount_raw)
        contract_amount_crore = float(amount_match.group(1)) if amount_match else 0.0

        return {
            "ministry": ministry,
            "division": division,
            "tender_ref_no": tender_ref_no,
            "package_name": package_name,
            "advertisement_date_listing": advertisement_date,
            "procuring_entity_listing": procuring_entity_listing,
            "procurement_method_listing": procurement_method_listing,
            "district_listing": district,
            "signing_date_listing": signing_date,
            "winner_listing": winner,
            "contract_amount_crore_listing": contract_amount_crore,
            "tender_id": tender_id,
            "pkg_lot_id": pkg_lot_id,
            "detail_url": detail_url,
        }

    # ------------------------------------------------------------------
    # Detail page parsing.
    # ------------------------------------------------------------------

    def parse_detail(self, response):
        """Parse a contract detail page into a full ContractAward item."""
        tender_id = response.meta["tender_id"]
        pkg_lot_id = response.meta["pkg_lot_id"]
        listing = response.meta.get("listing_data", {}) or {}

        # e-GP uses tables with class formStyle_1 for the key/value layout.
        # For each labeled row, the first td is the label, second td is the value.
        fields = self.parse_form_tables(response)

        # Beneficial ownership table.
        beneficial_owners = self.parse_beneficial_owners(response)

        item = ContractAward()

        # Identity
        item["tender_id"] = tender_id
        item["pkg_lot_id"] = pkg_lot_id
        item["tender_ref_no"] = (
            fields.get("Invitation/Proposal Ref. No.")
            or listing.get("tender_ref_no")
            or ""
        )
        item["package_no"] = fields.get("Tender/Proposal Package No.", "")
        item["package_name"] = (
            fields.get("Tender/Proposal Package Name")
            or listing.get("package_name")
            or ""
        )
        item["detail_url"] = listing.get("detail_url") or response.url

        # Procuring entity
        item["ministry"] = (
            fields.get("Ministry/Division") or listing.get("ministry") or ""
        ).split("\n")[0].strip()
        item["division"] = listing.get("division", "")
        item["agency"] = fields.get("Agency", "")
        item["procuring_entity_name"] = (
            fields.get("Procuring Entity Name")
            or listing.get("procuring_entity_listing")
            or ""
        )
        item["procuring_entity_district"] = (
            fields.get("Procuring Entity District")
            or listing.get("district_listing")
            or ""
        )
        item["procuring_entity_code"] = fields.get("Procuring Entity Code", "")
        item["authorised_officer_name"] = fields.get("Name of Authorised Officer", "")
        item["authorised_officer_designation"] = fields.get(
            "Designation of Authorised Officer", ""
        )

        # Classification
        item["procurement_method"] = (
            fields.get("Procurement Method (National/Internation)")
            or listing.get("procurement_method_listing")
            or ""
        )
        item["procurement_category"] = fields.get("Contract Award for", "")
        # Budget info may be combined; split on first whitespace.
        budget_raw = fields.get("Budget and Source of Funds", "")
        budget_parts = budget_raw.split()
        item["budget_type"] = budget_parts[0] if budget_parts else ""
        item["funding_source"] = " ".join(budget_parts[1:]) if len(budget_parts) > 1 else ""
        item["development_partner"] = fields.get("Development Partner (if applicable)", "")
        item["project_code"] = fields.get("Project/Program Code (if applicable)", "")
        item["project_name"] = fields.get("Project/Program Name (if applicable)", "")

        # Dates
        item["advertisement_date"] = (
            fields.get("Date of Advertisement")
            or listing.get("advertisement_date_listing")
            or ""
        )
        item["notification_award_date"] = fields.get(
            "Date of Notification of Award", ""
        )
        item["contract_signing_date"] = (
            fields.get("Date of Contract Signing")
            or listing.get("signing_date_listing")
            or ""
        )
        item["contract_start_date"] = fields.get(
            "Proposed Date of Contract Start", ""
        )
        item["contract_completion_date"] = fields.get(
            "Proposed Date of Contract Completion", ""
        )

        # Winner
        item["winner_name"] = self.normalize_winner_name(
            fields.get(
                "Name of the Economic Operator (Supplier/Contractor/Service Provider/Consultant)",
                listing.get("winner_listing", ""),
            )
        )
        item["winner_tenderer_id"] = fields.get(
            "Tenderer ID of the Economic Operator (If any)", ""
        )
        item["winner_business_address"] = fields.get(
            "Business Address of the Economic Operator", ""
        )
        item["delivery_location"] = fields.get(
            "Location of Delivery/Works/Service Delivery", ""
        )

        # Financial
        contract_price_raw = fields.get("Contract Price", "")
        item["contract_price_raw"] = contract_price_raw
        item["contract_price_bdt"] = self.parse_bdt_amount(contract_price_raw)

        # Beneficial ownership
        item["beneficial_owners"] = beneficial_owners

        # Provenance
        item["scraped_at"] = datetime.now(timezone.utc).isoformat()
        item["source"] = "egp"

        yield item

    def handle_detail_error(self, failure):
        """If a detail page fails, fall back to whatever the listing gave us."""
        request = failure.request
        listing = request.meta.get("listing_data", {})
        self.logger.warning(
            f"[detail-error] Failed {listing.get('detail_url')}: {failure.value}"
        )

        # Emit a partial item so we don't lose the listing-level signal.
        item = ContractAward()
        item["tender_id"] = listing.get("tender_id", "")
        item["pkg_lot_id"] = listing.get("pkg_lot_id", "")
        item["tender_ref_no"] = listing.get("tender_ref_no", "")
        item["package_name"] = listing.get("package_name", "")
        item["detail_url"] = listing.get("detail_url", "")
        item["ministry"] = listing.get("ministry", "")
        item["division"] = listing.get("division", "")
        item["procuring_entity_name"] = listing.get("procuring_entity_listing", "")
        item["procuring_entity_district"] = listing.get("district_listing", "")
        item["procurement_method"] = listing.get("procurement_method_listing", "")
        item["advertisement_date"] = listing.get("advertisement_date_listing", "")
        item["contract_signing_date"] = listing.get("signing_date_listing", "")
        item["winner_name"] = self.normalize_winner_name(listing.get("winner_listing", ""))
        item["contract_price_bdt"] = listing.get("contract_amount_crore_listing", 0.0) * 1e7
        item["beneficial_owners"] = []
        item["scraped_at"] = datetime.now(timezone.utc).isoformat()
        item["source"] = "egp"
        yield item

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def parse_form_tables(self, response):
        """
        Walk all tables with class formStyle_1 and extract the
        {label: value} dict. Labels live in td.ff; values live in the
        next td in the same row.
        """
        result = {}

        for table in response.xpath("//table[contains(@class,'formStyle_1')]"):
            for row in table.xpath(".//tr"):
                cells = row.xpath(".//td")
                if len(cells) < 2:
                    continue
                label = " ".join(cells[0].xpath(".//text()").getall()).strip()
                label = re.sub(r"\s+", " ", label).rstrip(":").strip()
                if not label:
                    continue
                # Value may be in cells[1]; for the beneficial ownership
                # section the value is in a div, but we don't try to
                # parse that here (parse_beneficial_owners handles it).
                value = " ".join(cells[1].xpath(".//text()").getall()).strip()
                value = re.sub(r"\s+", " ", value)
                result[label] = value

        return result

    def parse_beneficial_owners(self, response):
        """
        Parse the beneficial ownership table. The HTML pattern is:

        <table class="viewShareholdersTable, tableList_1">
          <thead>...</thead>
          <tbody>
            <tr><td>1</td><td>Name</td><td>Designation</td><td>Pct</td><td>Country</td></tr>
            ...
          </tbody>
        </table>
        """
        owners = []
        for row in response.xpath(
            "//table[contains(@class,'viewShareholdersTable')]/tbody/tr"
        ):
            cells = row.xpath(".//td")
            if len(cells) < 5:
                continue
            try:
                ownership_pct = float(
                    " ".join(cells[3].xpath(".//text()").getall()).strip()
                )
            except (ValueError, TypeError):
                ownership_pct = None
            owners.append(
                {
                    "name": " ".join(cells[1].xpath(".//text()").getall()).strip(),
                    "designation": " ".join(cells[2].xpath(".//text()").getall()).strip(),
                    "ownership_pct": ownership_pct,
                    "country": " ".join(cells[4].xpath(".//text()").getall()).strip(),
                }
            )
        return owners

    def parse_bdt_amount(self, raw):
        """Convert a string like '1919866.516 (BDT)' to a float."""
        if not raw:
            return 0.0
        match = re.search(r"([\d,]+\.?\d*)", raw)
        if not match:
            return 0.0
        return float(match.group(1).replace(",", ""))

    def normalize_winner_name(self, raw):
        """
        Normalize vendor names so 'M/S CHOWDHURY CONSTRUCTION' and
        'M/S. Chowdhury Construction' and 'ms.chowdhury construction'
        match each other.
        """
        if not raw:
            return ""
        cleaned = raw.lower()
        cleaned = re.sub(r"\b(m/s|m/s\.|ms\.?)\b", "ms", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        # Title-case but preserve common patterns.
        return cleaned.title()