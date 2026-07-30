/**
 * PDF proxy — serves PDFs from R2 with a signed URL pattern.
 *
 * The frontend uses this for the right-pane viewer. We could embed
 * the signed URL directly in the citation metadata, but proxying
 * through the worker lets us:
 *   1. Inject CORS headers
 *   2. Cache aggressively at the edge
 *   3. Rewrite the response to a cleaner filename
 */

import type { Env } from "../env";
import { preflight, withCors } from "../lib/cors";

export async function handlePdf(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const url = new URL(request.url);
  // Path is /api/pdf/<key...> — capture everything after /api/pdf/
  const match = url.pathname.match(/^\/api\/pdf\/(.+)$/);
  if (!match) {
    return withCors(
      new Response("Invalid PDF path", { status: 400 }),
      request,
      env
    );
  }
  const key = decodeURIComponent(match[1] ?? "");

  try {
    const obj = await env.STORAGE.get(key);
    if (!obj) {
      return withCors(
        new Response("PDF not found", { status: 404 }),
        request,
        env
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set("Cache-Control", "public, max-age=86400");
    headers.set("Content-Disposition", `inline; filename="${key.split("/").pop()}"`);

    return new Response(obj.body, { headers });
  } catch (err) {
    console.error("[pdf] error", err);
    return withCors(
      new Response("Internal error", { status: 500 }),
      request,
      env
    );
  }
}

/**
 * Generate a signed URL for the frontend (optional — the proxy
 * above is sufficient for v1).
 */
export async function getSignedPdfUrl(key: string, env: Env): Promise<string> {
  // For the demo we just return the proxy URL. To upgrade to actual
  // signed URLs, call env.STORAGE.createPresignedUrl() in a Worker
  // with the r2-signed-urls compatibility flag.
  return `/api/pdf/${encodeURIComponent(key)}`;
}