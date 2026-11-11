import { findFreeModelCandidates, freeModelConfirmMessage } from '@/lib/actions/shoots'

/**
 * 撮影会名が空（フリー）のモデルを登録する前に、同名のフリーのモデルと同じ人かを確認する。
 * 同名の別人の可能性があるため、自動では同じモデルにしない。
 *
 * 候補を1人ずつ確認し、OK のモデルを使う（その id を返す）。すべてキャンセルなら 'new'（別モデルとして登録）。
 * 候補がいなければ undefined（確認なし）。
 */
export async function chooseFreeModel(
  modelName: string,
  eventName: string,
  currentSessionId?: string,
): Promise<string | undefined> {
  const candidates = await findFreeModelCandidates(modelName, eventName, currentSessionId)
  for (const candidate of candidates) {
    if (confirm(freeModelConfirmMessage(candidate))) return candidate.id
  }
  return candidates.length > 0 ? 'new' : undefined
}
