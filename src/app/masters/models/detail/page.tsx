'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { ModelAccount } from '@/components/ModelAccount'
import { modelStatusLabel } from '@/lib/model-status'
import { loadModelDetail } from '@/lib/queries/models'

export default function ModelDetailPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <ModelDetailView />
    </Suspense>
  )
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP')
}

const SNS_LABELS: Record<string, string> = { x: 'X', instagram: 'Instagram' }

/** モデルマスタの詳細 */
function ModelDetailView() {
  const router = useRouter()
  const id = useSearchParams().get('id') ?? ''
  const model = useLiveQuery(() => loadModelDetail(id), [id], 'loading' as const)

  if (model === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!model) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">モデルの詳細</h1>
        <p className="text-muted text-sm">モデルが見つかりませんでした。</p>
        <Link
          href="/masters/models"
          className="text-navy-600 dark:text-navy-200 text-sm underline underline-offset-2"
        >
          モデルマスタへ
        </Link>
      </div>
    )
  }

  const snsEntries = [
    'x',
    'instagram',
    ...Object.keys(model.snsLinks).filter((key) => key !== 'x' && key !== 'instagram'),
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">モデルの詳細</h1>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            戻る
          </button>
          <Link
            href={`/masters/models/edit?id=${encodeURIComponent(model.id)}`}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            編集
          </Link>
        </div>
      </header>

      <dl className="bg-surface border-border divide-border divide-y rounded-lg border text-sm">
        <Row label="ID">
          <span className="font-mono text-xs break-all">{model.id}</span>
        </Row>
        <Row label="ユーザーID">
          <span className="font-mono text-xs break-all">{model.userId}</span>
        </Row>
        <Row label="モデル名">{model.name}</Row>
        <Row label="読み">{model.nameKana}</Row>
        <Row label="別名義">{model.aliases.join('、')}</Row>
        <Row label="所属（メイン）">{model.affiliation}</Row>
        <Row label="その他の所属">{model.subAffiliations.join('、')}</Row>
        {snsEntries.map((key) => (
          <Row key={key} label={SNS_LABELS[key] ?? `SNS（${key}）`}>
            {model.snsLinks[key] ? (
              <ModelAccount href={model.snsLinks[key]} label={SNS_LABELS[key] ?? key} />
            ) : null}
          </Row>
        ))}
        <Row label="連絡手段">{model.contactMethod}</Row>
        <Row label="連絡先">{model.contactValue}</Row>
        <Row label="お気に入り">{model.isFavorite ? 'はい' : 'いいえ'}</Row>
        <Row label="ステータス">{modelStatusLabel(model.status)}</Row>
        <Row label="メモ">
          {model.notes ? <span className="whitespace-pre-wrap">{model.notes}</span> : null}
        </Row>
        <Row label="作成日時">{formatDateTime(model.createdAt)}</Row>
        <Row label="更新日時">{formatDateTime(model.updatedAt)}</Row>
        <Row label="削除日時">{model.deletedAt ? formatDateTime(model.deletedAt) : null}</Row>
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
