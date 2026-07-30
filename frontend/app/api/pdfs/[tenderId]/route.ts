/**
 * Streams a PDF for a given tenderId from the Worker backend.
 *
 * Worker exposes GET /api/pdfs/:tenderId. We just forward that request
 * and return the binary stream.
 */
export const runtime = 'nodejs'

const WORKER_URL = process.env.WORKER_URL ?? 'http://127.0.0.1:8787'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenderId: string }> },
) {
  const { tenderId } = await params
  if (!/^\d+$/.test(tenderId)) {
    return new Response('Invalid tenderId', { status: 400 })
  }

  const upstream = await fetch(`${WORKER_URL}/api/pdfs/${tenderId}`)

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