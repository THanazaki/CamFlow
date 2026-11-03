'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { getActiveUserId } from '@/lib/auth/session'
import { createReservation, type ReservationInput } from '@/lib/actions/reservations'
import { loadSuggestions } from '@/lib/queries/reservations'

const EMPTY: ReservationInput = {
  bookingOpensAt: '',
  shootDate: '',
  modelName: '',
  concept: '',
  venueName: '',
  bookingUrl: '',
}

export default function ReservationNewPage() {
  const router = useRouter()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], { models: [], venues: [] })
  const [form, setForm] = useState<ReservationInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const modelListId = useId()
  const venueListId = useId()

  const set = <K extends keyof ReservationInput>(key: K, value: ReservationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      // ログイン画面が無いので、同期と同じ経路でユーザーIDを取る。
      // オフラインや未設定でも手元には書けるよう、取れなければ中断する
      const userId = await getActiveUserId()
      if (!userId) {
        setError(
          'ユーザー情報を取得できませんでした。.env.local の設定を確認してください（オフライン時は接続が戻ってから再度お試しください）。',
        )
        return
      }
      const { createdModel } = await createReservation(userId, form)
      setNotice(createdModel ? `「${form.modelName.trim()}」をモデルマスタに追加しました` : null)
      setForm(EMPTY)
      router.push('/reservations/schedule')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">予約情報入力</h1>
        <p className="text-muted mt-1 text-sm">
          撮影会の予約受付を押さえるための情報を登録します。登録後は予約スケジュールに
          受付開始が早い順で並びます。
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300">
          {notice}
        </p>
      )}

      <form onSubmit={onSubmit} className="bg-surface border-border space-y-5 rounded-lg border p-5">
        <Field
          label="予約開始日時"
          required
          hint="予約受付が始まる日時。撮影日とは別です。この時刻までの残り時間が予約スケジュールに出ます"
        >
          {(p) => (
            <input
              {...p}
              type="datetime-local"
              required
              value={form.bookingOpensAt}
              onChange={(e) => set('bookingOpensAt', e.target.value)}
              className={inputClass}
            />
          )}
        </Field>

        <Field label="撮影日" required>
          {(p) => (
            <input
              {...p}
              type="date"
              required
              value={form.shootDate}
              onChange={(e) => set('shootDate', e.target.value)}
              className={inputClass}
            />
          )}
        </Field>

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

        <Field label="撮影コンセプト">
          {(p) => (
            <input
              {...p}
              type="text"
              value={form.concept}
              onChange={(e) => set('concept', e.target.value)}
              placeholder="白ホリ・ナチュラル"
              className={inputClass}
            />
          )}
        </Field>

        <Field label="場所" hint="マスタに同名があれば紐づきます。無ければ名前だけ残ります">
          {(p) => (
            <>
              <input
                {...p}
                type="text"
                list={venueListId}
                value={form.venueName}
                onChange={(e) => set('venueName', e.target.value)}
                placeholder="スタジオ ルミエール"
                className={inputClass}
              />
              <datalist id={venueListId}>
                {suggestions.venues.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field label="予約ページURL">
          {(p) => (
            <input
              {...p}
              type="url"
              value={form.bookingUrl}
              onChange={(e) => set('bookingUrl', e.target.value)}
              placeholder="https://example.com/booking"
              className={inputClass}
            />
          )}
        </Field>

        <div className="border-border flex items-center gap-3 border-t pt-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '予約を登録'}
          </button>
          <button
            type="button"
            onClick={() => setForm(EMPTY)}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            クリア
          </button>
          <span className="text-muted text-xs">
            オフラインでも登録できます。通信が戻ると自動で送信されます
          </span>
        </div>
      </form>
    </div>
  )
}

const inputClass =
  'bg-background border-border focus:border-navy-500 focus:ring-navy-500/30 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2'

/** 入力要素に渡す属性。ラベルとヒントの関連付けを Field 側で持つ */
interface FieldControlProps {
  id: string
  'aria-describedby'?: string
}

/**
 * ヒントは `<label>` の外に出し、`aria-describedby` で結びつける。
 * ラベル内に置くと読み上げ名が「撮影日 予約受付が始まる日時。撮影日とは別です…」のように
 * 長くなり、項目名が埋もれる。
 */
function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: (props: FieldControlProps) => React.ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
        {label}
        {required && (
          <span className="text-red-600 dark:text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-muted mt-0.5 text-xs">
          {hint}
        </p>
      )}
      <div className="mt-1.5">
        {children({ id, 'aria-describedby': hint ? hintId : undefined })}
      </div>
    </div>
  )
}
