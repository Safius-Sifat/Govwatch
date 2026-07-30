'use client'

import { useCallback, useRef, useState } from 'react'

import type { Anomaly, Citation, SearchEvent } from './types'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  /** Citations attached to the assistant's response (emitted at start) */
  citations?: Citation[]
  /** Anomaly card attached to the assistant's response */
  anomaly?: Anomaly
  /** True while this message is still being streamed */
  streaming?: boolean
  /** Set if this message resulted from an error */
  error?: string
}

/**
 * Lightweight chat hook that consumes our /api/search SSE stream.
 *
 * Unlike @ai-sdk/react's `useChat`, this hook has no concept of
 * tool-calls, regeneration, or JSON-render — it's tuned for the
 * GovWatch backend's exact event shape (citations, anomaly, text-delta,
 * done).
 */
export function useGovWatchSearch() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const appendUserMessage = useCallback((text: string) => {
    const id = crypto.randomUUID()
    setMessages(prev => [...prev, { id, role: 'user', text }])
    return id
  }, [])

  const submit = useCallback(
    async (query: string, language: 'bn' | 'en' = 'bn') => {
      const userId = appendUserMessage(query)
      const assistantId = crypto.randomUUID()

      // Optimistic assistant message — empty, streaming.
      setMessages(prev => [
        ...prev,
        { id: assistantId, role: 'assistant', text: '', streaming: true },
      ])

      const abort = new AbortController()
      abortRef.current?.abort()
      abortRef.current = abort
      setIsStreaming(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query, language, userMessageId: userId }),
          signal: abort.signal,
        })

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => 'Unknown error')
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    text: `Error: ${res.status} — ${errText}`,
                    error: errText,
                    streaming: false,
                  }
                : m,
            ),
          )
          return
        }

        // Parse SSE into typed events.
        await consumeSseStream(res.body, (event: SearchEvent) => {
          if (event.type === 'text-delta') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, text: m.text + event.delta }
                  : m,
              ),
            )
          } else if (event.type === 'citations') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, citations: event.citations }
                  : m,
              ),
            )
          } else if (event.type === 'anomaly') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, anomaly: event.anomaly }
                  : m,
              ),
            )
          } else if (event.type === 'done') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId ? { ...m, streaming: false } : m,
              ),
            )
          } else if (event.type === 'error') {
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, error: event.message, streaming: false }
                  : m,
              ),
            )
          }
        })

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          ),
        )
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, error: String(err), streaming: false }
              : m,
          ),
        )
      } finally {
        setIsStreaming(false)
      }
    },
    [appendUserMessage],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setIsStreaming(false)
    setMessages(prev =>
      prev.map(m => (m.streaming ? { ...m, streaming: false } : m)),
    )
  }, [])

  const reset = useCallback(() => setMessages([]), [])

  return { messages, isStreaming, submit, stop, reset }
}

/**
 * Parse an SSE byte stream into typed SearchEvent objects.
 *
 * SSE format is:
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 */
async function consumeSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: SearchEvent) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE messages are separated by a blank line.
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk)
      if (parsed) onEvent(parsed)
    }
  }
}

function parseSseChunk(chunk: string): SearchEvent | null {
  const lines = chunk.split('\n')
  let eventName = 'message'
  let dataStr = ''

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataStr += line.slice(5).trim()
    }
  }

  if (!dataStr) return null

  let payload: unknown
  try {
    payload = JSON.parse(dataStr)
  } catch {
    return null
  }

  if (eventName === 'citations' && Array.isArray((payload as { citations: unknown }).citations)) {
    return { type: 'citations', citations: (payload as { citations: Citation[] }).citations }
  }
  if (eventName === 'anomaly') {
    return { type: 'anomaly', anomaly: payload as Anomaly }
  }
  if (eventName === 'text-delta') {
    const delta = (payload as { delta?: string }).delta ?? ''
    return { type: 'text-delta', delta }
  }
  if (eventName === 'done') {
    return { type: 'done' }
  }
  if (eventName === 'error') {
    return {
      type: 'error',
      message: (payload as { error?: string }).error ?? 'Unknown error',
    }
  }
  return null
}