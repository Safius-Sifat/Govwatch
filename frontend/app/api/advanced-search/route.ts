/**
 * Advanced search endpoint is unused in GovWatch (SearXNG/etc).
 * Kept as a no-op so the build succeeds.
 */
export async function POST() {
  return new Response('Advanced search disabled in GovWatch build', {
    status: 204,
  })
}
