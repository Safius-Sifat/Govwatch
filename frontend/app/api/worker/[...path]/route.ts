/**
 * Generic GET proxy to the GovWatch Worker backend.
 *
 * The Worker exposes GET endpoints at:
 *   /api/health
 *   /api/stats
 *   /api/anomalies
 *   /api/vendors/top              (?limit=N, ?sort=value|count)
 *   /api/vendors/:name/collusion  (vendor + directors + edges)
 *   /api/ministries
 *   /api/districts
 * Anything else returns 404.
 *
 * We strip the /api/worker prefix and forward the remaining path to the
 * Worker via a service binding, returning JSON. This proxy exists so
 * the browser fetch is same-origin (no CORS) and so we can centrally
 * inject headers.
 */
import { backendFetch } from '@/lib/govwatch/url'

const ALLOWED: Record<string, boolean> = {
  health: true,
  stats: true,
  anomalies: true,
  vendors: true,
  ministries: true,
  districts: true,
}

function isAllowed(path: string[]): boolean {
  if (path.length === 0) return false
  const root = path[0]
  if (!ALLOWED[root]) return false

  // Vendors has two real shapes:
  //   /api/vendors/top
  //   /api/vendors/:name/collusion
  // Anything else (e.g. bare /api/vendors) is not a real backend route.
  if (root === 'vendors') {
    if (path.length === 2 && path[1] === 'top') return true
    if (path.length === 3 && path[2] === 'collusion') return true
    return false
  }

  return true
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  if (!isAllowed(path)) {
    return new Response('Not found', { status: 404 })
  }

  // The backend's health probe lives at `/` and `/health`, not
  // `/api/health`. Map `/api/worker/health` -> `/health` so the
  // browser-facing path stays under the `/api/worker/*` namespace.
  const search = new URL(req.url).searchParams.toString()
  const upstreamPath =
    path.length === 1 && path[0] === 'health'
      ? '/health'
      : `/api/${path.join('/')}`
  const pathAndQuery = `${upstreamPath}${search ? `?${search}` : ''}`

  try {
    const upstream = await backendFetch(pathAndQuery, {
      method: 'GET',
      headers: { accept: 'application/json' },
    })

    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: {
        'content-type':
          upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'worker_unreachable',
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}