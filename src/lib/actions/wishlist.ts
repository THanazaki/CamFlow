import { db } from '@/lib/db'
import { createRow, updateRow } from '@/lib/sync/mutations'
import type { Json } from '@/types/database'

import { resolveModel, resolveOrganizer, type ShootOptionsInput } from './shoots'

/** 撮影希望モデル登録の入力。入力順は画面と同じ */
export interface WishlistInput
  extends Pick<ShootOptionsInput, 'costumeOptions' | 'shootingMethodOptions'> {
  modelName: string
  eventName: string
  /** モデルのアカウント。入力があればモデルマスタに保存する */
  modelX: string
  modelInstagram: string
}

/**
 * 撮影希望モデルを登録する。
 * モデルはマスタの行に紐づける（無ければ作る）。同じモデルを複数回登録してもよい。
 */
export async function createWishlistModel(userId: string, input: WishlistInput): Promise<string> {
  const modelName = input.modelName.trim()
  if (!modelName) {
    throw new Error('モデル名を入力してください')
  }

  const modelId = await resolveModel(userId, modelName)
  await saveModelAccounts(modelId, input)
  // 撮影希望には日付も枠も無いので撮影会への紐づけは持たず、マスタへの登録だけ行う
  await resolveOrganizer(userId, input.eventName)

  return createRow('wishlist_models', {
    user_id: userId,
    model_id: modelId,
    event_name: input.eventName.trim() || null,
    costume_options: input.costumeOptions.trim() || null,
    shooting_method_options: input.shootingMethodOptions.trim() || null,
  })
}

/** 入力があった欄だけ上書きする。空欄で既存のアカウントを消さないため */
async function saveModelAccounts(
  modelId: string,
  input: Pick<WishlistInput, 'modelX' | 'modelInstagram'>,
): Promise<void> {
  const model = await db.models.get(modelId)
  const current = (model?.sns_links ?? {}) as Record<string, string>
  const next = { ...current }
  const x = input.modelX.trim()
  const instagram = input.modelInstagram.trim()
  if (x) next.x = x
  if (instagram) next.instagram = instagram

  if (JSON.stringify(next) !== JSON.stringify(current)) {
    await updateRow('models', modelId, { sns_links: next as Json })
  }
}
