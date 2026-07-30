import { notFound } from 'next/navigation'

import { GovWatchChat } from '@/components/govwatch/chat'
import { GovWatchFooter } from '@/components/layout/govwatch-footer'
import { GovWatchHeader } from '@/components/layout/govwatch-header'
import { cookies } from 'next/headers'
import type { Language } from '@/lib/govwatch/types'

/**
 * Saved-search page is unused in GovWatch (no chat history).
 * Kept as a placeholder that 404s so the build succeeds and the route
 * remains available for future re-use.
 */
export const dynamic = 'force-dynamic'

export default async function SavedSearchPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params
  // GovWatch has no chat persistence — saved-search IDs are not
  // resolvable. 404 for now.
  if (!id) notFound()

  const cookieStore = await cookies()
  const langCookie = cookieStore.get('govwatch_lang')?.value
  const language: Language = langCookie === 'en' ? 'en' : 'bn'

  return (
    <div className="flex min-h-screen flex-col">
      <GovWatchHeader language={language} />
      <main className="flex-1">
        <GovWatchChat language={language} />
      </main>
      <GovWatchFooter language={language} />
    </div>
  )
}
