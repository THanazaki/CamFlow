'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { ShootCategoryPicker } from '@/components/forms/ShootCategoryPicker'
import { MemoField } from '@/components/forms/ShootDetailsFields'
import {
  EMPTY_SHOOT_OPTIONS,
  EMPTY_SHOOT_PAYMENT,
  ShootOptionsFields,
  ShootPaymentFields,
} from '@/components/forms/ShootOptionsFields'
import {
  createReservation,
  type BookingMethod,
  type ReservationInput,
} from '@/lib/actions/reservations'
import {
  affiliationConfirmMessage,
  findAffiliationConflict,
  type ShootOptionsInput,
  type ShootPaymentInput,
} from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'
import { RESERVATION_FEE_PAYMENT_TIMINGS } from '@/lib/fee-payment'
import { nextPathAfterSave } from '@/lib/new-model-prompt'
import { loadSuggestions } from '@/lib/queries/reservations'
import { categoryHasModel, DEFAULT_SHOOT_CATEGORY } from '@/lib/shoot-category'

const EMPTY: ReservationInput = {
  ...EMPTY_SHOOT_OPTIONS,
  ...EMPTY_SHOOT_PAYMENT,
  memo: '',
  eventName: '',
  shootCategory: DEFAULT_SHOOT_CATEGORY,
  modelName: '',
  concept: '',
  venueName: '',
  shootDate: '',
  bookingOpensAt: '',
  bookingMethod: 'page',
  bookingContact: '',
}

/** 予約種類ごとに、申込先の呼び方と入力の種類が変わる */
const BOOKING_METHODS: Record<
  BookingMethod,
  { label: string; contactLabel: string; type: 'url' | 'email' | 'text'; placeholder: string }
> = {
  page: {
    label: '予約ページ',
    contactLabel: '予約ページURL',
    type: 'url',
    placeholder: 'https://example.com/booking',
  },
  email: {
    label: 'メール',
    contactLabel: '予約先メールアドレス',
    type: 'email',
    placeholder: 'booking@example.com',
  },
  dm: {
    label: 'DM',
    contactLabel: 'DM送付先',
    type: 'text',
    placeholder: '@example_account',
  },
}

export default function ReservationNewPage() {
  const router = useRouter()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], {
    models: [],
    venues: [],
    events: [],
  })
  const [form, setForm] = useState<ReservationInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eventListId = useId()
  const modelListId = useId()
  const venueListId = useId()

  const method = BOOKING_METHODS[form.bookingMethod]
  const hasModel = categoryHasModel(form.shootCategory)

  const set = <K extends keyof ReservationInput>(key: K, value: ReservationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setOptions = <K extends keyof ShootOptionsInput>(key: K, value: ShootOptionsInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setPayment = <K extends keyof ShootPaymentInput>(key: K, value: ShootPaymentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      // ログイン画面が無いので、同期と同じ経路でユーザーIDを取る
      const userId = await getActiveUserId()
      if (!userId) {
        setError(
          'ユーザー情報を取得できませんでした。.env.local の設定を確認し、一度オンラインで開いてください。',
        )
        return
      }
      let addAffiliation = false
      const conflict = categoryHasModel(form.shootCategory)
        ? await findAffiliationConflict(form.modelName, form.eventName)
        : null
      if (conflict) {
        if (!confirm(affiliationConfirmMessage(conflict))) return
        addAffiliation = true
      }
      const { newModelId } = await createReservation(userId, { ...form, addAffiliation })
      setForm(EMPTY)
      router.push(nextPathAfterSave(newModelId, '/reservations/schedule'))
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

      <form onSubmit={onSubmit} className="bg-surface border-border space-y-5 rounded-lg border p-5">
        <Field
          label="撮影会名"
          hint={`未入力の場合はコンセプトか${hasModel ? 'モデル名' : '撮影区分'}から表示名を作ります`}
        >
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

        <Field label="予約種類" required>
          {(p) => (
            <div
              {...p}
              role="radiogroup"
              aria-label="予約種類"
              className="flex flex-wrap gap-2"
            >
              {(Object.keys(BOOKING_METHODS) as BookingMethod[]).map((key) => (
                <label
                  key={key}
                  className={`tap-target cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
                    form.bookingMethod === key
                      ? 'border-navy-500 bg-navy-900 text-white'
                      : 'border-border hover:bg-navy-50 dark:hover:bg-white/5'
                  }`}
                >
                  <input
                    type="radio"
                    name="bookingMethod"
                    value={key}
                    checked={form.bookingMethod === key}
                    onChange={() => set('bookingMethod', key)}
                    className="sr-only"
                  />
                  {BOOKING_METHODS[key].label}
                </label>
              ))}
            </div>
          )}
        </Field>

        {/* 予約種類で中身が変わるので、ラベルと入力タイプを切り替える */}
        <Field label={method.contactLabel} required key={form.bookingMethod}>
          {(p) => (
            <input
              {...p}
              type={method.type}
              required
              value={form.bookingContact}
              onChange={(e) => set('bookingContact', e.target.value)}
              placeholder={method.placeholder}
              className={inputClass}
            />
          )}
        </Field>

        <ShootOptionsFields
          values={form}
          onChange={setOptions}
          feeAside={
            <ShootPaymentFields
              values={form}
              onChange={setPayment}
              options={RESERVATION_FEE_PAYMENT_TIMINGS}
            />
          }
        />

        <MemoField value={form.memo ?? ''} onChange={(v) => set('memo', v)} />

        <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
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

// スマホでは 16px（iPhone の Safari が入力時に画面を拡大しないように）
const inputClass =
  'bg-background border-border focus:border-navy-500 focus:ring-navy-500/30 w-full rounded-md border px-3 py-2 text-base outline-none focus:ring-2 sm:text-sm'

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
      <div className="mt-1.5">{children({ id, 'aria-describedby': hint ? hintId : undefined })}</div>
    </div>
  )
}
