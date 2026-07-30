/**
 * GovWatch does not use Langfuse / OpenTelemetry for tracing.
 * This file is intentionally a no-op `register()` — but we also
 * re-export a stub `langfuseSpanProcessor` so that Morphic files we
 * keep around (e.g. `lib/streaming/create-chat-stream-response.ts`)
 * type-check even though they are never invoked by GovWatch.
 */

type LangfuseSpanProcessorStub = {
  forceFlush: () => Promise<void>
}

export const langfuseSpanProcessor: LangfuseSpanProcessorStub = {
  forceFlush: async () => {},
}

export async function register() {
  // No-op for GovWatch.
}