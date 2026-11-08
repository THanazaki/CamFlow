import type { ReservationInput } from '@/lib/actions/reservations'
import { db } from '@/lib/db'
import type { FeePaymentTiming } from '@/lib/fee-payment'
import type { Enums } from '@/types/database'
import { DEFAULT_SHOOT_CATEGORY } from '@/lib/shoot-category'

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
  memo: string | null
  /** 予約失敗にした予約。撮影日当日までは予約成功に変えられる */
  failed: boolean
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

  const today = localDateString(new Date())

  return (
    sessions
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
          memo: s.memo ?? null,
          failed: slot?.shoot_status === 'cancelled',
        }
      })
      // 予約失敗は撮影日当日まで残し、過ぎたら予約スケジュールから外す
      .filter((r) => !r.failed || r.shootDate >= today)
      .sort((a, b) => {
        // 受付開始が未設定のものは末尾
        if (a.bookingOpensAt === null) return b.bookingOpensAt === null ? 0 : 1
        if (b.bookingOpensAt === null) return -1
        return a.bookingOpensAt.localeCompare(b.bookingOpensAt)
      })
  )
}

function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
    models: [...new Set(models.filter((m) => !m.deleted_at).map((m) => m.name))],
    venues: venues.filter((v) => !v.deleted_at).map((v) => v.name),
    // 同じ撮影会に何度も申し込むので、過去に使った撮影会名を候補に出す
    events: [
      ...new Set([...sessions, ...histories].filter((s) => !s.deleted_at).map((s) => s.title)),
    ].sort(),
  }
}

/** ISO の日時を datetime-local の値（ローカル時刻の YYYY-MM-DDTHH:mm）にする */
function toDateTimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 予約の編集画面に入れる、登録済みの内容。
 * 可否が決まった予約と、無い予約は null（編集できない）。
 */
export async function loadReservationInput(sessionId: string): Promise<ReservationInput | null> {
  const session = await db.sessions.get(sessionId)
  if (!session || session.deleted_at || session.status !== 'planned') return null

  const slot = (await db.slots.where('session_id').equals(sessionId).toArray())
    .filter((s) => !s.deleted_at)
    .sort((a, b) => a.slot_no - b.slot_no)[0]
  const link = slot
    ? (await db.slot_models.where('slot_id').equals(slot.id).toArray())[0]
    : undefined
  const model = link ? await db.models.get(link.model_id) : undefined
  const organizer = session.organizer_id ? await db.organizers.get(session.organizer_id) : undefined
  const venue = session.venue_id ? await db.venues.get(session.venue_id) : undefined

  return {
    memo: session.memo ?? '',
    // 撮影会名は撮影会マスタの名前。未入力で作った予約は紐づいていないので空
    eventName: organizer && !organizer.deleted_at ? organizer.name : '',
    shootCategory: session.shoot_category ?? DEFAULT_SHOOT_CATEGORY,
    modelName: model?.name ?? '',
    concept: session.concept ?? '',
    venueName: venue && !venue.deleted_at ? venue.name : (session.venue_name ?? ''),
    shootDate: session.session_date,
    bookingOpensAt: toDateTimeLocal(session.booking_opens_at),
    bookingMethod: session.booking_method ?? 'page',
    bookingContact: session.booking_contact ?? '',
    shootFee: slot && Number(slot.booking_fee) > 0 ? String(Number(slot.booking_fee)) : '',
    costumeOptions: slot?.costume_options ?? '',
    shootingMethodOptions: slot?.shooting_method_options ?? '',
    paymentTiming: slot?.fee_payment_timing ?? null,
    paymentDate: slot?.fee_payment_date ?? '',
  }
}
