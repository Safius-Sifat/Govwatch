/**
 * Domain types for GovWatch — shapes returned by the Worker backend.
 *
 * Keep these aligned with `backend/workers/src/lib/types.ts`. Whenever
 * you add a field to the Worker, mirror it here.
 */

export type Language = 'bn' | 'en'

export interface Citation {
  tender_id: string
  pkg_no?: string | null
  ministry?: string | null
  agency?: string | null
  procurement_method?: string | null
  contract_amount_bdt?: number | null
  contract_date?: string | null
  vendor_name?: string | null
  district?: string | null
  snippet: string
  /** Raw score from hybrid retrieval (vector + FTS RRF) */
  score?: number
  pdf_url?: string | null
}

export interface Anomaly {
  tender_id: string
  pkg_no?: string | null
  ministry?: string | null
  agency?: string | null
  vendor_name?: string | null
  contract_amount_bdt?: number | null
  procurement_method?: string | null
  simplified_package_category?: string | null
  zscore_amount?: number | null
  zscore_method_bucket?: number | null
  flagged_reason: string
}

/**
 * Top-vendors row, returned by `GET /api/vendors/top`.
 *
 * Field names mirror what the Worker actually returns; do not rename
 * without updating the SQL in `backend/workers/src/handlers/vendors.ts`.
 */
export interface VendorSummary {
  vendor: string
  display_name: string
  tender_count: number
  total_value_bdt: number
  district_count: number
}

export interface VendorGraphNode {
  id: string
  label: string
  type: 'vendor' | 'director'
  /** Only set for the focal vendor node. */
  tenders_won?: number
  total_value_bdt?: number
}

export interface VendorGraphEdge {
  source: string
  target: string
  relationship: 'owns' | 'shares_address'
}

/**
 * Single tender contract attached to the focal vendor.
 * Returned by `GET /api/vendors/:name/collusion`.
 */
export interface VendorContract {
  tender_id: string
  package_name: string
  contract_price_bdt: number
  contract_signing_date: string
}

export interface VendorGraph {
  vendor: VendorGraphNode
  directors: VendorGraphNode[]
  edges: VendorGraphEdge[]
  contracts?: VendorContract[]
}

export interface Stats {
  /** Total contracts indexed */
  contracts: number
  /** Unique vendors */
  vendors: number
  /** Z-score flagged contracts */
  outliers: number
  /** Beneficial owners (directors) */
  directors: number
  /** Number of contracts with embeddings in Vectorize */
  vectors: number
}

export interface Ministry {
  name: string
  contract_count: number
}

export interface District {
  name: string
  contract_count: number
}

export interface ContractAward {
  tender_id: string
  pkg_no?: string | null
  ministry?: string | null
  agency?: string | null
  procurement_method?: string | null
  contract_amount_bdt?: number | null
  contract_date?: string | null
  vendor_name?: string | null
  district?: string | null
  beneficial_owners?: Array<{ name: string; address?: string | null }>
  search_text?: string | null
  zscore_amount?: number | null
  is_anomaly?: boolean
  flagged_reason?: string | null
  pdf_url?: string | null
}

export interface SearchFilters {
  ministry?: string
  district?: string
  year?: number
}

export type SearchEvent =
  | { type: 'citations'; citations: Citation[] }
  | { type: 'anomaly'; anomaly: Anomaly }
  | { type: 'text-delta'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
