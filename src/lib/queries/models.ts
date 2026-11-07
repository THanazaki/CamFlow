import { db } from '@/lib/db'

/** モデルマスタ画面の1行 */
export interface ModelRow {
  id: string
  name: string
  affiliation: string | null
}

/** 登録済みのモデルを、読み（無ければ名前）の順に返す。 */
export async function loadModelList(): Promise<ModelRow[]> {
  const models = await db.models.toArray()

  return models
    .filter((m) => !m.deleted_at)
    .sort((a, b) => (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja'))
    .map((m) => ({ id: m.id, name: m.name, affiliation: m.affiliation ?? null }))
}
