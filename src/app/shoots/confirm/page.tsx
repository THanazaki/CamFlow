'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { ShootCategoryPicker } from '@/components/forms/ShootCategoryPicker'
import { confirmShoot, type ShootConfirmInput } from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'
import { loadSuggestions } from '@/lib/queries/reservations'
import { loadConfirmableReservations } from '@/lib/queries/shoots'
import { categoryHasModel, DEFAULT_SHOOT_CATEGORY } from '@/lib/shoot-category'

const EMPTY: ShootConfirmInput = {
  fromSessionId: '',
  eventName: '',
  shootCategory: DEFAULT_SHOOT_CATEGORY,
  modelName: '',
  modelX: '',
  modelInstagram: '',
  concept: '',
  venueName: '',
  shootDate: '',
  startTime: '',
  endTime: '',
}

export default function ShootConfirmPage() {
  const router = useRouter()
  const reservations = useLiveQuery(() => loadConfirmableReservations(), [], [])
  const suggestions = useLiveQuery(() => loadSuggestions(), [], {
    models: [],
    venues: [],
    events: [],
  })

  const [form, setForm] = useState<ShootConfirmInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventListId = useId()
  const modelListId = useId()
  const venueListId = useId()
  const pickerId = useId()

  const hasModel = categoryHasModel(form.shootCategory)

  const set = <K extends keyof ShootConfirmInput>(key: K, value: ShootConfirmInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  /** 予約を選んだら、その内容で埋める */
  const pickReservation = (sessionId: string) => {
    if (!sessionId) {
      setForm((f) => ({ ...f, fromSessionId: '' }))
      return
    }
    const r = reservations.find((x) => x.sessionId === sessionId)
    if (!r) return
    setForm((f) => ({
      ...f,
      fromSessionId: r.sessionId,
      eventName: r.eventName,
      shootCategory: r.shootCategory,
      modelName: r.modelName,
      modelX: r.modelX,
      modelInstagram: r.modelInstagram,
      concept: r.concept,
      venueName: r.venueName,
      shootDate: r.shootDate,
      startTime: r.startTime || f.startTime,
      endTime: r.endTime || f.endTime,
    }))
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
      await confirmShoot(userId, form)
      setForm(EMPTY)
      router.push('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">確定撮影情報入力</h1>
        <p className="text-muted mt-1 text-sm">
          予約が取れた撮影の確定内容を登録します。保存先ストレージURLは撮影後に「確定撮影情報」から登録します。
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* 予約から引き継ぐ。予約を通していない撮影は選ばずに直接入力する */}
        <div className="bg-surface border-border rounded-lg border p-5">
          <label htmlFor={pickerId} className="text-sm font-medium">
            予約から選ぶ
          </label>
          <p className="text-muted mt-0.5 text-xs">
            選ぶと内容を引き継ぎ、その予約を「確定」にします。予約を通していない撮影は選ばずに入力してください
          </p>
          <select
            id={pickerId}
            value={form.fromSessionId}
            onChange={(e) => pickReservation(e.target.value)}
            className={`${inputClass} mt-1.5`}
          >
            <option value="">（選ばない／新規として登録）</option>
            {reservations.map((r) => (
              <option key={r.sessionId} value={r.sessionId}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <section className="bg-surface border-border space-y-5 rounded-lg border p-5">
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

          <Field label="撮影区分" required>
            {(p) => (
              <ShootCategoryPicker
                id={p.id}
                value={form.shootCategory}
                onChange={(v) => set('shootCategory', v)}
              />
            )}
          </Field>

          {hasModel && (
            <>
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

              <Field
                label="モデルアカウント"
                hint="入力するとモデルマスタに保存します。空欄なら既存のリンクはそのまま残ります"
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
            </>
          )}

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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="開始時刻" required>
              {(p) => (
                <input
                  {...p}
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) => set('startTime', e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="終了時刻" required>
              {(p) => (
                <input
                  {...p}
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) => set('endTime', e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '撮影を確定'}
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

interface FieldControlProps {
  id: string
  'aria-describedby'?: string
}

/** ヒントは label の外に出し aria-describedby で結びつける（読み上げ名を汚さない） */
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
      <div className="mt-1.5">{children({ id, 'aria-describedby': hint ? hintId : undefined })}</div>
    </div>
  )
}
