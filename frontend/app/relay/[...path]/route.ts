// frontend/app/relay/[...path]/route.ts
//
// PostHog relay proxy. Replaces the previous `rewrites()` config in
// `next.config.mjs` (which does not transparently proxy external hosts
// on Cloudflare Workers).
//
//   /relay/<*>          -> https://us.i.posthog.com/<*>
//   /relay/static/<*>   -> https://us-assets.i.posthog.com/static/<*>
//   /relay/array/<*>    -> https://us-assets.i.posthog.com/array/<*>
//
// The PostHog JS client (`components/posthog-provider.tsx`) is already
// configured with `api_host: '/relay'`, so requests flow through here
// instead of directly to PostHog's CDN. Static assets under
// `us-assets.i.posthog.com` are CDN-served and don't need proxying, but
// we route them too so the browser never sees the third-party host.
import type { NextRequest } from 'next/server'

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
const POSTHOG_ASSETS_HOST = 'https://us-assets.i.posthog.com'

export const dynamic = 'force-dynamic'

// Workers runtime. POST uses fetch duplex='half' which is supported
// on the Workers runtime; the previous nodejs compat runtime was
// unnecessary and was masking the same upstream-stream error as the
// /api/chat route.

type Ctx = { params: Promise<{ path: string[] }> }

function isAssetSegment(segment: string | undefined): boolean {
  return segment === 'static' || segment === 'array'
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  const segments = (path ?? []).map(encodeURIComponent)
  const useAssets = isAssetSegment(segments[0])
  const targetHost = useAssets ? POSTHOG_ASSETS_HOST : POSTHOG_HOST
  const trimmed = useAssets ? segments.slice(1) : segments
  const upstream = `${targetHost}/${trimmed.join('/')}${request.nextUrl.search}`

  return fetch(upstream, {
    method: 'GET',
    headers: {
      accept: request.headers.get('accept') ?? 'application/json',
      'user-agent': request.headers.get('user-agent') ?? 'govwatch-relay'
    },
    redirect: 'follow'
  })
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  const segments = (path ?? []).map(encodeURIComponent)
  const upstream = `${POSTHOG_HOST}/${segments.join('/')}${request.nextUrl.search}`

  return fetch(upstream, {
    method: 'POST',
    headers: {
      'content-type': request.headers.get('content-type') ?? 'application/json',
      accept: request.headers.get('accept') ?? 'application/json'
    },
    body: request.body,
    // @ts-expect-error duplex is in the runtime types but not in fetch's lib.dom types
    duplex: 'half'
  })
}