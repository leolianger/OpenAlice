import type { ChatHistoryItem } from './types'

export type ActivityOutcome =
  | 'delivered'
  | 'silent-ok'
  | 'duplicate'
  | 'empty'
  | 'outside-hours'
  | 'error'

export interface ActivityCycle {
  seq: number
  ts: number
  outcome: ActivityOutcome
  reason?: string
  durationMs?: number
}

export interface ActivityHistoryResponse {
  items: ChatHistoryItem[]
  cycles: ActivityCycle[]
  latestSeq: number
}

export const activityApi = {
  async history(opts?: { limit?: number; afterSeq?: number }): Promise<ActivityHistoryResponse> {
    const params = new URLSearchParams()
    if (opts?.limit !== undefined) params.set('limit', String(opts.limit))
    if (opts?.afterSeq !== undefined) params.set('afterSeq', String(opts.afterSeq))
    const qs = params.toString()
    const res = await fetch(`/api/activity/history${qs ? `?${qs}` : ''}`)
    if (!res.ok) throw new Error('Failed to load activity history')
    return res.json()
  },
}
