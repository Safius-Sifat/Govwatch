import { cookies } from 'next/headers'

import { GovWatchChat } from '@/components/govwatch/chat'
import { GovWatchFooter } from '@/components/layout/govwatch-footer'
import { GovWatchHeader } from '@/components/layout/govwatch-header'
import type { Language } from '@/lib/govwatch/types'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const cookieStore = await cookies()
  const langCookie = cookieStore.get('govwatch_lang')?.value
  const language: Language = langCookie === 'en' ? 'en' : 'bn'

  return (
    <div className="flex min-h-screen flex-col">
      <GovWatchHeader language={language} />

      <main className="flex-1">
        <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-8">
          <GovWatchChat language={language} />
        </div>
      </main>

      <GovWatchFooter language={language} />
    </div>
  )
}
