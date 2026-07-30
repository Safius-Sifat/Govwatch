/**
 * CORS helper — allows the frontend at any localhost port during dev,
 * locks down to the configured origin in production.
 */

export interface CorsOptions {
  request: Request;
  env: { ALLOWED_ORIGIN?: string };
}

export function corsHeaders({ request, env }: CorsOptions): Record<string, string> {
  const origin = request.headers.get("Origin") || "*";

  // In production, only allow the configured origin.
  // In dev, allow any localhost port.
  let allowed = "*";
  if (env.ALLOWED_ORIGIN) {
    allowed = origin === env.ALLOWED_ORIGIN ? origin : env.ALLOWED_ORIGIN;
  } else if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
    allowed = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function preflight(request: Request, env: { ALLOWED_ORIGIN?: string }): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders({ request, env }),
  });
}

/**
 * Wrap any response with CORS headers.
 */
export function withCors(response: Response, request: Request, env: { ALLOWED_ORIGIN?: string }): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders({ request, env }))) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}