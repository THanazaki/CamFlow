import { db } from '@/lib/db'
import { readModelAccounts, type ModelAccountEntry } from '@/lib/model-accounts'

/** 撮影会マスタの詳細・編集の1件。カラムと同じ項目を持つ */
export interface OrganizerDetail {
  id: string
  userId: string
  name: string
  nameKana: string | null
  baseLocation: string | null
  url: string | null
  /** X / Instagram などのアカウント。登録した順 */
  accounts: ModelAccountEntry[]
  contact: string | null
  notes: string | null
  isFavorite: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * 1件を返す。無いか論理削除済みなら null。
 * 入力から自動で作った行は、ローカルではカラムが欠けていることがあるので既定値で補う。
 */
export async function loadOrganizerDetail(id: string): Promise<OrganizerDetail | null> {
  const o = await db.organizers.get(id)
  if (!o || o.deleted_at) return null
  return {
    id: o.id,
    userId: o.user_id,
    name: o.name,
    nameKana: o.name_kana ?? null,
    baseLocation: o.base_location ?? null,
    url: o.url ?? null,
    accounts: readModelAccounts(o),
    contact: o.contact ?? null,
    notes: o.notes ?? null,
    isFavorite: o.is_favorite ?? false,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    deletedAt: o.deleted_at ?? null,
  }
}

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
