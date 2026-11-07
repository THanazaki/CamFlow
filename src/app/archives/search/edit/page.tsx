'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { ShootDetailsFields, ShootTimeFields } from '@/components/forms/ShootDetailsFields'
import { ShootOptionsFields, ShootPaymentFields } from '@/components/forms/ShootOptionsFields'
import { StorageUrlsField } from '@/components/forms/StorageUrlsField'
import { localToday, updateShootHistory } from '@/lib/actions/archives'
import {
  updateConfirmedShoot,
  type ShootDetailsInput,
  type ShootFormInput,
  type ShootOptionsInput,
  type ShootPaymentInput,
} from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'
import { DEFAULT_PLACE_CATEGORY } from '@/lib/place-category'
import {
  loadShootRecord,
  shootRecordHref,
  type ShootRecord,
  type ShootSource,
} from '@/lib/queries/archives'
import { DEFAULT_SHOOT_CATEGORY } from '@/lib/shoot-category'
import { MAX_STORAGE_URLS } from '@/lib/storage-urls'

export default function ShootEditPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <ShootEdit />
    </Suspense>
  )
}

function ShootEdit() {
  const params = useSearchParams()
  const source: ShootSource = params.get('source') === 'history' ? 'history' : 'slot'
  const id = params.get('id') ?? ''
  const record = useLiveQuery(() => loadShootRecord(source, id), [source, id], 'loading' as const)

  if (record === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!record) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影情報の編集</h1>
        <p className="text-muted text-sm">撮影が見つかりませんでした。</p>
        <Link
          href="/archives/search"
          className="text-navy-600 dark:text-navy-200 text-sm underline underline-offset-2"
        >
          撮影情報検索へ
        </Link>
      </div>
    )
  }
  return <ShootEditForm key={`${record.source}:${record.id}`} record={record} />
}

/** 空なら空欄を1つ出す */
function toUrlRows(urls: string[]): string[] {
  return urls.length > 0 ? urls : ['']
}

function toFormValues(record: ShootRecord): ShootFormInput {
  return {
    eventName: record.title,
    shootCategory: record.shootCategory ?? DEFAULT_SHOOT_CATEGORY,
    modelName: record.modelNames[0] ?? '',
    concept: record.concept ?? '',
    placeCategory: record.placeCategory ?? DEFAULT_PLACE_CATEGORY,
    venueName: record.venueName ?? '',
    meetingPoint: record.meetingPoint ?? '',
    shootDate: record.shootDate,
    meetingTime: record.meetingTime ?? '',
    startTime: record.startTime ?? '',
    endTime: record.endTime ?? '',
    shootFee: record.shootFee > 0 ? String(record.shootFee) : '',
    costumeOptions: record.costumeOptions ?? '',
    shootingMethodOptions: record.shootingMethodOptions ?? '',
    paymentTiming: record.paymentTiming,
    paymentDate: record.paymentDate ?? '',
  }
}

function ShootEditForm({ record }: { record: ShootRecord }) {
  const router = useRouter()
  const isSlot = record.source === 'slot'

  const [form, setForm] = useState<ShootFormInput>(() => toFormValues(record))
  const [storageUrls, setStorageUrls] = useState<string[]>(() => toUrlRows(record.storageUrls))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setDetails = <K extends keyof ShootDetailsInput>(key: K, value: ShootDetailsInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setOptions = <K extends keyof ShootOptionsInput>(key: K, value: ShootOptionsInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setPayment = <K extends keyof ShootPaymentInput>(key: K, value: ShootPaymentInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setTime = (key: 'meetingTime' | 'startTime' | 'endTime', value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

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
      if (isSlot) {
        await updateConfirmedShoot(userId, record.id, { ...form, storageUrls })
      } else {
        await updateShootHistory(userId, record.id, { ...form, storageUrls })
      }
      // 「戻る」で編集画面に戻らないよう、履歴を置き換える
      router.replace(shootRecordHref('detail', record))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">撮影情報の編集</h1>
        <p className="text-muted mt-1 text-sm">
          {isSlot ? '確定撮影情報入力' : '過去撮影登録'}で登録した撮影の内容を変更します。
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      {record.modelNames.length > 1 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          この撮影には複数のモデル（{record.modelNames.join('・')}
          ）が紐づいています。モデル名に新しい名前を入力すると、モデルが追加されます。
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <section className="bg-surface border-border space-y-5 rounded-lg border p-5">
          <ShootDetailsFields
            values={form}
            onChange={setDetails}
            maxShootDate={isSlot ? undefined : localToday()}
            showMeetingPoint={isSlot}
          />

          {isSlot && (
            <>
              <ShootTimeFields values={form} onChange={setTime} />
              <ShootOptionsFields
                values={form}
                onChange={setOptions}
                feeAside={<ShootPaymentFields values={form} onChange={setPayment} />}
              />
            </>
          )}

          <StorageUrlsField
            label="ストレージのURL"
            hint={
              record.finished
                ? `最大${MAX_STORAGE_URLS}個。空欄は保存されません`
                : '撮影が終わると登録できます'
            }
            urls={storageUrls}
            onChange={setStorageUrls}
            disabled={!record.finished}
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '変更を保存'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            キャンセル
          </button>
          <span className="text-muted text-xs">
            オフラインでも保存できます。通信が戻ると自動で送信されます
          </span>
        </div>
      </form>
    </div>
  )
}
