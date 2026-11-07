import { inputClass } from '@/components/forms/ShootDetailsFields'
import { MAX_STORAGE_URLS } from '@/lib/storage-urls'

/** ストレージURLの入力欄。「追加」で上限まで増やせる。過去撮影登録と確定撮影情報で共通 */
export function StorageUrlsField({
  label,
  hint,
  urls,
  onChange,
  disabled = false,
}: {
  label: string
  hint: string
  urls: string[]
  onChange: (urls: string[]) => void
  /** 撮影が終わるまで操作させないときに使う */
  disabled?: boolean
}) {
  return (
    // fieldset の disabled で、中の入力欄とボタンをまとめて操作できなくする
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-muted mt-0.5 text-xs">{hint}</p>
      <div className="mt-1.5 space-y-2">
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => onChange(urls.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder="https://drive.example.com/..."
              aria-label={`${label} ${i + 1}`}
              className={inputClass}
            />
            {urls.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(urls.filter((_, j) => j !== i))}
                aria-label={`${label} ${i + 1} を削除`}
                className="border-border hover:bg-navy-50 shrink-0 rounded-md border px-3 py-2 text-sm dark:hover:bg-white/5"
              >
                削除
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...urls, ''])}
        disabled={urls.length >= MAX_STORAGE_URLS}
        className="border-border hover:bg-navy-50 mt-2 rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/5"
      >
        追加
      </button>
    </fieldset>
  )
}
