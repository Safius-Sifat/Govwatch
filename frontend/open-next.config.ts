import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'

// OpenNext Cloudflare config for GovWatch.
//
// The R2 incremental cache binding is declared in `wrangler.toml` (commented
// out until the bucket is provisioned). Once the bucket exists, uncomment
// the `[[r2_buckets]]` block there and this override will take effect.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache
})
