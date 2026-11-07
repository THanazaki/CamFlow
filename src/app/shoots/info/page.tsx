'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { ShootOptionsFields } from '@/components/forms/ShootOptionsFields'
import { ModelAccounts } from '@/components/ModelAccount'
import { StorageUrlsField } from '@/components/forms/StorageUrlsField'
import { saveShootOptions, saveStorageUrls, type ShootOptionsInput } from '@/lib/actions/shoots'
import { feePaymentTimingLabel } from '@/lib/fee-payment'
import { placeCategoryLabel } from '@/lib/place-category'
import { loadConfirmedShoots, type ConfirmedShoot } from '@/lib/queries/shoots'
import { MAX_STORAGE_URLS, normalizeStorageUrls } from '@/lib/storage-urls'

/** 欄が1つも無いと入力できないので、空なら空欄を1つ出す */
function toRows(urls: string[]): string[] {
  return urls.length > 0 ? urls : ['']
}

/**
 * 確定撮影情報。
 * 「確定撮影情報入力」で登録した内容を一覧し、撮影後に保存先ストレージURLを登録する。
 */
export default function ShootInfoPage() {
  // 開いたままでも撮影の開始・終了を反映するよう、1分ごとに読み直す
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const shoots = useLiveQuery(() => loadConfirmedShoots(), [tick], null)

  const pending = shoots?.filter((s) => s.finished && !s.registered).length ?? 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">確定撮影情報</h1>
          <p className="text-muted mt-1 text-sm">
            確定した撮影の内容です。撮影料とオプションを編集でき、撮影後はここから保存先ストレージURLを登録してください。
          </p>
        </div>
        <Link
          href="/shoots/confirm"
          className="tap-target bg-navy-900 hover:bg-navy-800 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white"
        >
          撮影を確定する
        </Link>
      </header>

      {pending > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          撮影済みで保存先が未登録のものが {pending} 件あります
        </p>
      )}

      {shoots === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : shoots.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          <p className="text-foreground font-medium">確定した撮影がまだありません</p>
          <p className="mt-1">「撮影を確定する」から登録してください。</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {shoots.map((shoot) => (
            <ShootCard key={shoot.slotId} shoot={shoot} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ShootCard({ shoot }: { shoot: ConfirmedShoot }) {
  const [urls, setUrls] = useState<string[]>(() => toRows(shoot.storageUrls))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 空欄を増やしただけでは保存するものが変わらない
  const dirty =
    JSON.stringify(urls.map((u) => u.trim()).filter(Boolean)) !== JSON.stringify(shoot.storageUrls)

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveStorageUrls(shoot.slotId, urls)
      setUrls(toRows(normalizeStorageUrls(urls)))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="bg-surface border-border rounded-lg border">
      <div className="border-border border-b px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium">{shoot.title}</h2>
            {shoot.concept && shoot.concept !== shoot.title && (
              <p className="text-muted mt-0.5 truncate text-xs">{shoot.concept}</p>
            )}
          </div>
          <StatusBadge shoot={shoot} />
        </div>

        <dl className="text-muted mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <Row label="撮影日">
            <span className="tabular-nums">
              {shoot.shootDate} {shoot.startTime}〜{shoot.endTime}
            </span>
          </Row>
          {shoot.meetingTime && (
            <Row label="集合時刻">
              <span className="tabular-nums">{shoot.meetingTime}</span>
            </Row>
          )}
          {shoot.paymentTiming && (
            <Row label="支払方法">
              {feePaymentTimingLabel(shoot.paymentTiming)}
              {shoot.paymentDate && (
                <span className="tabular-nums">（支払日 {shoot.paymentDate}）</span>
              )}
            </Row>
          )}
          <Row label="場所区分">
            {shoot.placeCategory ? placeCategoryLabel(shoot.placeCategory) : '—'}
          </Row>
          <Row label="場所">{shoot.venueName ?? '—'}</Row>
          {shoot.meetingPoint && <Row label="集合場所">{shoot.meetingPoint}</Row>}
          <Row label="モデル">
            {shoot.models.length === 0 ? (
              '—'
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {shoot.models.map((m) => (
                  <span key={m.name} className="flex items-center gap-1.5">
                    <span>{m.name}</span>
                    <ModelAccounts accounts={m.accounts} />
                  </span>
                ))}
              </span>
            )}
          </Row>
        </dl>
        {shoot.memo && (
          <p className="text-muted mt-2 text-sm whitespace-pre-wrap">
            <span className="mr-2 text-xs">メモ</span>
            <span className="text-foreground">{shoot.memo}</span>
          </p>
        )}
      </div>

      <ShootOptionsEditor shoot={shoot} />

      <div className="px-5 py-4">
        <StorageUrlsField
          label="保存先ストレージURL"
          hint={
            shoot.finished
              ? `最大${MAX_STORAGE_URLS}個。1つでも登録すると撮影リマインドから外れます`
              : '撮影が終わると登録できます'
          }
          urls={urls}
          onChange={setUrls}
          disabled={!shoot.finished}
        />

        {error && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty || !shoot.finished}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {saving ? '保存中…' : '保存先を登録'}
          </button>
          {saved && <span className="text-xs text-emerald-700 dark:text-emerald-400">保存しました</span>}
          {!saved && !dirty && shoot.registered && (
            <span className="text-muted text-xs">登録済み</span>
          )}
        </div>
      </div>
    </li>
  )
}

/** 撮影料は未入力を0で持つので、入力欄では空欄に戻す */
function toOptionsInput(shoot: ConfirmedShoot): ShootOptionsInput {
  return {
    shootFee: shoot.shootFee > 0 ? String(shoot.shootFee) : '',
    costumeOptions: shoot.costumeOptions ?? '',
    shootingMethodOptions: shoot.shootingMethodOptions ?? '',
  }
}

function ShootOptionsEditor({ shoot }: { shoot: ConfirmedShoot }) {
  const [values, setValues] = useState<ShootOptionsInput>(() => toOptionsInput(shoot))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = toOptionsInput(shoot)
  const dirty = (Object.keys(current) as (keyof ShootOptionsInput)[]).some(
    (key) => values[key].trim() !== current[key],
  )

  const onChange = <K extends keyof ShootOptionsInput>(key: K, value: ShootOptionsInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setSaved(false)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await saveShootOptions(shoot.slotId, values)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="border-border space-y-4 border-b px-5 py-4">
      <ShootOptionsFields values={values} onChange={onChange} />

      {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !dirty}
          className="bg-navy-900 hover:bg-navy-800 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? '保存中…' : '撮影料とオプションを保存'}
        </button>
        {saved && !dirty && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">保存しました</span>
        )}
      </div>
    </form>
  )
}

function StatusBadge({ shoot }: { shoot: ConfirmedShoot }) {
  if (shoot.registered) {
    return (
      <span className="shrink-0 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
        データ登録済み
      </span>
    )
  }
  if (shoot.finished) {
    return (
      <span className="shrink-0 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
        データ未登録
      </span>
    )
  }
  return (
    <span className="bg-navy-100 text-navy-700 dark:text-navy-100 shrink-0 rounded-md px-2.5 py-1 text-xs font-medium dark:bg-white/10">
      {shoot.past ? '撮影中' : '撮影前'}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex gap-2">
      <dt className="shrink-0 text-xs">{label}</dt>
      <dd className="text-foreground min-w-0">{children}</dd>
    </span>
  )
}

