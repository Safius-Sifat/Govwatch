import type { Language } from '@/lib/govwatch/types'
import { t } from '@/lib/govwatch/i18n'

/**
 * Footer with data source credit and a small note.
 */
export function GovWatchFooter({ language = 'bn' }: { language?: Language }) {
  return (
    <footer className="mt-12 border-t bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>{t(language, 'footer_credit')}</div>
        <div>
          Built for the{' '}
          <span className="font-medium text-foreground">Bangladesh civic AI hackathon</span>.
        </div>
      </div>
    </footer>
  )
}
