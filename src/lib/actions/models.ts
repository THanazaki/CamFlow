import { db } from '@/lib/db'
import type { ModelStatus } from '@/lib/model-status'
import { updateRow } from '@/lib/sync/mutations'
import type { Json } from '@/types/database'

/** モデルマスタの編集の入力。入力欄の値のまま持つ */
export interface ModelInput {
  name: string
  nameKana: string
  avatarUrl: string
  x: string
  instagram: string
  contactMethod: string
  contactValue: string
  affiliation: string
  /** タグ。カンマか読点で区切る */
  tags: string
  /** 評価（1〜5）。空は未設定 */
  rating: string
  isFavorite: boolean
  status: ModelStatus
  notes: string
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

/** 区切り文字で分け、空欄と重複を除く */
export function parseTags(value: string): string[] {
  return [...new Set(value.split(/[,，、\n]/).map((tag) => tag.trim()).filter(Boolean))]
}

function parseRating(value: string): number | null {
  if (!value) return null
  const rating = Number(value)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('評価は1〜5で入力してください')
  }
  return rating
}

/**
 * モデルマスタの編集。
 * id / user_id / 作成・更新・削除の日時は変更しない。
 */
export async function updateModel(modelId: string, input: ModelInput): Promise<void> {
  const model = await db.models.get(modelId)
  if (!model || model.deleted_at) {
    throw new Error('モデルが見つかりませんでした')
  }

  const name = input.name.trim()
  if (!name) {
    throw new Error('モデル名を入力してください')
  }
  const rating = parseRating(input.rating)

  // サーバの一意制約（名前 + 所属。論理削除を除く）と同じ条件。ここで止めないと同期で初めて失敗する
  const affiliation = input.affiliation.trim()
  const models = await db.models.toArray()
  const duplicated = models.some(
    (m) =>
      m.id !== modelId &&
      !m.deleted_at &&
      normalize(m.name) === normalize(name) &&
      normalize(m.affiliation ?? '') === normalize(affiliation),
  )
  if (duplicated) {
    throw new Error(
      `「${name}」（所属：${affiliation || 'なし'}）は既に登録されています`,
    )
  }

  // X / Instagram 以外の SNS は画面に欄が無いので、そのまま残す
  const snsLinks = { ...((model.sns_links ?? {}) as Record<string, string>) }
  for (const [key, value] of [
    ['x', input.x],
    ['instagram', input.instagram],
  ] as const) {
    const trimmed = value.trim()
    if (trimmed) snsLinks[key] = trimmed
    else delete snsLinks[key]
  }

  await updateRow('models', modelId, {
    name,
    name_kana: input.nameKana.trim() || null,
    avatar_url: input.avatarUrl.trim() || null,
    sns_links: snsLinks as Json,
    contact_method: input.contactMethod.trim() || null,
    contact_value: input.contactValue.trim() || null,
    affiliation: affiliation || null,
    tags: parseTags(input.tags),
    rating,
    is_favorite: input.isFavorite,
    status: input.status,
    notes: input.notes.trim() || null,
  })
}
