'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { StorageUrlList } from '@/components/StorageUrlList'
import { loadVenueDetail, venueKindLabel } from '@/lib/queries/venues'

export default function VenueDetailPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <VenueDetailView />
    </Suspense>
  )
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP')
}

/** ロケ地・スタジオマスタの詳細。全カラムの値を表示する */
function VenueDetailView() {
  const id = useSearchParams().get('id') ?? ''
  const venue = useLiveQuery(() => loadVenueDetail(id), [id], 'loading' as const)

  if (venue === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!venue) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影場所の詳細</h1>
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

  return (
    <div className="max-w-2xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影場所の詳細</h1>
        <div className="flex shrink-0 gap-2">
          {/* 編集から来た場合も含め、常に一覧へ戻る */}
          <Link
            href="/masters/venues"
            className="tap-target border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            戻る
          </Link>
          <Link
            href={`/masters/venues/edit?id=${encodeURIComponent(venue.id)}`}
            className="tap-target bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            編集
          </Link>
        </div>
      </header>

      <dl className="bg-surface border-border divide-border divide-y rounded-lg border text-sm">
        <Row label="ID">
          <span className="font-mono text-xs break-all">{venue.id}</span>
        </Row>
        <Row label="ユーザーID">
          <span className="font-mono text-xs break-all">{venue.userId}</span>
        </Row>
        <Row label="撮影場所">{venue.name}</Row>
        <Row label="種別">{venueKindLabel(venue.kind)}</Row>
        <Row label="住所">{venue.address}</Row>
        <Row label="最寄り駅">{venue.nearestStation}</Row>
        <Row label="URL">{venue.url ? <StorageUrlList urls={[venue.url]} /> : null}</Row>
        <Row label="1時間あたりの料金">
          {venue.hourlyRate !== null ? (
            <span className="tabular-nums">{venue.hourlyRate.toLocaleString('ja-JP')} 円</span>
          ) : null}
        </Row>
        <Row label="メモ">
          {venue.notes ? <span className="whitespace-pre-wrap">{venue.notes}</span> : null}
        </Row>
        <Row label="お気に入り">{venue.isFavorite ? 'はい' : 'いいえ'}</Row>
        <Row label="作成日時">{formatDateTime(venue.createdAt)}</Row>
        <Row label="更新日時">{formatDateTime(venue.updatedAt)}</Row>
        <Row label="削除日時">{venue.deletedAt ? formatDateTime(venue.deletedAt) : null}</Row>
      </dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="gap-3 px-4 py-3 sm:flex">
      <dt className="text-muted shrink-0 text-xs sm:w-36 sm:text-sm">{label}</dt>
      <dd className="mt-0.5 min-w-0 break-words sm:mt-0 sm:flex-1">
        {children || <span className="text-muted">—</span>}
      </dd>
    </div>
  )
}
