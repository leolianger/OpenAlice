/**
 * Snapshot builder — assembles a UTASnapshot from a live UTA.
 *
 * Calls through public UTA methods so health tracking and error handling apply.
 * On failure (offline/disabled UTA), returns a partial snapshot with empty collections.
 */

import type { UnifiedTradingAccount } from '../UnifiedTradingAccount.js'
import type { UTASnapshot, SnapshotTrigger } from './types.js'

export async function buildSnapshot(
  uta: UnifiedTradingAccount,
  trigger: SnapshotTrigger,
): Promise<UTASnapshot> {
  const timestamp = new Date().toISOString()
  const health = uta.disabled ? 'disabled' as const : uta.health

  // Git state — always available regardless of broker health
  const gitStatus = uta.git.status()
  const headCommit = gitStatus.head
  const pendingCommits = gitStatus.pendingHash ? [gitStatus.pendingHash] : []

  // If unhealthy, return partial snapshot without querying broker
  if (health === 'offline' || health === 'disabled') {
    return {
      accountId: uta.id,
      timestamp,
      trigger,
      account: {
        netLiquidation: '0',
        totalCashValue: '0',
        unrealizedPnL: '0',
        realizedPnL: '0',
      },
      positions: [],
      openOrders: [],
      health,
      headCommit,
      pendingCommits,
    }
  }

  try {
    const pendingOrderIds = uta.git.getPendingOrderIds().map(p => p.orderId)
    const [accountInfo, positions, orders] = await Promise.all([
      uta.getAccount(),
      uta.getPositions(),
      uta.getOrders(pendingOrderIds),
    ])

    return {
      accountId: uta.id,
      timestamp,
      trigger,
      account: {
        netLiquidation: String(accountInfo.netLiquidation),
        totalCashValue: String(accountInfo.totalCashValue),
        unrealizedPnL: String(accountInfo.unrealizedPnL),
        realizedPnL: String(accountInfo.realizedPnL ?? 0),
        buyingPower: accountInfo.buyingPower != null ? String(accountInfo.buyingPower) : undefined,
        initMarginReq: accountInfo.initMarginReq != null ? String(accountInfo.initMarginReq) : undefined,
        maintMarginReq: accountInfo.maintMarginReq != null ? String(accountInfo.maintMarginReq) : undefined,
      },
      positions: positions.map(p => ({
        aliceId: p.contract.aliceId ?? uta.broker.getNativeKey(p.contract),
        side: p.side,
        quantity: p.quantity.toString(),
        avgCost: String(p.avgCost),
        marketPrice: String(p.marketPrice),
        marketValue: String(p.marketValue),
        unrealizedPnL: String(p.unrealizedPnL),
        realizedPnL: String(p.realizedPnL),
      })),
      openOrders: orders
        .filter(o => o.orderState.status === 'Submitted' || o.orderState.status === 'PreSubmitted')
        .map(o => ({
          orderId: String(o.order.orderId),
          aliceId: o.contract.aliceId ?? uta.broker.getNativeKey(o.contract),
          action: o.order.action,
          orderType: o.order.orderType,
          totalQuantity: o.order.totalQuantity.toString(),
          limitPrice: o.order.lmtPrice != null ? String(o.order.lmtPrice) : undefined,
          status: o.orderState.status,
          avgFillPrice: o.avgFillPrice != null ? String(o.avgFillPrice) : undefined,
        })),
      health,
      headCommit,
      pendingCommits,
    }
  } catch (err) {
    // Broker query failed — return partial snapshot
    console.warn(`snapshot: build failed for ${uta.id}:`, err instanceof Error ? err.message : err)
    return {
      accountId: uta.id,
      timestamp,
      trigger,
      account: {
        netLiquidation: '0',
        totalCashValue: '0',
        unrealizedPnL: '0',
        realizedPnL: '0',
      },
      positions: [],
      openOrders: [],
      health,
      headCommit,
      pendingCommits,
    }
  }
}
