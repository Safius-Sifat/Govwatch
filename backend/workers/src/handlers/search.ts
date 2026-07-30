/**
 * Search handler — the core RAG pipeline.
 *
 * Flow:
 *   1. Detect language (Bangla vs English).
 *   2. Embed the query with bge-m3.
 *   3. Run PARALLEL retrieval:
 *      a. Vectorize top-K (semantic similarity)
 *      b. D1 FTS5 top-K (BM25 keyword)
 *   4. Reciprocal Rank Fusion (RRF) to merge the two lists.
 *   5. Fetch full contract records for the top N.
 *   6. Build a strict citation-enforced system prompt.
 *   7. Stream Llama 3.1 8B response via SSE, with structured events
 *      (citations, anomalies, vendor-graph) alongside text deltas.
 */

import type { Env } from "../env";
import { embed } from "../lib/embedder";
import { buildFtsQuery, detectLanguage } from "../lib/text";
import { preflight, withCors } from "../lib/cors";
import { formatBdt } from "../lib/text";
import { streamCompletion } from "../lib/llm";
import type {
  Contract,
  Citation,
  AnomalyCard,
  StreamEvent,
} from "../lib/types";

interface SearchRequest {
  query: string;
  language?: "bn" | "en";
  top_k?: number;
}

export async function handleSearch(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);

  const t0 = Date.now();

  let body: SearchRequest;
  try {
    body = await request.json();
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

  const query = (body.query || "").trim();
  if (!query) {
    return withCors(
      new Response(JSON.stringify({ error: "Missing query" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
      request,
      env
    );
  }

  const language = body.language || detectLanguage(query);
  const topK = Math.min(
    body.top_k || parseInt(env.SEARCH_TOP_K_FINAL || "7", 10),
    20
  );

  try {
    // 1. Embed the query (best-effort; if AI binding fails, we fall back to FTS-only).
    let queryVec: number[] | null = null;
    try {
      queryVec = await embed(query, env.AI);
    } catch (err) {
      console.warn("[search] embed failed; falling back to FTS-only:", err);
    }

    // 2. Parallel retrieval.
    const ftsQuery = buildFtsQuery(query);
    const vectorTopK = parseInt(env.SEARCH_TOP_K_VECTOR || "30", 10);
    const ftsTopK = parseInt(env.SEARCH_TOP_K_FTS || "30", 10);

    const vectorPromise = queryVec && env.VECTORIZE
      ? env.VECTORIZE.query(queryVec, {
          topK: vectorTopK,
          returnMetadata: "all",
        }).catch((err: unknown) => {
          console.warn("[search] vectorize.query failed; continuing with FTS only:", err);
          return { matches: [], count: 0 };
        })
      : Promise.resolve({ matches: [], count: 0 });

    const ftsPromise = ftsQuery
      ? env.DB.prepare(
          `SELECT cf.tender_id, c.winner_name, c.package_name, c.ministry,
                  c.procuring_entity_district, c.contract_price_bdt, c.is_price_outlier
           FROM contracts_fts cf
           JOIN contracts c ON c.rowid = cf.rowid
           WHERE cf.contracts_fts MATCH ?
           ORDER BY rank
           LIMIT ?`
        )
          .bind(ftsQuery, ftsTopK)
          .all<{
            tender_id: string;
            winner_name: string;
            package_name: string;
            ministry: string;
            procuring_entity_district: string;
            contract_price_bdt: number;
            is_price_outlier: number;
          }>()
      : Promise.resolve({ results: [], success: true, meta: {} } as any);

    const [vectorMatches, ftsMatches] = await Promise.all([vectorPromise, ftsPromise]);

    // 3. Reciprocal Rank Fusion.
    const fused = reciprocalRankFusion(
      vectorMatches.matches.map((m) => ({ id: m.id, score: m.score, metadata: m.metadata })),
      (ftsMatches.results || []).map((r: any, i: number) => ({ id: r.tender_id, rank: i + 1, row: r }))
    );

    const topIds = fused.slice(0, topK).map((x) => x.id);

    // 4. Fetch full contract records.
    const contracts = await fetchFullContracts(topIds, env);

    // 5. Build citations.
    const citations: Citation[] = contracts.map((c) => ({
      tender_id: c.tender_id,
      title: c.package_name || c.tender_ref_no || c.tender_id,
      source: c.source || "egp",
      district: c.procuring_entity_district,
      ministry: c.ministry,
      winner: c.winner_name,
      contract_price_bdt: c.contract_price_bdt,
      detail_url: c.detail_url,
      is_price_outlier: Boolean(c.is_price_outlier),
      price_z_score: c.price_z_score,
    }));

    // 6. Detect anomalies.
    const anomaly = buildAnomalyCard(contracts);

    // 7. Build the system prompt.
    const systemPrompt = buildSystemPrompt(language, contracts);

    // 8. Stream LLM response with structured events.
    // The LLM step requires a provider (OpenAI or Workers AI); gracefully
    // degrade if it fails so the UI still gets citations + a fallback summary.
    let llmStream: AsyncIterable<{ type: string; text?: string; message?: string }> | null = null;
    try {
      llmStream = await streamCompletion(
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query },
          ],
          temperature: 0.2,
          max_tokens: 1024,
        },
        env
      );
    } catch (err) {
      console.warn("[search] LLM run failed; emitting citations + raw context only:", err);
    }

    const encoder = new TextEncoder();

    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          // Emit citations first.
          emit(controller, encoder, { type: "citations", data: citations });

          // Emit anomaly card if present.
          if (anomaly) {
            emit(controller, encoder, { type: "anomaly", data: anomaly });
          }

          if (llmStream) {
            // Stream the LLM tokens.
            for await (const chunk of llmStream) {
              if (chunk.type === "text" && chunk.text) {
                emit(controller, encoder, { type: "text-delta", data: chunk.text });
              } else if (chunk.type === "error") {
                console.warn("[search] LLM chunk error:", chunk.message);
              }
            }
          } else {
            // Fallback: emit a deterministic summary so the UI still has something to render.
            const fallbackSummary = buildFallbackSummary(language, query, contracts, anomaly);
            emit(controller, encoder, { type: "text-delta", data: fallbackSummary });
          }

          const latency = Date.now() - t0;
          emit(controller, encoder, { type: "done", data: { latency_ms: latency } });

          // Log the query for analytics (best-effort).
          env.DB.prepare(
            "INSERT INTO query_log (query_text, query_language, results_count, latency_ms) VALUES (?, ?, ?, ?)"
          )
            .bind(query, language, citations.length, latency)
            .run()
            .catch(() => {/* ignore */});

          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[search] stream error", err);
          emit(controller, encoder, { type: "error", data: { message } });
          controller.close();
        }
      },
    });

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        ...Object.fromEntries(
          Object.entries({
            "Access-Control-Allow-Origin":
              request.headers.get("Origin") || env.ALLOWED_ORIGIN || "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          })
        ),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[search] error", message, err);
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
 * Reciprocal Rank Fusion (RRF) — combines two ranked lists.
 * Standard k=60 in the literature (Cormack et al., 2009).
 */
function reciprocalRankFusion(
  vector: Array<{ id: string; score: number; metadata?: any }>,
  fts: Array<{ id: string; rank: number; row: any }>
): Array<{ id: string; score: number }> {
  const k = 60;
  const scores = new Map<string, number>();

  vector.forEach((r, i) => {
    scores.set(r.id, (scores.get(r.id) || 0) + 1 / (k + i + 1));
  });

  fts.forEach((r) => {
    scores.set(r.id, (scores.get(r.id) || 0) + 1 / (k + r.rank));
  });

  return Array.from(scores.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Fetch full contract rows for the top-K IDs.
 * The vector store only has metadata, not the full text.
 */
async function fetchFullContracts(ids: string[], env: Env): Promise<Contract[]> {
  if (ids.length === 0) return [];

  // D1 doesn't support bind arrays directly, so build a parameterized OR.
  const placeholders = ids.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT * FROM contracts WHERE tender_id IN (${placeholders})`
  )
    .bind(...ids)
    .all<Contract>();

  // Preserve the input ordering (by RRF score).
  const byId = new Map((result.results || []).map((c) => [c.tender_id, c]));
  return ids.map((id) => byId.get(id)).filter((c): c is Contract => Boolean(c));
}

/**
 * If any of the top contracts is a price outlier, surface one as an anomaly card.
 * The UI uses this to render the z-score gauge widget.
 */
function buildAnomalyCard(contracts: Contract[]): AnomalyCard | null {
  const outlier = contracts.find((c) => c.is_price_outlier && c.price_z_score && c.median_bdt);
  if (!outlier || !outlier.price_z_score || !outlier.median_bdt) return null;

  const pctAbove = ((outlier.contract_price_bdt! - outlier.median_bdt) / outlier.median_bdt) * 100;

  return {
    tender_id: outlier.tender_id,
    title: outlier.package_name || "",
    item: outlier.package_name || "",
    district: outlier.procuring_entity_district || "",
    ministry: outlier.ministry || "",
    winner: outlier.winner_name || "",
    awarded_bdt: outlier.contract_price_bdt || 0,
    median_bdt: outlier.median_bdt,
    z_score: outlier.price_z_score,
    pct_above_median: pctAbove,
  };
}

/**
 * Build the strict citation-enforced system prompt.
 */
function buildSystemPrompt(language: "bn" | "en", contracts: Contract[]): string {
  const contextBlock = contracts
    .map((c, i) => {
      const price = c.contract_price_bdt
        ? formatBdt(c.contract_price_bdt, language)
        : "N/A";
      return `[Doc ${i + 1} | ID: ${c.tender_id} | Source: ${c.source || "egp"}]
Title: ${c.package_name || c.tender_ref_no || "N/A"}
Winner: ${c.winner_name || "N/A"} (${c.procuring_entity_district || "N/A"})
Price: ${price}
Method: ${c.procurement_method || "N/A"}
Ministry: ${c.ministry || "N/A"}
Signing Date: ${c.contract_signing_date || "N/A"}
${c.is_price_outlier ? `⚠️ Price outlier: ${c.price_z_score?.toFixed(2)}σ above median (${formatBdt(c.median_bdt || 0, language)})` : ""}`;
    })
    .join("\n\n");

  const langInstr =
    language === "bn"
      ? `আপনি বাংলাদেশের জন্য একটি নাগরিক গোয়েন্দা সহকারী। প্রতিটি তথ্য, পরিমাণ, তারিখ বা নামের জন্য অবশ্যই [উৎস N] উল্লেখ করুন।`
      : `You are an investigative civic intelligence assistant for Bangladesh. Every fact, amount, date, or name MUST end with an inline [Source N] citation.`;

  const rules =
    language === "bn"
      ? `নিয়ম:
১. প্রতিটি তথ্য [উৎস N] দিয়ে শেষ করুন।
২. তথ্য যথেষ্ট না হলে স্পষ্ট বাংলায় বলুন: "প্রদত্ত সরকারি রেকর্ডে এ বিষয়ে পর্যাপ্ত তথ্য পাওয়া যায়নি।"
৩. অনুমান বা রাজনৈতিক মোটিভ যোগ করবেন না।`
      : `RULES:
1. Every claim MUST end with an inline [Source N] citation.
2. If the context is insufficient, say so plainly in Bangla: "প্রদত্ত সরকারি রেকর্ডে এ বিষয়ে পর্যাপ্ত তথ্য পাওয়া যায়নি।"
3. Do not extrapolate, infer motives, or hallucinate.`;

  return `${langInstr}

${rules}

CONTEXT DOCUMENTS:
${contextBlock}

USER QUESTION:
(answer the user's question using ONLY the context above)`;
}

function emit(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  event: StreamEvent
): void {
  controller.enqueue(
    encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
  );
}

/**
 * Deterministic fallback summary when the LLM is unavailable.
 * Renders a templated answer in the requested language so the UI
 * still has something to show in the deferred-llm dev mode.
 */
function buildFallbackSummary(
  language: "bn" | "en",
  query: string,
  contracts: Contract[],
  anomaly: AnomalyCard | null
): string {
  if (contracts.length === 0) {
    return language === "bn"
      ? `প্রদত্ত সরকারি রেকর্ডে "${query}" বিষয়ে কোনো তথ্য পাওয়া যায়নি।`
      : `No records found in the government database for "${query}".`;
  }

  const lines: string[] = [];
  if (language === "bn") {
    lines.push(`"${query}" বিষয়ে ${contracts.length}টি সরকারি রেকর্ড পাওয়া গেছে:\n`);
    contracts.slice(0, 5).forEach((c, i) => {
      const price = c.contract_price_bdt ? formatBdt(c.contract_price_bdt, language) : "N/A";
      lines.push(
        `${i + 1}. **${c.package_name || c.tender_ref_no || c.tender_id}** [উৎস ${i + 1}]\n` +
          `   - ঠিকাদার: ${c.winner_name || "N/A"} (${c.procuring_entity_district || "N/A"})\n` +
          `   - মূল্য: ${price}\n` +
          `   - পদ্ধতি: ${c.procurement_method || "N/A"}\n` +
          `   - তারিখ: ${c.contract_signing_date || "N/A"}` +
          (c.is_price_outlier && c.price_z_score
            ? `\n   - ⚠️ মধ্যম মূল্যের চেয়ে ${c.price_z_score.toFixed(2)}σ বেশি`
            : "")
      );
    });
  } else {
    lines.push(`Found ${contracts.length} government records for "${query}":\n`);
    contracts.slice(0, 5).forEach((c, i) => {
      const price = c.contract_price_bdt ? formatBdt(c.contract_price_bdt, language) : "N/A";
      lines.push(
        `${i + 1}. **${c.package_name || c.tender_ref_no || c.tender_id}** [Source ${i + 1}]\n` +
          `   - Winner: ${c.winner_name || "N/A"} (${c.procuring_entity_district || "N/A"})\n` +
          `   - Price: ${price}\n` +
          `   - Method: ${c.procurement_method || "N/A"}\n` +
          `   - Signed: ${c.contract_signing_date || "N/A"}` +
          (c.is_price_outlier && c.price_z_score
            ? `\n   - ⚠️ ${c.price_z_score.toFixed(2)}σ above median`
            : "")
      );
    });
  }

  if (anomaly) {
    lines.push(
      language === "bn"
        ? `\n\n🚨 **দুর্নীতি সতর্কতা**: ${anomaly.winner} কে ${formatBdt(anomaly.awarded_bdt, language)} মূল্যের চুক্তি দেওয়া হয়েছে, যা মধ্যমা মূল্য ${formatBdt(anomaly.median_bdt, language)} থেকে ${anomaly.pct_above_median.toFixed(0)}% বেশি।`
        : `\n\n🚨 **Anomaly Alert**: ${anomaly.winner} was awarded a contract worth ${formatBdt(anomaly.awarded_bdt, language)} — ${anomaly.pct_above_median.toFixed(0)}% above the median of ${formatBdt(anomaly.median_bdt, language)}.`
    );
  }

  return lines.join("\n");
}