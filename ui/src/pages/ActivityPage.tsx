import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type ChatHistoryItem } from '../api'
import type { ActivityCycle, ActivityOutcome } from '../api/activity'
import { ChatMessage, ToolCallGroup } from '../components/ChatMessage'

// ==================== Constants ====================

/** Background poll cadence while the tab is visible. Heartbeat fires ~every 30min, so 60s is plenty. */
const POLL_INTERVAL_MS = 60_000

// ==================== Helpers ====================

/**
 * Strip heartbeat response preamble ("STATUS: HEARTBEAT_OK — ..." / "STATUS: CHAT_YES\n...")
 * so the activity feed shows Alice's actual thought, not the machine-facing status token.
 */
function stripStatusPrefix(text: string): string {
  const m = text.match(/^\s*STATUS:\s*(HEARTBEAT_OK|CHAT_YES)\s*(?:[\u2014\-:]\s*)?([\s\S]*)$/)
  return m ? m[2].trim() : text
}

/** Stable key for diffing items across polls. Session entries don't expose uuid to the UI, so combine timestamp + content digest. */
function itemKey(item: ChatHistoryItem): string {
  if (item.kind === 'text') return `t|${item.timestamp ?? ''}|${item.role}|${item.text.slice(0, 80)}`
  return `tc|${item.timestamp ?? ''}|${item.calls.map((c) => c.name).join(',')}`
}

function itemTs(item: ChatHistoryItem): number {
  return item.timestamp ? new Date(item.timestamp).getTime() : 0
}

// ==================== Outcome presentation ====================

function outcomeLabel(o: ActivityOutcome): string {
  switch (o) {
    case 'delivered': return 'delivered to chat'
    case 'silent-ok': return 'silent ok'
    case 'duplicate': return 'duplicate'
    case 'empty': return 'empty'
    case 'outside-hours': return 'outside active hours'
    case 'error': return 'error'
  }
}

function outcomeClass(o: ActivityOutcome): string {
  switch (o) {
    case 'delivered': return 'border-accent/40 text-accent bg-accent/5'
    case 'silent-ok': return 'border-border/50 text-text-muted/70'
    case 'duplicate': return 'border-border/40 text-text-muted/50'
    case 'empty': return 'border-border/40 text-text-muted/50'
    case 'outside-hours': return 'border-border/40 text-text-muted/50'
    case 'error': return 'border-red/40 text-red bg-red/5'
  }
}

// ==================== Timeline ====================

type TimelineNode =
  | { kind: 'item'; item: ChatHistoryItem; ts: number; key: string }
  | { kind: 'cycle'; cycle: ActivityCycle; ts: number; key: string }

function buildTimeline(items: ChatHistoryItem[], cycles: ActivityCycle[]): TimelineNode[] {
  const nodes: TimelineNode[] = []

  for (const item of items) {
    // Hide user-role entries — those are cron trigger prompts, not human speech.
    if (item.kind === 'text' && item.role === 'user') continue
    // Skip empty assistant bubbles after prefix stripping.
    if (item.kind === 'text' && item.role === 'assistant' && !stripStatusPrefix(item.text).trim()) continue
    nodes.push({ kind: 'item', item, ts: itemTs(item), key: itemKey(item) })
  }
  for (const cycle of cycles) {
    nodes.push({ kind: 'cycle', cycle, ts: cycle.ts, key: `cycle|${cycle.seq}` })
  }

  // Stable sort by timestamp; within the same ts, cycle chips come after items (so the chip closes a cycle visually).
  nodes.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts
    if (a.kind === b.kind) return 0
    return a.kind === 'cycle' ? 1 : -1
  })

  return nodes
}

// ==================== Page ====================

export function ActivityPage() {
  const [items, setItems] = useState<ChatHistoryItem[]>([])
  const [cycles, setCycles] = useState<ActivityCycle[]>([])
  const [latestSeq, setLatestSeq] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const latestSeqRef = useRef(0)
  latestSeqRef.current = latestSeq

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolledUp = useRef(false)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  const fetchFull = useCallback(async () => {
    try {
      const res = await api.activity.history({ limit: 100 })
      setItems(res.items)
      setCycles(res.cycles)
      setLatestSeq(res.latestSeq)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDelta = useCallback(async () => {
    if (latestSeqRef.current === 0) return
    try {
      const res = await api.activity.history({ afterSeq: latestSeqRef.current })
      // No new cycles? Still update latestSeq so we don't re-fetch identical ranges.
      if (res.cycles.length === 0) {
        if (res.latestSeq !== latestSeqRef.current) setLatestSeq(res.latestSeq)
        return
      }
      setCycles((prev) => {
        const seen = new Set(prev.map((c) => c.seq))
        const fresh = res.cycles.filter((c) => !seen.has(c.seq))
        return fresh.length === 0 ? prev : [...prev, ...fresh]
      })
      setItems((prev) => {
        const seen = new Set(prev.map(itemKey))
        const fresh = res.items.filter((it) => !seen.has(itemKey(it)))
        return fresh.length === 0 ? prev : [...prev, ...fresh]
      })
      setLatestSeq(res.latestSeq)
    } catch (err) {
      // Silent on poll failures — next poll will retry.
      console.warn('activity poll failed', err)
    }
  }, [])

  // Initial load
  useEffect(() => { fetchFull() }, [fetchFull])

  // Refresh on tab focus
  useEffect(() => {
    const onFocus = () => { fetchDelta() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [fetchDelta])

  // Gentle interval poll while visible
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchDelta()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchDelta])

  // Auto-scroll to bottom on new content, unless user scrolled up
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior })
    }
  }, [])
  useEffect(() => { scrollToBottom() }, [items, cycles, scrollToBottom])

  // Track scroll position
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const isUp = scrollHeight - scrollTop - clientHeight > 80
      userScrolledUp.current = isUp
      setShowScrollBtn(isUp)
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const timeline = useMemo(() => buildTimeline(items, cycles), [items, cycles])

  const handleRefresh = useCallback(() => {
    setLoading(true)
    fetchFull()
  }, [fetchFull])

  const handleScrollToBottom = useCallback(() => {
    userScrolledUp.current = false
    setShowScrollBtn(false)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 max-w-[800px] mx-auto w-full">
        {/* Slim header — matches Chat's aesthetic rather than the heavier PageHeader */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-secondary/30 shrink-0">
          <span className="text-sm font-medium text-text">Activity</span>
          <span className="text-[11px] text-text-muted/60">what Alice has been up to</span>
          <button
            onClick={handleRefresh}
            className="ml-auto text-[12px] text-text-muted hover:text-text px-2 py-1 rounded transition-colors"
            title="Refresh"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>

        {/* Feed */}
        <div className="flex-1 min-h-0 relative">
          <div ref={containerRef} className="h-full overflow-y-auto px-5 py-6">
            {loading && items.length === 0 && cycles.length === 0 && (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">Loading...</div>
            )}

            {!loading && timeline.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
                <img src="/alice.ico" alt="Alice" className="w-12 h-12 rounded-2xl ring-1 ring-accent/20 opacity-70" />
                <div className="text-center">
                  <h2 className="text-base font-semibold text-text mb-1">Nothing yet</h2>
                  <p className="text-[12px] text-text-muted">Heartbeat cycles will appear here as they run.</p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center justify-center h-full text-sm text-red">
                Failed to load: {error}
              </div>
            )}

            <div className="flex flex-col">
              {timeline.map((node, i) => {
                const prev = i > 0 ? timeline[i - 1] : undefined

                if (node.kind === 'cycle') {
                  return (
                    <div key={node.key} className={i === 0 ? '' : 'mt-4'}>
                      <CycleChip cycle={node.cycle} />
                    </div>
                  )
                }

                const item = node.item
                if (item.kind === 'tool_calls') {
                  const prevAssistantish = prev != null && prev.kind === 'item' && (
                    prev.item.kind === 'tool_calls' ||
                    (prev.item.kind === 'text' && prev.item.role === 'assistant')
                  )
                  return (
                    <div key={node.key} className={prevAssistantish ? 'mt-1' : i === 0 ? '' : 'mt-5'}>
                      <ToolCallGroup calls={item.calls} timestamp={item.timestamp} />
                    </div>
                  )
                }

                // text, role === 'assistant' (user is filtered out in buildTimeline)
                const isGrouped = prev != null && prev.kind === 'item' && (
                  (prev.item.kind === 'text' && prev.item.role === 'assistant') ||
                  prev.item.kind === 'tool_calls'
                )
                return (
                  <div key={node.key} className={isGrouped ? 'mt-1' : i === 0 ? '' : 'mt-5'}>
                    <ChatMessage
                      role="assistant"
                      text={stripStatusPrefix(item.text)}
                      timestamp={item.timestamp}
                      isGrouped={isGrouped}
                      media={item.media}
                    />
                  </div>
                )
              })}
            </div>

            <div ref={messagesEndRef} />
          </div>

          {showScrollBtn && (
            <button
              onClick={handleScrollToBottom}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-bg-secondary border border-border text-text-muted hover:text-text hover:border-accent/50 flex items-center justify-center transition-all shadow-lg"
              aria-label="Scroll to bottom"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== Cycle chip ====================

function CycleChip({ cycle }: { cycle: ActivityCycle }) {
  const time = new Date(cycle.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const duration = cycle.durationMs !== undefined ? formatDuration(cycle.durationMs) : null

  return (
    <div className="flex items-center gap-2 text-[11px] text-text-muted/70 px-1">
      <div className="flex-1 h-px bg-border/30" />
      <span className="shrink-0">{time}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded border ${outcomeClass(cycle.outcome)}`}>
        {outcomeLabel(cycle.outcome)}
      </span>
      {cycle.reason && (
        <span className="shrink truncate max-w-[260px] opacity-60" title={cycle.reason}>
          {cycle.reason}
        </span>
      )}
      {duration && <span className="shrink-0 opacity-50">{duration}</span>}
      <div className="flex-1 h-px bg-border/30" />
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}
