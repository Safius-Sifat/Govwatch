/**
 * Streams a PDF for a given tenderId from the Worker backend.
 *
 * Worker exposes GET /api/pdfs/:tenderId. We just forward that request
 * and return the binary stream.
 */
// Workers runtime — same reason as /api/chat. Dropping nodejs compat
// so the upstream ReadableStream<Uint8Array> can be forwarded.
import { getWorkerUrl } from '@/lib/govwatch/url'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenderId: string }> },
) {
  const { tenderId } = await params
  if (!/^\d+$/.test(tenderId)) {
    return new Response('Invalid tenderId', { status: 400 })
  }

  const upstream = await fetch(`${getWorkerUrl()}/api/pdfs/${tenderId}`)

  if (!upstream.ok || !upstream.body) {
    return new Response(`Worker returned ${upstream.status}`, {
      status: upstream.status,
    })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type':
        upstream.headers.get('content-type') ?? 'application/pdf',
      'cache-control': 'public, max-age=3600',
    },
  })
}