import { cookies } from 'next/headers'

import { GovWatchChat } from '@/components/govwatch/chat'
import { GovWatchFooter } from '@/components/layout/govwatch-footer'
import { GovWatchHeader } from '@/components/layout/govwatch-header'
import type { Language } from '@/lib/govwatch/types'

export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const params = await searchParams
  const query = typeof params.q === 'string' ? params.q : ''

  const cookieStore = await cookies()
  const langCookie = cookieStore.get('govwatch_lang')?.value
  const language: Language = langCookie === 'en' ? 'en' : 'bn'

  return (
    <div className="flex min-h-screen flex-col">
      <GovWatchHeader language={language} />

      <main className="flex-1">
        <GovWatchChat initialQuery={query} language={language} />
      </main>

      <GovWatchFooter language={language} />
    </div>
  )
}
