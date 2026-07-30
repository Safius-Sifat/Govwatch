/**
 * ShottoPrakash API Gateway — main entry point.
 *
 * Routes:
 *   POST /api/search          — public, hybrid search + LLM streaming
 *   POST /api/ingest          — admin, single contract ingest
 *   POST /api/ingest-batch    — admin, NDJSON batch ingest
 *   GET  /api/anomalies       — public, top price outliers
 *   GET  /api/vendors/:name/collusion — public, vendor + directors + collusion
 *   GET  /api/vendors/top     — public, top vendors
 *   GET  /api/stats           — public, corpus counts
 *   GET  /api/ministries      — public, ministry list
 *   GET  /api/districts       — public, district list
 *   GET  /api/pdf/:key        — public, PDF proxy from R2
 *   GET  /                    — health + endpoint list
 *
 * Cron:
 *   every 6 hours            — scheduled re-ingest (production)
 */

import type { Env } from "./env";
import { handleSearch } from "./handlers/search";
import { handleIngest, handleIngestBatch } from "./handlers/ingest";
import { handleAnomalies } from "./handlers/anomalies";
import { handleVendorCollusion, handleTopVendors } from "./handlers/vendors";
import { handlePdf } from "./handlers/pdf";
import { handleRoot, handleStats, handleMinistries, handleDistricts } from "./handlers/stats";
import { preflight } from "./lib/cors";

export default {
  /**
   * HTTP request handler.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for any endpoint.
    if (request.method === "OPTIONS") {
      return preflight(request, env);
    }

    const path = url.pathname;

    try {
      // === Health ===
      if (path === "/" || path === "/health") {
        return handleRoot(request, env);
      }

      // === Search ===
      if (path === "/api/search" && request.method === "POST") {
        return handleSearch(request, env);
      }

      // === Ingest (write-side) ===
      if (path === "/api/ingest" && request.method === "POST") {
        return handleIngest(request, env);
      }
      if (path === "/api/ingest-batch" && request.method === "POST") {
        return handleIngestBatch(request, env);
      }

      // === Anomalies ===
      if (path === "/api/anomalies" && request.method === "GET") {
        return handleAnomalies(request, env);
      }

      // === Vendors ===
      if (path === "/api/vendors/top" && request.method === "GET") {
        return handleTopVendors(request, env);
      }
      const vendorMatch = path.match(/^\/api\/vendors\/(.+?)\/collusion$/);
      if (vendorMatch && request.method === "GET") {
        return handleVendorCollusion(request, env);
      }

      // === Stats & filters ===
      if (path === "/api/stats" && request.method === "GET") {
        return handleStats(request, env);
      }
      if (path === "/api/ministries" && request.method === "GET") {
        return handleMinistries(request, env);
      }
      if (path === "/api/districts" && request.method === "GET") {
        return handleDistricts(request, env);
      }

      // === PDF proxy ===
      if (path.startsWith("/api/pdf/") && request.method === "GET") {
        return handlePdf(request, env);
      }

      // === 404 ===
      return new Response(
        JSON.stringify({ error: "Not found", path }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
          },
        }
      );
    } catch (err) {
      console.error("[router] unhandled error", err);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: err instanceof Error ? err.message : String(err),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },

  /**
   * Cron trigger — runs every 6 hours in production.
   *
   * For the demo this just logs; in production it would dispatch
   * the Python scraper to Modal/Hetzner and the results would land
   * here via /api/ingest-batch.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log("[cron] tick at", new Date().toISOString());

    // For now, just emit a log line. To wire this up to a real
    // scraper, you'd:
    //   1. POST to Modal/Hetzner to start a scraper run
    //   2. Wait for it to push results to a Cloudflare Queue
    //   3. The queue consumer calls /api/ingest-batch
    ctx.waitUntil(
      env.DB.prepare("SELECT COUNT(*) as n FROM contracts").first<{ n: number }>()
        .then((r) => console.log("[cron] current contract count:", r?.n))
        .catch((e) => console.error("[cron] error", e))
    );
  },
};