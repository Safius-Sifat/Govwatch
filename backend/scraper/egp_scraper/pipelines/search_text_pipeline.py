"""
Builds a single concatenated `search_text` field per item.

This field is what we'll embed into Cloudflare Vectorize — it's the
"document" the semantic search engine retrieves against. By packing all
the key fields into one normalized string, the embedding model sees
a coherent paragraph instead of a sparse list of disconnected labels.
"""

import re


class SearchTextPipeline:
    """Compose a single Bangla+English searchable text per contract."""

    TEMPLATE = """Tender ID: {tender_id}
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

    def process_item(self, item, spider):
        owners = item.get("beneficial_owners") or []
        owner_descriptions = []
        for o in owners:
            pct = o.get("ownership_pct")
            pct_str = f" ({pct}%)" if pct is not None else ""
            owner_descriptions.append(
                f"{o.get('name', '')}{pct_str} [{o.get('designation', '')}]"
            )

        item["search_text"] = self.TEMPLATE.format(
            tender_id=item.get("tender_id", ""),
            tender_ref_no=item.get("tender_ref_no", ""),
            package_name=item.get("package_name", ""),
            ministry=item.get("ministry", ""),
            division=item.get("division", ""),
            agency=item.get("agency", ""),
            procuring_entity_name=item.get("procuring_entity_name", ""),
            district=item.get("procuring_entity_district", ""),
            procurement_method=item.get("procurement_method", ""),
            procurement_category=item.get("procurement_category", ""),
            winner_name=item.get("winner_name", ""),
            owners="; ".join(owner_descriptions) if owner_descriptions else "N/A",
            contract_price_bdt=item.get("contract_price_bdt") or 0,
            advertisement_date=item.get("advertisement_date", ""),
            contract_signing_date=item.get("contract_signing_date", ""),
            contract_completion_date=item.get("contract_completion_date", ""),
        ).strip()

        # Collapse runs of whitespace.
        item["search_text"] = re.sub(r"\s+", " ", item["search_text"])
        return item