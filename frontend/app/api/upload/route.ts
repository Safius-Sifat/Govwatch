/**
 * Upload endpoint is unused in GovWatch.
 * Kept as a no-op so the build succeeds and the route remains available
 * for future re-use.
 */
export async function POST() {
  return new Response('Upload disabled in GovWatch build', { status: 204 })
}
