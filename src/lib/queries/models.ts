import { db } from '@/lib/db'
import { DEFAULT_MODEL_STATUS, type ModelStatus } from '@/lib/model-status'

/** モデルマスタの詳細・編集の1件。カラムと同じ項目を持つ */
export interface ModelDetail {
  id: string
  userId: string
  name: string
  nameKana: string | null
  avatarUrl: string | null
  snsLinks: Record<string, string>
  contactMethod: string | null
  contactValue: string | null
  affiliation: string | null
  tags: string[]
  rating: number | null
  isFavorite: boolean
  status: ModelStatus
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
  return {
    id: m.id,
    userId: m.user_id,
    name: m.name,
    nameKana: m.name_kana ?? null,
    avatarUrl: m.avatar_url ?? null,
    snsLinks: (m.sns_links ?? {}) as Record<string, string>,
    contactMethod: m.contact_method ?? null,
    contactValue: m.contact_value ?? null,
    affiliation: m.affiliation ?? null,
    tags: m.tags ?? [],
    rating: m.rating ?? null,
    isFavorite: m.is_favorite ?? false,
    status: m.status ?? DEFAULT_MODEL_STATUS,
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
