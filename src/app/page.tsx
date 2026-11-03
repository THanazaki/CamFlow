'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '@/lib/db'
import { SYNC_TABLES } from '@/lib/db/types'
import { useSync } from '@/lib/sync/useSync'

const LABELS: Record<(typeof SYNC_TABLES)[number], string> = {
  profiles: 'プロフィール',
  venues: 'スタジオ・ロケ地',
  organizers: '団体',
  models: 'モデル',
  sessions: '撮影イベント',
  slots: '撮影枠',
  slot_models: '枠 × モデル',
}

/**
 * ダッシュボード（土台の確認用）。
 * 画面は全てローカルDB（IndexedDB）から読む。Supabase を直接読まない。
 */
export default function DashboardPage() {
  const counts = useLiveQuery(
    async () => {
      const entries = await Promise.all(
        SYNC_TABLES.map(async (t) => [t, await db.syncTable(t).count()] as const),
      )
      return Object.fromEntries(entries) as Record<string, number>
    },
    [],
    null,
  )

  const { phase, pending, failed, lastSyncedAt } = useSync()
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="text-muted mt-1 text-sm">
          ローカルDB（IndexedDB）の中身です。Phase 1 の画面はここに載せていきます。
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SYNC_TABLES.map((table) => (
          <div
            key={table}
            className="bg-surface border-border rounded-lg border px-4 py-3.5"
          >
            <div className="text-muted text-xs">{LABELS[table]}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {counts === null ? '—' : counts[table]}
            </div>
          </div>
        ))}
      </section>

      {counts !== null && total === 0 && <EmptyState />}

      <section className="bg-surface border-border rounded-lg border p-4">
        <h2 className="text-sm font-medium">同期の状態</h2>
        <dl className="text-muted mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="状態" value={phaseLabel(phase)} />
          <Stat label="未送信" value={`${pending} 件`} />
          <Stat label="送信失敗" value={`${failed} 件`} />
          <Stat
            label="最終同期"
            value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('ja-JP') : '—'}
          />
        </dl>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs">{label}</dt>
      <dd className="text-foreground mt-0.5 font-medium">{value}</dd>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border-border text-muted rounded-lg border border-dashed p-5 text-sm">
      <p className="text-foreground font-medium">ローカルDBが空です</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          ホスト側で <code className="font-mono text-xs">supabase start</code> →{' '}
          <code className="font-mono text-xs">supabase db reset</code>
        </li>
        <li>
          <code className="font-mono text-xs">.env.local</code> に接続情報と開発用アカウントを設定
          （<code className="font-mono text-xs">.env.example</code> を参照）
        </li>
        <li>ページを再読み込みすると同期が走り、シードデータが入ります</li>
      </ol>
    </div>
  )
}

function phaseLabel(phase: ReturnType<typeof useSync>['phase']): string {
  switch (phase) {
    case 'idle':
      return '待機中'
    case 'syncing':
      return '同期中'
    case 'offline':
      return 'オフライン'
    case 'error':
      return 'エラー'
  }
}
