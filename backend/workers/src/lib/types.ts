/**
 * Shared types used across all handlers.
 */

export interface Contract {
  tender_id: string;
  pkg_lot_id?: string;
  tender_ref_no?: string;
  package_no?: string;
  package_name?: string;
  detail_url?: string;

  ministry?: string;
  division?: string;
  agency?: string;
  procuring_entity_name?: string;
  procuring_entity_district?: string;
  procuring_entity_code?: string;

  procurement_method?: string;
  procurement_category?: string;
  budget_type?: string;
  funding_source?: string;

  contract_price_bdt?: number;
  contract_price_raw?: string;

  winner_name?: string;
  winner_name_normalized?: string;
  winner_tenderer_id?: string;
  winner_business_address?: string;
  delivery_location?: string;

  advertisement_date?: string;
  notification_award_date?: string;
  contract_signing_date?: string;
  contract_start_date?: string;
  contract_completion_date?: string;

  authorised_officer_name?: string;
  authorised_officer_designation?: string;

  median_bdt?: number;
  price_z_score?: number;
  is_price_outlier?: boolean | number;

  search_text?: string;
  source?: string;
  scraped_at?: string;
}

export interface BeneficialOwner {
  tender_id: string;
  vendor_name: string;
  director_name: string;
  designation?: string;
  ownership_pct?: number;
  country?: string;
  district?: string;
  ministry?: string;
}

export interface Citation {
  tender_id: string;
  title: string;
  source: string;
  district?: string;
  ministry?: string;
  winner?: string;
  contract_price_bdt?: number;
  detail_url?: string;
  is_price_outlier?: boolean;
  price_z_score?: number;
}

export interface AnomalyCard {
  tender_id: string;
  title: string;
  item: string;
  district: string;
  ministry: string;
  winner: string;
  awarded_bdt: number;
  median_bdt: number;
  z_score: number;
  pct_above_median: number;
}

export interface VendorGraphNode {
  id: string;
  label: string;
  type: "vendor" | "director";
  tenders_won?: number;
  total_value_bdt?: number;
}

export interface VendorGraphEdge {
  source: string;
  target: string;
  relationship: "owns" | "shares_address";
}

export interface VendorGraph {
  vendor: VendorGraphNode;
  directors: VendorGraphNode[];
  edges: VendorGraphEdge[];
  contracts: Array<{
    tender_id: string;
    package_name: string;
    contract_price_bdt: number;
    contract_signing_date: string;
  }>;
}

/**
 * Server-sent event types streamed to the client.
 */
export type StreamEvent =
  | { type: "citations"; data: Citation[] }
  | { type: "anomaly"; data: AnomalyCard }
  | { type: "text-delta"; data: string }
  | { type: "vendor-graph"; data: VendorGraph }
  | { type: "done"; data: { latency_ms: number } }
  | { type: "error"; data: { message: string } };