/**
 * Stats & health endpoints.
 *
 * GET /              — health check
 * GET /api/stats     — counts of contracts, vendors, anomalies
 * GET /api/ministries — list of ministries (for the dashboard filter)
 * GET /api/districts  — list of districts
 */

import type { Env } from "../env";
import { preflight, withCors } from "../lib/cors";

export async function handleRoot(request: Request, env: Env): Promise<Response> {
  return withCors(
    new Response(
      JSON.stringify({
        name: "ShottoPrakash Gateway",
        version: "0.1.0",
        status: "ok",
        endpoints: [
          "POST /api/search",
          "POST /api/ingest",
          "POST /api/ingest-batch",
          "GET  /api/anomalies",
          "GET  /api/vendors/:name/collusion",
          "GET  /api/vendors/top",
          "GET  /api/stats",
          "GET  /api/ministries",
          "GET  /api/districts",
          "GET  /api/pdf/:key",
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ),
    request,
    env
  );
}

export async function handleStats(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  try {
    const [contracts, vendors, outliers, directors] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as n FROM contracts").first<{ n: number }>(),
      env.DB.prepare(
        "SELECT COUNT(DISTINCT winner_name_normalized) as n FROM contracts WHERE winner_name_normalized IS NOT NULL"
      ).first<{ n: number }>(),
      env.DB.prepare(
        "SELECT COUNT(*) as n FROM contracts WHERE is_price_outlier = 1"
      ).first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) as n FROM vendor_directors").first<{ n: number }>(),
    ]);

    // Vectorize.describe() is not always supported locally.
    // Wrap it in try/catch and report 0 if it fails.
    let vectorCount = 0;
    try {
      const desc = await env.VECTORIZE.describe();
      vectorCount = (desc as any).vectorCount || 0;
    } catch {
      vectorCount = 0;
    }

    return withCors(
      new Response(
        JSON.stringify({
          contracts: contracts?.n || 0,
          vendors: vendors?.n || 0,
          outliers: outliers?.n || 0,
          directors: directors?.n || 0,
          vectors: vectorCount,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      request,
      env
    );
  } catch (err) {
    return withCors(
      new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  }
}

export async function handleMinistries(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const result = await env.DB.prepare(
    `SELECT ministry, COUNT(*) as tender_count
     FROM contracts
     WHERE ministry IS NOT NULL AND ministry != ''
     GROUP BY ministry
     ORDER BY tender_count DESC
     LIMIT 100`
  ).all<{ ministry: string; tender_count: number }>();

  return withCors(
    new Response(JSON.stringify({ ministries: result.results || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    request,
    env
  );
}

export async function handleDistricts(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const result = await env.DB.prepare(
    `SELECT procuring_entity_district as district, COUNT(*) as tender_count
     FROM contracts
     WHERE procuring_entity_district IS NOT NULL AND procuring_entity_district != ''
     GROUP BY procuring_entity_district
     ORDER BY tender_count DESC
     LIMIT 100`
  ).all<{ district: string; tender_count: number }>();

  return withCors(
    new Response(JSON.stringify({ districts: result.results || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    request,
    env
  );
}