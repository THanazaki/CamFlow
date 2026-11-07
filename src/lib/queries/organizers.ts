import { db } from '@/lib/db'

/** 撮影会マスタ画面の1行 */
export interface OrganizerRow {
  id: string
  name: string
  baseLocation: string | null
}

/** 登録済みの撮影会を、読み（無ければ名前）の順に返す。 */
export async function loadOrganizerList(): Promise<OrganizerRow[]> {
  const organizers = await db.organizers.toArray()

  return organizers
    .filter((o) => !o.deleted_at)
    .sort((a, b) => (a.name_kana ?? a.name).localeCompare(b.name_kana ?? b.name, 'ja'))
    .map((o) => ({ id: o.id, name: o.name, baseLocation: o.base_location ?? null }))
}
