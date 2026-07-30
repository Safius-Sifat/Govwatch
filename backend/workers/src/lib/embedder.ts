/**
 * Embedding layer — wraps Workers AI's bge-m3 model.
 *
 * bge-m3 is multilingual (English + Bengali + 100+ others) and outputs
 * 1024-dimensional dense vectors. We use it for both the documents
 * we ingest and the user queries at search time — the model must be
 * the same or cosine similarity is meaningless.
 */

// The Ai binding type is globally available from
// @cloudflare/workers-types, which is included via env.d.ts.

const EMBEDDING_MODEL = "@cf/baai/bge-m3" as const;
const EMBEDDING_DIM = 1024;

/**
 * Embed a single text string into a 1024-dim vector.
 *
 * Workers AI returns: { shape: [1, 1024], data: [[...]] }
 */
export async function embed(text: string, ai: Ai): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot embed empty text");
  }

  // Truncate to ~8000 chars to stay well under the model's input limit.
  const truncated = text.slice(0, 8000);

  const result = (await ai.run(EMBEDDING_MODEL, {
    text: truncated,
  })) as { data: number[][] };

  const vec = result.data[0];
  if (!vec || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${vec?.length}`
    );
  }
  return vec;
}

/**
 * Embed a batch of texts in a single API call.
 * Returns vectors in the same order as the input.
 */
export async function embedBatch(texts: string[], ai: Ai): Promise<number[][]> {
  const result = (await ai.run(EMBEDDING_MODEL, {
    text: texts.map((t) => t.slice(0, 8000)),
  })) as { data: number[][] };

  return result.data;
}

export const EMBEDDING_DIMENSIONS = EMBEDDING_DIM;