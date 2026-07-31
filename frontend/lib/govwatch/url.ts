/**
 * Resolve the GovWatch Worker backend URL.
 *
 * On Cloudflare Workers (via `@opennextjs/cloudflare`) the route handlers
 * run on the Workers runtime, where bindings / vars from `wrangler.toml`
 * are NOT exposed via `process.env`. Instead they live on the per-request
 * context returned by `getCloudflareContext()`.
 *
 * In `next dev` (Node), `process.env.WORKER_URL` is what populates the
 * value (via `.env.local`). We check the Cloudflare context first so the
 * deployed frontend uses the configured Worker URL, then fall back to
 * `process.env` for local dev, and finally to the well-known default.
 *
 * To keep this helper synchronous (it's used inside route bodies that
 * immediately `await fetch(...)`), we cache the resolved URL after the
 * first call: a single Workers isolate serves many requests but
 * `env.WORKER_URL` is fixed for the lifetime of a deploy, so caching is
 * safe and avoids re-running the resolver on the hot path.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'

let cached: string | undefined

export function getWorkerUrl(): string {
  if (cached) return cached

  // 1. Cloudflare Workers runtime — read from the request context.
  try {
    const ctx = getCloudflareContext()
    const fromEnv = ctx?.env?.WORKER_URL
    if (typeof fromEnv === 'string' && fromEnv.length > 0) {
      cached = fromEnv
      return cached
    }
  } catch {
    // Not on the Workers runtime — fall through.
  }

  // 2. Node dev runtime — read from process.env (.env.local).
  if (typeof process !== 'undefined' && process.env?.WORKER_URL) {
    cached = process.env.WORKER_URL
    return cached
  }

  // 3. Fallback for local `next dev` against a `wrangler dev` Worker.
  cached = 'http://127.0.0.1:8787'
  return cached
}