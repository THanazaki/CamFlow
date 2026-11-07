import { db } from '@/lib/db'
import type { LocalShootHistory, LocalSession, LocalSlot, LocalVenue } from '@/lib/db/types'
import type { FeePaymentTiming } from '@/lib/fee-payment'
import type { PlaceCategory } from '@/lib/place-category'
import type { ShootCategory } from '@/lib/shoot-category'
import { isSlotFinished } from '@/lib/slot-time'

import { toTime } from './shoots'

export type ShootSource = 'slot' | 'history'

/**
 * 撮影情報検索の1行。運用フロー（枠）と過去撮影登録を同じ形にそろえたもの。
 * サーバ側の v_shoot_history_all に当たる。
 */
export interface ShootRecord {
  source: ShootSource
  /** slots.id または shoot_history.id */
  id: string
  shootDate: string
  title: string
  memo: string | null
  shootCategory: ShootCategory | null
  concept: string | null
  placeCategory: PlaceCategory | null
  venueName: string | null
  modelNames: string[]
  /** modelNames と同じ順 */
  modelIds: string[]
  /** 撮影会マスタへの紐づけ。撮影会名が未入力の撮影は null */
  organizerId: string | null
  /** 撮影イベントの単位。同じ session の枠は同じ値になる */
  eventKey: string
  /** 撮影が終わったか。終わるまで保存先ストレージURLは登録できない */
  finished: boolean
  storageUrls: string[]
  /** 物理的な保管先。この画面からは入力しない */
  storagePath: string | null
  // ここから下は運用フローだけ。過去撮影登録では空
  meetingPoint: string | null
  meetingTime: string | null
  startTime: string | null
  endTime: string | null
  shootFee: number
  paymentTiming: FeePaymentTiming | null
  paymentDate: string | null
  costumeOptions: string | null
  shootingMethodOptions: string | null
}

export interface ShootSearchConditions {
  eventName: string
  modelName: string
  /** 撮影日の範囲（YYYY-MM-DD）。空なら指定なし */
  dateFrom: string
  dateTo: string
  venueName: string
}

export const EMPTY_SHOOT_SEARCH: ShootSearchConditions = {
  eventName: '',
  modelName: '',
  dateFrom: '',
  dateTo: '',
  venueName: '',
}

async function loadTables() {
  const [sessions, slots, histories, slotModels, historyModels, models, venues] = await Promise.all([
    db.sessions.toArray(),
    db.slots.toArray(),
    db.shoot_history.toArray(),
    db.slot_models.toArray(),
    db.shoot_history_models.toArray(),
    db.models.toArray(),
    db.venues.toArray(),
  ])
  return { sessions, slots, histories, slotModels, historyModels, models, venues }
}

type Tables = Awaited<ReturnType<typeof loadTables>>

interface RecordModel {
  id: string
  name: string
}

/** 紐づく行からモデルを引くための表。削除済みのモデルも過去の記録として名前を出す */
function modelsBy<K extends string>(
  links: ({ model_id: string } & Record<K, string>)[],
  key: K,
  models: Tables['models'],
): Map<string, RecordModel[]> {
  const nameById = new Map(models.map((m) => [m.id, m.name]))
  const result = new Map<string, RecordModel[]>()
  for (const link of links) {
    const name = nameById.get(link.model_id)
    if (!name) continue
    result.set(link[key], [...(result.get(link[key]) ?? []), { id: link.model_id, name }])
  }
  return result
}

function venueNameOf(
  row: { venue_id: string | null; venue_name: string | null },
  venues: Map<string, LocalVenue>,
): string | null {
  return row.venue_id ? (venues.get(row.venue_id)?.name ?? row.venue_name) : row.venue_name
}

function fromSlot(
  slot: LocalSlot,
  session: LocalSession,
  models: RecordModel[],
  venues: Map<string, LocalVenue>,
): ShootRecord {
  // 予約から作った枠のローカル行には planned_minutes が無いことがある。サーバの既定値で補う。
  // 補わないと toISOString が例外を投げ、この1件のために検索全体が止まる
  const minutes = slot.planned_minutes ?? 30
  const end = new Date(new Date(slot.start_at).getTime() + minutes * 60_000)
  return {
    source: 'slot',
    id: slot.id,
    shootDate: session.session_date,
    title: session.title,
    shootCategory: session.shoot_category ?? null,
    concept: session.concept ?? null,
    placeCategory: session.place_category ?? null,
    venueName: venueNameOf(session, venues),
    modelNames: models.map((m) => m.name),
    modelIds: models.map((m) => m.id),
    organizerId: session.organizer_id ?? null,
    eventKey: `session:${session.id}`,
    finished: isSlotFinished(slot),
    storageUrls: slot.storage_urls ?? [],
    storagePath: slot.storage_path ?? null,
    meetingPoint: session.meeting_point ?? null,
    memo: session.memo ?? null,
    meetingTime: slot.meeting_at ? toTime(slot.meeting_at) : null,
    startTime: toTime(slot.start_at),
    endTime: toTime(end.toISOString()),
    // 予約から作った枠のローカル行には booking_fee が無いことがある
    shootFee: Number(slot.booking_fee ?? 0),
    paymentTiming: slot.fee_payment_timing ?? null,
    paymentDate: slot.fee_payment_date ?? null,
    costumeOptions: slot.costume_options ?? null,
    shootingMethodOptions: slot.shooting_method_options ?? null,
  }
}

function fromHistory(
  history: LocalShootHistory,
  models: RecordModel[],
  venues: Map<string, LocalVenue>,
): ShootRecord {
  return {
    source: 'history',
    id: history.id,
    shootDate: history.shoot_date,
    title: history.title,
    shootCategory: history.shoot_category ?? null,
    concept: history.concept ?? null,
    placeCategory: history.place_category ?? null,
    venueName: venueNameOf(history, venues),
    modelNames: models.map((m) => m.name),
    modelIds: models.map((m) => m.id),
    organizerId: history.organizer_id ?? null,
    eventKey: `history:${history.id}`,
    finished: true,
    storageUrls: history.storage_urls ?? [],
    storagePath: history.storage_path ?? null,
    meetingPoint: null,
    memo: history.memo ?? null,
    meetingTime: null,
    startTime: history.start_at ? toTime(history.start_at) : null,
    endTime: history.end_at ? toTime(history.end_at) : null,
    shootFee: 0,
    paymentTiming: null,
    paymentDate: null,
    costumeOptions: null,
    shootingMethodOptions: null,
  }
}

/** 詳細・編集の対象になる枠か。予約段階のものと、中止・不参加は扱わない */
function isConfirmedSlot(slot: LocalSlot, session: LocalSession): boolean {
  if (slot.deleted_at || session.deleted_at) return false
  if (slot.shoot_status === 'cancelled' || slot.shoot_status === 'no_show') return false
  return (
    slot.shoot_status === 'shot' || session.status === 'confirmed' || session.status === 'done'
  )
}

/**
 * 検索の対象になる過去の撮影を、撮影日の新しい順に返す。
 *
 * 運用フローの枠は `shoot_status = 'shot'` に加え、確定済みで撮影日時を過ぎたものも含める。
 * サーバ側の v_shoot_history_all は前者だけだが、撮影済みへ変更する画面がまだ無いので、
 * それに合わせると確定撮影情報入力で登録した撮影が検索に一切出なくなる。
 */
export async function loadShootArchive(now: Date = new Date()): Promise<ShootRecord[]> {
  const t = await loadTables()
  const sessionMap = new Map(t.sessions.map((s) => [s.id, s]))
  const venueMap = new Map(t.venues.map((v) => [v.id, v]))
  const modelsBySlot = modelsBy(t.slotModels, 'slot_id', t.models)
  const modelsByHistory = modelsBy(t.historyModels, 'shoot_history_id', t.models)
  const nowIso = now.toISOString()

  const slotRecords = t.slots.flatMap((slot) => {
    const session = sessionMap.get(slot.session_id)
    if (!session || !isConfirmedSlot(slot, session)) return []
    if (slot.shoot_status !== 'shot' && slot.start_at >= nowIso) return []
    return [fromSlot(slot, session, modelsBySlot.get(slot.id) ?? [], venueMap)]
  })
  const historyRecords = t.histories
    .filter((h) => !h.deleted_at)
    .map((h) => fromHistory(h, modelsByHistory.get(h.id) ?? [], venueMap))

  return [...slotRecords, ...historyRecords].sort((a, b) => {
    const byDate = b.shootDate.localeCompare(a.shootDate)
    return byDate !== 0 ? byDate : (b.startTime ?? '').localeCompare(a.startTime ?? '')
  })
}

/** 詳細・編集の1件。見つからなければ null */
export async function loadShootRecord(source: ShootSource, id: string): Promise<ShootRecord | null> {
  const t = await loadTables()
  const venueMap = new Map(t.venues.map((v) => [v.id, v]))

  if (source === 'history') {
    const history = t.histories.find((h) => h.id === id && !h.deleted_at)
    if (!history) return null
    return fromHistory(
      history,
      modelsBy(t.historyModels, 'shoot_history_id', t.models).get(id) ?? [],
      venueMap,
    )
  }

  const slot = t.slots.find((s) => s.id === id)
  const session = slot && t.sessions.find((s) => s.id === slot.session_id)
  if (!slot || !session || !isConfirmedSlot(slot, session)) return null
  return fromSlot(slot, session, modelsBy(t.slotModels, 'slot_id', t.models).get(id) ?? [], venueMap)
}

function includes(value: string | null, keyword: string): boolean {
  const k = keyword.trim().toLowerCase()
  return !k || (value ?? '').toLowerCase().includes(k)
}

/** 条件はすべて AND。文字の条件は部分一致で、大文字小文字を区別しない */
export function filterShootArchive(
  records: ShootRecord[],
  c: ShootSearchConditions,
): ShootRecord[] {
  return records.filter(
    (r) =>
      includes(r.title, c.eventName) &&
      (!c.modelName.trim() || r.modelNames.some((name) => includes(name, c.modelName))) &&
      includes(r.venueName, c.venueName) &&
      (!c.dateFrom || r.shootDate >= c.dateFrom) &&
      (!c.dateTo || r.shootDate <= c.dateTo),
  )
}

/** 詳細・編集画面の URL */
export function shootRecordHref(
  page: 'detail' | 'edit',
  record: Pick<ShootRecord, 'source' | 'id'>,
): string {
  return `/archives/search/${page}?source=${record.source}&id=${encodeURIComponent(record.id)}`
}
