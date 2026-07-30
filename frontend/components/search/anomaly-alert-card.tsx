import { AlertTriangle } from 'lucide-react'

import type { Anomaly, Language } from '@/lib/govwatch/types'
import { t } from '@/lib/govwatch/i18n'

function formatBdt(n: number | null | undefined): string {
  if (n == null) return ''
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ৳`
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr ৳`
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L ৳`
  return `${n.toLocaleString('en-US')} ৳`
}

/**
 * Red-flag card for a contract the backend flagged as anomalous
 * (z-score on contract amount + procurement method bucket).
 */
export function AnomalyAlertCard({
  anomaly,
  language = 'bn',
}: {
  anomaly: Anomaly
  language?: Language
}) {
  const amount = formatBdt(anomaly.contract_amount_bdt)
  const zAmount =
    anomaly.zscore_amount != null ? anomaly.zscore_amount.toFixed(2) : null
  const zMethod =
    anomaly.zscore_method_bucket != null
      ? anomaly.zscore_method_bucket.toFixed(2)
      : null

  return (
    <div className="rounded-lg border-2 border-red-500/40 bg-red-500/5 p-4 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        <div className="font-semibold text-red-700 dark:text-red-400">
          {t(language, 'anomaly_alert')}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          #{anomaly.tender_id}
        </div>
      </div>

      <div className="mb-2 line-clamp-2 font-medium">
        {anomaly.ministry ?? anomaly.agency ?? ''}
        {anomaly.vendor_name && (
          <span className="ml-2 text-muted-foreground">
            — {anomaly.vendor_name}
          </span>
        )}
      </div>

      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        {amount && (
          <div>
            <div className="text-muted-foreground">{t(language, 'stats_value')}</div>
            <div className="font-semibold">{amount}</div>
          </div>
        )}
        {zAmount && (
          <div>
            <div className="text-muted-foreground">z-score (amount)</div>
            <div className="font-semibold">{zAmount}</div>
          </div>
        )}
        {zMethod && (
          <div>
            <div className="text-muted-foreground">z-score (method)</div>
            <div className="font-semibold">{zMethod}</div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {anomaly.flagged_reason ?? t(language, 'anomaly_explainer')}
      </p>
    </div>
  )
}