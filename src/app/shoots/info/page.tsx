'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useId, useState } from 'react'

import { saveStorageUrls } from '@/lib/actions/shoots'
import { loadConfirmedShoots, type ConfirmedShoot } from '@/lib/queries/shoots'

const STORAGE_SLOTS = 3

/**
 * 確定撮影情報。
 * 「確定撮影情報入力」で登録した内容を一覧し、撮影後に保存先ストレージURLを登録する。
 */
export default function ShootInfoPage() {
  const shoots = useLiveQuery(() => loadConfirmedShoots(), [], null)

  const pending = shoots?.filter((s) => s.past && !s.registered).length ?? 0

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">確定撮影情報</h1>
          <p className="text-muted mt-1 text-sm">
            確定した撮影の内容です。撮影後はここから保存先ストレージURLを登録してください。
          </p>
        </div>
        <Link
          href="/shoots/confirm"
          className="bg-navy-900 hover:bg-navy-800 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white"
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
  // 保存済みの値を初期値にして、3枠ぶんに広げる
  const [urls, setUrls] = useState<string[]>(() =>
    Array.from({ length: STORAGE_SLOTS }, (_, i) => shoot.storageUrls[i] ?? ''),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const groupId = useId()

  const dirty = urls.some((u, i) => u !== (shoot.storageUrls[i] ?? ''))

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveStorageUrls(shoot.slotId, urls)
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
          <Row label="場所">{shoot.venueName ?? '—'}</Row>
          <Row label="モデル">
            {shoot.models.length === 0 ? (
              '—'
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {shoot.models.map((m) => (
                  <span key={m.name} className="flex items-center gap-1.5">
                    <span>{m.name}</span>
                    {m.x && <Account href={m.x} label="X" />}
                    {m.instagram && <Account href={m.instagram} label="IG" />}
                  </span>
                ))}
              </span>
            )}
          </Row>
        </dl>
      </div>

      <div className="px-5 py-4">
        <fieldset>
          <legend className="text-sm font-medium">保存先ストレージURL</legend>
          <p className="text-muted mt-0.5 text-xs" id={`${groupId}-hint`}>
            最大3つ。1つでも登録すると撮影リマインドから外れます
          </p>
          <div className="mt-2 space-y-2">
            {urls.map((url, i) => (
              <input
                key={i}
                type="url"
                value={url}
                onChange={(e) =>
                  setUrls((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                placeholder={`https://drive.example.com/... (${i + 1})`}
                aria-label={`保存先ストレージURL ${i + 1}`}
                aria-describedby={`${groupId}-hint`}
                className="bg-background border-border focus:border-navy-500 focus:ring-navy-500/30 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
              />
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="mt-2 text-xs text-red-700 dark:text-red-400">{error}</p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !dirty}
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

function StatusBadge({ shoot }: { shoot: ConfirmedShoot }) {
  if (shoot.registered) {
    return (
      <span className="shrink-0 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
        データ登録済み
      </span>
    )
  }
  if (shoot.past) {
    return (
      <span className="shrink-0 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
        データ未登録
      </span>
    )
  }
  return (
    <span className="bg-navy-100 text-navy-700 dark:text-navy-100 shrink-0 rounded-md px-2.5 py-1 text-xs font-medium dark:bg-white/10">
      撮影前
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

function Account({ href, label }: { href: string; label: string }) {
  // アカウント欄には URL ではなく @ハンドルだけ入っていることもある
  const isUrl = /^https?:\/\//.test(href)
  if (!isUrl) {
    return <span className="text-muted text-xs">{label}: {href}</span>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-navy-600 dark:text-navy-200 text-xs underline underline-offset-2"
    >
      {label}
    </a>
  )
}
