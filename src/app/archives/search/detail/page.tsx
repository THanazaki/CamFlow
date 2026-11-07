'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { StorageUrlList } from '@/components/StorageUrlList'
import { feePaymentTimingLabel } from '@/lib/fee-payment'
import { placeCategoryLabel } from '@/lib/place-category'
import { loadShootRecord, shootRecordHref, type ShootSource } from '@/lib/queries/archives'
import { shootCategoryLabel } from '@/lib/shoot-category'

export default function ShootDetailPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <ShootDetail />
    </Suspense>
  )
}

function ShootDetail() {
  const router = useRouter()
  const params = useSearchParams()
  const source: ShootSource = params.get('source') === 'history' ? 'history' : 'slot'
  const id = params.get('id') ?? ''
  const record = useLiveQuery(() => loadShootRecord(source, id), [source, id], 'loading' as const)

  if (record === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!record) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">撮影情報の詳細</h1>
        <p className="text-muted text-sm">撮影が見つかりませんでした。</p>
        <Link
          href="/archives/search"
          className="text-navy-600 dark:text-navy-200 text-sm underline underline-offset-2"
        >
          撮影情報検索へ
        </Link>
      </div>
    )
  }

  const time =
    record.startTime && record.endTime ? `${record.startTime}〜${record.endTime}` : null

  return (
    <div className="max-w-2xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">撮影情報の詳細</h1>
          <p className="text-muted mt-1 text-sm">
            {record.source === 'slot' ? '確定撮影情報入力' : '過去撮影登録'}で登録した撮影です。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            戻る
          </button>
          <Link
            href={shootRecordHref('edit', record)}
            className="tap-target bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            編集
          </Link>
        </div>
      </header>

      <dl className="bg-surface border-border divide-border divide-y rounded-lg border text-sm">
        <Row label="撮影会名">{record.title}</Row>
        <Row label="撮影区分">
          {record.shootCategory ? shootCategoryLabel(record.shootCategory) : null}
        </Row>
        <Row label="モデル">{record.modelNames.join('・')}</Row>
        <Row label="撮影コンセプト">{record.concept}</Row>
        <Row label="撮影日">
          <span className="tabular-nums">{record.shootDate}</span>
        </Row>
        {time && (
          <Row label="撮影時間">
            <span className="tabular-nums">{time}</span>
          </Row>
        )}
        <Row label="場所区分">
          {record.placeCategory ? placeCategoryLabel(record.placeCategory) : null}
        </Row>
        <Row label="撮影場所">{record.venueName}</Row>
        {record.source === 'slot' && (
          <>
            <Row label="集合場所">{record.meetingPoint}</Row>
            <Row label="集合時刻">{record.meetingTime}</Row>
            <Row label="撮影料">
              {record.shootFee > 0 ? `${record.shootFee.toLocaleString('ja-JP')}円` : null}
            </Row>
            <Row label="支払方法">
              {record.paymentTiming
                ? `${feePaymentTimingLabel(record.paymentTiming)}${
                    record.paymentDate ? `（支払日 ${record.paymentDate}）` : ''
                  }`
                : null}
            </Row>
            <Row label="衣装系オプション">{record.costumeOptions}</Row>
            <Row label="撮影方法オプション">{record.shootingMethodOptions}</Row>
          </>
        )}
        <Row label="ストレージのURL">
          <StorageUrlList urls={record.storageUrls} />
        </Row>
        {record.storagePath && <Row label="保管先">{record.storagePath}</Row>}
        <Row label="メモ">
          {record.memo ? <span className="whitespace-pre-wrap">{record.memo}</span> : null}
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
