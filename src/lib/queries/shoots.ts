import { db } from '@/lib/db'
import type { FeePaymentTiming } from '@/lib/fee-payment'
import { readModelAccounts, type ModelAccountEntry } from '@/lib/model-accounts'
import type { PlaceCategory } from '@/lib/place-category'
import { DEFAULT_SHOOT_CATEGORY, type ShootCategory } from '@/lib/shoot-category'
import { isSlotFinished } from '@/lib/slot-time'

/** 確定撮影情報画面の1行（1枠 = 1行） */
export interface ConfirmedShoot {
  sessionId: string
  slotId: string
  title: string
  concept: string | null
  venueName: string | null
  /** 導入前の行は NULL */
  placeCategory: PlaceCategory | null
  meetingPoint: string | null
  memo: string | null
  shootDate: string
  startTime: string
  endTime: string
  models: { name: string; accounts: ModelAccountEntry[] }[]
  /** 撮影料（円）。未入力は0 */
  shootFee: number
  costumeOptions: string | null
  shootingMethodOptions: string | null
  /** 集合時刻（HH:mm）。未入力は null */
  meetingTime: string | null
  paymentTiming: FeePaymentTiming | null
  /** 支払日（YYYY-MM-DD）。事前のときだけ入る */
  paymentDate: string | null
  storageUrls: string[]
  /** 保存先が1つでも入っていれば撮影データ登録は済み */
  registered: boolean
  /** 撮影の開始時刻を過ぎているか */
  past: boolean
  /** 撮影が終わったか。終わるまで保存先ストレージURLは登録できない */
  finished: boolean
}

/** 確定撮影情報入力で「予約から選ぶ」ための候補 */
export interface ConfirmableReservation {
  sessionId: string
  label: string
  eventName: string
  shootCategory: ShootCategory
  modelName: string
  /** 2人目以降のモデル名 */
  extraModelNames: string[]
  concept: string
  venueName: string
  shootDate: string
  /** 予約時は仮置きなので、時刻が入っていれば初期値に使う */
  startTime: string
  endTime: string
  /** 撮影料。入力欄の値の形。未入力は空 */
  shootFee: string
  costumeOptions: string
  shootingMethodOptions: string
  paymentTiming: FeePaymentTiming | null
  paymentDate: string
  memo: string
}

/** ローカル時刻の HH:mm */
export function toTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 可否がまだ決まっていない予約を、確定フォームの初期値として使える形で返す。
 * 撮影日の近い順。
 */
export async function loadConfirmableReservations(): Promise<ConfirmableReservation[]> {
  const [sessions, slots, slotModels, models, venues] = await Promise.all([
    db.sessions.toArray(),
    db.slots.toArray(),
    db.slot_models.toArray(),
    db.models.toArray(),
    db.venues.toArray(),
  ])

  const modelMap = new Map(models.map((m) => [m.id, m]))
  const venueMap = new Map(venues.map((v) => [v.id, v]))
  const liveSlots = slots.filter((s) => !s.deleted_at)

  return sessions
    .filter((s) => !s.deleted_at && s.status === 'planned')
    .map((session) => {
      const slot = liveSlots
        .filter((s) => s.session_id === session.id)
        .sort((a, b) => a.slot_no - b.slot_no)[0]
      // 予約失敗にした予約は選べない（予約スケジュールで予約成功に変えてから確定する）
      if (slot?.shoot_status === 'cancelled') return null
      const slotModelList = slot
        ? slotModels
            .filter((sm) => sm.slot_id === slot.id)
            .map((sm) => modelMap.get(sm.model_id))
            .filter((m) => m && !m.deleted_at)
        : []
      const model = slotModelList[0]

      // 予約時の start_at は撮影日の 0 時を仮置きしている。
      // 0:00 のままなら未入力扱いにして、確定時に入れてもらう
      const start = slot ? toTime(slot.start_at) : ''
      const hasRealTime = start !== '00:00'
      const end =
        slot && hasRealTime
          ? toTime(new Date(new Date(slot.start_at).getTime() + slot.planned_minutes * 60_000).toISOString())
          : ''

      return {
        sessionId: session.id,
        label: `${session.session_date} ${session.title}${model ? ` / ${model.name}` : ''}`,
        eventName: session.title,
        shootCategory: session.shoot_category ?? DEFAULT_SHOOT_CATEGORY,
        modelName: model?.name ?? '',
        extraModelNames: slotModelList.slice(1).map((m) => m!.name),
        concept: session.concept ?? '',
        venueName: session.venue_id
          ? (venueMap.get(session.venue_id)?.name ?? session.venue_name ?? '')
          : (session.venue_name ?? ''),
        shootDate: session.session_date,
        startTime: hasRealTime ? start : '',
        endTime: end,
        shootFee: slot?.booking_fee ? String(slot.booking_fee) : '',
        costumeOptions: slot?.costume_options ?? '',
        shootingMethodOptions: slot?.shooting_method_options ?? '',
        paymentTiming: slot?.fee_payment_timing ?? null,
        paymentDate: slot?.fee_payment_date ?? '',
        memo: session.memo ?? '',
      }
    })
    .filter((r): r is ConfirmableReservation => r !== null)
    .sort((a, b) => a.shootDate.localeCompare(b.shootDate))
}

/**
 * 確定した撮影（`sessions.status = 'confirmed'`）の一覧。
 * 撮影日の新しい順。保存先ストレージURL の登録はこの画面から行う。
 */
export async function loadConfirmedShoots(now: Date = new Date()): Promise<ConfirmedShoot[]> {
  const [sessions, slots, slotModels, models, venues] = await Promise.all([
    db.sessions.toArray(),
    db.slots.toArray(),
    db.slot_models.toArray(),
    db.models.toArray(),
    db.venues.toArray(),
  ])

  const modelMap = new Map(models.map((m) => [m.id, m]))
  const venueMap = new Map(venues.map((v) => [v.id, v]))
  const sessionMap = new Map(
    sessions.filter((s) => !s.deleted_at && s.status === 'confirmed').map((s) => [s.id, s]),
  )

  const modelsBySlot = new Map<string, ConfirmedShoot['models']>()
  for (const sm of slotModels) {
    const model = modelMap.get(sm.model_id)
    if (!model) continue
    const list = modelsBySlot.get(sm.slot_id) ?? []
    list.push({ name: model.name, accounts: readModelAccounts(model) })
    modelsBySlot.set(sm.slot_id, list)
  }

  const nowMs = now.getTime()

  return slots
    // 取り消した枠（中止）は撮影予定から外す
    .filter(
      (slot) =>
        !slot.deleted_at && slot.shoot_status !== 'cancelled' && sessionMap.has(slot.session_id),
    )
    .map((slot) => {
      const session = sessionMap.get(slot.session_id)!
      const start = new Date(slot.start_at)
      const end = new Date(start.getTime() + slot.planned_minutes * 60_000)
      const urls = slot.storage_urls ?? []

      return {
        sessionId: session.id,
        slotId: slot.id,
        title: session.title,
        concept: session.concept,
        venueName: session.venue_id
          ? (venueMap.get(session.venue_id)?.name ?? session.venue_name)
          : session.venue_name,
        placeCategory: session.place_category ?? null,
        meetingPoint: session.meeting_point ?? null,
        memo: session.memo ?? null,
        shootDate: session.session_date,
        startTime: toTime(slot.start_at),
        endTime: toTime(end.toISOString()),
        models: modelsBySlot.get(slot.id) ?? [],
        // 予約から作った枠のローカル行には booking_fee が無いことがある
        shootFee: Number(slot.booking_fee ?? 0),
        costumeOptions: slot.costume_options ?? null,
        shootingMethodOptions: slot.shooting_method_options ?? null,
        meetingTime: slot.meeting_at ? toTime(slot.meeting_at) : null,
        paymentTiming: slot.fee_payment_timing ?? null,
        paymentDate: slot.fee_payment_date ?? null,
        storageUrls: urls,
        registered: urls.length > 0 || Boolean(slot.storage_path),
        past: start.getTime() < nowMs,
        finished: isSlotFinished(slot, now),
      }
    })
    .sort((a, b) => {
      const byDate = b.shootDate.localeCompare(a.shootDate)
      return byDate !== 0 ? byDate : b.startTime.localeCompare(a.startTime)
    })
}
