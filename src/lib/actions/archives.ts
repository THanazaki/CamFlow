import { categoryHasModel, fallbackShootTitle } from '@/lib/shoot-category'
import { normalizeStorageUrls } from '@/lib/storage-urls'
import { createRow } from '@/lib/sync/mutations'

import { findVenue, resolveModel, type ShootDetailsInput } from './shoots'

/**
 * 過去撮影登録の書き込み。
 *
 * 運用フローを通していない過去の撮影を shoot_history + shoot_history_models として作る。
 * 登録した時点で撮影済みの実績として数えられる。
 */

export interface ShootHistoryInput extends Omit<ShootDetailsInput, 'meetingPoint'> {
  /** 保存先ストレージURL。空欄は無視する */
  storageUrls: string[]
}

/** ローカルタイムゾーンの今日（YYYY-MM-DD） */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export async function createShootHistory(
  userId: string,
  input: ShootHistoryInput,
): Promise<{ historyId: string }> {
  const hasModel = categoryHasModel(input.shootCategory)
  // 欄を隠す前の入力が残っていても、モデルを指定しない区分では使わない
  const modelName = hasModel ? input.modelName.trim() : ''
  const venueName = input.venueName.trim()
  const concept = input.concept.trim()
  const eventName = input.eventName.trim()
  const storageUrls = normalizeStorageUrls(input.storageUrls)

  if (hasModel && !modelName) {
    throw new Error('モデル名を入力してください')
  }
  // 登録すると撮影済みの実績に数えるので、未来の日付は受け付けない
  if (input.shootDate > localToday()) {
    throw new Error('撮影日には今日以前の日付を入力してください')
  }

  const modelId = hasModel ? await resolveModel(userId, modelName) : null
  const venue = await findVenue(venueName)

  const historyId = await createRow('shoot_history', {
    user_id: userId,
    shoot_date: input.shootDate,
    title: eventName || concept || fallbackShootTitle(input.shootCategory, modelName),
    // NOT NULL + 既定値のカラムは、ローカル行とサーバ行の形をそろえるため明示する
    shoot_type: 'solo',
    shoot_category: input.shootCategory,
    concept: concept || null,
    place_category: input.placeCategory,
    venue_id: venue?.id ?? null,
    venue_name: venueName || null,
    storage_urls: storageUrls,
    venue_cost: 0,
    transport_cost: 0,
    entry_cost: 0,
    other_cost: 0,
    delivery_status: 'not_started',
  })

  // outbox は順に送信されるので、親 → 子の順に作れば FK の順序は保たれる
  if (modelId) {
    await createRow('shoot_history_models', {
      user_id: userId,
      shoot_history_id: historyId,
      model_id: modelId,
      fee: 0,
      payment_status: 'paid',
    })
  }

  return { historyId }
}
