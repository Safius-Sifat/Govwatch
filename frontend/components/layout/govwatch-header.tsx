import Link from 'next/link'

import { LanguageToggle } from '@/components/i18n/language-toggle'
import type { Language } from '@/lib/govwatch/types'
import { t } from '@/lib/govwatch/i18n'

/**
 * Top nav for GovWatch. Logo + nav links + language toggle.
 * Server component — no client state.
 */
export function GovWatchHeader({ language = 'bn' }: { language?: Language }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-white">
            <span className="text-xs font-bold">GW</span>
          </span>
          <span>{t(language, 'brand')}</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          <NavLink href="/" label={t(language, 'nav_search')} />
          <NavLink href="/anomalies" label={t(language, 'nav_anomalies')} />
          <NavLink href="/vendors" label={t(language, 'nav_vendors')} />
          <NavLink href="/stats" label={t(language, 'nav_stats')} />
          <NavLink href="/about" label={t(language, 'nav_about')} />
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle current={language} />
        </div>
      </div>
    </header>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {label}
    </Link>
  )
}
