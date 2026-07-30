/**
 * Chats endpoint is unused in GovWatch (no chat history).
 * Kept as a no-op so the build succeeds.
 */
export async function GET() {
  return new Response(JSON.stringify([]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
