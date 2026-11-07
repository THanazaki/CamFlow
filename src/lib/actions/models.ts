import { db } from '@/lib/db'
import type { SelectableModelStatus } from '@/lib/model-status'
import { createRow, deleteRow, updateRow } from '@/lib/sync/mutations'
import type { Json } from '@/types/database'

/** モデルマスタの編集の入力。入力欄の値のまま持つ */
export interface ModelInput {
  name: string
  nameKana: string
  x: string
  instagram: string
  contactMethod: string
  contactValue: string
  /** 所属。空欄は無視する */
  affiliations: string[]
  /** affiliations のうちメインにするものの位置 */
  mainAffiliation: number
  /** 別名義。空欄は無視する */
  aliases: string[]
  isFavorite: boolean
  status: SelectableModelStatus
  notes: string
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

/** 前後の空白、空欄、重複（大文字小文字の違いを含む）を除く。順番は保つ */
function cleanList(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(normalize(trimmed))) continue
    seen.add(normalize(trimmed))
    result.push(trimmed)
  }
  return result
}

/**
 * 所属をメインとそれ以外に分ける。
 * メインに選んだ欄が空なら、残った所属の先頭をメインにする。
 */
export function splitAffiliations(
  affiliations: string[],
  mainIndex: number,
): { main: string | null; subs: string[] } {
  const chosen = affiliations[mainIndex]?.trim() ?? ''
  const all = cleanList(affiliations)
  const main = all.find((a) => normalize(a) === normalize(chosen)) ?? all[0] ?? null
  return { main, subs: all.filter((a) => a !== main) }
}

/** モデルの所属すべて（メイン + それ以外）。所属が無ければ空文字を1つ返す（一意制約と同じ扱い） */
export function affiliationKeys(
  main: string | null | undefined,
  subs: string[] | undefined,
): string[] {
  const all = [main ?? '', ...(subs ?? [])].map(normalize)
  return all.some(Boolean) ? all.filter(Boolean) : ['']
}

/**
 * モデルマスタの編集。
 * id / user_id / 作成・更新・削除の日時は変更しない。別名義は model_former_names に保存する。
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

  const { main, subs } = splitAffiliations(input.affiliations, input.mainAffiliation)

  // 同じ名前で所属が重なるモデルがあれば、予約などの入力でどちらか決められない。
  // メインの所属どうしの重複はサーバの一意制約でも止まるが、同期で初めて失敗しないようここで止める
  const ownKeys = affiliationKeys(main, subs)
  const models = await db.models.toArray()
  const conflict = models.find(
    (m) =>
      m.id !== modelId &&
      !m.deleted_at &&
      normalize(m.name) === normalize(name) &&
      affiliationKeys(m.affiliation, m.sub_affiliations).some((k) => ownKeys.includes(k)),
  )
  if (conflict) {
    const shared = affiliationKeys(conflict.affiliation, conflict.sub_affiliations).find((k) =>
      ownKeys.includes(k),
    )
    const label =
      [main, ...subs].find((a) => a && normalize(a) === shared) ?? (shared || 'なし')
    throw new Error(`「${name}」（所属：${label}）は既に登録されています`)
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
    sns_links: snsLinks as Json,
    contact_method: input.contactMethod.trim() || null,
    contact_value: input.contactValue.trim() || null,
    affiliation: main,
    sub_affiliations: subs,
    is_favorite: input.isFavorite,
    status: input.status,
    notes: input.notes.trim() || null,
  })

  await saveAliases(model.user_id, modelId, cleanList(input.aliases))
}

/** 別名義を入力どおりにする。消えたものは削除し、増えたものを追加する */
async function saveAliases(userId: string, modelId: string, aliases: string[]): Promise<void> {
  const current = await db.model_former_names.where('model_id').equals(modelId).toArray()
  const wanted = new Set(aliases)

  for (const row of current) {
    if (!wanted.has(row.name)) await deleteRow('model_former_names', row.id)
  }
  const kept = new Set(current.map((row) => row.name))
  for (const alias of aliases) {
    if (!kept.has(alias)) {
      await createRow('model_former_names', { user_id: userId, model_id: modelId, name: alias })
    }
  }
}
