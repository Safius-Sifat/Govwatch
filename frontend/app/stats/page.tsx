import { cookies } from 'next/headers'

import { GovWatchFooter } from '@/components/layout/govwatch-footer'
import { GovWatchHeader } from '@/components/layout/govwatch-header'
import { StatCard } from '@/components/stats/stat-card'
import { fetchStats } from '@/lib/govwatch/api'
import { t } from '@/lib/govwatch/i18n'
import type { Language } from '@/lib/govwatch/types'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const cookieStore = await cookies()
  const langCookie = cookieStore.get('govwatch_lang')?.value
  const language: Language = langCookie === 'en' ? 'en' : 'bn'

  const stats = await fetchStats()

  return (
    <div className="flex min-h-screen flex-col">
      <GovWatchHeader language={language} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          {t(language, 'nav_stats')}
        </h1>

        {stats ? (
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <StatCard
              label={t(language, 'stats_contracts')}
              value={(stats.contracts ?? 0).toLocaleString('en-US')}
            />
            <StatCard
              label={t(language, 'stats_vendors')}
              value={(stats.vendors ?? 0).toLocaleString('en-US')}
            />
            <StatCard
              label={t(language, 'stats_anomalies')}
              value={(stats.outliers ?? 0).toLocaleString('en-US')}
              accent="red"
            />
            <StatCard
              label="Directors"
              value={(stats.directors ?? 0).toLocaleString('en-US')}
            />
            <StatCard
              label="Vectors"
              value={(stats.vectors ?? 0).toLocaleString('en-US')}
            />
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
            Stats unavailable — the Worker backend may be offline. Run{' '}
            <code className="rounded bg-background px-1.5 py-0.5 text-xs">
              cd backend/workers && npm run dev
            </code>{' '}
            to start it.
          </div>
        )}
      </main>

      <GovWatchFooter language={language} />
    </div>
  )
}
