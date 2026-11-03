import { db } from '@/lib/db'
import type { SyncTable } from '@/lib/db/types'

import { compactOutbox, type CompactedOp } from './compact'
import { refreshDirtyFlag } from './mutations'
import { isPermanentError, type SyncTransport } from './transport'

/**
 * ローカル → サーバ（outbox のフラッシュ）。
 *
 * 設計上の決め事:
 *   * 送信は seq 昇順の**直列**。並列化すると FK の親より子が先に届きうる
 *   * insert は upsert で送る。再送しても重複キーで落ちない
 *   * 恒久的エラーは outbox に `failed` として残し、UI に出す。黙って捨てない
 *   * 再試行可能なエラー（オフライン等）が出たらそこで打ち切る。
 *     飛ばして先に進むと順序が崩れるため
 */

export interface PushResult {
  /** サーバに送れた op の数 */
  pushed: number
  /** 恒久的エラーで failed にした op の数 */
  failed: number
  /** 圧縮で送らずに済んだエントリ数 */
  discarded: number
  /** 再試行可能なエラーで中断したか */
  interrupted: boolean
}

export async function pushOutbox(transport: SyncTransport): Promise<PushResult> {
  const pending = await db._outbox.where('status').equals('pending').sortBy('seq')
  if (pending.length === 0) {
    return { pushed: 0, failed: 0, discarded: 0, interrupted: false }
  }

  const { ops, discarded } = compactOutbox(pending)
  await removeEntries(discarded)

  let pushed = 0
  let failed = 0

  for (const op of ops) {
    try {
      await send(transport, op)
      await removeEntries(op.sourceSeqs)
      pushed += 1
    } catch (error) {
      if (isPermanentError(error)) {
        await markFailed(op, error)
        failed += 1
        continue
      }
      await bumpAttempts(op, error)
      return { pushed, failed, discarded: discarded.length, interrupted: true }
    }
  }

  return { pushed, failed, discarded: discarded.length, interrupted: false }
}

async function send(transport: SyncTransport, op: CompactedOp): Promise<void> {
  switch (op.op) {
    case 'insert':
      await transport.upsertRow(op.table, op.payload ?? {})
      return
    case 'update':
      await transport.updateRow(op.table, op.row_id, op.payload ?? {})
      return
    case 'delete':
      await transport.deleteRow(op.table, op.row_id)
      return
  }
}

/** outbox からエントリを消し、未送信が残っていない行の `_dirty` を下ろす */
async function removeEntries(seqs: number[]): Promise<void> {
  if (seqs.length === 0) return

  const entries = await db._outbox.where('seq').anyOf(seqs).toArray()
  const touched = new Map<string, [SyncTable, string]>()
  for (const e of entries) touched.set(e.row_key, [e.table, e.row_id])

  await db._outbox.bulkDelete(seqs)

  for (const [table, id] of touched.values()) {
    await refreshDirtyFlag(table, id)
  }
}

async function markFailed(op: CompactedOp, error: unknown): Promise<void> {
  const message = errorMessage(error)
  await db._outbox
    .where('seq')
    .anyOf(op.sourceSeqs)
    .modify((entry) => {
      entry.status = 'failed'
      entry.last_error = message
      entry.attempts += 1
    })
}

async function bumpAttempts(op: CompactedOp, error: unknown): Promise<void> {
  const message = errorMessage(error)
  await db._outbox
    .where('seq')
    .anyOf(op.sourceSeqs)
    .modify((entry) => {
      entry.attempts += 1
      entry.last_error = message
    })
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

/** 失敗したエントリを再試行対象に戻す（UI の「再送」用） */
export async function retryFailed(): Promise<number> {
  return db._outbox.where('status').equals('failed').modify({ status: 'pending', last_error: null })
}

/** 失敗したエントリを破棄する（UI の「この変更を捨てる」用） */
export async function discardFailed(): Promise<number> {
  const failed = await db._outbox.where('status').equals('failed').toArray()
  await removeEntries(failed.map((e) => e.seq as number))
  return failed.length
}

/** 未送信・失敗の件数（ヘッダーのインジケータ用） */
export async function outboxCounts(): Promise<{ pending: number; failed: number }> {
  const [pending, failed] = await Promise.all([
    db._outbox.where('status').equals('pending').count(),
    db._outbox.where('status').equals('failed').count(),
  ])
  return { pending, failed }
}
