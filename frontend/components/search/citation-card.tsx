import { ExternalLink } from 'lucide-react'

import type { Citation, Language } from '@/lib/govwatch/types'
import { t } from '@/lib/govwatch/i18n'

function formatBdt(n: number | null | undefined): string {
  if (n == null) return ''
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ৳`
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr ৳`
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L ৳`
  return `${n.toLocaleString('en-US')} ৳`
}

/**
 * Renders a single source citation — what was used to answer the
 * user's query. Shows the tender ID, ministry, vendor, amount, and a
 * snippet. Optionally links to the PDF if available.
 */
export function CitationCard({
  citation,
  language = 'bn',
}: {
  citation: Citation
  language?: Language
}) {
  const amount = formatBdt(citation.contract_amount_bdt)

  return (
    <div className="rounded-lg border bg-card p-4 text-sm transition-colors hover:border-primary/40 hover:bg-card/80">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="font-mono text-xs text-muted-foreground">
          #{citation.tender_id}
        </div>
        {amount && (
          <div className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {amount}
          </div>
        )}
      </div>

      <div className="mb-1 line-clamp-2 font-medium">
        {citation.ministry ?? citation.agency ?? t(language, 'sources_tender')}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        {citation.vendor_name && (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {citation.vendor_name}
          </span>
        )}
        {citation.procurement_method && (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {citation.procurement_method}
          </span>
        )}
        {citation.district && (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {citation.district}
          </span>
        )}
        {citation.contract_date && (
          <span className="rounded bg-muted px-1.5 py-0.5">
            {citation.contract_date.slice(0, 10)}
          </span>
        )}
      </div>

      <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {citation.snippet}
      </p>

      <div className="flex items-center gap-3 text-xs">
        {citation.pdf_url && (
          <a
            href={citation.pdf_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {t(language, 'sources_pdf')}
          </a>
        )}
      </div>
    </div>
  )
}