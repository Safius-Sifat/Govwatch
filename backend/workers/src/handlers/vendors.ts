/**
 * Vendor endpoints — used by the vendor graph widget.
 *
 * GET /api/vendors/:name/collusion
 *   Returns the vendor's contracts + all their directors + edges to
 *   other vendors who share directors.
 *
 * GET /api/vendors/top?limit=10
 *   Returns the top vendors by total contract value or contract count.
 */

import type { Env } from "../env";
import { preflight, withCors } from "../lib/cors";
import type { VendorGraph } from "../lib/types";
import { normalizeVendorName } from "../lib/text";

export async function handleVendorCollusion(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/vendors\/(.+?)\/collusion$/);
  if (!match) {
    return withCors(
      new Response("Invalid vendor path", { status: 400 }),
      request,
      env
    );
  }
  const vendorNameRaw = decodeURIComponent(match[1] ?? "");
  const vendorName = normalizeVendorName(vendorNameRaw);

  try {
    // 1. All contracts won by this vendor.
    const contracts = await env.DB.prepare(
      `SELECT tender_id, package_name, contract_price_bdt,
              contract_signing_date, procuring_entity_district, ministry
       FROM contracts
       WHERE winner_name_normalized = ?
       ORDER BY contract_price_bdt DESC NULLS LAST
       LIMIT 50`
    )
      .bind(vendorName)
      .all<any>();

    if (!contracts.results || contracts.results.length === 0) {
      return withCors(
        new Response(JSON.stringify({ error: "Vendor not found", vendor: vendorNameRaw }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
        request,
        env
      );
    }

    // 2. All directors of this vendor.
    const directors = await env.DB.prepare(
      `SELECT DISTINCT director_name, designation, ownership_pct, country, tender_id
       FROM vendor_directors
       WHERE vendor_name_normalized = ?
       ORDER BY ownership_pct DESC NULLS LAST`
    )
      .bind(vendorName)
      .all<any>();

    // 3. Find vendors that share directors with us (collusion signal).
    const directorNames = (directors.results || []).map((d) => d.director_name);
    let collusionVendors: Array<{ vendor: string; shared_director: string; tender_count: number }> = [];

    if (directorNames.length > 0) {
      const placeholders = directorNames.map(() => "?").join(",");
      const shared = await env.DB.prepare(
        `SELECT DISTINCT vendor_name_normalized as vendor, director_name as shared_director,
                COUNT(DISTINCT tender_id) as tender_count
         FROM vendor_directors
         WHERE director_name IN (${placeholders})
           AND vendor_name_normalized != ?
         GROUP BY vendor_name_normalized, director_name
         ORDER BY tender_count DESC
         LIMIT 20`
      )
        .bind(...directorNames, vendorName)
        .all<any>();

      collusionVendors = shared.results || [];
    }

    // 4. Build the graph payload.
    const totalValue = (contracts.results || []).reduce(
      (sum, c) => sum + (c.contract_price_bdt || 0),
      0
    );

    const graph: VendorGraph = {
      vendor: {
        id: vendorName,
        label: vendorNameRaw,
        type: "vendor",
        tenders_won: contracts.results?.length || 0,
        total_value_bdt: totalValue,
      },
      directors: (directors.results || []).map((d) => ({
        id: d.director_name,
        label: d.director_name,
        type: "director" as const,
      })),
      edges: [
        // Each director owns this vendor.
        ...(directors.results || []).map((d) => ({
          source: d.director_name,
          target: vendorName,
          relationship: "owns" as const,
        })),
        // Shared-director edges to other vendors.
        ...collusionVendors.map((c) => ({
          source: c.shared_director,
          target: c.vendor,
          relationship: "shares_address" as const,
        })),
      ],
      contracts: (contracts.results || []).map((c) => ({
        tender_id: c.tender_id,
        package_name: c.package_name || "",
        contract_price_bdt: c.contract_price_bdt || 0,
        contract_signing_date: c.contract_signing_date || "",
      })),
    };

    return withCors(
      new Response(JSON.stringify(graph), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  } catch (err) {
    console.error("[vendor] error", err);
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

export async function handleTopVendors(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const sortBy = url.searchParams.get("sort") || "value"; // "value" | "count"

  const orderColumn = sortBy === "count" ? "tender_count" : "total_value_bdt";

  try {
    const result = await env.DB.prepare(
      `SELECT winner_name_normalized as vendor, winner_name as display_name,
              COUNT(*) as tender_count, SUM(contract_price_bdt) as total_value_bdt,
              COUNT(DISTINCT procuring_entity_district) as district_count
       FROM contracts
       WHERE winner_name_normalized IS NOT NULL
       GROUP BY winner_name_normalized
       ORDER BY ${orderColumn} DESC
       LIMIT ?`
    )
      .bind(limit)
      .all<any>();

    return withCors(
      new Response(JSON.stringify({ vendors: result.results || [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  } catch (err) {
    console.error("[top-vendors] error", err);
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