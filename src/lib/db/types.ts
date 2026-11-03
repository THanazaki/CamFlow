import type { Tables } from '@/types/database'

/**
 * ローカルDB（IndexedDB）の型。
 *
 * カラム名はサーバと同じ snake_case のまま持つ。camelCase に変換すると
 * 同期のたびに双方向のマッピングが必要になり、そこがバグの温床になるため。
 */

/** 同期対象のテーブル。push / pull の順序はこの配列順（FK の親から子へ） */
export const SYNC_TABLES = [
  'profiles',
  'venues',
  'organizers',
  'models',
  'sessions',
  'slots',
  'slot_models',
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

/** ローカル行 = サーバ行 + 未送信フラグ */
export type LocalRow<T extends SyncTable> = Tables<T> & {
  /** 1 = この行に未送信の変更がある。pull はこの行を上書きしない */
  _dirty: 0 | 1
}

export type LocalProfile = LocalRow<'profiles'>
export type LocalVenue = LocalRow<'venues'>
export type LocalOrganizer = LocalRow<'organizers'>
export type LocalModel = LocalRow<'models'>
export type LocalSession = LocalRow<'sessions'>
export type LocalSlot = LocalRow<'slots'>
export type LocalSlotModel = LocalRow<'slot_models'>

/** 論理削除を持つテーブル（pull で deleted_at を見る必要があるもの） */
export const SOFT_DELETABLE: ReadonlySet<SyncTable> = new Set([
  'venues',
  'organizers',
  'models',
  'sessions',
  'slots',
])

export type OutboxOp = 'insert' | 'update' | 'delete'

export type OutboxStatus = 'pending' | 'failed'

export interface OutboxEntry {
  /** 自動採番。これが送信順になる */
  seq?: number
  table: SyncTable
  op: OutboxOp
  row_id: string
  /** `${table}:${row_id}`。compaction のグループキー */
  row_key: string
  /** delete のときは null */
  payload: Record<string, unknown> | null
  status: OutboxStatus
  attempts: number
  last_error: string | null
  created_at: string
}

export interface MetaRow {
  key: string
  value: unknown
}

/** `_meta` のキー */
export const metaKeys = {
  /** そのテーブルを最後に pull した時刻（ISO文字列） */
  lastPulledAt: (table: SyncTable) => `pull:${table}` as const,
  /** 最後に取り込んだ sync_tombstones.id */
  lastTombstoneId: 'tombstone:lastId',
} as const
