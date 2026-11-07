import { db } from '@/lib/db'
import { updateRow } from '@/lib/sync/mutations'

/** 撮影会マスタの編集の入力。入力欄の値のまま持つ */
export interface OrganizerInput {
  name: string
  nameKana: string
  baseLocation: string
  url: string
  contact: string
  notes: string
  isFavorite: boolean
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * 撮影会マスタの編集。
 * id / user_id / 作成・更新・削除の日時は変更しない。
 * 名前を変えても、撮影のタイトルとモデルの所属は書き換えない（それぞれ入力した時点の名前を持つ）。
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

  await updateRow('organizers', organizerId, {
    name,
    name_kana: input.nameKana.trim() || null,
    base_location: input.baseLocation.trim() || null,
    url: input.url.trim() || null,
    contact: input.contact.trim() || null,
    notes: input.notes.trim() || null,
    is_favorite: input.isFavorite,
  })
}
