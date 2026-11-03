import type { Table } from 'dexie'

import { db, getMeta, setMeta } from '@/lib/db'
import { metaKeys, SYNC_TABLES, type SyncTable } from '@/lib/db/types'

import type { PullCursor, ServerRow, SyncTransport } from './transport'

/**
 * サーバ → ローカル（差分取り込み）。
 */

const PAGE_SIZE = 500
const EPOCH = '1970-01-01T00:00:00.000Z'

/**
 * ウォーターマークを少し巻き戻して取り直す幅。
 *
 * `updated_at` はトリガの `now()` ＝**トランザクション開始時刻**なので、
 * 「後に開始したトランザクションが先にコミットする」と、小さい updated_at の行が
 * 後から見えるようになる。ウォーターマークをコミット順で進めると取りこぼす。
 * upsert は冪等なので、重複して取り直すぶんには害がない。
 */
const OVERLAP_MS = 2_000

/** sync_tombstones の保持期間（サーバ側の purge と合わせる） */
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

export interface PullResult {
  /** テーブルごとの取り込み件数 */
  upserted: Record<string, number>
  /** 論理削除・tombstone でローカルから消した件数 */
  removed: number
  /** ローカルの変更を守るために上書きを見送った件数 */
  skippedDirty: number
  /** 差分で追いつけずフル再同期したテーブル */
  fullResynced: SyncTable[]
}

export async function pullAll(transport: SyncTransport): Promise<PullResult> {
  const result: PullResult = { upserted: {}, removed: 0, skippedDirty: 0, fullResynced: [] }

  for (const table of SYNC_TABLES) {
    const stats = await pullTable(transport, table)
    result.upserted[table] = stats.upserted
    result.removed += stats.removed
    result.skippedDirty += stats.skippedDirty
    if (stats.fullResynced) result.fullResynced.push(table)
  }

  result.removed += await pullTombstones(transport)
  return result
}

async function pullTable(
  transport: SyncTransport,
  table: SyncTable,
): Promise<{ upserted: number; removed: number; skippedDirty: number; fullResynced: boolean }> {
  const lastPulledAt = await getMeta<string>(metaKeys.lastPulledAt(table))

  // 最後の同期が tombstone の保持期間より古いと、その間の物理削除を知る手段が無い。
  // 差分では整合が取れないのでローカルを捨てて取り直す。
  const staleBeyondRetention =
    lastPulledAt !== undefined &&
    Date.now() - new Date(lastPulledAt).getTime() > TOMBSTONE_RETENTION_MS

  const fullResync = lastPulledAt === undefined || staleBeyondRetention
  if (staleBeyondRetention) {
    await db.syncTable(table).clear()
  }

  const since = fullResync
    ? EPOCH
    : new Date(new Date(lastPulledAt).getTime() - OVERLAP_MS).toISOString()

  let cursor: PullCursor = { updatedAt: since, id: null }
  let upserted = 0
  let removed = 0
  let skippedDirty = 0
  let newWatermark = lastPulledAt ?? EPOCH

  for (;;) {
    const rows = await transport.pullPage(table, cursor, PAGE_SIZE)
    if (rows.length === 0) break

    const applied = await applyRows(table, rows)
    upserted += applied.upserted
    removed += applied.removed
    skippedDirty += applied.skippedDirty

    const last = rows[rows.length - 1]
    if (last.updated_at > newWatermark) newWatermark = last.updated_at
    cursor = { updatedAt: last.updated_at, id: last.id }

    if (rows.length < PAGE_SIZE) break
  }

  await setMeta(metaKeys.lastPulledAt(table), newWatermark)
  return { upserted, removed, skippedDirty, fullResynced: staleBeyondRetention }
}

/**
 * 取得した行をローカルに反映する。
 *
 * `_dirty = 1` の行は**上書きしない**。未送信のローカル変更を消してしまうため。
 * その行は push が通ったあと、次の pull でサーバの正規版が入る。
 */
async function applyRows(
  table: SyncTable,
  rows: ServerRow[],
): Promise<{ upserted: number; removed: number; skippedDirty: number }> {
  let upserted = 0
  let removed = 0
  let skippedDirty = 0

  await db.transaction('rw', [db.syncTable(table)], async () => {
    const store = db.syncTable(table) as Table<Record<string, unknown>, string>
    const ids = rows.map((r) => r.id)
    const existing = await store.bulkGet(ids)
    const dirty = new Set<string>()
    existing.forEach((row, i) => {
      if (row && row._dirty === 1) dirty.add(ids[i])
    })

    const toPut: Record<string, unknown>[] = []
    const toDelete: string[] = []

    for (const row of rows) {
      if (dirty.has(row.id)) {
        skippedDirty += 1
        continue
      }
      // 論理削除された行はローカルから消す（一覧クエリに出さないため）
      if (row.deleted_at) {
        toDelete.push(row.id)
        continue
      }
      toPut.push({ ...row, _dirty: 0 })
    }

    if (toPut.length > 0) {
      await store.bulkPut(toPut)
      upserted = toPut.length
    }
    if (toDelete.length > 0) {
      await store.bulkDelete(toDelete)
      removed = toDelete.length
    }
  })

  return { upserted, removed, skippedDirty }
}

/**
 * 物理削除の取り込み。
 *
 * `updated_at` のウォーターマークでは物理削除を検知できない（行が消えているので
 * 差分に現れない）。サーバ側の AFTER DELETE トリガが `sync_tombstones` に記録しており、
 * ここで id の続きから読む。
 */
async function pullTombstones(transport: SyncTransport): Promise<number> {
  let lastId = (await getMeta<number>(metaKeys.lastTombstoneId)) ?? 0
  let removed = 0

  for (;;) {
    const tombstones = await transport.pullTombstones(lastId, PAGE_SIZE)
    if (tombstones.length === 0) break

    for (const t of tombstones) {
      if (!isSyncTable(t.table_name)) continue
      // 未送信のローカル変更がある行は消さない（push の結果を待つ）
      const row = await db.syncTable(t.table_name).get(t.row_id)
      if (row && (row as { _dirty?: number })._dirty === 1) continue
      if (row) {
        await db.syncTable(t.table_name).delete(t.row_id)
        removed += 1
      }
    }

    lastId = tombstones[tombstones.length - 1].id
    await setMeta(metaKeys.lastTombstoneId, lastId)

    if (tombstones.length < PAGE_SIZE) break
  }

  return removed
}

function isSyncTable(name: string): name is SyncTable {
  return (SYNC_TABLES as readonly string[]).includes(name)
}

export const pullInternals = { OVERLAP_MS, PAGE_SIZE, TOMBSTONE_RETENTION_MS }
