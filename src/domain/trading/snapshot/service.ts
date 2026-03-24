/**
 * Snapshot service — orchestrates builder + store.
 *
 * Errors are caught and logged — snapshots must never break trading operations.
 * Store instances are cached per account to ensure writes are serialized.
 */

import type { AccountManager } from '../account-manager.js'
import type { EventLog } from '../../../core/event-log.js'
import type { SnapshotStore } from './store.js'
import type { UTASnapshot, SnapshotTrigger } from './types.js'
import { buildSnapshot } from './builder.js'
import { createSnapshotStore } from './store.js'

export interface SnapshotService {
  takeSnapshot(accountId: string, trigger: SnapshotTrigger): Promise<UTASnapshot | null>
  takeAllSnapshots(trigger: SnapshotTrigger): Promise<void>
  getRecent(accountId: string, limit?: number): Promise<UTASnapshot[]>
}

export function createSnapshotService(deps: {
  accountManager: AccountManager
  eventLog?: EventLog
}): SnapshotService {
  const { accountManager, eventLog } = deps
  const stores = new Map<string, SnapshotStore>()

  function getStore(accountId: string): SnapshotStore {
    let s = stores.get(accountId)
    if (!s) {
      s = createSnapshotStore(accountId)
      stores.set(accountId, s)
    }
    return s
  }

  return {
    async takeSnapshot(accountId, trigger) {
      const uta = accountManager.get(accountId)
      if (!uta) return null

      try {
        const snapshot = await buildSnapshot(uta, trigger)
        await getStore(accountId).append(snapshot)
        await eventLog?.append('snapshot.taken', {
          accountId,
          trigger,
          timestamp: snapshot.timestamp,
        })
        return snapshot
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`snapshot: failed for ${accountId}:`, msg)
        await eventLog?.append('snapshot.error', { accountId, trigger, error: msg }).catch(() => {})
        return null
      }
    },

    async takeAllSnapshots(trigger) {
      const accounts = accountManager.resolve()
      await Promise.allSettled(
        accounts.map(uta => this.takeSnapshot(uta.id, trigger)),
      )
    },

    async getRecent(accountId, limit = 10) {
      return getStore(accountId).readRange({ limit })
    },
  }
}
