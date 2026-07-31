/**
 * GovWatch chat API route.
 *
 * Thin SSE proxy to the Cloudflare Worker backend. The Worker exposes
 * `POST /api/search` which emits SSE events:
 *   - `citations`  -> data: { citations: [...] }
 *   - `anomaly`    -> data: { anomaly: {...} }
 *   - `text-delta` -> data: { delta: "..." }
 *   - `done`       -> data: { ... }
 *
 * We accept whatever JSON body the client sends, extract the user query
 * (or fall back to body.query), and forward it to the Worker. The
 * Worker's stream is returned verbatim with proper SSE headers.
 *
 * The user's original trigger + chatId are preserved in the forwarded
 * body so that any future server-side logic (logging, routing) can use
 * them. The reading state from Morphic's `useChat` is exercised by
 * the broader app, but GovWatch's own UI in `components/govwatch/chat`
 * consumes this stream directly via `fetch` + `ReadableStream`.
 *
 * Run on the Cloudflare Workers runtime. We forward via a service
 * binding (see wrangler.toml `[[services]]` block and
 * `lib/govwatch/url.ts`). Service bindings keep the subrequest at the
 * edge, avoiding both `runtime: 'nodejs'`'s ReadableStream wrapping
 * issue and the public-Workers-DNS `error code: 1042` we saw when
 * calling the backend over its `*.workers.dev` URL.
 */

import { backendFetch } from '@/lib/govwatch/url'

/**
 * Extract the user's text query from an AI SDK `message` payload, or
 * return whatever raw `query` field is given. We support both shapes so
 * the existing `useChat` callers and a brand-new GovWatch client can
 * both talk to this endpoint.
 */
function extractQuery(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>

  if (typeof b.query === 'string' && b.query.trim()) return b.query.trim()

  // AI SDK v3 message shape: { role, parts: [{ type: 'text', text: '...' }] }
  const message = b.message as Record<string, unknown> | undefined
  if (message && Array.isArray(message.parts)) {
    const parts = message.parts as Array<Record<string, unknown>>
    const text = parts
      .filter(p => p.type === 'text' && typeof p.text === 'string')
      .map(p => p.text as string)
      .join('')
      .trim()
    if (text) return text
  }

  // Last-resort: walk the messages array and grab the last user text.
  if (Array.isArray(b.messages)) {
    const msgs = b.messages as Array<Record<string, unknown>>
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m?.role !== 'user') continue
      if (Array.isArray(m.parts)) {
        const parts = m.parts as Array<Record<string, unknown>>
        const text = parts
          .filter(p => p.type === 'text' && typeof p.text === 'string')
          .map(p => p.text as string)
          .join('')
          .trim()
        if (text) return text
      }
    }
  }

  return ''
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const query = extractQuery(body)
  if (!query) {
    return new Response('No query could be extracted from the request', {
      status: 400,
    })
  }

  // Read language cookie (default Bangla — Bangladesh civic audience).
  const cookieHeader = req.headers.get('cookie') ?? ''
  const langMatch = cookieHeader.match(/(?:^|;\s*)govwatch_lang=([^;]+)/)
  const language = langMatch?.[1] === 'en' ? 'en' : 'bn'

  let upstream: Response
  try {
    upstream = await backendFetch('/api/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        query,
        language,
        chatId: typeof body.chatId === 'string' ? body.chatId : undefined,
      }),
    })
  } catch (err) {
    return new Response(
      `Upstream fetch threw: ${err instanceof Error ? err.message : String(err)}`,
      { status: 502 },
    )
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(
      `Worker returned ${upstream.status}: ${await upstream.text().catch(() => '')}`,
      { status: 502 },
    )
  }

  // Forward the SSE stream verbatim. `x-accel-buffering: no` keeps
  // proxies (nginx, Cloudflare) from buffering the stream.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    },
  })
}
