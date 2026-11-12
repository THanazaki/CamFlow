import { findFreeModelCandidates, freeModelConfirmMessage, freeModelKey } from '@/lib/actions/shoots'
import { collectModelNames } from '@/lib/shoot-category'

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

/**
 * 2人目以降のモデル名それぞれについて chooseFreeModel を行う。
 * 戻り値は `freeModelKey(モデル名)` → 選択。確認の要らないモデルは含めない。
 * 1人目と同じ名前や空欄は対象外（保存時に無視されるため）
 */
export async function chooseExtraFreeModels(
  primaryName: string,
  extraNames: string[] | undefined,
  eventName: string,
  currentSessionId?: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const name of collectModelNames(primaryName, extraNames).slice(1)) {
    const choice = await chooseFreeModel(name, eventName, currentSessionId)
    if (choice) result[freeModelKey(name)] = choice
  }
  return result
}
