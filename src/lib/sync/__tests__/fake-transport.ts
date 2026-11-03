import type { SyncTable } from '@/lib/db/types'

import {
  PermanentSyncError,
  type PullCursor,
  type ServerRow,
  type ServerTombstone,
  type SyncTransport,
} from '../transport'

/**
 * サーバの代わり。Supabase の挙動のうち同期が依存している部分だけ再現する:
 *   * upsert / update / delete
 *   * 書き込み時にサーバ側で updated_at を付け直す（= LWW の権威）
 *   * (updated_at, id) のキーセットページング
 *   * 物理削除の tombstone 記録
 */
export class FakeTransport implements SyncTransport {
  rows = new Map<SyncTable, Map<string, ServerRow>>()
  tombstones: ServerTombstone[] = []
  calls: { op: string; table: string; id?: string }[] = []

  /** 次の n 回の書き込みをこのエラーで失敗させる */
  failNext: { times: number; error: unknown } | null = null

  private clock = Date.parse('2026-11-01T00:00:00.000Z')
  private tombstoneId = 0

  /** サーバ時刻。書き込みごとに1ms進める（updated_at の単調性を作る） */
  private now(): string {
    this.clock += 1
    return new Date(this.clock).toISOString()
  }

  private store(table: SyncTable): Map<string, ServerRow> {
    let m = this.rows.get(table)
    if (!m) {
      m = new Map()
      this.rows.set(table, m)
    }
    return m
  }

  private maybeFail(): void {
    if (!this.failNext || this.failNext.times <= 0) return
    this.failNext.times -= 1
    const error = this.failNext.error
    if (this.failNext.times === 0) this.failNext = null
    throw error
  }

  /** テストのセットアップ用。updated_at を指定してサーバ側に直接置く */
  seed(table: SyncTable, row: Partial<ServerRow> & { id: string }): ServerRow {
    const full: ServerRow = { updated_at: this.now(), ...row } as ServerRow
    this.store(table).set(row.id, full)
    return full
  }

  async upsertRow(table: SyncTable, payload: Record<string, unknown>): Promise<void> {
    this.maybeFail()
    const id = String(payload.id)
    this.calls.push({ op: 'upsert', table, id })
    const existing = this.store(table).get(id)
    // サーバ側トリガが updated_at を上書きする挙動を再現
    this.store(table).set(id, { ...existing, ...payload, id, updated_at: this.now() } as ServerRow)
  }

  async updateRow(table: SyncTable, id: string, patch: Record<string, unknown>): Promise<void> {
    this.maybeFail()
    this.calls.push({ op: 'update', table, id })
    const existing = this.store(table).get(id)
    if (!existing) {
      throw new PermanentSyncError(`${table} に id=${id} がありません`)
    }
    this.store(table).set(id, { ...existing, ...patch, id, updated_at: this.now() })
  }

  async deleteRow(table: SyncTable, id: string): Promise<void> {
    this.maybeFail()
    this.calls.push({ op: 'delete', table, id })
    const existed = this.store(table).delete(id)
    if (existed) {
      this.tombstoneId += 1
      this.tombstones.push({
        id: this.tombstoneId,
        table_name: table,
        row_id: id,
        deleted_at: this.now(),
      })
    }
  }

  async pullPage(table: SyncTable, cursor: PullCursor, limit: number): Promise<ServerRow[]> {
    const all = [...this.store(table).values()].sort((a, b) =>
      a.updated_at === b.updated_at ? a.id.localeCompare(b.id) : a.updated_at < b.updated_at ? -1 : 1,
    )
    const after = all.filter((r) => {
      if (cursor.id === null) return r.updated_at > cursor.updatedAt
      if (r.updated_at > cursor.updatedAt) return true
      return r.updated_at === cursor.updatedAt && r.id > cursor.id
    })
    return after.slice(0, limit)
  }

  async pullTombstones(afterId: number, limit: number): Promise<ServerTombstone[]> {
    return this.tombstones.filter((t) => t.id > afterId).slice(0, limit)
  }
}

/** Supabase が返す整合性制約違反（恒久的エラー）の形 */
export const uniqueViolation = { code: '23505', message: 'duplicate key value violates unique constraint' }

/** オフライン時の fetch 失敗（再試行可能） */
export const networkError = new TypeError('Failed to fetch')
