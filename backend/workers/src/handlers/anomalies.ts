/**
 * Anomalies endpoint — returns the top price outliers for the
 * dashboard / "Top 10 Inflations" feature.
 *
 * GET /api/anomalies?limit=20&ministry=...&district=...
 */

import type { Env } from "../env";
import { preflight, withCors } from "../lib/cors";
import type { AnomalyCard } from "../lib/types";

export async function handleAnomalies(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const ministry = url.searchParams.get("ministry");
  const district = url.searchParams.get("district");
  const method = url.searchParams.get("method");

  const where: string[] = ["is_price_outlier = 1"];
  const params: any[] = [];

  if (ministry) {
    where.push("ministry LIKE ?");
    params.push(`%${ministry}%`);
  }
  if (district) {
    where.push("procuring_entity_district = ?");
    params.push(district);
  }
  if (method) {
    where.push("procurement_method = ?");
    params.push(method);
  }

  const sql = `
    SELECT tender_id, package_name, winner_name, procuring_entity_district,
           ministry, contract_price_bdt, median_bdt, price_z_score,
           contract_signing_date, detail_url
    FROM contracts
    WHERE ${where.join(" AND ")}
    ORDER BY price_z_score DESC
    LIMIT ?
  `;
  params.push(limit);

  try {
    const result = await env.DB.prepare(sql).bind(...params).all<any>();

    const anomalies: AnomalyCard[] = (result.results || []).map((r) => ({
      tender_id: r.tender_id,
      title: r.package_name || "",
      item: r.package_name || "",
      district: r.procuring_entity_district || "",
      ministry: r.ministry || "",
      winner: r.winner_name || "",
      awarded_bdt: r.contract_price_bdt || 0,
      median_bdt: r.median_bdt || 0,
      z_score: r.price_z_score || 0,
      pct_above_median:
        r.median_bdt && r.contract_price_bdt
          ? ((r.contract_price_bdt - r.median_bdt) / r.median_bdt) * 100
          : 0,
    }));

    return withCors(
      new Response(JSON.stringify({ count: anomalies.length, anomalies }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  } catch (err) {
    console.error("[anomalies] error", err);
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