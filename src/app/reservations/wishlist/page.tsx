'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'

import { Field, inputClass } from '@/components/forms/ShootDetailsFields'
import { ShootOptionTextFields } from '@/components/forms/ShootOptionsFields'
import { ModelAccount } from '@/components/ModelAccount'
import { createWishlistModel, type WishlistInput } from '@/lib/actions/wishlist'
import { getActiveUserId } from '@/lib/auth/session'
import { loadSuggestions } from '@/lib/queries/reservations'
import { loadWishlist, type WishlistRow } from '@/lib/queries/wishlist'

const EMPTY: WishlistInput = {
  modelName: '',
  eventName: '',
  modelX: '',
  modelInstagram: '',
  costumeOptions: '',
  shootingMethodOptions: '',
}

/**
 * 撮影希望モデル登録。
 * いつか撮りたいモデルを控えておく画面。予約とはまだ連動しない。
 */
export default function WishlistPage() {
  const rows = useLiveQuery(() => loadWishlist(), [], null)
  const suggestions = useLiveQuery(() => loadSuggestions(), [], {
    models: [],
    venues: [],
    events: [],
  })

  const [form, setForm] = useState<WishlistInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const modelListId = useId()
  const eventListId = useId()

  const set = (key: keyof WishlistInput, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const userId = await getActiveUserId()
      if (!userId) {
        setError(
          'ユーザー情報を取得できませんでした。.env.local の設定を確認し、一度オンラインで開いてください。',
        )
        return
      }
      await createWishlistModel(userId, form)
      setForm(EMPTY)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">撮影希望モデル登録</h1>
        <p className="text-muted mt-1 text-sm">撮影してみたいモデルを登録して、控えておけます。</p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="bg-surface border-border space-y-5 rounded-lg border p-5">
        <Field label="モデル名" required hint="マスタに無い名前はそのまま新規登録されます">
          {(p) => (
            <>
              <input
                {...p}
                type="text"
                required
                list={modelListId}
                value={form.modelName}
                onChange={(e) => set('modelName', e.target.value)}
                placeholder="栞奈"
                className={inputClass}
              />
              <datalist id={modelListId}>
                {suggestions.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field label="撮影会名">
          {(p) => (
            <>
              <input
                {...p}
                type="text"
                list={eventListId}
                value={form.eventName}
                onChange={(e) => set('eventName', e.target.value)}
                placeholder="ポートレート撮影会 秋の回"
                className={inputClass}
              />
              <datalist id={eventListId}>
                {suggestions.events.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field
          label="モデルアカウント"
          hint="入力するとモデルマスタに保存します。空欄なら既存のアカウントはそのまま残ります"
        >
          {(p) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                {...p}
                type="text"
                value={form.modelX}
                onChange={(e) => set('modelX', e.target.value)}
                placeholder="X: @example"
                aria-label="X アカウント"
                className={inputClass}
              />
              <input
                type="text"
                value={form.modelInstagram}
                onChange={(e) => set('modelInstagram', e.target.value)}
                placeholder="Instagram: @example"
                aria-label="Instagram アカウント"
                className={inputClass}
              />
            </div>
          )}
        </Field>

        <ShootOptionTextFields values={form} onChange={set} />

        <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '撮影希望を登録'}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY)
              setSaved(false)
            }}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            クリア
          </button>
          {saved && <span className="text-xs text-emerald-700 dark:text-emerald-400">登録しました</span>}
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">登録済みの撮影希望</h2>
        {rows === null ? (
          <p className="text-muted text-sm">読み込み中…</p>
        ) : rows.length === 0 ? (
          <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
            撮影希望のモデルはまだ登録されていません
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <WishlistCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function WishlistCard({ row }: { row: WishlistRow }) {
  return (
    <li className="bg-surface border-border rounded-lg border p-4">
      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium">
        <span className="min-w-0 break-words">{row.modelName}</span>
        {row.x && <ModelAccount href={row.x} label="X" />}
        {row.instagram && <ModelAccount href={row.instagram} label="IG" />}
      </h3>
      {(row.eventName || row.costumeOptions || row.shootingMethodOptions) && (
        <dl className="text-muted mt-2 space-y-1 text-sm">
          {row.eventName && <Row label="撮影会名">{row.eventName}</Row>}
          {row.costumeOptions && <Row label="衣装系">{row.costumeOptions}</Row>}
          {row.shootingMethodOptions && <Row label="撮影方法">{row.shootingMethodOptions}</Row>}
        </dl>
      )}
    </li>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-xs leading-5">{label}</dt>
      <dd className="text-foreground min-w-0 break-words">{children}</dd>
    </div>
  )
}
