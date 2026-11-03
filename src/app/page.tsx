'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { ReminderCard, ReminderRow } from '@/components/dashboard/ReminderCard'
import { loadDashboard, type ShootSummary } from '@/lib/queries/dashboard'
import { useSync } from '@/lib/sync/useSync'

/**
 * ダッシュボード。
 *
 * 上段: 予約 / 料金 / 撮影 の3つのリマインド
 * 下段: 直近の撮影済みデータ（運用フロー分＋遡及登録分）
 *
 * 読み取りは全てローカルDB（IndexedDB）から。クエリは lib/queries/dashboard.ts に集約し、
 * ここでは組み立てない。
 */
export default function DashboardPage() {
  const data = useLiveQuery(() => loadDashboard(), [], null)
  const { phase } = useSync()

  if (data === null) {
    return <p className="text-muted py-10 text-sm">読み込み中…</p>
  }

  const isEmpty =
    data.reservations.length === 0 &&
    data.shoots.length === 0 &&
    data.fees.totalCount === 0 &&
    data.recent.length === 0

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="text-muted mt-1 text-sm">
          {phase === 'offline' ? 'オフライン（手元のデータを表示しています）' : '今やることと、直近の撮影です。'}
        </p>
      </header>

      {/* 上段: 3つのリマインド */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ReminderCard
          title="予約リマインド"
          count={data.reservations.length}
          emptyText="確定待ちの予約はありません"
        >
          {data.reservations.map((r) => (
            <ReminderRow
              key={r.slotId}
              primary={r.title}
              secondary={[r.venueName, r.modelNames.join('・')].filter(Boolean).join(' / ') || undefined}
              trailing={<DateTime iso={r.startAt} daysUntil={r.daysUntil} />}
            />
          ))}
        </ReminderCard>

        <ReminderCard
          title="料金リマインド"
          count={data.fees.totalCount}
          tone="alert"
          summary={data.fees.totalCount > 0 ? `未払い ${yen(data.fees.totalAmount)}` : undefined}
          emptyText="未払いのモデル料はありません"
        >
          {data.fees.items.map((f) => (
            <ReminderRow
              key={`${f.source}:${f.id}`}
              primary={f.modelName}
              secondary={`${f.shootDate} ${f.title}`}
              trailing={yen(f.amount)}
            />
          ))}
        </ReminderCard>

        <ReminderCard
          title="撮影リマインド"
          count={data.shoots.length}
          emptyText="確定済みの撮影予定はありません"
        >
          {data.shoots.map((s) => (
            <ReminderRow
              key={s.slotId}
              primary={`${s.title}${s.label ? `（${s.label}）` : ''}`}
              secondary={[s.venueName, s.modelNames.join('・')].filter(Boolean).join(' / ') || undefined}
              trailing={<DateTime iso={s.startAt} daysUntil={s.daysUntil} />}
            />
          ))}
        </ReminderCard>
      </div>

      {/* 下段: 直近の撮影済み */}
      <section className="bg-surface border-border rounded-lg border">
        <header className="border-border flex items-baseline justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">直近の撮影済みデータ</h2>
          <span className="text-muted text-xs">撮影管理の完了分と、遡及登録した過去分</span>
        </header>

        {data.recent.length === 0 ? (
          <p className="text-muted px-4 py-8 text-center text-xs">撮影済みのデータはまだありません</p>
        ) : (
          <RecentTable rows={data.recent} />
        )}
      </section>

      {isEmpty && <SetupHint />}
    </div>
  )
}

function RecentTable({ rows }: { rows: ShootSummary[] }) {
  return (
    // 横に広いので、狭い画面ではこの中だけ横スクロールさせる
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="text-muted border-border border-b text-left text-xs">
          <tr>
            <th className="px-4 py-2 font-medium">撮影日</th>
            <th className="px-4 py-2 font-medium">内容</th>
            <th className="px-4 py-2 font-medium">モデル</th>
            <th className="px-4 py-2 text-right font-medium">枚数</th>
            <th className="px-4 py-2 font-medium">保管先</th>
            <th className="px-4 py-2 font-medium">バックアップ</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((r) => (
            <tr key={`${r.source}:${r.sourceId}`}>
              <td className="text-muted px-4 py-2.5 whitespace-nowrap tabular-nums">{r.shootDate}</td>
              <td className="px-4 py-2.5">
                <span className="block max-w-[15rem] truncate">
                  {r.title}
                  {r.slotNo !== null && <span className="text-muted"> ({r.slotNo}部)</span>}
                </span>
                {r.venueName && <span className="text-muted block truncate text-xs">{r.venueName}</span>}
              </td>
              <td className="px-4 py-2.5">
                <span className="block max-w-[10rem] truncate">{r.modelNames.join('・') || '—'}</span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.frameCount ?? '—'}</td>
              <td className="px-4 py-2.5">
                {r.storagePath ? (
                  <span className="block max-w-[14rem] truncate font-mono text-xs" title={r.storagePath}>
                    {r.storageLabel && <span className="text-muted">[{r.storageLabel}] </span>}
                    {r.storagePath}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">未登録</span>
                )}
              </td>
              <td className="px-4 py-2.5 whitespace-nowrap">
                {r.backedUpAt ? (
                  <span className="text-muted tabular-nums">{r.backedUpAt.slice(0, 10)}</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">未</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DateTime({ iso, daysUntil }: { iso: string; daysUntil: number }) {
  const d = new Date(iso)
  const days = daysUntil
  return (
    <span className="text-right">
      <span className="block whitespace-nowrap">
        {d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="text-muted block whitespace-nowrap">
        {days <= 0 ? '本日' : `あと${days}日`}
      </span>
    </span>
  )
}

function yen(amount: number): string {
  return `¥${amount.toLocaleString('ja-JP')}`
}

function SetupHint() {
  return (
    <div className="border-border text-muted rounded-lg border border-dashed p-5 text-sm">
      <p className="text-foreground font-medium">まだデータがありません</p>
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
