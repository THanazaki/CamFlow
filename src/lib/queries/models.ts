import { db } from '@/lib/db'
import { readModelAccounts, type ModelAccountEntry } from '@/lib/model-accounts'
import { toSelectableModelStatus, type SelectableModelStatus } from '@/lib/model-status'

/**
 * モデルマスタの詳細・編集の1件。
 * アバターURL・タグ・評価はカラムとしては残っているが、使わないので画面に出さない。
 */
export interface ModelDetail {
  id: string
  userId: string
  name: string
  nameKana: string | null
  /** モデルアカウント。登録した順 */
  accounts: ModelAccountEntry[]
  contactMethod: string | null
  contactValue: string | null
  /** メインの所属 */
  affiliation: string | null
  /** メイン以外の所属 */
  subAffiliations: string[]
  /** 別名義（model_former_names）。登録した順 */
  aliases: { name: string; kana: string | null }[]
  isFavorite: boolean
  /** ng（今後撮影しない）は休止・引退にそろえて返す */
  status: SelectableModelStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * 1件を返す。無いか論理削除済みなら null。
 * 予約などから自動で作った行は、ローカルではカラムが欠けていることがあるので既定値で補う。
 */
export async function loadModelDetail(id: string): Promise<ModelDetail | null> {
  const m = await db.models.get(id)
  if (!m || m.deleted_at) return null
  const aliases = (await db.model_former_names.where('model_id').equals(id).toArray()).sort(
    (a, b) => a.created_at.localeCompare(b.created_at),
  )
  return {
    id: m.id,
    userId: m.user_id,
    name: m.name,
    nameKana: m.name_kana ?? null,
    accounts: readModelAccounts(m),
    contactMethod: m.contact_method ?? null,
    contactValue: m.contact_value ?? null,
    affiliation: m.affiliation ?? null,
    subAffiliations: m.sub_affiliations ?? [],
    aliases: aliases.map((a) => ({ name: a.name, kana: a.name_kana ?? null })),
    isFavorite: m.is_favorite ?? false,
    status: toSelectableModelStatus(m.status),
    notes: m.notes ?? null,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    deletedAt: m.deleted_at ?? null,
  }
}

/** モデルマスタ画面の1行 */
export interface ModelRow {
  id: string
  name: string
  /** メインの所属 */
  affiliation: string | null
  /** メイン以外の所属の数 */
  otherAffiliationCount: number
}

/** 登録済みのモデルを、読み（無ければ名前）の順に返す。 */
export async function loadModelList(): Promise<ModelRow[]> {
  const models = await db.models.toArray()

  return models
    .filter((m) => !m.deleted_at)
    .sort((a, b) => (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja'))
    .map((m) => ({
      id: m.id,
      name: m.name,
      affiliation: m.affiliation ?? null,
      otherAffiliationCount: (m.sub_affiliations ?? []).length,
    }))
}
