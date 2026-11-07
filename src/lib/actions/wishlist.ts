import { db } from '@/lib/db'
import { cleanAccounts, readModelAccounts } from '@/lib/model-accounts'
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

  // 撮影希望は名前だけで照合する（撮影会名との組み合わせで見分けるのは予約・確定・過去撮影の入力）。
  // 新しく作るときの所属は「フリー」
  const { id: modelId } = await resolveModel(userId, modelName, '', { anyAffiliation: true })
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

/**
 * 入力されたアカウントをモデルに足す。既に同じものがあれば何もしない。
 * アカウントは複数持てるので、空欄でも違う値でも既存のアカウントは消さない
 */
async function saveModelAccounts(
  modelId: string,
  input: Pick<WishlistInput, 'modelX' | 'modelInstagram'>,
): Promise<void> {
  const model = await db.models.get(modelId)
  if (!model) return
  const current = readModelAccounts(model)
  const next = cleanAccounts([
    ...current,
    { service: 'x', value: input.modelX },
    { service: 'instagram', value: input.modelInstagram },
  ])

  if (next.length !== current.length) {
    await updateRow('models', modelId, { sns_accounts: next as unknown as Json })
  }
}
