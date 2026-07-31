/**
 * Server-side helpers that call the GovWatch Worker backend. These
 * run inside Next.js route handlers and server components, so they
 * reach the backend via the same service-binding / dev-fallback path
 * used by the API routes.
 *
 * Use these from server components in `app/` or `route.ts` handlers.
 * For client-side fetches, call `/api/worker/...` directly (which uses
 * this same code path internally).
 *
 * Backend route contract this layer talks to:
 *   GET /api/stats
 *   GET /api/anomalies?limit=N
 *   GET /api/vendors/top?limit=N&sort=value|count
 *   GET /api/vendors/:name/collusion
 *   GET /api/ministries
 *   GET /api/districts
 */

import type {
  Anomaly,
  District,
  Ministry,
  Stats,
  VendorGraph,
  VendorSummary,
} from './types'
import { backendFetch } from './url'

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await backendFetch(path, {
    ...init,
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    throw new Error(`Worker ${path} -> ${res.status}`)
  }
  return (await res.json()) as T
}

export async function fetchStats(): Promise<Stats | null> {
  try {
    return await getJson<Stats>('/api/stats')
  } catch {
    return null
  }
}

export async function fetchAnomalies(limit = 20): Promise<Anomaly[]> {
  return getJson<Anomaly[]>(`/api/anomalies?limit=${limit}`).catch(() => [])
}

export async function fetchTopVendors(
  limit = 20,
  sort: 'value' | 'count' = 'value',
): Promise<VendorSummary[]> {
  const qs = new URLSearchParams({ limit: String(limit), sort })
  const res = await getJson<{ vendors: VendorSummary[] }>(
    `/api/vendors/top?${qs.toString()}`,
  ).catch(() => ({ vendors: [] }))
  return res.vendors ?? []
}

export async function fetchVendorGraph(id: string): Promise<VendorGraph | null> {
  try {
    return await getJson<VendorGraph>(
      `/api/vendors/${encodeURIComponent(id)}/collusion`,
    )
  } catch {
    return null
  }
}

export async function fetchMinistries(): Promise<Ministry[]> {
  return getJson<Ministry[]>('/api/ministries').catch(() => [])
}

export async function fetchDistricts(): Promise<District[]> {
  return getJson<District[]>('/api/districts').catch(() => [])
}
