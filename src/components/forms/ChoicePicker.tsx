/** ボタン型のラジオ。撮影区分・場所区分で共通 */
export function ChoicePicker<T extends string>({
  id,
  name,
  label,
  options,
  value,
  onChange,
}: {
  id?: string
  /** input の name。同じ画面に複数置くので、用途ごとに変える */
  name: string
  /** 読み上げ用のグループ名 */
  label: string
  options: { value: T; label: string }[]
  /** null は未選択 */
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <div id={id} role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 ${
            value === option.value
              ? 'border-navy-500 bg-navy-900 text-white'
              : 'border-border hover:bg-navy-50 dark:hover:bg-white/5'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}
