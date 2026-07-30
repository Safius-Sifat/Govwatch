import { cookies } from 'next/headers'

import { GovWatchChat } from '@/components/govwatch/chat'
import { GovWatchFooter } from '@/components/layout/govwatch-footer'
import { GovWatchHeader } from '@/components/layout/govwatch-header'
import { StatCard } from '@/components/stats/stat-card'
import { fetchStats } from '@/lib/govwatch/api'
import { t } from '@/lib/govwatch/i18n'
import type { Language } from '@/lib/govwatch/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const cookieStore = await cookies()
  const langCookie = cookieStore.get('govwatch_lang')?.value
  const language: Language = langCookie === 'en' ? 'en' : 'bn'

  const stats = await fetchStats()

  return (
    <div className="flex min-h-screen flex-col">
      <GovWatchHeader language={language} />

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="grid gap-8 md:grid-cols-[1fr,300px]">
            <div className="min-h-[60vh]">
              <GovWatchChat language={language} />
            </div>

            <aside className="space-y-2 md:sticky md:top-20 md:self-start">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(language, 'nav_stats')}
              </div>
              {stats ? (
                <>
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
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Stats unavailable — Worker may be offline.
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>

      <GovWatchFooter language={language} />
    </div>
  )
}
