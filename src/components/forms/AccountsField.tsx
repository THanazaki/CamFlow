'use client'

import { inputClass } from '@/components/forms/ShootDetailsFields'
import { ACCOUNT_SERVICES, type ModelAccountEntry } from '@/lib/model-accounts'

/** inputClass の w-full を外したもの。幅を指定して並べる select 用 */
const SELECT_CLASS = inputClass.replace('w-full', '')

const SMALL_BUTTON =
  'border-border hover:bg-navy-50 shrink-0 rounded-md border px-3 py-2 text-sm dark:hover:bg-white/5'

/** 新しく足す行の既定 */
export const EMPTY_ACCOUNT: ModelAccountEntry = { service: 'x', value: '' }

/**
 * アカウントの入力欄（モデルマスタ・撮影会マスタの編集で共通）。
 * 1行 = 種類（X / Instagram / その他）+ URL か @ハンドル。「アカウントを追加」で行を増やす。
 */
export function AccountsField({
  label,
  accounts,
  onChange,
}: {
  label: string
  accounts: ModelAccountEntry[]
  onChange: (accounts: ModelAccountEntry[]) => void
}) {
  const setAccount = (index: number, patch: Partial<ModelAccountEntry>) =>
    onChange(accounts.map((a, i) => (i === index ? { ...a, ...patch } : a)))

  return (
    <fieldset>
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-muted mt-0.5 text-xs">
        URL か @ハンドルを入力します。同じ種類のアカウントも複数登録できます
      </p>
      <div className="mt-1.5 space-y-2">
        {accounts.map((account, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={account.service}
              onChange={(e) => setAccount(i, { service: e.target.value })}
              aria-label={`アカウント ${i + 1} の種類`}
              className={`${SELECT_CLASS} w-28 shrink-0 sm:w-32`}
            >
              {ACCOUNT_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              {/* 移行前のデータにある種類（tiktok など）も選んだままにできるように */}
              {!ACCOUNT_SERVICES.some((s) => s.value === account.service) && (
                <option value={account.service}>{account.service}</option>
              )}
            </select>
            <input
              type="text"
              value={account.value}
              onChange={(e) => setAccount(i, { value: e.target.value })}
              placeholder="@example"
              aria-label={`アカウント ${i + 1}`}
              className={`${inputClass} min-w-0`}
            />
            <button
              type="button"
              onClick={() => onChange(accounts.filter((_, j) => j !== i))}
              aria-label={`アカウント ${i + 1} を削除`}
              className={SMALL_BUTTON}
            >
              削除
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...accounts, EMPTY_ACCOUNT])}
        className={`${SMALL_BUTTON} mt-2 py-1.5`}
      >
        アカウントを追加
      </button>
    </fieldset>
  )
}

/** 編集画面の初期値。欄が1つも無いと入力できないので、空なら空欄を1つ出す */
export function toAccountRows(accounts: ModelAccountEntry[]): ModelAccountEntry[] {
  return accounts.length > 0 ? accounts : [EMPTY_ACCOUNT]
}
