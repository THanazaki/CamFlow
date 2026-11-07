'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { AccountsField, toAccountRows } from '@/components/forms/AccountsField'
import { Field, inputClass } from '@/components/forms/ShootDetailsFields'
import { updateOrganizer, type OrganizerInput } from '@/lib/actions/organizers'
import { loadOrganizerDetail, type OrganizerDetail } from '@/lib/queries/organizers'

export default function OrganizerEditPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <OrganizerEdit />
    </Suspense>
  )
}

function OrganizerEdit() {
  const id = useSearchParams().get('id') ?? ''
  const organizer = useLiveQuery(() => loadOrganizerDetail(id), [id], 'loading' as const)

  if (organizer === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!organizer) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影会の編集</h1>
        <p className="text-muted text-sm">撮影会が見つかりませんでした。</p>
        <Link
          href="/masters/organizers"
          className="text-navy-600 dark:text-navy-200 text-sm underline underline-offset-2"
        >
          撮影会マスタへ
        </Link>
      </div>
    )
  }
  return <OrganizerEditForm key={organizer.id} organizer={organizer} />
}

function toFormValues(organizer: OrganizerDetail): OrganizerInput {
  return {
    name: organizer.name,
    nameKana: organizer.nameKana ?? '',
    baseLocation: organizer.baseLocation ?? '',
    url: organizer.url ?? '',
    accounts: toAccountRows(organizer.accounts),
    contact: organizer.contact ?? '',
    notes: organizer.notes ?? '',
    isFavorite: organizer.isFavorite,
  }
}

function OrganizerEditForm({ organizer }: { organizer: OrganizerDetail }) {
  const router = useRouter()
  const [form, setForm] = useState<OrganizerInput>(() => toFormValues(organizer))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof OrganizerInput>(key: K, value: OrganizerInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await updateOrganizer(organizer.id, form)
      // 「戻る」で編集画面に戻らないよう、履歴を置き換える
      router.replace(`/masters/organizers/detail?id=${encodeURIComponent(organizer.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">撮影会の編集</h1>
        <p className="text-muted mt-1 text-sm">撮影会マスタの内容を変更します。</p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <section className="bg-surface border-border space-y-5 rounded-lg border p-5">
          <Field label="ID" hint="変更できません">
            {(p) => (
              <input
                {...p}
                type="text"
                value={organizer.id}
                readOnly
                className={`${inputClass} text-muted font-mono`}
              />
            )}
          </Field>

          <Field
            label="撮影会名"
            required
            hint="変更すると、この撮影会を所属に持つモデルの所属も新しい名前に変わります。登録済みの撮影のタイトルは変わりません"
          >
            {(p) => (
              <input
                {...p}
                type="text"
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="読み" hint="入力すると、一覧はこの読みの順に並びます">
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.nameKana}
                onChange={(e) => set('nameKana', e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="拠点">
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.baseLocation}
                onChange={(e) => set('baseLocation', e.target.value)}
                placeholder="東京、関西"
                className={inputClass}
              />
            )}
          </Field>

          <Field label="URL" hint="公式サイトや予約ページ">
            {(p) => (
              <input
                {...p}
                type="url"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                placeholder="https://example.com"
                className={inputClass}
              />
            )}
          </Field>

          <AccountsField
            label="アカウント"
            accounts={form.accounts}
            onChange={(accounts) => set('accounts', accounts)}
          />

          <Field label="連絡先" hint="メール、DM、電話など">
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.contact}
                onChange={(e) => set('contact', e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="メモ" hint="支払い条件、入館ルールなど">
            {(p) => (
              <textarea
                {...p}
                rows={4}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <div>
            <p className="text-sm font-medium">お気に入り</p>
            <label className="tap-target mt-1.5 flex items-center gap-2 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFavorite}
                onChange={(e) => set('isFavorite', e.target.checked)}
                className="size-4"
              />
              お気に入りにする
            </label>
          </div>
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
