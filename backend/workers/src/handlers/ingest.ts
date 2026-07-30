/**
 * Ingest handler — receives contract data (from the scraper) and
 * stores it in D1 + Vectorize + R2.
 *
 * Two modes:
 *   POST /api/ingest        — single contract
 *   POST /api/ingest-batch  — NDJSON body, multiple contracts
 *
 * Auth: requires X-Admin-Token header (unless ADMIN_TOKEN is unset, in dev).
 */

import type { Env } from "../env";
import { embed } from "../lib/embedder";
import { normalizeVendorName } from "../lib/text";
import { requireAdmin } from "../lib/auth";
import { preflight, withCors } from "../lib/cors";
import type { Contract, BeneficialOwner } from "../lib/types";

const INSERT_SQL = `
  INSERT INTO contracts (
    tender_id, pkg_lot_id, tender_ref_no, package_no, package_name, detail_url,
    ministry, division, agency, procuring_entity_name, procuring_entity_district,
    procuring_entity_code,
    procurement_method, procurement_category, budget_type, funding_source,
    contract_price_bdt, contract_price_raw,
    winner_name, winner_name_normalized, winner_tenderer_id,
    winner_business_address, delivery_location,
    advertisement_date, notification_award_date, contract_signing_date,
    contract_start_date, contract_completion_date,
    authorised_officer_name, authorised_officer_designation,
    median_bdt, price_z_score, is_price_outlier, search_text,
    source, scraped_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(tender_id) DO UPDATE SET
    package_name = excluded.package_name,
    contract_price_bdt = excluded.contract_price_bdt,
    winner_name = excluded.winner_name,
    winner_name_normalized = excluded.winner_name_normalized,
    price_z_score = excluded.price_z_score,
    is_price_outlier = excluded.is_price_outlier,
    search_text = excluded.search_text,
    ingested_at = datetime('now')
`;

const INSERT_DIRECTOR_SQL = `
  INSERT INTO vendor_directors (
    tender_id, vendor_name, vendor_name_normalized, director_name,
    designation, ownership_pct, country, district, ministry
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

interface IngestRequest {
  contract: Contract;
  beneficial_owners?: BeneficialOwner[];
}

export async function handleIngest(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const authErr = requireAdmin(request, env);
  if (authErr) return withCors(authErr, request, env);

  if (request.method !== "POST") {
    return withCors(
      new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  }

  let payload: IngestRequest;
  try {
    payload = await request.json();
  } catch {
    return withCors(
      new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  }

  if (!payload.contract?.tender_id) {
    return withCors(
      new Response(
        JSON.stringify({ error: "Missing tender_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      ),
      request,
      env
    );
  }

  try {
    const result = await ingestContract(payload.contract, payload.beneficial_owners || [], env);
    return withCors(
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ingest] error", message, err);
    return withCors(
      new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  }
}

/**
 * Insert a single contract into D1, embed it, and upsert to Vectorize.
 * Also inserts the beneficial_owner rows if provided.
 */
export async function ingestContract(
  contract: Contract,
  owners: BeneficialOwner[],
  env: Env
): Promise<{ tender_id: string; embedded: boolean; owners_inserted: number }> {
  // 1. Validate — tender_id is required.
  if (!contract.tender_id || contract.tender_id === "null") {
    throw new Error("tender_id is required and must be a non-empty string");
  }

  // 2. Normalize the vendor name so future joins work.
  const winnerNorm = normalizeVendorName(contract.winner_name);

  // Coerce undefined → null for D1 binding (D1 rejects undefined).
  const v = (x: unknown) => (x === undefined ? null : x);
  const num = (x: unknown) =>
    x === undefined || x === null || x === "" ? null : Number(x);

  // 2. INSERT into D1.
  await env.DB.prepare(INSERT_SQL)
    .bind(
      v(contract.tender_id),
      v(contract.pkg_lot_id),
      v(contract.tender_ref_no),
      v(contract.package_no),
      v(contract.package_name),
      v(contract.detail_url),
      v(contract.ministry),
      v(contract.division),
      v(contract.agency),
      v(contract.procuring_entity_name),
      v(contract.procuring_entity_district),
      v(contract.procuring_entity_code),
      v(contract.procurement_method),
      v(contract.procurement_category),
      v(contract.budget_type),
      v(contract.funding_source),
      num(contract.contract_price_bdt),
      v(contract.contract_price_raw),
      v(contract.winner_name),
      v(winnerNorm),
      v(contract.winner_tenderer_id),
      v(contract.winner_business_address),
      v(contract.delivery_location),
      v(contract.advertisement_date),
      v(contract.notification_award_date),
      v(contract.contract_signing_date),
      v(contract.contract_start_date),
      v(contract.contract_completion_date),
      v(contract.authorised_officer_name),
      v(contract.authorised_officer_designation),
      num(contract.median_bdt),
      num(contract.price_z_score),
      contract.is_price_outlier ? 1 : 0,
      v(contract.search_text),
      v(contract.source) || "egp",
      v(contract.scraped_at) || new Date().toISOString()
    )
    .run();

  // 3. INSERT beneficial owners (delete previous first to avoid dupes).
  let ownersInserted = 0;
  if (owners.length > 0) {
    await env.DB.prepare("DELETE FROM vendor_directors WHERE tender_id = ?")
      .bind(contract.tender_id)
      .run();

    const batch = owners.map((o) =>
      env.DB.prepare(INSERT_DIRECTOR_SQL).bind(
        v(o.tender_id),
        v(o.vendor_name),
        v(normalizeVendorName(o.vendor_name)),
        v(o.director_name),
        v(o.designation),
        num(o.ownership_pct),
        v(o.country),
        v(o.district),
        v(o.ministry)
      )
    );
    await env.DB.batch(batch);
    ownersInserted = owners.length;
  }

  // 4. Embed the search_text and upsert into Vectorize.
  let embedded = false;
  if (contract.search_text) {
    try {
      const vector = await embed(contract.search_text, env.AI);
      await env.VECTORIZE.upsert([
        {
          id: contract.tender_id,
          values: vector,
          metadata: {
            tender_id: contract.tender_id,
            winner: winnerNorm || "",
            district: contract.procuring_entity_district || "",
            ministry: (contract.ministry || "").slice(0, 100),
            method: contract.procurement_method || "",
            is_outlier: contract.is_price_outlier ? true : false,
            z_score: contract.price_z_score || 0,
            contract_price_bdt: contract.contract_price_bdt || 0,
            package_name: (contract.package_name || "").slice(0, 200),
          },
        },
      ]);
      embedded = true;
    } catch (err) {
      console.error("[ingest] embed/upsert failed for", contract.tender_id, err);
      // Don't fail the whole request — D1 succeeded, Vectorize is best-effort.
    }
  }

  return {
    tender_id: contract.tender_id,
    embedded,
    owners_inserted: ownersInserted,
  };
}

/**
 * Batch ingest — accepts NDJSON in the request body.
 * Used by the local scraper after a crawl completes.
 */
export async function handleIngestBatch(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const authErr = requireAdmin(request, env);
  if (authErr) return withCors(authErr, request, env);

  if (request.method !== "POST") {
    return withCors(
      new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  }

  const text = await request.text();
  const lines = text.split("\n").filter((l) => l.trim());

  let ok = 0;
  let failed = 0;
  const errors: Array<{ tender_id?: string; message: string }> = [];

  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      const owners = record.beneficial_owners || [];
      delete record.beneficial_owners;
      const result = await ingestContract(record, owners, env);
      console.log(`[ingest-batch] ok: ${record.tender_id}`, result);
      ok++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[ingest-batch] failed: ${message}`);
      try {
        const parsed = JSON.parse(line);
        errors.push({ tender_id: parsed?.tender_id, message });
      } catch {
        errors.push({ message });
      }
    }
  }

  return withCors(
    new Response(
      JSON.stringify({
        total: lines.length,
        ok,
        failed,
        errors: errors.slice(0, 10),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ),
    request,
    env
  );
}