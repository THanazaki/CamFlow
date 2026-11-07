'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import {
  EMPTY_SHOOT_DETAILS,
  Field,
  inputClass,
  ShootDetailsFields,
} from '@/components/forms/ShootDetailsFields'
import { ChoicePicker } from '@/components/forms/ChoicePicker'
import { EMPTY_SHOOT_OPTIONS, ShootOptionsFields } from '@/components/forms/ShootOptionsFields'
import {
  confirmShoot,
  type ShootConfirmInput,
  type ShootDetailsInput,
  type ShootOptionsInput,
} from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'
import { FEE_PAYMENT_TIMINGS, feePaymentHasDate } from '@/lib/fee-payment'
import { loadConfirmableReservations } from '@/lib/queries/shoots'

const EMPTY: ShootConfirmInput = {
  ...EMPTY_SHOOT_DETAILS,
  ...EMPTY_SHOOT_OPTIONS,
  fromSessionId: '',
  meetingTime: '',
  startTime: '',
  endTime: '',
  paymentTiming: null,
  paymentDate: '',
}

export default function ShootConfirmPage() {
  const router = useRouter()
  const reservations = useLiveQuery(() => loadConfirmableReservations(), [], [])

  const [form, setForm] = useState<ShootConfirmInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickerId = useId()

  const set = <K extends keyof ShootConfirmInput>(key: K, value: ShootConfirmInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setDetails = <K extends keyof ShootDetailsInput>(key: K, value: ShootDetailsInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setOptions = <K extends keyof ShootOptionsInput>(key: K, value: ShootOptionsInput[K]) =>
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
          <ShootDetailsFields values={form} onChange={setDetails} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="集合時刻">
              {(p) => (
                <input
                  {...p}
                  type="time"
                  value={form.meetingTime}
                  onChange={(e) => set('meetingTime', e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
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

          <ShootOptionsFields
            values={form}
            onChange={setOptions}
            feeAside={
              <div className="space-y-4">
                <Field label="支払方法">
                  {(p) => (
                    <ChoicePicker
                      id={p.id}
                      name="paymentTiming"
                      label="支払方法"
                      options={FEE_PAYMENT_TIMINGS}
                      value={form.paymentTiming}
                      onChange={(v) => set('paymentTiming', v)}
                    />
                  )}
                </Field>
                {feePaymentHasDate(form.paymentTiming) && (
                  <Field label="支払日">
                    {(p) => (
                      <input
                        {...p}
                        type="date"
                        value={form.paymentDate}
                        onChange={(e) => set('paymentDate', e.target.value)}
                        className={inputClass}
                      />
                    )}
                  </Field>
                )}
              </div>
            }
          />
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
