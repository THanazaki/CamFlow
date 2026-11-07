import { db } from '@/lib/db'
import type { FeePaymentTiming } from '@/lib/fee-payment'
import type { Enums } from '@/types/database'

/** 予約スケジュール画面の1行 */
export interface ReservationRow {
  sessionId: string
  /** 予約受付の開始日時。未設定の予約は末尾に回す */
  bookingOpensAt: string | null
  bookingMethod: Enums<'booking_method'> | null
  bookingContact: string | null
  shootDate: string
  modelNames: string[]
  concept: string | null
  venueName: string | null
  title: string
  /** 撮影料（円）。未入力は0 */
  shootFee: number
  paymentTiming: FeePaymentTiming | null
  paymentDate: string | null
  costumeOptions: string | null
  shootingMethodOptions: string | null
}

/**
 * 可否がまだ決まっていない予約を、受付開始が早い順に返す。
 *
 * 残り時間は1秒ごとに変わるので、ここでは計算しない（毎秒 IndexedDB を
 * 読み直すことになるため）。画面側で bookingOpensAt から出す。
 */
export async function loadReservationSchedule(): Promise<ReservationRow[]> {
  const [sessions, slots, slotModels, models, venues] = await Promise.all([
    db.sessions.toArray(),
    db.slots.toArray(),
    db.slot_models.toArray(),
    db.models.toArray(),
    db.venues.toArray(),
  ])

  const modelMap = new Map(models.map((m) => [m.id, m]))
  const venueMap = new Map(venues.map((v) => [v.id, v]))

  // session → そこに紐づくモデル名
  const slotsBySession = new Map<string, string[]>()
  for (const slot of slots) {
    if (slot.deleted_at) continue
    const list = slotsBySession.get(slot.session_id) ?? []
    list.push(slot.id)
    slotsBySession.set(slot.session_id, list)
  }
  const modelNamesBySlot = new Map<string, string[]>()
  for (const sm of slotModels) {
    const name = modelMap.get(sm.model_id)?.name
    if (!name) continue
    const list = modelNamesBySlot.get(sm.slot_id) ?? []
    list.push(name)
    modelNamesBySlot.set(sm.slot_id, list)
  }

  return sessions
    .filter((s) => !s.deleted_at && s.status === 'planned')
    .map((s) => {
      const slotIds = slotsBySession.get(s.id) ?? []
      const names = [...new Set(slotIds.flatMap((id) => modelNamesBySlot.get(id) ?? []))]
      // 予約の枠は1つ（確定撮影情報入力の候補と同じく枠番号の若い枠を見る）
      const slot = slots
        .filter((sl) => !sl.deleted_at && sl.session_id === s.id)
        .sort((a, b) => a.slot_no - b.slot_no)[0]
      return {
        sessionId: s.id,
        bookingOpensAt: s.booking_opens_at,
        bookingMethod: s.booking_method,
        bookingContact: s.booking_contact,
        shootDate: s.session_date,
        modelNames: names,
        concept: s.concept,
        venueName: s.venue_id ? (venueMap.get(s.venue_id)?.name ?? s.venue_name) : s.venue_name,
        title: s.title,
        shootFee: Number(slot?.booking_fee ?? 0),
        paymentTiming: slot?.fee_payment_timing ?? null,
        paymentDate: slot?.fee_payment_date ?? null,
        costumeOptions: slot?.costume_options ?? null,
        shootingMethodOptions: slot?.shooting_method_options ?? null,
      }
    })
    .sort((a, b) => {
      // 受付開始が未設定のものは末尾
      if (a.bookingOpensAt === null) return b.bookingOpensAt === null ? 0 : 1
      if (b.bookingOpensAt === null) return -1
      return a.bookingOpensAt.localeCompare(b.bookingOpensAt)
    })
}

/** 入力補助（datalist）用の候補 */
export async function loadSuggestions(): Promise<{
  models: string[]
  venues: string[]
  events: string[]
}> {
  const [models, venues, sessions, histories] = await Promise.all([
    db.models.toArray(),
    db.venues.toArray(),
    db.sessions.toArray(),
    db.shoot_history.toArray(),
  ])
  return {
    // 撮影会が違えば同じ名前のモデルが複数いるので、候補は名前で重複を除く
    models: [
      ...new Set(models.filter((m) => !m.deleted_at && m.status !== 'ng').map((m) => m.name)),
    ],
    venues: venues.filter((v) => !v.deleted_at).map((v) => v.name),
    // 同じ撮影会に何度も申し込むので、過去に使った撮影会名を候補に出す
    events: [
      ...new Set([...sessions, ...histories].filter((s) => !s.deleted_at).map((s) => s.title)),
    ].sort(),
  }
}
