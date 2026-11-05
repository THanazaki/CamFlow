'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  EMPTY_SHOOT_DETAILS,
  inputClass,
  ShootDetailsFields,
} from '@/components/forms/ShootDetailsFields'
import { createShootHistory, localToday, MAX_STORAGE_URLS } from '@/lib/actions/archives'
import type { ShootDetailsInput } from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'

/** 入力欄は最初から1つ出しておく */
const EMPTY_STORAGE_URLS = ['']

export default function ArchiveNewPage() {
  const router = useRouter()
  const [details, setDetails] = useState<ShootDetailsInput>(EMPTY_SHOOT_DETAILS)
  const [storageUrls, setStorageUrls] = useState<string[]>(EMPTY_STORAGE_URLS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ShootDetailsInput>(key: K, value: ShootDetailsInput[K]) =>
    setDetails((f) => ({ ...f, [key]: value }))

  const clear = () => {
    setDetails(EMPTY_SHOOT_DETAILS)
    setStorageUrls(EMPTY_STORAGE_URLS)
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
      await createShootHistory(userId, { ...details, storageUrls })
      clear()
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
        <h1 className="text-2xl font-semibold tracking-tight">過去撮影登録</h1>
        <p className="text-muted mt-1 text-sm">
          予約や確定の入力を通していない過去の撮影を、撮影済みとして登録します。
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <section className="bg-surface border-border space-y-5 rounded-lg border p-5">
          <ShootDetailsFields
            values={details}
            onChange={set}
            maxShootDate={localToday()}
            showMeetingPoint={false}
          />
          <StorageUrlsField urls={storageUrls} onChange={setStorageUrls} />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '過去撮影を登録'}
          </button>
          <button
            type="button"
            onClick={clear}
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

function StorageUrlsField({
  urls,
  onChange,
}: {
  urls: string[]
  onChange: (urls: string[]) => void
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">ストレージURL</legend>
      <p className="text-muted mt-0.5 text-xs">最大{MAX_STORAGE_URLS}個。空欄は保存されません</p>
      <div className="mt-1.5 space-y-2">
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => onChange(urls.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder="https://drive.example.com/..."
              aria-label={`ストレージURL ${i + 1}`}
              className={inputClass}
            />
            {urls.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(urls.filter((_, j) => j !== i))}
                aria-label={`ストレージURL ${i + 1} を削除`}
                className="border-border hover:bg-navy-50 shrink-0 rounded-md border px-3 py-2 text-sm dark:hover:bg-white/5"
              >
                削除
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...urls, ''])}
        disabled={urls.length >= MAX_STORAGE_URLS}
        className="border-border hover:bg-navy-50 mt-2 rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/5"
      >
        追加
      </button>
    </fieldset>
  )
}
