import { db } from '@/lib/db'
import type { LocalModel } from '@/lib/db/types'
import { cleanAccounts, type ModelAccountEntry } from '@/lib/model-accounts'
import { updateRow } from '@/lib/sync/mutations'
import type { Json } from '@/types/database'

import { affiliationKeys } from './models'

/** 撮影会マスタの編集の入力。入力欄の値のまま持つ */
export interface OrganizerInput {
  name: string
  nameKana: string
  baseLocation: string
  url: string
  /** X / Instagram などのアカウント。空欄は無視する */
  accounts: ModelAccountEntry[]
  contact: string
  notes: string
  isFavorite: boolean
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

interface ModelAffiliationChange {
  model: LocalModel
  affiliation: string | null
  subAffiliations: string[]
}

/**
 * 撮影会名の変更に合わせて書き換えるモデルの所属。
 * 古い名前（大文字小文字の違いを含む）をメイン・その他の所属に持つモデルが対象。
 * 書き換えで同じモデルの所属が重なったら1つにまとめる（メインを残す）。
 */
function affiliationChanges(
  models: LocalModel[],
  oldName: string,
  newName: string,
): ModelAffiliationChange[] {
  const replace = (a: string) => (normalize(a) === normalize(oldName) ? newName : a)

  return models.flatMap((model) => {
    const main = model.affiliation ?? null
    const subs = model.sub_affiliations ?? []
    if (![main ?? '', ...subs].some((a) => normalize(a) === normalize(oldName))) return []

    const newMain = main === null ? null : replace(main)
    const seen = new Set(newMain === null ? [] : [normalize(newMain)])
    const newSubs: string[] = []
    for (const sub of subs.map(replace)) {
      if (seen.has(normalize(sub))) continue
      seen.add(normalize(sub))
      newSubs.push(sub)
    }
    return [{ model, affiliation: newMain, subAffiliations: newSubs }]
  })
}

/**
 * 撮影会マスタの編集。
 * id / user_id / 作成・更新・削除の日時は変更しない。
 *
 * 名前を変えると、その名前を所属に持つモデルの所属も新しい名前に書き換える
 * （予約などの入力でモデルを見分けるのに所属を使うため）。撮影のタイトルは書き換えない。
 */
export async function updateOrganizer(organizerId: string, input: OrganizerInput): Promise<void> {
  const organizer = await db.organizers.get(organizerId)
  if (!organizer || organizer.deleted_at) {
    throw new Error('撮影会が見つかりませんでした')
  }

  const name = input.name.trim()
  if (!name) {
    throw new Error('撮影会名を入力してください')
  }

  // サーバの一意制約（論理削除を除く）と同じ条件。ここで止めないと同期で初めて失敗する
  const organizers = await db.organizers.toArray()
  const duplicated = organizers.some(
    (o) => o.id !== organizerId && !o.deleted_at && normalize(o.name) === normalize(name),
  )
  if (duplicated) {
    throw new Error(`「${name}」は既に登録されています`)
  }

  // 書き込む前に、所属の書き換えでモデルが重ならないか確かめる
  const liveModels = (await db.models.toArray()).filter((m) => !m.deleted_at)
  const changes = name === organizer.name ? [] : affiliationChanges(liveModels, organizer.name, name)
  const after = new Map(
    liveModels.map((m) => [m.id, { name: m.name, keys: affiliationKeys(m.affiliation, m.sub_affiliations) }]),
  )
  for (const change of changes) {
    after.set(change.model.id, {
      name: change.model.name,
      keys: affiliationKeys(change.affiliation, change.subAffiliations),
    })
  }
  for (const change of changes) {
    const own = after.get(change.model.id)!
    const conflict = [...after].some(
      ([id, other]) =>
        id !== change.model.id &&
        normalize(other.name) === normalize(own.name) &&
        other.keys.some((k) => own.keys.includes(k)),
    )
    if (conflict) {
      throw new Error(
        `撮影会名を「${name}」に変えると、モデル「${change.model.name}」の所属が他のモデルと重なります。先にモデルマスタで所属を整理してください`,
      )
    }
  }

  await updateRow('organizers', organizerId, {
    name,
    name_kana: input.nameKana.trim() || null,
    base_location: input.baseLocation.trim() || null,
    url: input.url.trim() || null,
    sns_accounts: cleanAccounts(input.accounts) as unknown as Json,
    contact: input.contact.trim() || null,
    notes: input.notes.trim() || null,
    is_favorite: input.isFavorite,
  })

  for (const change of changes) {
    await updateRow('models', change.model.id, {
      affiliation: change.affiliation,
      sub_affiliations: change.subAffiliations,
    })
  }
}
