import Dexie, { type EntityTable } from 'dexie'

import type {
  LocalModel,
  LocalModelFormerName,
  LocalOrganizer,
  LocalProfile,
  LocalSession,
  LocalSlot,
  LocalShootHistory,
  LocalShootHistoryModel,
  LocalSlotModel,
  LocalVenue,
  LocalWishlistModel,
  MetaRow,
  OutboxEntry,
  SyncTable,
} from './types'

/**
 * ローカルDB。アプリの読み取りは全てここから行い、Supabase を直接読まない。
 * Supabase との差し引きは `lib/sync` が担当する。
 */
export class CamFlowDB extends Dexie {
  profiles!: EntityTable<LocalProfile, 'id'>
  venues!: EntityTable<LocalVenue, 'id'>
  organizers!: EntityTable<LocalOrganizer, 'id'>
  models!: EntityTable<LocalModel, 'id'>
  model_former_names!: EntityTable<LocalModelFormerName, 'id'>
  wishlist_models!: EntityTable<LocalWishlistModel, 'id'>
  sessions!: EntityTable<LocalSession, 'id'>
  slots!: EntityTable<LocalSlot, 'id'>
  slot_models!: EntityTable<LocalSlotModel, 'id'>
  shoot_history!: EntityTable<LocalShootHistory, 'id'>
  shoot_history_models!: EntityTable<LocalShootHistoryModel, 'id'>
  _outbox!: EntityTable<OutboxEntry, 'seq'>
  _meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'camflow') {
    super(name)

    this.version(1).stores({
      profiles: 'id, _dirty',
      venues: 'id, user_id, name, kind, [user_id+kind], is_favorite, updated_at, _dirty',
      models: 'id, user_id, name, name_kana, status, is_favorite, updated_at, _dirty, *tags',
      organizers: 'id, user_id, name, name_kana, is_favorite, updated_at, _dirty',
      sessions:
        'id, user_id, session_date, status, shoot_type, venue_id, organizer_id, booking_opens_at, [status+booking_opens_at], updated_at, _dirty',
      slots:
        'id, user_id, session_id, start_at, timer_status, shoot_status, updated_at, _dirty, [session_id+slot_no]',
      slot_models:
        'id, user_id, slot_id, model_id, payment_status, delivery_status, delivery_deadline, updated_at, _dirty',
      shoot_history:
        'id, user_id, shoot_date, shoot_type, venue_id, organizer_id, delivery_status, updated_at, _dirty',
      shoot_history_models: 'id, user_id, shoot_history_id, model_id, payment_status, updated_at, _dirty',
      // ++seq で採番順＝送信順。[status+seq] で pending を順番に取り出す
      _outbox: '++seq, status, row_key, [status+seq], [row_key+status]',
      _meta: 'key',
    })

    // 指定しなかったストアは v1 のまま残り、既存のデータも消えない
    this.version(2).stores({
      model_former_names: 'id, user_id, model_id, name, updated_at, _dirty',
    })

    this.version(3).stores({
      wishlist_models: 'id, user_id, model_id, updated_at, _dirty',
    })
  }

  /** 同期対象テーブルを名前で引く */
  syncTable(table: SyncTable) {
    return this.table(table)
  }
}

export const db = new CamFlowDB()

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db._meta.get(key)
  return row?.value as T | undefined
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db._meta.put({ key, value })
}

/** ローカルDBを空にする（フル再同期やサインアウト時に使う） */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
  })
}
