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

export interface VendorSummary {
  vendor_name: string
  total_contracts: number
  total_value_bdt: number
  first_seen?: string | null
  last_seen?: string | null
}

export interface VendorGraphNode {
  id: string
  label: string
  type: 'vendor' | 'director'
}

export interface VendorGraphEdge {
  source: string
  target: string
  /** How many contracts link this director to this vendor */
  weight: number
}

export interface VendorGraph {
  vendor: VendorSummary & { id: string }
  nodes: VendorGraphNode[]
  edges: VendorGraphEdge[]
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
