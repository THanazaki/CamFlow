import { db } from '@/lib/db'
import { categoryHasModel, fallbackShootTitle } from '@/lib/shoot-category'
import { normalizeStorageUrls } from '@/lib/storage-urls'
import { createRow, deleteRow, updateRow } from '@/lib/sync/mutations'

import {
  resolveVenue,
  resolveShootEvent,
  resolveShootModel,
  type EventOrganizerRow,
  type ShootDetailsInput,
} from './shoots'

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

/**
 * 登録と編集で共通の処理。入力を検証してカラムに変換し、モデルと撮影会をマスタと突き合わせる。
 * current は更新する既存の行。
 */
async function prepareShootHistory(
  userId: string,
  input: ShootHistoryInput,
  current?: EventOrganizerRow,
  currentModelIds: string[] = [],
) {
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

  const event = await resolveShootEvent(userId, eventName, current)
  const model = hasModel
    ? await resolveShootModel(
        userId,
        modelName,
        event,
        currentModelIds,
        input.addAffiliation,
      )
    : null
  const venueId = await resolveVenue(userId, venueName, input.placeCategory)

  return {
    modelId: model?.id ?? null,
    newModelId: model?.created ? model.id : null,
    values: {
      shoot_date: input.shootDate,
      title: eventName || concept || fallbackShootTitle(input.shootCategory, modelName),
      organizer_id: event.organizerId,
      shoot_category: input.shootCategory,
      concept: concept || null,
      place_category: input.placeCategory,
      venue_id: venueId,
      venue_name: venueName || null,
      storage_urls: storageUrls,
      memo: input.memo?.trim() || null,
    },
  }
}

export async function createShootHistory(
  userId: string,
  input: ShootHistoryInput,
): Promise<{ historyId: string; newModelId: string | null }> {
  const { modelId, newModelId, values } = await prepareShootHistory(userId, input)

  const historyId = await createRow('shoot_history', {
    user_id: userId,
    ...values,
    // NOT NULL + 既定値のカラムは、ローカル行とサーバ行の形をそろえるため明示する
    shoot_type: 'solo',
    venue_cost: 0,
    transport_cost: 0,
    entry_cost: 0,
    other_cost: 0,
    delivery_status: 'not_started',
  })

  // outbox は順に送信されるので、親 → 子の順に作れば FK の順序は保たれる
  if (modelId) {
    await addHistoryModel(userId, historyId, modelId)
  }

  return { historyId, newModelId }
}

/** 過去撮影の編集。撮影情報検索の編集画面から呼ぶ */
export async function updateShootHistory(
  userId: string,
  historyId: string,
  input: ShootHistoryInput,
): Promise<void> {
  const history = await db.shoot_history.get(historyId)
  if (!history) {
    throw new Error('撮影が見つかりませんでした')
  }
  const links = await db.shoot_history_models.where('shoot_history_id').equals(historyId).toArray()
  const { modelId, values } = await prepareShootHistory(
    userId,
    input,
    history,
    links.map((l) => l.model_id),
  )

  await updateRow('shoot_history', historyId, values)

  if (!modelId) {
    for (const link of links) {
      await deleteRow('shoot_history_models', link.id)
    }
  } else if (links.some((l) => l.model_id === modelId)) {
    return
  } else if (links.length === 1) {
    // 紐づけを付け替える。作り直すとモデル料や納品の記録が消える
    await updateRow('shoot_history_models', links[0].id, { model_id: modelId })
  } else {
    await addHistoryModel(userId, historyId, modelId)
  }
}

async function addHistoryModel(userId: string, historyId: string, modelId: string): Promise<void> {
  await createRow('shoot_history_models', {
    user_id: userId,
    shoot_history_id: historyId,
    model_id: modelId,
    fee: 0,
    payment_status: 'paid',
  })
}
