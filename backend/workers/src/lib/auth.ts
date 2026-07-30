/**
 * Authentication helper for write-side endpoints.
 *
 * The /api/ingest and /api/ingest-batch endpoints require an
 * X-Admin-Token header that matches the ADMIN_TOKEN secret.
 *
 * The /api/search endpoint is public — it's the read-side.
 */

export interface AuthEnv {
  ADMIN_TOKEN?: string;
}

export function requireAdmin(request: Request, env: AuthEnv): Response | null {
  // If no token is configured, allow unauthenticated access in dev.
  if (!env.ADMIN_TOKEN) {
    return null;
  }

  const provided =
    request.headers.get("X-Admin-Token") ||
    request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== env.ADMIN_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Invalid or missing admin token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}