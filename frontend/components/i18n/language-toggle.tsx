'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'
import type { Language } from '@/lib/govwatch/types'

/**
 * EN / BN toggle. Sets the `govwatch_lang` cookie (1 year) and refreshes
 * the current route so server components re-render with the new lang.
 */
export function LanguageToggle({ current = 'bn' }: { current?: Language }) {
  const router = useRouter()

  const setLang = useCallback(
    (lang: Language) => {
      if (lang === current) return
      document.cookie = `govwatch_lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
      router.refresh()
    },
    [current, router],
  )

  return (
    <div className="inline-flex items-center gap-1 rounded-full border bg-background/70 p-1 text-xs">
      <Button
        variant={current === 'bn' ? 'default' : 'ghost'}
        size="sm"
        className="h-7 rounded-full px-3"
        onClick={() => setLang('bn')}
      >
        বাংলা
      </Button>
      <Button
        variant={current === 'en' ? 'default' : 'ghost'}
        size="sm"
        className="h-7 rounded-full px-3"
        onClick={() => setLang('en')}
      >
        EN
      </Button>
    </div>
  )
}
