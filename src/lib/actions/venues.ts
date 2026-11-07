import { db } from '@/lib/db'
import type { VenueKind } from '@/lib/queries/venues'
import { updateRow } from '@/lib/sync/mutations'

/** ロケ地・スタジオマスタの編集の入力。入力欄の値のまま持つ */
export interface VenueInput {
  name: string
  kind: VenueKind
  address: string
  nearestStation: string
  url: string
  /** 1時間あたりの料金（円）。空欄なら未設定 */
  hourlyRate: string
  notes: string
  isFavorite: boolean
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

/** 料金の入力を数値にする。空欄は null。0以上の整数だけ受け付ける（DB の numeric(10,0) と check に合わせる） */
export function parseHourlyRate(value: string): number | null {
  const trimmed = value.trim().replace(/[,，]/g, '')
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('1時間あたりの料金は0以上の整数で入力してください')
  }
  const rate = Number(trimmed)
  if (rate > 9_999_999_999) {
    throw new Error('1時間あたりの料金が大きすぎます')
  }
  return rate
}

/**
 * ロケ地・スタジオマスタの編集。
 * id / user_id / 作成・更新・削除の日時は変更しない。
 * 撮影の場所は venue_id でマスタに紐づいているので、名前を変えると紐づく撮影の表示も新しい名前になる。
 */
export async function updateVenue(venueId: string, input: VenueInput): Promise<void> {
  const venue = await db.venues.get(venueId)
  if (!venue || venue.deleted_at) {
    throw new Error('場所が見つかりませんでした')
  }

  const name = input.name.trim()
  if (!name) {
    throw new Error('撮影場所を入力してください')
  }
  const hourlyRate = parseHourlyRate(input.hourlyRate)

  // サーバの一意制約（論理削除を除く）と同じ条件。ここで止めないと同期で初めて失敗する
  const venues = await db.venues.toArray()
  const duplicated = venues.some(
    (v) => v.id !== venueId && !v.deleted_at && normalize(v.name) === normalize(name),
  )
  if (duplicated) {
    throw new Error(`「${name}」は既に登録されています`)
  }

  await updateRow('venues', venueId, {
    name,
    kind: input.kind,
    address: input.address.trim() || null,
    nearest_station: input.nearestStation.trim() || null,
    url: input.url.trim() || null,
    hourly_rate: hourlyRate,
    notes: input.notes.trim() || null,
    is_favorite: input.isFavorite,
  })
}
