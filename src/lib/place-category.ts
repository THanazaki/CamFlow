import type { Enums } from '@/types/database'

export type PlaceCategory = Enums<'place_category'>

export const DEFAULT_PLACE_CATEGORY: PlaceCategory = 'studio'

/** 表示順もこの順 */
export const PLACE_CATEGORIES: { value: PlaceCategory; label: string }[] = [
  { value: 'outdoor', label: '屋外' },
  { value: 'studio', label: 'スタジオ' },
]

/** この区分で集合場所を入力するか */
export function categoryHasMeetingPoint(category: PlaceCategory): boolean {
  return category === 'outdoor'
}

export function placeCategoryLabel(category: PlaceCategory): string {
  return PLACE_CATEGORIES.find((c) => c.value === category)!.label
}
