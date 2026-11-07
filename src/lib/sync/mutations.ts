import type { Table } from 'dexie'

import { db } from '@/lib/db'
import { SOFT_DELETABLE } from '@/lib/db/types'
import type { LocalRow, OutboxEntry, OutboxOp, SyncTable } from '@/lib/db/types'
import type { TablesInsert, TablesUpdate } from '@/types/database'

/**
 * 画面からの書き込み口。Supabase を直接叩かず、必ずここを通す。
 *
 * 肝は「ローカル行の変更」と「outbox への追加」を**同一トランザクション**で行うこと。
 * 分けると、片方だけ成功したときに
 *   - ローカルだけ変わって永遠に送信されない変更
 *   - 送信キューにあるのに手元には無い変更
 * が生まれる。Dexie のトランザクションは途中で例外が出れば両方巻き戻る。
 */

function rowKey(table: SyncTable, id: string): string {
  return `${table}:${id}`
}

/**
 * 行の id（UUID v4）。テスト時に差し替えられるよう分離している。
 *
 * crypto.randomUUID は HTTPS か localhost（secure context）でしか使えない。
 * スマホから開発サーバーを http://192.168.x.x:3000 のように開くと undefined になり、
 * 全ての登録が失敗するので、どこでも使える crypto.getRandomValues で同じ形式を作る。
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return uuidV4FromRandomValues()
}

/** RFC 4122 の UUID v4 を crypto.getRandomValues から作る */
export function uuidV4FromRandomValues(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10xx
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function enqueue(
  table: SyncTable,
  op: OutboxOp,
  id: string,
  payload: Record<string, unknown> | null,
): Promise<void> {
  const entry: OutboxEntry = {
    table,
    op,
    row_id: id,
    row_key: rowKey(table, id),
    payload,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
  }
  await db._outbox.add(entry)
}

/**
 * 行を作る。`id` / `created_at` / `updated_at` はローカルで埋める
 * （オフラインでも即座に画面に出す必要があるため、サーバの採番を待たない）。
 */
export async function createRow<T extends SyncTable>(
  table: T,
  values: TablesInsert<T>,
): Promise<string> {
  const now = new Date().toISOString()
  const id = (values as { id?: string }).id ?? newId()
  const record = { ...values, id, created_at: now, updated_at: now } as Record<string, unknown>

  // 論理削除のあるテーブルは deleted_at を明示的に null にする。
  // 入れないと undefined のままになり、pull で入ってくるサーバ行（null）と
  // 形が食い違う。`deleted_at === null` で絞る一覧から新規行が消えるので、
  // ローカル行はサーバ行と同じ形にそろえる
  if (SOFT_DELETABLE.has(table) && record.deleted_at === undefined) {
    record.deleted_at = null
  }

  await db.transaction('rw', [db.syncTable(table), db._outbox], async () => {
    await (db.syncTable(table) as Table<Record<string, unknown>, string>).add({
      ...record,
      _dirty: 1,
    })
    await enqueue(table, 'insert', id, record)
  })

  return id
}

/** 行を更新する。渡した差分だけを outbox に積む（全体を送らない） */
export async function updateRow<T extends SyncTable>(
  table: T,
  id: string,
  patch: TablesUpdate<T>,
): Promise<void> {
  const changes = { ...patch, updated_at: new Date().toISOString() } as Record<string, unknown>

  await db.transaction('rw', [db.syncTable(table), db._outbox], async () => {
    const existing = await db.syncTable(table).get(id)
    if (!existing) throw new Error(`${table} に id=${id} の行がありません`)

    await (db.syncTable(table) as Table<Record<string, unknown>, string>).update(id, {
      ...changes,
      _dirty: 1,
    })
    await enqueue(table, 'update', id, changes)
  })
}

/**
 * 行を消す。
 * 論理削除を持つテーブル（venues / models / sessions / slots）は `deleted_at` を立てる
 * 運用なので、画面からは `updateRow(table, id, { deleted_at })` を使うこと。
 * この関数は物理削除（主に slot_models）用。
 */
export async function deleteRow<T extends SyncTable>(table: T, id: string): Promise<void> {
  await db.transaction('rw', [db.syncTable(table), db._outbox], async () => {
    await db.syncTable(table).delete(id)
    await enqueue(table, 'delete', id, null)
  })
}

/** 論理削除。履歴を壊さずに一覧から消す */
export async function softDeleteRow<T extends SyncTable>(table: T, id: string): Promise<void> {
  await updateRow(table, id, { deleted_at: new Date().toISOString() } as TablesUpdate<T>)
}

/** その行に未送信の変更が残っているか */
export async function hasPendingWrites(table: SyncTable, id: string): Promise<boolean> {
  const n = await db._outbox.where('row_key').equals(rowKey(table, id)).count()
  return n > 0
}

/** `_dirty` を再計算する。push が成功したあとに呼ぶ */
export async function refreshDirtyFlag(table: SyncTable, id: string): Promise<void> {
  const remaining = await db._outbox.where('row_key').equals(rowKey(table, id)).count()
  if (remaining > 0) return
  const row = await db.syncTable(table).get(id)
  if (row) {
    await (db.syncTable(table) as Table<LocalRow<SyncTable>, string>).update(id, { _dirty: 0 })
  }
}

export { rowKey }
