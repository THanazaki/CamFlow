'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

import { ChoicePicker } from '@/components/forms/ChoicePicker'
import { Field, inputClass } from '@/components/forms/ShootDetailsFields'
import { updateVenue, type VenueInput } from '@/lib/actions/venues'
import { loadVenueDetail, VENUE_KINDS, type VenueDetail } from '@/lib/queries/venues'

export default function VenueEditPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <VenueEdit />
    </Suspense>
  )
}

function VenueEdit() {
  const id = useSearchParams().get('id') ?? ''
  const venue = useLiveQuery(() => loadVenueDetail(id), [id], 'loading' as const)

  if (venue === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!venue) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影場所の編集</h1>
        <p className="text-muted text-sm">撮影場所が見つかりませんでした。</p>
        <Link
          href="/masters/venues"
          className="text-navy-600 dark:text-navy-200 text-sm underline underline-offset-2"
        >
          ロケ地・スタジオマスタへ
        </Link>
      </div>
    )
  }
  return <VenueEditForm key={venue.id} venue={venue} />
}

function toFormValues(venue: VenueDetail): VenueInput {
  return {
    name: venue.name,
    kind: venue.kind,
    address: venue.address ?? '',
    nearestStation: venue.nearestStation ?? '',
    url: venue.url ?? '',
    hourlyRate: venue.hourlyRate !== null ? String(venue.hourlyRate) : '',
    notes: venue.notes ?? '',
    isFavorite: venue.isFavorite,
  }
}

function VenueEditForm({ venue }: { venue: VenueDetail }) {
  const router = useRouter()
  const [form, setForm] = useState<VenueInput>(() => toFormValues(venue))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof VenueInput>(key: K, value: VenueInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await updateVenue(venue.id, form)
      // 「戻る」で編集画面に戻らないよう、履歴を置き換える
      router.replace(`/masters/venues/detail?id=${encodeURIComponent(venue.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">撮影場所の編集</h1>
        <p className="text-muted mt-1 text-sm">ロケ地・スタジオマスタの内容を変更します。</p>
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
                value={venue.id}
                readOnly
                className={`${inputClass} text-muted font-mono`}
              />
            )}
          </Field>

          <Field
            label="撮影場所"
            required
            hint="変更すると、この場所で登録した撮影の場所の表示も新しい名前に変わります"
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

          <Field label="種別" required>
            {(p) => (
              <ChoicePicker
                id={p.id}
                name="venueKind"
                label="種別"
                options={VENUE_KINDS}
                value={form.kind}
                onChange={(v) => set('kind', v)}
              />
            )}
          </Field>

          <Field label="住所">
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="最寄り駅">
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.nearestStation}
                onChange={(e) => set('nearestStation', e.target.value)}
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

          <Field label="1時間あたりの料金（円）" hint="スタジオ代など。空欄なら未設定">
            {(p) => (
              <input
                {...p}
                type="text"
                inputMode="numeric"
                value={form.hourlyRate}
                onChange={(e) => set('hourlyRate', e.target.value)}
                placeholder="5000"
                className={inputClass}
              />
            )}
          </Field>

          <Field label="メモ" hint="機材、電源、NG事項など">
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
