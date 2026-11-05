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
    <div id={id} role="radiogroup" aria-label="撮影区分" className="flex flex-wrap gap-2">
      {SHOOT_CATEGORIES.map((category) => (
        <label
          key={category.value}
          className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 ${
            value === category.value
              ? 'border-navy-500 bg-navy-900 text-white'
              : 'border-border hover:bg-navy-50 dark:hover:bg-white/5'
          }`}
        >
          <input
            type="radio"
            name="shootCategory"
            value={category.value}
            checked={value === category.value}
            onChange={() => onChange(category.value)}
            className="sr-only"
          />
          {category.label}
        </label>
      ))}
    </div>
  )
}
