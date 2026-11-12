import { db } from '@/lib/db'
import { createRow, deleteRow, updateRow } from '@/lib/sync/mutations'

import { resolveModel, resolveOrganizer, type ShootOptionsInput } from './shoots'

/** 撮影希望モデル登録の入力。入力順は画面と同じ */
export interface WishlistInput
  extends Pick<ShootOptionsInput, 'costumeOptions' | 'shootingMethodOptions'> {
  modelName: string
  eventName: string
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

  // 撮影希望は名前だけで照合する（撮影会名との組み合わせで見分けるのは予約・確定・過去撮影の入力）。
  // 新しく作るときの所属は「フリー」
  const { id: modelId } = await resolveModel(userId, modelName, '', { anyAffiliation: true })
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

/**
 * 撮影希望モデルを編集する。登録と同じ入力で、モデルは名前で照合し直す（無ければ作る）。
 * 空にした任意項目は null に戻す。
 */
export async function updateWishlistModel(
  userId: string,
  id: string,
  input: WishlistInput,
): Promise<void> {
  if (!(await db.wishlist_models.get(id))) {
    throw new Error('撮影希望が見つかりませんでした')
  }
  const modelName = input.modelName.trim()
  if (!modelName) {
    throw new Error('モデル名を入力してください')
  }

  const { id: modelId } = await resolveModel(userId, modelName, '', { anyAffiliation: true })
  await resolveOrganizer(userId, input.eventName)

  await updateRow('wishlist_models', id, {
    model_id: modelId,
    event_name: input.eventName.trim() || null,
    costume_options: input.costumeOptions.trim() || null,
    shooting_method_options: input.shootingMethodOptions.trim() || null,
  })
}

/**
 * 撮影希望モデルの削除。控えの1件だけを消す（物理削除。同期は tombstone で行う）。
 * モデルマスタのモデルは消さない。同じモデルの別の撮影希望も残る。
 */
export async function deleteWishlistModel(id: string): Promise<void> {
  if (!(await db.wishlist_models.get(id))) {
    throw new Error('撮影希望が見つかりませんでした')
  }
  await deleteRow('wishlist_models', id)
}
