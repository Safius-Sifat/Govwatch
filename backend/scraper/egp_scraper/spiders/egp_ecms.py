"""
eCMS Work-Status Spider.

Strategy:
1. GET the AdvSearchNOA.jsp page once to establish an ASP.NET session
   (same warm-up trick as egp_contracts; the portal shares session state
   across its servlets).
2. POST to /AdvSearcheCMSServlet with `action=geteCMSList`, `statusTab=
   eTenders`, `pageNo=1`, `size=<n>` to fetch a page of tracked contracts.
   The servlet returns rows in HTML (TRs with class bgColor-white / -Green).
3. For each row, parse:
     - tender_id (extracted from the embedded ref-no cell)
     - work_status (Completed / Ongoing / Cancelled / ...)
     - the Id parameter needed to GET the detail page
   Skip any tender_ids we've already seen (dedup at listing level to
   avoid hammering the detail endpoint for the same contract across
   multiple page overlaps).
4. POST to /AdvSearcheCMSServlet again to walk forward pages up to
   `max_pages`.
5. For each unique row, GET VieweCmsDetails.jsp?wcs=<status>&Id=<id>
   to pull the full beneficiary-ownership table and the work-status
   payload (progress %, dates, JVCA flag, etc.).
6. Yield one EcmsWorkStatus item per detail page. The
   DeduplicationPipeline keeps only one record per tender_id (the most
   recent we encountered first — the portal serves them newest-first,
   so this is the freshest data we have).
"""

import re
from datetime import datetime, timezone
from urllib.parse import urljoin

import scrapy

from egp_scraper.items import EcmsWorkStatus


BASE_URL = "https://www.eprocure.gov.bd"
WARMUP_URL = f"{BASE_URL}/resources/common/AdvSearchNOA.jsp"
LISTING_API = f"{BASE_URL}/AdvSearcheCMSServlet"
DETAIL_PATH = "/resources/common/VieweCmsDetails.jsp"


class EgpEcmsSpider(scrapy.Spider):
    name = "egp_ecms"

    custom_settings = {
        "DOWNLOAD_DELAY": 1.2,
        "CONCURRENT_REQUESTS": 3,
    }

    def __init__(self, page_size=500, max_pages=5, *args, **kwargs):
        """
        Args:
            page_size: how many rows per listing POST.
            max_pages: cap on how many listing pages to crawl.
        """
        super().__init__(*args, **kwargs)
        self.page_size = int(page_size)
        self.max_pages = int(max_pages)
        self.seen_tender_ids = set()
        self.total_pages_seen = None

    async def start(self):
        # In Scrapy 2.13+ the engine calls async start() instead of
        # the legacy start_requests(); forward so we support both.
        for req in self.start_requests():
            yield req

    def start_requests(self):
        # Step 1: warm the ASP.NET session via the AdvSearchNOA.jsp page.
        yield scrapy.Request(
            url=WARMUP_URL,
            callback=self.after_warmup,
            dont_filter=True,
            meta={"phase": "warmup"},
        )

    def after_warmup(self, response):
        """After warming the session, kick off the first POST."""
        self.logger.info(
            f"[warmup] Got session cookies; response status {response.status}"
        )
        yield from self.fetch_listing_page(page_no=1)

    def fetch_listing_page(self, page_no):
        """POST to the eCMSServlet endpoint to fetch a page of tracked contracts."""
        payload = {
            "action": "geteCMSList",
            "keyword": "",
            "officeId": "0",
            "contractAwardTo": "",
            "contractStartDtFrom": "",
            "contractStartDtTo": "",
            "contractEndDtFrom": "",
            "contractEndDtTo": "",
            "departmentId": "",
            "tenderId": "",
            "procurementMethod": "",
            "procurementNature": "",
            "contAwrdSearchOpt": "Contains",
            "exCertSearchOpt": "Contains",
            "exCertificateNo": "",
            "tendererId": "",
            "procType": "",
            "statusTab": "eTenders",
            "pageNo": str(page_no),
            "size": str(self.page_size),
            "workStatus": "All",
        }
        yield scrapy.FormRequest(
            url=LISTING_API,
            formdata=payload,
            callback=self.parse_listing,
            dont_filter=True,
            meta={"page_no": page_no},
        )

    def parse_listing(self, response):
        """Parse the listing rows; enqueue detail pages for new tender_ids."""
        page_no = response.meta["page_no"]

        rows = response.xpath("//tr[contains(@class,'bgColor-')]")
        self.logger.info(f"[listing] page {page_no}: {len(rows)} rows")

        enqueued = 0
        for row in rows:
            row_data = self.parse_listing_row(row)
            if not row_data or not row_data.get("tender_id"):
                continue
            tid = row_data["tender_id"]

            # Listing-level dedup (in case the same contract appears across
            # multiple pages or retries).
            if tid in self.seen_tender_ids:
                continue
            self.seen_tender_ids.add(tid)

            detail_url = urljoin(BASE_URL, row_data["detail_href"])
            yield scrapy.Request(
                url=detail_url,
                callback=self.parse_detail,
                errback=self.handle_detail_error,
                dont_filter=True,
                meta={"row_data": row_data},
            )
            enqueued += 1

        # Walk forward one page at a time.
        next_page = page_no + 1
        if next_page <= self.max_pages:
            yield from self.fetch_listing_page(page_no=next_page)
        else:
            self.logger.info(
                f"[listing] Stopping at page {page_no}; "
                f"total tender_ids seen: {len(self.seen_tender_ids)} "
                f"(enqueued for detail: {enqueued})"
            )

    # ------------------------------------------------------------------
    # Listing-level parsing
    # ------------------------------------------------------------------

    def parse_listing_row(self, row):
        """Extract everything we can see at the listing level.

        Returns a dict with the subset of fields we can get cheaply:
        tender_id, work_status, detail_href, ministry, organization,
        procurement_*, winner, dates, value. The detail page fills in
        the rest (beneficial owners, JVCA, progress %, etc.).
        """
        def cell_text(idx):
            cells = row.xpath(".//td")
            if idx < len(cells):
                return " ".join(cells[idx].xpath(".//text()").getall()).strip()
            return ""

        def cell_html(idx):
            """Get raw HTML of a cell (to inspect <a href>, <br/>, etc.)."""
            cells = row.xpath(".//td")
            if idx < len(cells):
                # Return innerHTML-ish — Scrapy gives us the outerTag, so
                # take .//node() which flattens nested text + tags.
                return " ".join(
                    [
                        t.strip()
                        for t in cells[idx].xpath(".//text()").getall()
                        if t.strip()
                    ]
                )
            return ""

        # Cell 1: "Ministry of X, Department of Y, Org Z" (3 parts, <br/>-joined)
        ministry_raw = cell_text(1)
        ministry_parts = [p.strip() for p in re.split(r",\s*|\n", ministry_raw) if p.strip()]

        # Cell 2: "Goods, NCT, RFQ" — three tokens separated by commas
        proc_tokens = [t.strip() for t in cell_text(2).split(",") if t.strip()]

        # Cell 3: "<tender_id>, <tender_ref_no><br/><a href='VieweCmsDetails...'>Title</a><br/><date>"
        # Use row-level XPath for the link (cell-level .//td[3]//a was unreliable
        # because of single-quoted attributes in the <a> tag).
        detail_href = row.xpath(
            ".//a[contains(@href,'VieweCmsDetails')]/@href"
        ).get() or ""

        # Extract tender_id from the link first (most reliable),
        # else fall back to the first numeric token in the cell text.
        tender_id = ""
        if detail_href:
            m = re.search(r"[?&]tenderid=(\d+)", detail_href)
            if m:
                tender_id = m.group(1)
        if not tender_id:
            m = re.search(r"\b(\d{6,})\b", cell_text(3))
            if m:
                tender_id = m.group(1)

        # Cell 3 also contains the package name inside the <a> tag.
        pkg_name = row.xpath(
            ".//a[contains(@href,'VieweCmsDetails')]/text()"
        ).get(default="").strip()

        # Reference number: the second token in cell 3 ("<id>, <ref>").
        # It's everything between the id and the <a> tag, so strip
        # everything after the first <a> link in the cell.
        cell3_html = row.xpath(
            ".//td[3]//node()[not(self::a) and not(parent::a)]"
        )
        ref_text_parts = []
        for n in cell3_html:
            t = " ".join(n.xpath(".//text()").getall()).strip() if hasattr(n, "xpath") else (n.strip() if isinstance(n, str) else "")
            if t:
                ref_text_parts.append(t)
        ref_raw = " ".join(ref_text_parts)
        ref_match = re.match(r"\s*\d+\s*,?\s*(.+)", ref_raw)
        tender_ref_no = ref_match.group(1).strip() if ref_match else ""

        # Publication date = last date in cell 3.
        date_match = re.findall(r"\d{1,2}-[A-Za-z]{3}-\d{4}", cell_text(3))
        pub_date = date_match[-1] if date_match else ""

        # Cell 4: winner name
        # Cell 5: winner tenderer_id
        # Cell 6: experience certificate no
        # Cell 7: contract_value (just a number)
        # Cell 8: "StartDate\nEndDate"
        # Cell 9: work_status (Completed / Ongoing / Cancelled)
        date_pair = re.findall(r"\d{1,2}-[A-Za-z]{3}-\d{4}", cell_text(8))
        contract_start_date = date_pair[0] if date_pair else ""
        contract_end_date = date_pair[1] if len(date_pair) > 1 else ""

        value_raw = cell_text(7).replace(",", "")
        try:
            contract_value_bdt = float(value_raw)
        except (ValueError, TypeError):
            contract_value_bdt = 0.0

        return {
            "tender_id": tender_id,
            "detail_href": detail_href,
            "ministry": ministry_parts[0] if len(ministry_parts) > 0 else "",
            "organization": ministry_parts[1] if len(ministry_parts) > 1 else "",
            "pe_office_name": ministry_parts[2] if len(ministry_parts) > 2 else "",
            "tender_ref_no": tender_ref_no,
            "package_name": pkg_name,
            "tender_publication_date": pub_date,
            "procurement_nature": proc_tokens[0] if len(proc_tokens) > 0 else "",
            "procurement_type": proc_tokens[1] if len(proc_tokens) > 1 else "",
            "procurement_method": proc_tokens[2] if len(proc_tokens) > 2 else "",
            "winner_name": cell_text(4),
            "winner_tenderer_id": cell_text(5),
            "experience_certificate_no": cell_html(6),
            "contract_value_bdt": contract_value_bdt,
            "contract_start_date": contract_start_date,
            "contract_end_date": contract_end_date,
            "work_status": cell_text(9),
        }

    # ------------------------------------------------------------------
    # Detail page parsing
    # ------------------------------------------------------------------

    def parse_detail(self, response):
        """Parse the full eCMS detail page into an EcmsWorkStatus item."""
        row = response.meta["row_data"]

        # Parse the labelled ff/td table.
        fields = self.parse_form_tables(response)

        # Beneficial ownership table.
        beneficial_owners = self.parse_beneficial_owners(response)

        item = EcmsWorkStatus()

        # Identity
        item["tender_id"] = row.get("tender_id", "")
        item["ecms_id"] = self._ecms_id_from_url(row.get("detail_href", ""))
        item["detail_url"] = response.url
        item["experience_certificate_no"] = fields.get("Work Experience Certificate No",
                                                       row.get("experience_certificate_no", ""))

        # Procuring entity
        item["ministry"] = fields.get("Ministry/Division", row.get("ministry", ""))
        item["organization"] = fields.get("Organization Name", row.get("organization", ""))
        item["pe_office_name"] = fields.get("PE Office Name", row.get("pe_office_name", ""))
        item["pe_name"] = fields.get("PE Name", "")

        # Tender metadata
        item["tender_ref_no"] = fields.get("Tender Ref No", row.get("tender_ref_no", ""))
        item["package_name"] = fields.get("Package Name", row.get("package_name", ""))
        item["package_no"] = fields.get("Package No", "")
        item["procurement_nature"] = fields.get("Procurement Nature", row.get("procurement_nature", ""))
        item["procurement_method"] = fields.get("Procurement Method", row.get("procurement_method", ""))
        item["work_category"] = fields.get("Work Category", "")
        item["name_of_work"] = fields.get("Name of Work", row.get("package_name", ""))
        item["tender_publication_date"] = fields.get("Tender Publication Date",
                                                     row.get("tender_publication_date", ""))
        item["tender_type"] = fields.get("Tender Type", "")

        # Winner
        item["winner_name"] = fields.get("Company Name", row.get("winner_name", ""))
        item["winner_tenderer_id"] = row.get("winner_tenderer_id", "")
        item["is_jvca"] = fields.get("Is JVCA", "")

        # Lifecycle / status (THE KEY NEW FIELDS)
        item["work_status"] = fields.get("Work Completion Status", row.get("work_status", ""))
        item["physical_progress_pct"] = self._to_float(fields.get("Physical Progress (%)"))
        item["financial_progress_pct"] = self._to_float(fields.get("Financial Progress (%)"))
        item["date_of_physical_progress"] = fields.get("Date of Physical Progress", "")
        item["date_of_financial_progress"] = fields.get("Date of Financial Progress", "")

        # Contract dates (actual)
        item["contract_start_date"] = fields.get("Contract Start Date",
                                                  row.get("contract_start_date", ""))
        item["contract_end_date"] = fields.get("Contract End Date",
                                                row.get("contract_end_date", ""))
        item["contract_no"] = fields.get("Contract No.", "")
        contract_value_raw = fields.get("Contract Value (Equivalent in BDT)", "")
        try:
            item["contract_value_bdt"] = float(contract_value_raw.replace(",", ""))
        except (ValueError, AttributeError):
            item["contract_value_bdt"] = row.get("contract_value_bdt", 0.0)

        # Commentary
        item["remarks"] = fields.get("Remarks", "")
        item["pe_comments"] = fields.get("Comments By PE", "")

        # Beneficial ownership (cross-reference with ContractAward)
        item["beneficial_owners"] = beneficial_owners

        # Provenance
        item["scraped_at"] = datetime.now(timezone.utc).isoformat()
        item["source"] = "egp_ecms"

        yield item

    def handle_detail_error(self, failure):
        """If a detail page fails, fall back to listing-level data."""
        request = failure.request
        row = request.meta.get("row_data", {})
        self.logger.warning(
            f"[detail-error] Failed {row.get('detail_href','')}: {failure.value}"
        )

        item = EcmsWorkStatus()
        for key, value in row.items():
            if key != "detail_href" and key in EcmsWorkStatus.fields.keys():
                item[key] = value
        item["ecms_id"] = self._ecms_id_from_url(row.get("detail_href", ""))
        item["detail_url"] = urljoin(BASE_URL, row.get("detail_href", ""))
        item["beneficial_owners"] = []
        item["physical_progress_pct"] = None
        item["financial_progress_pct"] = None
        item["scraped_at"] = datetime.now(timezone.utc).isoformat()
        item["source"] = "egp_ecms"
        yield item

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _ecms_id_from_url(self, href):
        """Extract the Id parameter from a VieweCmsDetails.jsp URL."""
        if not href:
            return ""
        m = re.search(r"[?&]Id=(\d+)", href)
        return m.group(1) if m else ""

    def _to_float(self, raw):
        if not raw:
            return None
        try:
            return float(str(raw).replace(",", "").strip())
        except (ValueError, TypeError):
            return None

    def parse_form_tables(self, response):
        """Same generic {label: value} extractor as the contracts spider."""
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
                value = " ".join(cells[1].xpath(".//text()").getall()).strip()
                value = re.sub(r"\s+", " ", value)
                result[label] = value
        return result

    def parse_beneficial_owners(self, response):
        """Same viewShareholdersTable parser as the contracts spider."""
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
            owners.append({
                "name": " ".join(cells[1].xpath(".//text()").getall()).strip(),
                "designation": " ".join(cells[2].xpath(".//text()").getall()).strip(),
                "ownership_pct": ownership_pct,
                "country": " ".join(cells[4].xpath(".//text()").getall()).strip(),
            })
        return owners