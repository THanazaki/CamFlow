'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useId, useState } from 'react'

import {
  EMPTY_SHOOT_DETAILS,
  inputClass,
  MemoField,
  ShootDetailsFields,
  ShootTimeFields,
} from '@/components/forms/ShootDetailsFields'
import {
  EMPTY_SHOOT_OPTIONS,
  EMPTY_SHOOT_PAYMENT,
  ShootOptionsFields,
  ShootPaymentFields,
} from '@/components/forms/ShootOptionsFields'
import {
  affiliationConfirmMessage,
  confirmShoot,
  findAffiliationConflict,
  type ShootConfirmInput,
  type ShootDetailsInput,
  type ShootOptionsInput,
  type ShootPaymentInput,
} from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'
import { chooseExtraFreeModels, chooseFreeModel } from '@/lib/free-model-choice'
import { nextPathAfterSave } from '@/lib/new-model-prompt'
import { categoryHasModel } from '@/lib/shoot-category'
import { loadConfirmableReservations } from '@/lib/queries/shoots'

const EMPTY: ShootConfirmInput = {
  ...EMPTY_SHOOT_DETAILS,
  ...EMPTY_SHOOT_OPTIONS,
  ...EMPTY_SHOOT_PAYMENT,
  fromSessionId: '',
  meetingTime: '',
  startTime: '',
  endTime: '',
}

export default function ShootConfirmPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <ShootConfirm />
    </Suspense>
  )
}

function ShootConfirm() {
  const router = useRouter()
  // 予約スケジュールの「予約成功」から来たときは、その予約を選んだ状態で開く
  const presetSessionId = useSearchParams().get('session') ?? ''
  const [presetApplied, setPresetApplied] = useState(false)
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
  const setPayment = <K extends keyof ShootPaymentInput>(key: K, value: ShootPaymentInput[K]) =>
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
      extraModelNames: r.extraModelNames,
      concept: r.concept,
      venueName: r.venueName,
      shootDate: r.shootDate,
      startTime: r.startTime || f.startTime,
      endTime: r.endTime || f.endTime,
      // 確定時はフォームの値で枠を更新するので、引き継がないと予約時の入力が消える
      shootFee: r.shootFee,
      costumeOptions: r.costumeOptions,
      shootingMethodOptions: r.shootingMethodOptions,
      paymentTiming: r.paymentTiming,
      paymentDate: r.paymentDate,
      memo: r.memo,
    }))
  }

  // 予約の読み込みが終わったら一度だけ選ぶ（描画中の state 更新は React が認める書き方）
  if (
    !presetApplied &&
    presetSessionId &&
    reservations.some((x) => x.sessionId === presetSessionId)
  ) {
    setPresetApplied(true)
    pickReservation(presetSessionId)
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
      let addAffiliation = false
      const conflict = categoryHasModel(form.shootCategory)
        ? await findAffiliationConflict(form.modelName, form.eventName, form.fromSessionId)
        : null
      if (conflict) {
        // キャンセルなら登録は続け、同名の別モデルとして登録する
        addAffiliation = confirm(affiliationConfirmMessage(conflict))
      }
      const freeModel = categoryHasModel(form.shootCategory)
        ? await chooseFreeModel(form.modelName, form.eventName, form.fromSessionId)
        : undefined
      const extraFreeModels = categoryHasModel(form.shootCategory)
        ? await chooseExtraFreeModels(
            form.modelName,
            form.extraModelNames,
            form.eventName,
            form.fromSessionId,
          )
        : undefined
      const { newModelId } = await confirmShoot(userId, { ...form, addAffiliation, freeModel, extraFreeModels })
      setForm(EMPTY)
      router.push(nextPathAfterSave(newModelId, '/'))
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

          <ShootTimeFields values={form} onChange={set} />

          <ShootOptionsFields
            values={form}
            onChange={setOptions}
            feeAside={<ShootPaymentFields values={form} onChange={setPayment} />}
          />

          <MemoField value={form.memo ?? ''} onChange={(v) => set('memo', v)} />
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
