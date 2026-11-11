import { db } from '@/lib/db'
import { categoryHasModel, fallbackShootTitle, type ShootCategory } from '@/lib/shoot-category'
import { createRow, deleteRow, softDeleteRow, updateRow } from '@/lib/sync/mutations'

import {
  resolveModel,
  resolveOrganizer,
  toFeePaymentColumns,
  toShootOptionColumns,
  type ShootOptionsInput,
  type ShootPaymentInput,
} from './shoots'

/**
 * 予約情報入力の書き込み。
 *
 * 1件の予約は sessions / slots / slot_models の3行になる
 * （モデルを指定しない撮影区分では slot_models を作らない）。
 * `createRow` はテーブルごとに別トランザクションだが、outbox は seq 昇順に
 * 直列送信されるので、親 → 子の順に呼べば FK の順序は保たれる。
 */

export type BookingMethod = 'page' | 'email' | 'dm'

/** 入力順は画面と同じ（撮影会名 → 撮影区分 → モデル名 → … → 予約URL） */
export interface ReservationInput extends ShootOptionsInput, ShootPaymentInput {
  /** メモ。省略時は空 */
  memo?: string
  /** 撮影会名。任意。未入力ならコンセプトやモデル名からタイトルを組み立てる */
  eventName: string
  shootCategory: ShootCategory
  /** モデルを指定しない撮影区分では無視する */
  modelName: string
  /** 任意 */
  concept: string
  /** 任意。マスタに同名があれば紐づけ、無ければテキストとして残す */
  venueName: string
  /** 撮影日（YYYY-MM-DD） */
  shootDate: string
  /** 予約受付の開始日時（datetime-local の値） */
  bookingOpensAt: string
  /** 予約受付の終了日時（datetime-local の値）。任意 */
  bookingClosesAt?: string
  bookingMethod: BookingMethod
  /** 申込先。bookingMethod によって URL / メールアドレス / DM アカウント */
  bookingContact: string
  /** 同名で所属が違うモデルがいるとき、新規作成せず撮影会名をそのモデルの所属に加える */
  addAffiliation?: boolean
}

export interface ReservationResult {
  sessionId: string
  /** 新しくモデルマスタに登録したモデル。登録しなければ null */
  newModelId: string | null
}

/** 予約段階では枠の時刻が未定なので、撮影日の 0 時を仮置きする */
function placeholderStartAt(shootDate: string): string {
  return new Date(`${shootDate}T00:00:00`).toISOString()
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

export async function createReservation(
  userId: string,
  input: ReservationInput,
): Promise<ReservationResult> {
  const hasModel = categoryHasModel(input.shootCategory)
  // 欄を隠す前に入力した名前が残っていても、モデルを指定しない区分では使わない
  const modelName = hasModel ? input.modelName.trim() : ''
  const venueName = input.venueName.trim()
  const concept = input.concept.trim()

  if (hasModel && !modelName) {
    throw new Error('モデル名を入力してください')
  }

  // モデルなどを作る前に検証する。途中で失敗して行だけ残らないように
  const options = toShootOptionColumns(input)

  // モデルはマスタに実体が要る（slot_models.model_id は NOT NULL で
  // テキストのフォールバックが無い）。モデル名と撮影会名の組み合わせが無ければ作る
  const eventName = input.eventName.trim()
  const model = hasModel
    ? await resolveModel(userId, modelName, eventName, {
        addAffiliation: input.addAffiliation,
      })
    : null
  const modelId = model?.id

  // 場所は venue_name のフォールバックがあるので、マスタに無ければ作らない。
  // 予約段階で場所マスタが増え続けるのを避ける
  const venues = await db.venues.toArray()
  const venue = venues.find((v) => !v.deleted_at && normalize(v.name) === normalize(venueName))

  // 撮影会名があればそれがタイトル。無ければコンセプト、どちらも無ければモデル名か区分名から組む
  const title = eventName || concept || fallbackShootTitle(input.shootCategory, modelName)
  const organizerId = await resolveOrganizer(userId, eventName)

  const sessionId = await createRow('sessions', {
    user_id: userId,
    title,
    organizer_id: organizerId,
    session_date: input.shootDate,
    shoot_category: input.shootCategory,
    // 予約段階。可否が決まったら confirmed / cancelled になる
    status: 'planned',
    booking_opens_at: new Date(input.bookingOpensAt).toISOString(),
    booking_closes_at: input.bookingClosesAt ? new Date(input.bookingClosesAt).toISOString() : null,
    booking_method: input.bookingMethod,
    booking_contact: input.bookingContact.trim() || null,
    concept: concept || null,
    venue_id: venue?.id ?? null,
    venue_name: venueName || null,
    memo: input.memo?.trim() || null,
  })

  const slotId = await createRow('slots', {
    user_id: userId,
    session_id: sessionId,
    slot_no: 1,
    start_at: placeholderStartAt(input.shootDate),
    ...options,
    ...toFeePaymentColumns(input),
    // サーバ既定の '{}' に合わせる（省くと undefined になり形が食い違う）
    storage_urls: [],
  })

  if (modelId) {
    await createRow('slot_models', {
      user_id: userId,
      slot_id: slotId,
      model_id: modelId,
    })
  }

  return { sessionId, newModelId: model?.created ? model.id : null }
}

/**
 * 予約の編集。入力は予約情報入力と同じ。
 * 可否が決まった（確定・不成立になった）予約は編集できない。
 * モデルを変えたら slot_models の行を付け替え、モデルを指定しない区分にしたら行を消す。
 */
export async function updateReservation(
  sessionId: string,
  input: ReservationInput,
): Promise<ReservationResult> {
  const session = await db.sessions.get(sessionId)
  if (!session || session.deleted_at || session.status !== 'planned') {
    throw new Error('編集できる予約が見つかりませんでした')
  }
  const slot = (await db.slots.where('session_id').equals(sessionId).toArray())
    .filter((s) => !s.deleted_at)
    .sort((a, b) => a.slot_no - b.slot_no)[0]
  if (!slot) throw new Error('予約の枠が見つかりませんでした')

  const userId = session.user_id
  const hasModel = categoryHasModel(input.shootCategory)
  const modelName = hasModel ? input.modelName.trim() : ''
  const venueName = input.venueName.trim()
  const concept = input.concept.trim()
  if (hasModel && !modelName) throw new Error('モデル名を入力してください')

  // 書き込む前に検証する
  const options = toShootOptionColumns(input)
  const eventName = input.eventName.trim()
  const model = hasModel
    ? await resolveModel(userId, modelName, eventName, {
        addAffiliation: input.addAffiliation,
      })
    : null

  const venue = (await db.venues.toArray()).find(
    (v) => !v.deleted_at && normalize(v.name) === normalize(venueName),
  )
  const organizerId = await resolveOrganizer(userId, eventName)

  await updateRow('sessions', sessionId, {
    title: eventName || concept || fallbackShootTitle(input.shootCategory, modelName),
    organizer_id: organizerId,
    session_date: input.shootDate,
    shoot_category: input.shootCategory,
    booking_opens_at: new Date(input.bookingOpensAt).toISOString(),
    booking_closes_at: input.bookingClosesAt ? new Date(input.bookingClosesAt).toISOString() : null,
    booking_method: input.bookingMethod,
    booking_contact: input.bookingContact.trim() || null,
    concept: concept || null,
    venue_id: venue?.id ?? null,
    venue_name: venueName || null,
    memo: input.memo?.trim() || null,
  })

  await updateRow('slots', slot.id, {
    start_at: placeholderStartAt(input.shootDate),
    ...options,
    ...toFeePaymentColumns(input),
  })

  const links = await db.slot_models.where('slot_id').equals(slot.id).toArray()
  if (!model) {
    for (const link of links) await deleteRow('slot_models', link.id)
  } else if (links.length === 0) {
    await createRow('slot_models', {
      user_id: userId,
      slot_id: slot.id,
      model_id: model.id,
    })
  } else {
    const [first, ...rest] = links
    if (first.model_id !== model.id)
      await updateRow('slot_models', first.id, { model_id: model.id })
    for (const link of rest) await deleteRow('slot_models', link.id)
  }

  return { sessionId, newModelId: model?.created ? model.id : null }
}

/**
 * 予約の成否を記録する。
 * 予約失敗は「session は planned のまま、枠の shoot_status が cancelled」で表す
 * （撮影中止は枠が残らないと session も cancelled にするので、この組み合わせは失敗の予約だけ）。
 * 失敗にしても予約スケジュールに残り、撮影日当日までは予約成功に変えられる。
 * 予約失敗の理由（任意）は `sessions.booking_failure_reason` に持ち、予約成功に変えると消す。
 * 予約成功は枠を元に戻す。session を confirmed にするのは確定撮影情報入力。
 */
export async function setReservationResult(
  sessionId: string,
  result: 'success' | 'failure',
  reason = '',
): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session || session.deleted_at || session.status !== 'planned') {
    throw new Error('予約が見つかりませんでした')
  }
  const slots = (await db.slots.where('session_id').equals(sessionId).toArray()).filter(
    (s) => !s.deleted_at,
  )
  const wanted = result === 'failure' ? 'cancelled' : 'planned'
  for (const slot of slots) {
    if (slot.shoot_status !== wanted) await updateRow('slots', slot.id, { shoot_status: wanted })
  }
  const nextReason = result === 'failure' ? reason.trim() || null : null
  if ((session.booking_failure_reason ?? null) !== nextReason) {
    await updateRow('sessions', sessionId, { booking_failure_reason: nextReason })
  }
}

/**
 * 予約の削除。可否がまだ決まっていない予約（予約失敗にした予約を含む）を、
 * 予約スケジュールから消す。履歴を残すため論理削除で、枠も一緒に消す。
 * モデル・撮影会・ロケ地のマスタと slot_models は触らない（入力した情報は残す）。
 */
export async function deleteReservation(sessionId: string): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session || session.deleted_at || session.status !== 'planned') {
    throw new Error('削除できる予約が見つかりませんでした')
  }
  const slots = (await db.slots.where('session_id').equals(sessionId).toArray()).filter(
    (s) => !s.deleted_at,
  )
  for (const slot of slots) await softDeleteRow('slots', slot.id)
  await softDeleteRow('sessions', sessionId)
}

export const reservationInternals = { placeholderStartAt, normalize }
