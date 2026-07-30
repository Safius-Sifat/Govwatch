'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Square } from 'lucide-react'

import { AnomalyAlertCard } from '@/components/search/anomaly-alert-card'
import { CitationCard } from '@/components/search/citation-card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { t } from '@/lib/govwatch/i18n'
import type { Language } from '@/lib/govwatch/types'
import {
  useGovWatchSearch,
  type ChatMessage,
} from '@/lib/govwatch/use-search-stream'

/**
 * GovWatch's own chat UI — simpler than Morphic's. Single input bar,
 * streaming response, citations and anomaly cards below the answer.
 * Replaces the existing useChat-based chat on the home page and the
 * search page.
 */
export function GovWatchChat({
  initialQuery = '',
  language = 'bn',
}: {
  initialQuery?: string
  language?: Language
}) {
  const router = useRouter()
  const { messages, isStreaming, submit, stop, reset } = useGovWatchSearch()
  const [draft, setDraft] = useState(initialQuery)
  const lastSubmittedRef = useRef('')

  // If a query comes in via prop (e.g. /search?q=...) and we haven't
  // submitted it yet, submit it once on mount.
  useEffect(() => {
    if (initialQuery && lastSubmittedRef.current !== initialQuery) {
      lastSubmittedRef.current = initialQuery
      submit(initialQuery, language)
    }
  }, [initialQuery, language, submit])

  const handleSubmit = async () => {
    const q = draft.trim()
    if (!q || isStreaming) return
    setDraft('')
    // If we're on the home page, push to /search?q=... so the URL is
    // shareable. If we're already on /search, just submit in-place.
    if (typeof window !== 'undefined' && window.location.pathname === '/') {
      router.push(`/search?q=${encodeURIComponent(q)}`)
      return
    }
    await submit(q, language)
  }

  const handleStop = () => stop()

  const handleReset = () => {
    reset()
    lastSubmittedRef.current = ''
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-4 py-6">
      {messages.length === 0 ? (
        <EmptyState
          language={language}
          onSuggestion={(q) => {
            setDraft(q)
            if (typeof window !== 'undefined' && window.location.pathname === '/') {
              router.push(`/search?q=${encodeURIComponent(q)}`)
            } else {
              submit(q, language)
            }
          }}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-6">
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} language={language} />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t(language, 'searching')}
            </div>
          )}
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 border-t bg-background/80 px-4 py-3 backdrop-blur">
        <form
          onSubmit={e => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex items-end gap-2"
        >
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={t(language, 'search_placeholder')}
            rows={1}
            className="min-h-[44px] flex-1 resize-none rounded-xl border bg-muted/30 px-3 py-2.5 text-sm focus-visible:ring-1"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSubmit()
              }
            }}
          />
          {isStreaming ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={handleStop}
              className="h-11 w-11 shrink-0 rounded-xl"
              aria-label="Stop"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!draft.trim()}
              className="h-11 w-11 shrink-0 rounded-xl"
              aria-label={t(language, 'search_button')}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </form>
        {messages.length > 0 && !isStreaming && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {language === 'bn' ? 'নতুন কথোপকথন' : 'New conversation'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({
  language,
  onSuggestion,
}: {
  language: Language
  onSuggestion: (q: string) => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {t(language, 'hero_title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          {t(language, 'hero_subtitle')}
        </p>
      </div>
      <div className="grid w-full max-w-2xl gap-2 md:grid-cols-2">
        <SuggestionCard
          label={t(language, 'suggestion_road_construction')}
          onClick={() => onSuggestion(t(language, 'suggestion_bangla'))}
        />
        <SuggestionCard
          label={t(language, 'suggestion_vendor')}
          onClick={() => onSuggestion(t(language, 'suggestion_vendor'))}
        />
        <SuggestionCard
          label={t(language, 'suggestion_anomaly')}
          onClick={() => onSuggestion(t(language, 'suggestion_anomaly'))}
        />
        <SuggestionCard
          label={t(language, 'suggestion_bangla')}
          onClick={() => onSuggestion(t(language, 'suggestion_bangla'))}
        />
      </div>
    </div>
  )
}

function SuggestionCard({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border bg-card p-3 text-left text-sm text-card-foreground transition-colors hover:border-primary/40 hover:bg-card/80"
    >
      {label}
    </button>
  )
}

function MessageBubble({
  message,
  language,
}: {
  message: ChatMessage
  language: Language
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm text-white shadow-sm">
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {message.text && (
        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
          {message.text}
          {message.streaming && (
            <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-foreground" />
          )}
        </div>
      )}

      {message.anomaly && (
        <AnomalyAlertCard anomaly={message.anomaly} language={language} />
      )}

      {message.citations && message.citations.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(language, 'citation_heading')} ({message.citations.length})
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {message.citations.slice(0, 6).map((c, i) => (
              <CitationCard key={`${c.tender_id}-${i}`} citation={c} language={language} />
            ))}
          </div>
        </div>
      )}

      {message.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-400">
          {message.error}
        </div>
      )}
    </div>
  )
}
