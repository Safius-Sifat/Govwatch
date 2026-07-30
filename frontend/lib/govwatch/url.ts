/**
 * Helper to resolve the Worker URL from env.
 * In dev: WORKER_URL=http://127.0.0.1:8787
 * In prod: set to the deployed Worker URL.
 */
export function getWorkerUrl(): string {
  return process.env.WORKER_URL ?? 'http://127.0.0.1:8787'
}
