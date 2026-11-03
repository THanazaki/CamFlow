import type { SyncTable } from '@/lib/db/types'
import { getSupabase } from '@/lib/supabase/client'

/**
 * 同期エンジンがサーバに触るための最小インターフェース。
 * これを挟むことで、エンジン本体はネットワーク無しで単体テストできる。
 */

export interface ServerRow {
  id: string
  updated_at: string
  deleted_at?: string | null
  [key: string]: unknown
}

export interface ServerTombstone {
  id: number
  table_name: string
  row_id: string
  deleted_at: string
}

export interface PullCursor {
  /** この時刻より後の updated_at を取る */
  updatedAt: string
  /** updated_at が同値のときの続き位置（キーセットページング） */
  id: string | null
}

export interface SyncTransport {
  upsertRow(table: SyncTable, payload: Record<string, unknown>): Promise<void>
  updateRow(table: SyncTable, id: string, patch: Record<string, unknown>): Promise<void>
  deleteRow(table: SyncTable, id: string): Promise<void>
  pullPage(table: SyncTable, cursor: PullCursor, limit: number): Promise<ServerRow[]>
  pullTombstones(afterId: number, limit: number): Promise<ServerTombstone[]>
}

/** 再試行しても無駄なエラー（制約違反・権限・不正な値など） */
export class PermanentSyncError extends Error {
  readonly permanent = true as const
  constructor(message: string) {
    super(message)
    this.name = 'PermanentSyncError'
  }
}

interface MaybePostgrestError {
  code?: string
  message?: string
  details?: string
  status?: number
}

/**
 * 恒久的エラーかどうかを判定する。
 * ここで誤って「再試行可能」に分類すると、壊れた書き込みを永遠に再送し続けてキューが詰まる。
 */
export function isPermanentError(error: unknown): boolean {
  if (error instanceof PermanentSyncError) return true

  const e = error as MaybePostgrestError | null
  if (!e) return false

  const status = e.status
  if (typeof status === 'number') {
    // 408 タイムアウト / 429 レート制限 / 5xx は時間を置けば通る
    if (status === 408 || status === 429 || status >= 500) return false
    if (status >= 400) return true
  }

  const code = e.code
  if (typeof code === 'string') {
    // SQLSTATE: 22=データ例外, 23=整合性制約違反, 42=構文/権限
    if (/^(22|23|42)/.test(code)) return true
    // PostgREST 側のリクエスト不正
    if (code.startsWith('PGRST')) return true
  }

  // fetch 失敗（オフライン）は再試行可能
  return false
}

function unwrap(error: unknown): never {
  if (isPermanentError(error)) {
    const e = error as MaybePostgrestError
    throw new PermanentSyncError(e.message ?? String(error))
  }
  throw error
}

export function createSupabaseTransport(): SyncTransport {
  const supabase = getSupabase()

  return {
    async upsertRow(table, payload) {
      // insert ではなく upsert。再送時に「既に入っている」で失敗しないようにする
      const { error } = await supabase.from(table).upsert(payload as never, { onConflict: 'id' })
      if (error) unwrap(error)
    },

    async updateRow(table, id, patch) {
      const { error } = await supabase
        .from(table)
        .update(patch as never)
        .eq('id', id)
      if (error) unwrap(error)
    },

    async deleteRow(table, id) {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) unwrap(error)
    },

    async pullPage(table, cursor, limit) {
      let query = supabase
        .from(table)
        .select('*')
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(limit)

      if (cursor.id === null) {
        query = query.gt('updated_at', cursor.updatedAt)
      } else {
        // (updated_at, id) の行値比較。updated_at が同値の行をまたいで進む
        query = query.or(
          `updated_at.gt.${cursor.updatedAt},and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`,
        )
      }

      const { data, error } = await query
      if (error) unwrap(error)
      return (data ?? []) as unknown as ServerRow[]
    },

    async pullTombstones(afterId, limit) {
      const { data, error } = await supabase
        .from('sync_tombstones')
        .select('id, table_name, row_id, deleted_at')
        .gt('id', afterId)
        .order('id', { ascending: true })
        .limit(limit)
      if (error) unwrap(error)
      return (data ?? []) as ServerTombstone[]
    },
  }
}
