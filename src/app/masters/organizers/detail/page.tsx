'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { StorageUrlList } from '@/components/StorageUrlList'
import { loadOrganizerDetail } from '@/lib/queries/organizers'

export default function OrganizerDetailPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <OrganizerDetailView />
    </Suspense>
  )
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP')
}

/** 撮影会マスタの詳細。全カラムの値を表示する */
function OrganizerDetailView() {
  const id = useSearchParams().get('id') ?? ''
  const organizer = useLiveQuery(() => loadOrganizerDetail(id), [id], 'loading' as const)

  if (organizer === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!organizer) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影会の詳細</h1>
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

  return (
    <div className="max-w-2xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影会の詳細</h1>
        <div className="flex shrink-0 gap-2">
          {/* 編集から来た場合も含め、常に一覧へ戻る */}
          <Link
            href="/masters/organizers"
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            戻る
          </Link>
          <Link
            href={`/masters/organizers/edit?id=${encodeURIComponent(organizer.id)}`}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            編集
          </Link>
        </div>
      </header>

      <dl className="bg-surface border-border divide-border divide-y rounded-lg border text-sm">
        <Row label="ID">
          <span className="font-mono text-xs break-all">{organizer.id}</span>
        </Row>
        <Row label="ユーザーID">
          <span className="font-mono text-xs break-all">{organizer.userId}</span>
        </Row>
        <Row label="撮影会名">{organizer.name}</Row>
        <Row label="読み">{organizer.nameKana}</Row>
        <Row label="拠点">{organizer.baseLocation}</Row>
        <Row label="URL">
          {organizer.url ? <StorageUrlList urls={[organizer.url]} /> : null}
        </Row>
        <Row label="連絡先">{organizer.contact}</Row>
        <Row label="メモ">
          {organizer.notes ? <span className="whitespace-pre-wrap">{organizer.notes}</span> : null}
        </Row>
        <Row label="お気に入り">{organizer.isFavorite ? 'はい' : 'いいえ'}</Row>
        <Row label="作成日時">{formatDateTime(organizer.createdAt)}</Row>
        <Row label="更新日時">{formatDateTime(organizer.updatedAt)}</Row>
        <Row label="削除日時">
          {organizer.deletedAt ? formatDateTime(organizer.deletedAt) : null}
        </Row>
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
