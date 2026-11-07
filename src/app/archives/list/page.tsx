'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'

import { ShootRecordTable } from '@/components/ShootRecordTable'
import { loadShootArchive } from '@/lib/queries/archives'

/**
 * 過去撮影一覧。
 * 撮影情報検索と同じ対象（撮影日を過ぎた確定済みの撮影 + 過去撮影登録）を、条件なしで撮影日の新しい順に出す。
 */
export default function ShootListPage() {
  const records = useLiveQuery(() => loadShootArchive(), [], null)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">過去撮影一覧</h1>
          <p className="text-muted mt-1 text-sm">
            撮影日を過ぎた確定済みの撮影と、過去撮影登録で登録した撮影を、撮影日の新しい順に表示します。
          </p>
        </div>
        <Link
          href="/archives/search"
          className="tap-target border-border hover:bg-navy-50 shrink-0 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
        >
          条件で検索する
        </Link>
      </header>

      <section aria-label="過去の撮影" className="space-y-3">
        {records === null ? (
          <p className="text-muted text-sm">読み込み中…</p>
        ) : (
          <>
            <p className="text-sm font-medium" role="status">
              {records.length} 件
            </p>
            {records.length === 0 ? (
              <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
                過去の撮影はまだありません
              </div>
            ) : (
              <ShootRecordTable rows={records} />
            )}
          </>
        )}
      </section>
    </div>
  )
}
