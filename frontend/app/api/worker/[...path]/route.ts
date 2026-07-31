/**
 * Generic GET proxy to the GovWatch Worker backend.
 *
 * The Worker exposes GET endpoints at /api/stats, /api/anomalies,
 * /api/vendors, /api/vendors/:id, /api/ministries, /api/districts,
 * /api/health. Anything else returns 404.
 *
 * We strip the /api/worker prefix and forward the remaining path to the
 * Worker, returning JSON. This proxy exists so the browser fetch is
 * same-origin (no CORS) and so we can centrally inject headers.
 */
// Workers runtime — same reason as /api/chat. Dropping nodejs compat.
import { getWorkerUrl } from '@/lib/govwatch/url'

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
  // For vendors, allow /vendors/:id
  if (root === 'vendors' && path.length > 2) return false
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

  const upstreamUrl = `${getWorkerUrl()}/api/${path.join('/')}${req.url.includes('?') ? '?' + new URL(req.url).searchParams.toString() : ''}`

  try {
    const upstream = await fetch(upstreamUrl, {
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
      JSON.stringify({ error: 'worker_unreachable', detail: String(err) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    )
  }
}
