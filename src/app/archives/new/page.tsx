'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { EMPTY_SHOOT_DETAILS, ShootDetailsFields } from '@/components/forms/ShootDetailsFields'
import { createShootHistory, localToday } from '@/lib/actions/archives'
import type { ShootDetailsInput } from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'

export default function ArchiveNewPage() {
  const router = useRouter()
  const [form, setForm] = useState<ShootDetailsInput>(EMPTY_SHOOT_DETAILS)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ShootDetailsInput>(key: K, value: ShootDetailsInput[K]) =>
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
      await createShootHistory(userId, form)
      setForm(EMPTY_SHOOT_DETAILS)
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
          <ShootDetailsFields values={form} onChange={set} maxShootDate={localToday()} />
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
            onClick={() => setForm(EMPTY_SHOOT_DETAILS)}
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
