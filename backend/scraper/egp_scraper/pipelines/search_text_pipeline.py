"""
Builds a single concatenated `search_text` field per item.

This field is what we'll embed into Cloudflare Vectorize — it's the
"document" the semantic search engine retrieves against. By packing all
the key fields into one normalized string, the embedding model sees
a coherent paragraph instead of a sparse list of disconnected labels.

Supports both ContractAward (egp_contracts spider) and EcmsWorkStatus
(egp_ecms spider) items; we branch on item.get("source") to pick the
right template.
"""

import re


class SearchTextPipeline:
    """Compose a single Bangla+English searchable text per item."""

    CONTRACT_TEMPLATE = """Tender ID: {tender_id}
Reference: {tender_ref_no}
Package: {package_name}
Ministry: {ministry}
Division: {division}
Agency: {agency}
Procuring Entity: {procuring_entity_name}
District: {district}
Procurement Method: {procurement_method}
Category: {procurement_category}
Winner: {winner_name}
Beneficial Owners: {owners}
Contract Value: BDT {contract_price_bdt:,.0f}
Advertisement Date: {advertisement_date}
Contract Signing: {contract_signing_date}
Completion Date: {contract_completion_date}
"""

    ECMS_TEMPLATE = """Tender ID: {tender_id}
Reference: {tender_ref_no}
Package: {package_name}
Ministry: {ministry}
Organization: {organization}
PE Office: {pe_office_name}
Procurement Method: {procurement_method}
Category: {procurement_nature}
Work Category: {work_category}
Winner: {winner_name}
Beneficial Owners: {owners}
Contract Value: BDT {contract_value_bdt:,.0f}
Work Status: {work_status}
Physical Progress: {physical_progress}%
Financial Progress: {financial_progress}%
Contract Start: {contract_start_date}
Contract End: {contract_end_date}
"""

    def process_item(self, item, spider):
        source = item.get("source", "")
        if source == "egp_ecms":
            text = self._render(self.ECMS_TEMPLATE, item)
        else:
            text = self._render(self.CONTRACT_TEMPLATE, item)
        item["search_text"] = re.sub(r"\s+", " ", text).strip()
        return item

    def _render(self, template, item):
        """Fill in a template using fields from the item, with safe defaults."""
        owners = item.get("beneficial_owners") or []
        owner_descriptions = []
        for o in owners:
            pct = o.get("ownership_pct")
            pct_str = f" ({pct}%)" if pct is not None else ""
            owner_descriptions.append(
                f"{o.get('name', '')}{pct_str} [{o.get('designation', '')}]"
            )

        ctx = {
            "tender_id": item.get("tender_id", ""),
            "tender_ref_no": item.get("tender_ref_no", ""),
            "package_name": item.get("package_name", ""),
            "ministry": item.get("ministry", ""),
            "division": item.get("division", ""),
            "agency": item.get("agency", ""),
            "organization": item.get("organization", ""),
            "pe_office_name": item.get("pe_office_name", ""),
            "procuring_entity_name": item.get("procuring_entity_name", ""),
            "district": item.get("procuring_entity_district", ""),
            "procurement_method": item.get("procurement_method", ""),
            "procurement_category": item.get("procurement_category", ""),
            "procurement_nature": item.get("procurement_nature", ""),
            "work_category": item.get("work_category", ""),
            "winner_name": item.get("winner_name", ""),
            "owners": "; ".join(owner_descriptions) if owner_descriptions else "N/A",
            "contract_price_bdt": item.get("contract_price_bdt") or 0,
            "contract_value_bdt": item.get("contract_value_bdt") or 0,
            "advertisement_date": item.get("advertisement_date", ""),
            "contract_signing_date": item.get("contract_signing_date", ""),
            "contract_completion_date": item.get("contract_completion_date", ""),
            "contract_start_date": item.get("contract_start_date", ""),
            "contract_end_date": item.get("contract_end_date", ""),
            "work_status": item.get("work_status", ""),
            "physical_progress": (
                f"{item['physical_progress_pct']:.0f}"
                if isinstance(item.get("physical_progress_pct"), (int, float))
                else "N/A"
            ),
            "financial_progress": (
                f"{item['financial_progress_pct']:.0f}"
                if isinstance(item.get("financial_progress_pct"), (int, float))
                else "N/A"
            ),
        }
        try:
            return template.format(**ctx).strip()
        except (KeyError, IndexError):
            # Fall back: any missing keys just become empty.
            return template.format_map(_SafeDict(**ctx)).strip()


class _SafeDict(dict):
    """dict that returns "" for missing keys (used by format_map)."""

    def __missing__(self, key):
        return ""