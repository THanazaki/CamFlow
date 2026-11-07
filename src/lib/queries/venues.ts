import { db } from '@/lib/db'

export type VenueKind = 'studio' | 'location'

export const VENUE_KINDS: { value: VenueKind; label: string }[] = [
  { value: 'studio', label: 'スタジオ' },
  { value: 'location', label: 'ロケ地' },
]

export function venueKindLabel(kind: VenueKind): string {
  return VENUE_KINDS.find((k) => k.value === kind)?.label ?? kind
}

/** ロケ地・スタジオマスタの詳細・編集の1件。カラムと同じ項目を持つ */
export interface VenueDetail {
  id: string
  userId: string
  name: string
  kind: VenueKind
  address: string | null
  nearestStation: string | null
  url: string | null
  /** 1時間あたりの料金（円） */
  hourlyRate: number | null
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
export async function loadVenueDetail(id: string): Promise<VenueDetail | null> {
  const v = await db.venues.get(id)
  if (!v || v.deleted_at) return null
  return {
    id: v.id,
    userId: v.user_id,
    name: v.name,
    kind: v.kind ?? 'studio',
    address: v.address ?? null,
    nearestStation: v.nearest_station ?? null,
    url: v.url ?? null,
    hourlyRate: v.hourly_rate ?? null,
    notes: v.notes ?? null,
    isFavorite: v.is_favorite ?? false,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
    deletedAt: v.deleted_at ?? null,
  }
}

/** ロケ地・スタジオマスタ画面の1行 */
export interface VenueRow {
  id: string
  name: string
}

/** 登録済みの場所を名前の順に返す（場所には読みのカラムが無い） */
export async function loadVenueList(): Promise<VenueRow[]> {
  const venues = await db.venues.toArray()
  return venues
    .filter((v) => !v.deleted_at)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
    .map((v) => ({ id: v.id, name: v.name }))
}
