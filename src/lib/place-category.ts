import type { Enums } from '@/types/database'

export type PlaceCategory = Enums<'place_category'>

export const DEFAULT_PLACE_CATEGORY: PlaceCategory = 'studio'

/** 表示順もこの順 */
export const PLACE_CATEGORIES: { value: PlaceCategory; label: string }[] = [
  { value: 'outdoor', label: '屋外' },
  { value: 'studio', label: 'スタジオ' },
]

/** 過去撮影で登録できる場所の数（1か所目＋追加ロケ地）。屋外だけ複数にできる */
export const MAX_VENUES = 5

/** 追加ロケ地を入力できる区分か */
export function categoryHasMultipleVenues(category: PlaceCategory): boolean {
  return category === 'outdoor'
}

/**
 * 追加ロケ地の入力を整える。前後の空白を除き、空欄・1か所目と同じ名前・重複（大文字小文字は区別しない）を除く。
 * 屋外以外は追加ロケ地を持たないので空にする。1か所目と合わせて MAX_VENUES か所まで
 */
export function collectExtraVenueNames(
  category: PlaceCategory,
  primary: string,
  extras: string[] | undefined,
): string[] {
  if (!categoryHasMultipleVenues(category)) return []
  const seen = new Set([primary.trim().toLowerCase()])
  const result: string[] = []
  for (const raw of extras ?? []) {
    const name = raw.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    result.push(name)
  }
  return result.slice(0, MAX_VENUES - 1)
}

/** この区分で集合場所を入力するか */
export function categoryHasMeetingPoint(category: PlaceCategory): boolean {
  return category === 'outdoor'
}

export function placeCategoryLabel(category: PlaceCategory): string {
  return PLACE_CATEGORIES.find((c) => c.value === category)!.label
}
