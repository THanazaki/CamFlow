import type { Enums } from '@/types/database'

export type ShootCategory = Enums<'shoot_category'>

/** 区分の導入前に作られた行（NULL）もこの扱いにする。当時はモデルが必須だったため */
export const DEFAULT_SHOOT_CATEGORY: ShootCategory = 'solo'

/** 表示順もこの順 */
export const SHOOT_CATEGORIES: { value: ShootCategory; label: string; hasModel: boolean }[] = [
  { value: 'solo', label: '個撮', hasModel: true },
  { value: 'group', label: '団体', hasModel: true },
  { value: 'session', label: 'セッション', hasModel: false },
  { value: 'large', label: '大撮', hasModel: false },
]

function findCategory(category: ShootCategory) {
  return SHOOT_CATEGORIES.find((c) => c.value === category)!
}

/** この区分でモデル名を入力するか */
export function categoryHasModel(category: ShootCategory): boolean {
  return findCategory(category).hasModel
}

/**
 * 撮影会名もコンセプトも無いときのタイトル。
 * モデルを指定しない区分では、モデル名の代わりに区分名を使う。
 */
export function fallbackShootTitle(category: ShootCategory, modelName: string): string {
  return categoryHasModel(category) ? `${modelName} 撮影` : findCategory(category).label
}
