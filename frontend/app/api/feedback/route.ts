/**
 * Feedback endpoint is unused in GovWatch (we don't have auth/DB).
 * Kept as a no-op so the build succeeds and the route remains available
 * for future re-use.
 */
export async function POST() {
  return new Response('Feedback disabled in GovWatch build', { status: 204 })
}
