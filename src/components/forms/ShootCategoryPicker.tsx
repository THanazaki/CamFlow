import { ChoicePicker } from '@/components/forms/ChoicePicker'
import { SHOOT_CATEGORIES, type ShootCategory } from '@/lib/shoot-category'

/** 撮影区分の選択。予約情報入力と確定撮影情報入力で共通 */
export function ShootCategoryPicker({
  id,
  value,
  onChange,
}: {
  id?: string
  value: ShootCategory
  onChange: (value: ShootCategory) => void
}) {
  return (
    <ChoicePicker
      id={id}
      name="shootCategory"
      label="撮影区分"
      options={SHOOT_CATEGORIES}
      value={value}
      onChange={onChange}
    />
  )
}
