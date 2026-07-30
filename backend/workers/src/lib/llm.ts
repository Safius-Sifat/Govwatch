/**
 * LLM provider abstraction.
 *
 * Two providers are supported:
 *   1. OpenAI (default) — much better Bangla, costs real money.
 *      Streaming via OpenAI's /v1/chat/completions SSE.
 *   2. Cloudflare Workers AI (fallback) — free but mediocre Bangla.
 *      Streaming via env.AI.run with stream: true.
 *
 * Selection is controlled by `LLM_PROVIDER` env var:
 *   - "openai"    -> use OpenAI (requires OPENAI_API_KEY)
 *   - "workersai" -> use Workers AI
 *   - absent      -> default to OpenAI if OPENAI_API_KEY is set, else Workers AI
 *
 * Both providers yield chunks of generated text. The caller is
 * responsible for putting them inside our own SSE envelope (event:
 * text-delta).
 */

import type { Env } from "../env";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  /** Sampling temperature. Default 0.2 (factual). */
  temperature?: number;
  /** Max tokens to generate. Default 1024. */
  max_tokens?: number;
}

export interface LLMChunk {
  type: "text" | "done" | "error";
  /** For type==="text", the new token(s). */
  text?: string;
  /** For type==="error", the error message. */
  message?: string;
}

export type LLMStream = AsyncIterable<LLMChunk>;

/**
 * Pick a provider and stream a completion.
 */
export async function streamCompletion(
  req: LLMRequest,
  env: Env
): Promise<LLMStream> {
  const provider = pickProvider(env);
  if (provider === "openai") {
    return streamOpenAI(req, env);
  }
  return streamWorkersAI(req, env);
}

function pickProvider(env: Env): "openai" | "workersai" {
  const explicit = (env.LLM_PROVIDER ?? "").toLowerCase();
  if (explicit === "openai") return "openai";
  if (explicit === "workersai") return "workersai";
  // Default: OpenAI if key is set, else Workers AI.
  if (env.OPENAI_API_KEY) return "openai";
  return "workersai";
}

/**
 * OpenAI streaming completion.
 *
 * OpenAI's /v1/chat/completions returns SSE chunks like:
 *   data: {"choices":[{"delta":{"content":"hello"}}]}
 *
 * We translate each chunk into our LLMChunk shape.
 */
async function streamOpenAI(req: LLMRequest, env: Env): Promise<LLMStream> {
  const model = env.OPENAI_MODEL ?? "gpt-4o-mini";
  const apiUrl = env.OPENAI_API_URL ?? "https://api.openai.com/v1/chat/completions";

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.max_tokens ?? 1024,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(
      `OpenAI ${model} -> ${upstream.status}: ${errText.slice(0, 200)}`
    );
  }

  return parseOpenAISseStream(upstream.body);
}

async function parseOpenAISseStream(
  body: ReadableStream<Uint8Array>
): Promise<LLMStream> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const queue: LLMChunk[] = [];
  let resolveNext: (() => void) | null = null;
  let streamError: Error | null = null;
  let streamDone = false;

  const pump = async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          streamDone = true;
          if (resolveNext) resolveNext();
          return;
        }
        buffer += decoder.decode(value, { stream: true });

        // SSE events separated by blank line.
        let splitIdx;
        while ((splitIdx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, splitIdx);
          buffer = buffer.slice(splitIdx + 2);

          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              streamDone = true;
              queue.push({ type: "done" });
              if (resolveNext) resolveNext();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                queue.push({ type: "text", text: delta });
                if (resolveNext) {
                  resolveNext();
                  resolveNext = null;
                }
              }
            } catch {
              // Skip malformed chunks.
            }
          }
        }
      }
    } catch (err) {
      streamError = err instanceof Error ? err : new Error(String(err));
      streamDone = true;
      if (resolveNext) resolveNext();
    }
  };
  // Don't await — background pump drives the queue.
  pump();

  return (async function* () {
    while (true) {
      if (streamError) throw streamError;
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (streamDone) return;
      await new Promise<void>(r => {
        resolveNext = r;
      });
    }
  })();
}

/**
 * Cloudflare Workers AI streaming completion.
 *
 * `env.AI.run(model, { messages, stream: true })` returns a
 * ReadableStream that emits `{ response: string }` chunks.
 */
async function streamWorkersAI(req: LLMRequest, env: Env): Promise<LLMStream> {
  const model = env.WORKERSAI_MODEL ?? "@cf/meta/llama-3.1-8b-instruct";

  const upstream = await env.AI.run(model as any, {
    messages: req.messages,
    stream: true,
    max_tokens: req.max_tokens ?? 1024,
    temperature: req.temperature ?? 0.2,
  });

  if (!upstream) {
    throw new Error("Workers AI returned no stream");
  }

  return (async function* () {
    try {
      for await (const chunk of upstream as unknown as AsyncIterable<{ response: string }>) {
        const text = chunk?.response || "";
        if (text) yield { type: "text", text };
      }
      yield { type: "done" };
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  })();
}
