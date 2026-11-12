'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { ReminderCard, ReminderRow } from '@/components/dashboard/ReminderCard'
import {
  loadDashboard,
  type FeeReminderItem,
  type ReminderItem,
  type ReminderStage,
  type ShootSummary,
  type TodayShoot,
} from '@/lib/queries/dashboard'
import { useSync } from '@/lib/sync/useSync'
import { pad2, splitDuration, useNow } from '@/lib/use-now'

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
  const nowMs = useNow()

  if (data === null) {
    return <p className="text-muted py-10 text-sm">読み込み中…</p>
  }

  const isEmpty =
    data.reservations.totalCount === 0 &&
    data.shoots.totalCount === 0 &&
    data.fees.totalCount === 0 &&
    data.today.length === 0 &&
    data.recent.length === 0

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ダッシュボード</h1>
        <p className="text-muted mt-1 text-sm">
          {phase === 'offline' ? 'オフライン（手元のデータを表示しています）' : '今やることと、直近の撮影です。'}
        </p>
      </header>

      <TodayShoots shoots={data.today} nowMs={nowMs} />

      {/* 上段: 3つのリマインド */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ReminderCard
          title="予約リマインド"
          count={data.reservations.totalCount}
          tone={data.reservations.overdueCount > 0 ? 'alert' : 'neutral'}
          summary={
            data.reservations.overdueCount > 0
              ? `可否未決のまま超過 ${data.reservations.overdueCount}`
              : undefined
          }
          emptyText="可否待ちの予約はありません"
        >
          {data.reservations.items.map((r) => (
            <ReminderRow
              key={r.slotId}
              primary={<Primary item={r} />}
              secondary={[r.venueName, r.modelNames.join('・')].filter(Boolean).join(' / ') || undefined}
              trailing={<BookingCountdown iso={r.bookingOpensAt} nowMs={nowMs} />}
            />
          ))}
        </ReminderCard>

        <ReminderCard
          title="料金リマインド"
          count={data.fees.totalCount}
          tone={data.fees.overdueCount > 0 ? 'alert' : 'neutral'}
          summary={data.fees.totalCount > 0 ? `合計 ${yen(data.fees.totalAmount)}` : undefined}
          emptyText="支払い予定の撮影料はありません"
        >
          {data.fees.items.map((f) => (
            <ReminderRow
              key={f.slotId}
              primary={<FeePrimary item={f} />}
              secondary={f.modelNames.join('・') || undefined}
              trailing={<FeeDue item={f} />}
            />
          ))}
        </ReminderCard>

        <ReminderCard
          title="撮影リマインド"
          count={data.shoots.totalCount}
          emptyText="撮影前の撮影はありません"
        >
          {data.shoots.items.map((s) => (
            <ReminderRow
              key={s.slotId}
              primary={<Primary item={s} />}
              secondary={[s.venueName, s.modelNames.join('・')].filter(Boolean).join(' / ') || undefined}
              trailing={<DateTime iso={s.startAt} daysUntil={s.daysUntil} />}
            />
          ))}
        </ReminderCard>
      </div>

      {/* 下段: 直近の撮影済み */}
      <section className="bg-surface border-border rounded-lg border">
        <header className="border-border flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b px-4 py-3">
          <h2 className="text-sm font-medium whitespace-nowrap">直近の撮影済みデータ</h2>
          <span className="text-muted text-xs">撮影管理の完了分と、遡及登録した過去分</span>
        </header>

        {data.recent.length === 0 ? (
          <p className="text-muted px-4 py-8 text-center text-xs">撮影済みのデータはまだありません</p>
        ) : (
          <>
            <RecentList rows={data.recent} />
            <RecentTable rows={data.recent} />
          </>
        )}
      </section>

      {isEmpty && <SetupHint />}
    </div>
  )
}

/** 保管先の表示。保管先パス、ストレージURLの件数、未登録のどれか */
function StorageSummary({ row }: { row: ShootSummary }) {
  if (row.storagePath) {
    return (
      <span className="block max-w-[14rem] truncate font-mono text-xs" title={row.storagePath}>
        {row.storageLabel && <span className="text-muted">[{row.storageLabel}] </span>}
        {row.storagePath}
      </span>
    )
  }
  if (row.storageUrls.length > 0) {
    return (
      <span className="text-muted block text-xs" title={row.storageUrls.join('\n')}>
        URL {row.storageUrls.length}件
      </span>
    )
  }
  return <span className="text-amber-600 dark:text-amber-400">未登録</span>
}

/** スマホ向け。表は横に広く、スマホでは横スクロールになるため1件ずつ縦に並べる */
function RecentList({ rows }: { rows: ShootSummary[] }) {
  return (
    <ul className="divide-border divide-y sm:hidden">
      {rows.map((r) => (
        <li key={`${r.source}:${r.sourceId}`} className="px-4 py-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-medium">
              {r.title}
              {r.slotNo !== null && <span className="text-muted"> ({r.slotNo}部)</span>}
            </span>
            <span className="text-muted shrink-0 text-xs tabular-nums">{r.shootDate}</span>
          </div>
          <p className="text-muted mt-0.5 truncate text-xs">
            {[r.modelNames.join('・'), r.venueName].filter(Boolean).join(' / ') || '—'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="flex min-w-0 items-center gap-1">
              <span className="text-muted shrink-0">保管先</span>
              <StorageSummary row={r} />
            </span>
            <span className="flex items-center gap-1">
              <span className="text-muted">バックアップ</span>
              {r.backedUpAt ? (
                <span className="tabular-nums">{r.backedUpAt.slice(0, 10)}</span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">未</span>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function RecentTable({ rows }: { rows: ShootSummary[] }) {
  return (
    // スマホでは RecentList を出す
    <div className="hidden overflow-x-auto sm:block">
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
                <StorageSummary row={r} />
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

const STAGE_LABEL: Record<ReminderStage, string> = {
  awaiting_decision: '可否待ち',
  overdue_decision: '可否未決',
  before_shoot: '撮影前',
}

/** 工程が一目で分かるようタイトルの前にバッジを出す */
function Primary({ item }: { item: ReminderItem }) {
  const urgent = item.stage === 'overdue_decision'
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
          urgent
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
            : 'bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-navy-100'
        }`}
      >
        {STAGE_LABEL[item.stage]}
      </span>
      <span className="truncate">
        {item.title}
        {item.label && <span className="text-muted">（{item.label}）</span>}
      </span>
    </span>
  )
}

/**
 * 予約リマインドの日時。予約日時と、そこまでの日数を出す。
 * 1日未満になったら、残り時間を秒単位で刻む。
 */
/** 時間の残りを「あと HH:MM:SS」にする。24時間以上は日数 */
function remainText(remainMs: number): string {
  const { days, hours, minutes, seconds } = splitDuration(remainMs)
  return days > 0
    ? `${days}日 ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
    : `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

/**
 * 本日の撮影。開始までは開始までの時間、始まったら終了までの時間を出し、
 * 終わった撮影は一覧から外す。1秒ごとの時刻（nowMs）で判定するので、開いたままでも切り替わる
 */
function TodayShoots({ shoots, nowMs }: { shoots: TodayShoot[]; nowMs: number | null }) {
  // 時刻が取れるまで（マウント前）は、クエリが返した「終わっていない撮影」をそのまま出す
  const visible = shoots.filter((s) => nowMs === null || new Date(s.endAt).getTime() > nowMs)

  return (
    <section className="bg-surface border-border rounded-lg border">
      <header className="border-border flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">本日の撮影</h2>
        <span className="bg-navy-100 text-navy-700 dark:text-navy-100 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums dark:bg-white/10">
          {visible.length}
        </span>
      </header>
      {visible.length === 0 ? (
        <p className="text-muted px-4 py-6 text-center text-xs">本日の撮影はありません</p>
      ) : (
        <ul className="divide-border divide-y">
          {visible.map((s) => {
            const started = nowMs !== null && new Date(s.startAt).getTime() <= nowMs
            const targetMs = new Date(started ? s.endAt : s.startAt).getTime()
            return (
              <li key={s.slotId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{s.title}</span>
                  <span className="text-muted block truncate text-xs">
                    {timeOf(s.startAt)}〜{timeOf(s.endAt)}
                    {[s.venueName, s.modelNames.join('・')].filter(Boolean).length > 0 &&
                      ` / ${[s.venueName, s.modelNames.join('・')].filter(Boolean).join(' / ')}`}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block text-xs ${
                      started ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'
                    }`}
                  >
                    {nowMs === null ? '—' : started ? '終了まで' : '開始まで'}
                  </span>
                  <span className="block font-medium whitespace-nowrap tabular-nums">
                    {nowMs === null ? '—' : remainText(targetMs - nowMs)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function BookingCountdown({ iso, nowMs }: { iso: string | null; nowMs: number | null }) {
  if (!iso) return <span className="text-muted text-xs">予約日時 未設定</span>
  const remainMs = nowMs === null ? null : new Date(iso).getTime() - nowMs
  const when = new Date(iso).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  let remain: React.ReactNode = '—'
  let tone = 'text-muted'
  if (remainMs !== null) {
    if (remainMs <= 0) {
      remain = '受付中'
      tone = 'text-emerald-600 dark:text-emerald-400'
    } else if (remainMs < 86_400_000) {
      const { hours, minutes, seconds } = splitDuration(remainMs)
      remain = `あと ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
      tone = remainMs < 3_600_000 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'
    } else {
      remain = `あと${splitDuration(remainMs).days}日`
    }
  }
  return (
    <span className="text-right">
      <span className="block whitespace-nowrap">{when}</span>
      <span className={`block whitespace-nowrap tabular-nums ${tone}`}>{remain}</span>
    </span>
  )
}

function DateTime({ iso, daysUntil }: { iso: string; daysUntil: number }) {
  const d = new Date(iso)
  const overdue = daysUntil < 0
  return (
    <span className="text-right">
      <span className="block whitespace-nowrap">
        {d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </span>
      <span
        className={`block whitespace-nowrap ${overdue ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}
      >
        {overdue ? `${-daysUntil}日経過` : daysUntil === 0 ? '本日' : `あと${daysUntil}日`}
      </span>
    </span>
  )
}

const FEE_TIMING_LABEL: Record<FeeReminderItem['timing'], string> = {
  on_the_day: '当日',
  in_advance: '事前',
}

function FeePrimary({ item }: { item: FeeReminderItem }) {
  const urgent = item.daysUntil === null || item.daysUntil < 0
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
          urgent
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
            : 'bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-navy-100'
        }`}
      >
        {FEE_TIMING_LABEL[item.timing]}
      </span>
      <span className="truncate">{item.title}</span>
    </span>
  )
}

/** 期日と撮影料。当日は撮影開始時刻、事前は支払日 */
function FeeDue({ item }: { item: FeeReminderItem }) {
  const when =
    item.dueAt !== null
      ? new Date(item.dueAt).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : item.dueDate !== null
        ? new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
          })
        : '支払日未定'
  const overdue = item.daysUntil === null || item.daysUntil < 0
  return (
    <span className="text-right">
      <span className="block whitespace-nowrap">
        {when} {item.amount > 0 ? yen(item.amount) : '金額未入力'}
      </span>
      {item.daysUntil !== null && (
        <span
          className={`block whitespace-nowrap ${overdue ? 'text-amber-600 dark:text-amber-400' : 'text-muted'}`}
        >
          {overdue
            ? `${-item.daysUntil}日経過`
            : item.daysUntil === 0
              ? '本日'
              : `あと${item.daysUntil}日`}
        </span>
      )}
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
