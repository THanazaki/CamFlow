import { db } from '@/lib/db'
import { categoryHasModel, fallbackShootTitle, type ShootCategory } from '@/lib/shoot-category'
import { createRow } from '@/lib/sync/mutations'

import {
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
  bookingMethod: BookingMethod
  /** 申込先。bookingMethod によって URL / メールアドレス / DM アカウント */
  bookingContact: string
}

export interface ReservationResult {
  sessionId: string
  /** 新しくモデルマスタに登録したか */
  createdModel: boolean
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
  // テキストのフォールバックが無い）。同名が無ければ作る
  let modelId: string | undefined
  let createdModel = false
  if (hasModel) {
    const models = await db.models.toArray()
    modelId = models.find((m) => !m.deleted_at && normalize(m.name) === normalize(modelName))?.id
    if (!modelId) {
      modelId = await createRow('models', { user_id: userId, name: modelName })
      createdModel = true
    }
  }

  // 場所は venue_name のフォールバックがあるので、マスタに無ければ作らない。
  // 予約段階で場所マスタが増え続けるのを避ける
  const venues = await db.venues.toArray()
  const venue = venues.find(
    (v) => !v.deleted_at && normalize(v.name) === normalize(venueName),
  )

  // 撮影会名があればそれがタイトル。無ければコンセプト、どちらも無ければモデル名か区分名から組む
  const eventName = input.eventName.trim()
  const title = eventName || concept || fallbackShootTitle(input.shootCategory, modelName)

  const sessionId = await createRow('sessions', {
    user_id: userId,
    title,
    session_date: input.shootDate,
    shoot_category: input.shootCategory,
    // 予約段階。可否が決まったら confirmed / cancelled になる
    status: 'planned',
    booking_opens_at: new Date(input.bookingOpensAt).toISOString(),
    booking_method: input.bookingMethod,
    booking_contact: input.bookingContact.trim() || null,
    concept: concept || null,
    venue_id: venue?.id ?? null,
    venue_name: venueName || null,
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

  return { sessionId, createdModel }
}

export const reservationInternals = { placeholderStartAt, normalize }
