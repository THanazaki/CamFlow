import { db } from '@/lib/db'
import { cleanAccounts, type ModelAccountEntry } from '@/lib/model-accounts'
import type { SelectableModelStatus } from '@/lib/model-status'
import { createRow, deleteRow, softDeleteRow, updateRow } from '@/lib/sync/mutations'
import type { Json } from '@/types/database'

import { FREE_AFFILIATION, resolveOrganizer } from './shoots'

/** モデルマスタの編集の入力。入力欄の値のまま持つ */
export interface ModelInput {
  name: string
  nameKana: string
  /** モデルアカウント。空欄は無視する */
  accounts: ModelAccountEntry[]
  contactMethod: string
  contactValue: string
  /** 所属。空欄は無視する */
  affiliations: string[]
  /** affiliations のうちメインにするものの位置 */
  mainAffiliation: number
  /** 別名義と、その読み。名義が空欄の行は無視する */
  aliases: AliasInput[]
  isFavorite: boolean
  status: SelectableModelStatus
  notes: string
}

export interface AliasInput {
  name: string
  kana: string
}

/** updateModel の結果 */
export interface UpdateModelResult {
  /** 所属から撮影会マスタに新しく登録した撮影会名 */
  createdOrganizers: string[]
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
 * 所属に撮影会マスタに無い名前があれば、撮影会として登録する（「フリー」は除く）。
 */
export async function updateModel(modelId: string, input: ModelInput): Promise<UpdateModelResult> {
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

  // sns_links は互換用（sns_accounts を持たない古い行の読み取り用）なので書き換えない
  await updateRow('models', modelId, {
    name,
    name_kana: input.nameKana.trim() || null,
    sns_accounts: cleanAccounts(input.accounts) as unknown as Json,
    contact_method: input.contactMethod.trim() || null,
    contact_value: input.contactValue.trim() || null,
    affiliation: main,
    sub_affiliations: subs,
    is_favorite: input.isFavorite,
    status: input.status,
    notes: input.notes.trim() || null,
  })

  await saveAliases(model.user_id, modelId, cleanAliases(input.aliases))
  const createdOrganizers = await registerOrganizers(model.user_id, [main, ...subs])
  return { createdOrganizers }
}

/** 所属のうち撮影会マスタに無いものを登録し、登録した名前を返す */
async function registerOrganizers(
  userId: string,
  affiliations: (string | null)[],
): Promise<string[]> {
  const organizers = await db.organizers.toArray()
  const known = new Set(organizers.filter((o) => !o.deleted_at).map((o) => normalize(o.name)))
  const created: string[] = []
  for (const affiliation of affiliations) {
    if (!affiliation || normalize(affiliation) === normalize(FREE_AFFILIATION)) continue
    if (known.has(normalize(affiliation))) continue
    await resolveOrganizer(userId, affiliation)
    known.add(normalize(affiliation))
    created.push(affiliation)
  }
  return created
}

/** 名義の前後の空白、空欄、重複を除く（重複は先に書いた方を残す）。読みは空なら null */
function cleanAliases(aliases: AliasInput[]): { name: string; kana: string | null }[] {
  const names = cleanList(aliases.map((a) => a.name))
  return names.map((name) => {
    const source = aliases.find((a) => normalize(a.name) === normalize(name))
    return { name, kana: source?.kana.trim() || null }
  })
}

/** 別名義を入力どおりにする。消えたものは削除し、増えたものを追加し、読みが変わったものを更新する */
async function saveAliases(
  userId: string,
  modelId: string,
  aliases: { name: string; kana: string | null }[],
): Promise<void> {
  const current = await db.model_former_names.where('model_id').equals(modelId).toArray()
  const wanted = new Map(aliases.map((a) => [a.name, a.kana]))

  for (const row of current) {
    if (!wanted.has(row.name)) {
      await deleteRow('model_former_names', row.id)
    } else if ((row.name_kana ?? null) !== wanted.get(row.name)) {
      await updateRow('model_former_names', row.id, { name_kana: wanted.get(row.name) ?? null })
    }
  }
  const kept = new Set(current.map((row) => row.name))
  for (const alias of aliases) {
    if (!kept.has(alias.name)) {
      await createRow('model_former_names', {
        user_id: userId,
        model_id: modelId,
        name: alias.name,
        name_kana: alias.kana,
      })
    }
  }
}

/** 別名義と同じ名前の、統合できそうなモデル */
export interface MergeCandidate {
  id: string
  name: string
  /** 所属（メイン → それ以外の順）。無ければ空 */
  affiliations: string[]
}

/**
 * 新しく追加した別名義と同じ名前のモデルを探す。
 * 既に登録済みの別名義は、前に統合を断っていても毎回聞かないよう対象にしない。
 */
export async function findMergeCandidates(
  modelId: string,
  aliases: AliasInput[],
): Promise<MergeCandidate[]> {
  const saved = await db.model_former_names.where('model_id').equals(modelId).toArray()
  const savedNames = new Set(saved.map((a) => normalize(a.name)))
  const added = new Set(
    cleanAliases(aliases)
      .map((a) => normalize(a.name))
      .filter((n) => !savedNames.has(n)),
  )
  if (added.size === 0) return []

  const models = await db.models.toArray()
  return models
    .filter((m) => m.id !== modelId && !m.deleted_at && added.has(normalize(m.name)))
    .map((m) => ({
      id: m.id,
      name: m.name,
      affiliations: [m.affiliation, ...(m.sub_affiliations ?? [])].filter((a): a is string =>
        Boolean(a?.trim()),
      ),
    }))
}

/**
 * source のモデルを target に統合し、source をモデルマスタから削除する（論理削除）。
 * 消したモデルを指したまま残らないよう、撮影の明細・撮影希望・別名義は target に付け替える。
 * 同じ枠（同じ過去撮影）に両方が入っていたときは、target 側の明細を残す。
 */
export async function mergeModelInto(targetId: string, sourceId: string): Promise<void> {
  if (targetId === sourceId) throw new Error('同じモデルは統合できません')
  const target = await db.models.get(targetId)
  const source = await db.models.get(sourceId)
  if (!target || target.deleted_at || !source || source.deleted_at) {
    throw new Error('モデルが見つかりませんでした')
  }

  const targetSlots = new Set(
    (await db.slot_models.where('model_id').equals(targetId).toArray()).map((r) => r.slot_id),
  )
  for (const row of await db.slot_models.where('model_id').equals(sourceId).toArray()) {
    if (targetSlots.has(row.slot_id)) await deleteRow('slot_models', row.id)
    else await updateRow('slot_models', row.id, { model_id: targetId })
  }

  const targetHistories = new Set(
    (await db.shoot_history_models.where('model_id').equals(targetId).toArray()).map(
      (r) => r.shoot_history_id,
    ),
  )
  for (const row of await db.shoot_history_models.where('model_id').equals(sourceId).toArray()) {
    if (targetHistories.has(row.shoot_history_id)) await deleteRow('shoot_history_models', row.id)
    else await updateRow('shoot_history_models', row.id, { model_id: targetId })
  }

  for (const row of await db.wishlist_models.where('model_id').equals(sourceId).toArray()) {
    await updateRow('wishlist_models', row.id, { model_id: targetId })
  }

  // source の別名義も target の別名義にする。target の名前や既にある別名義と重なるものは捨てる
  const targetAliases = new Set(
    [
      target.name,
      ...(await db.model_former_names.where('model_id').equals(targetId).toArray()).map(
        (a) => a.name,
      ),
    ].map(normalize),
  )
  for (const row of await db.model_former_names.where('model_id').equals(sourceId).toArray()) {
    if (targetAliases.has(normalize(row.name))) {
      await deleteRow('model_former_names', row.id)
    } else {
      await updateRow('model_former_names', row.id, { model_id: targetId })
      targetAliases.add(normalize(row.name))
    }
  }

  await softDeleteRow('models', sourceId)
}
