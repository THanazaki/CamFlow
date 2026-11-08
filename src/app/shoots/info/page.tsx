'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useEffect, useId, useState } from 'react'

import { ShootOptionsFields } from '@/components/forms/ShootOptionsFields'
import { ModelAccounts } from '@/components/ModelAccount'
import { StorageUrlsField } from '@/components/forms/StorageUrlsField'
import {
  cancelConfirmedShoot,
  saveShootOptions,
  saveStorageUrls,
  type ShootOptionsInput,
} from '@/lib/actions/shoots'
import { feePaymentTimingLabel } from '@/lib/fee-payment'
import { placeCategoryLabel } from '@/lib/place-category'
import { shootRecordHref } from '@/lib/queries/archives'
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
            確定した撮影の内容です。「編集」で日時・場所・モデル・オプションなどを修正できます。撮影後はここから保存先ストレージURLを登録してください。
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
  const [cancelOpen, setCancelOpen] = useState(false)

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
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge shoot={shoot} />
            <Link
              href={`${shootRecordHref('edit', { source: 'slot', id: shoot.slotId })}&from=info`}
              aria-label={`${shoot.title} を編集`}
              className="tap-target border-border hover:bg-navy-50 rounded-md border px-3 py-1 text-xs whitespace-nowrap dark:hover:bg-white/5"
            >
              編集
            </Link>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              aria-label={`${shoot.title} を撮影中止にする`}
              className="tap-target rounded-md border border-red-300 px-3 py-1 text-xs whitespace-nowrap text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              撮影中止
            </button>
          </div>
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

      {cancelOpen && <CancelShootDialog shoot={shoot} onClose={() => setCancelOpen(false)} />}

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

/**
 * 撮影中止の確認。OK で確定撮影情報から削除する。
 * モデルや撮影会などの入力内容はマスタに残る。
 */
function CancelShootDialog({ shoot, onClose }: { shoot: ConfirmedShoot; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const onOk = async () => {
    setBusy(true)
    setError(null)
    try {
      // 成功するとカードごと一覧から消えるので、閉じる処理は要らない
      await cancelConfirmedShoot(shoot.slotId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border-border w-full max-w-sm rounded-lg border p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-base font-semibold">
          この撮影を中止しますか？
        </h2>
        <p className="mt-2 text-sm">
          <span className="font-medium">{shoot.title}</span>
          <span className="text-muted ml-2 tabular-nums">
            {shoot.shootDate} {shoot.startTime}〜{shoot.endTime}
          </span>
        </p>
        <p className="text-muted mt-2 text-xs">
          OK を押すと、この撮影を確定撮影情報から削除します。入力したモデルや撮影会の情報はマスタに残ります。
        </p>

        {error && <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-1.5 text-sm disabled:opacity-50 dark:hover:bg-white/5"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={onOk}
            disabled={busy}
            autoFocus
            className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? '削除中…' : 'OK'}
          </button>
        </div>
      </div>
    </div>
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

