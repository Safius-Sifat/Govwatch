import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

/** @type {import('next').NextConfig} */
const nextConfig = {
  skipTrailingSlashRedirect: true,
  // The image optimizer is not supported on Cloudflare Workers, so we
  // disable it and pass all images through to their source origin.
  // PostHog /relay/* previously lived here as `rewrites()`; it's now a
  // Route Handler at app/relay/[...path]/route.ts (external rewrites
  // do not work for arbitrary hosts on Cloudflare Workers).
  images: {
    unoptimized: true
  }
}

export default nextConfig

initOpenNextCloudflareForDev()