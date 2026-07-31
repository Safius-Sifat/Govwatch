/**
 * Resolve the GovWatch Worker backend fetcher.
 *
 * On Cloudflare Workers (via `@opennextjs/cloudflare`) the route handlers
 * run on the Workers runtime. The backend is bound to this Worker as a
 * `[[services]]` binding (see wrangler.toml). Calling it via the binding
 * keeps the subrequest at the edge — no public DNS, no Host-header
 * routing, no edge-loop protection. Earlier we hit `error code: 1042`
 * when forwarding over the public `*.workers.dev` URL.
 *
 * In `next dev` (Node), there is no service binding, so we fall back to
 * a public fetch against `WORKER_URL` (or the well-known local default
 * for `wrangler dev`).
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'

interface BackendBinding {
  /** Direct edge-to-edge fetch. Returns a `Fetcher` on Workers, `null` in `next dev`. */
  readonly fetcher: Fetcher | null
  /** Public URL fallback for dev environments. */
  readonly fallbackUrl: string
}

let cached: BackendBinding | undefined

function resolve(): BackendBinding {
  if (cached) return cached

  // 1. Cloudflare Workers runtime — read from the request context.
  try {
    const ctx = getCloudflareContext()
    const env = ctx?.env as
      | { BACKEND?: unknown; WORKER_URL?: unknown }
      | undefined
    if (env?.BACKEND && typeof env.BACKEND === 'object') {
      cached = {
        fetcher: env.BACKEND as Fetcher,
        fallbackUrl:
          typeof env.WORKER_URL === 'string' && env.WORKER_URL
            ? env.WORKER_URL
            : 'http://127.0.0.1:8787',
      }
      return cached
    }
  } catch {
    // Not on the Workers runtime — fall through.
  }

  // 2. Node dev runtime.
  const fallbackUrl =
    (typeof process !== 'undefined' && process.env?.WORKER_URL) ||
    'http://127.0.0.1:8787'
  cached = { fetcher: null, fallbackUrl }
  return cached
}

/**
 * Build an absolute URL usable as the first arg to either
 * `fetcher.fetch(...)` (service binding) or `fetch(...)` (dev fallback).
 *
 * Service bindings require the request URL to be absolute but they
 * ignore the host — anything under https:// will do. We mint a stable
 * internal URL so request logging on the backend is consistent.
 */
function toInternalUrl(path: string): string {
  return `https://govwatch-internal${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * Forward a request to the backend using a service binding when
 * available, or a plain `fetch()` against `WORKER_URL` in dev.
 *
 * Returns the upstream Response verbatim. The caller decides how to
 * stream / cache / forward it.
 */
export async function backendFetch(
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<Response> {
  const { fetcher, fallbackUrl } = resolve()

  // Workers path — service binding.
  if (fetcher) {
    const url = toInternalUrl(pathAndQuery)
    const headers = new Headers(init.headers)
    // Bindings preserve content-type / accept / etc. so we forward as is.
    return fetcher.fetch(url, {
      ...init,
      headers,
      // Bindings support streaming bodies via fetch duplex.
      // @ts-expect-error duplex is in workerd types but not in lib.dom
      duplex: 'half',
    })
  }

  // Dev fallback — public fetch against WORKER_URL.
  const url = `${fallbackUrl}${pathAndQuery}`
  return fetch(url, init)
}

/**
 * Public URL of the backend (for client-side links / redirects). On the
 * Workers runtime this is the well-known `*.workers.dev` URL.
 */
export function getWorkerUrl(): string {
  const { fallbackUrl } = resolve()
  return fallbackUrl
}
