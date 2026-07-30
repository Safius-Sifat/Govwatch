/**
 * Strongly-typed environment bindings for the Worker.
 *
 * Each binding declared in wrangler.toml surfaces here with full
 * type-safety. If you add a binding, add it to this file too.
 */

export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  STORAGE: R2Bucket;
  AI: Ai;

  // Vars (from wrangler.toml [vars])
  LOG_LEVEL: string;
  DEFAULT_LANGUAGE: "bn" | "en";
  SEARCH_TOP_K_VECTOR: string;
  SEARCH_TOP_K_FTS: string;
  SEARCH_TOP_K_FINAL: string;
  ANOMALY_Z_THRESHOLD: string;

  // Secrets (set via wrangler secret put)
  ADMIN_TOKEN?: string;
  ALLOWED_ORIGIN?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_URL?: string;
  OPENAI_MODEL?: string;
  LLM_PROVIDER?: string;
  WORKERSAI_MODEL?: string;
}

/**
 * Augment Cloudflare's built-in types with our R2 bucket type.
 */
declare global {
  interface VectorizeIndex {
    query(
      vector: number[],
      options?: {
        topK?: number;
        returnMetadata?: "all" | "indexed" | "none";
        filter?: Record<string, any>;
      }
    ): Promise<VectorizeMatches>;

    upsert(
      vectors: VectorizeVector[]
    ): Promise<VectorizeUpsertResult>;

    describe(): Promise<{
      name: string;
      dimensions: number;
      metric: string;
      vectorCount?: number;
    }>;
  }

  interface VectorizeVector {
    id: string;
    values: number[];
    metadata?: Record<string, VectorizeMetadataValue>;
  }

  type VectorizeMetadataValue = string | number | boolean | string[];
  type VectorizeMatches = {
    matches: Array<{
      id: string;
      score: number;
      metadata?: Record<string, VectorizeMetadataValue>;
    }>;
    count: number;
  };

  interface VectorizeUpsertResult {
    ids: string[];
    count: number;
  }
}

export {};