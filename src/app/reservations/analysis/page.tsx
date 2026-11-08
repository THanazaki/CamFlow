'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { loadReservationOutcomes } from '@/lib/queries/reservations'

const COLUMNS = ['モデル名', '予約成功回数', '予約失敗回数', '最近の成功日時', '最近の失敗日時', '最近の失敗理由']

/** 予約成否分析。予約情報に入れたモデルごとの、予約の成功・失敗を表示する */
export default function ReservationAnalysisPage() {
  const rows = useLiveQuery(() => loadReservationOutcomes(), [], null)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">予約成否分析</h1>
        <p className="text-muted mt-1 text-sm">
          予約スケジュールで「予約成功」「予約失敗」を押した予約を、モデルごとに数えます。日時は予約開始日時です。最近の失敗理由は、最近の失敗にあたる予約で入力した理由です。
          予約成功は、確定撮影情報入力で確定したものから数えます。
        </p>
      </header>

      {rows === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : rows.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          予約の成否を登録したモデルはまだありません
        </div>
      ) : (
        <>
          {/* スマホではカード、それより広い画面では表 */}
          <ul className="space-y-2 sm:hidden">
            {rows.map((row) => (
              <li
                key={row.modelId}
                className="bg-surface border-border rounded-lg border px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-medium break-words">{row.modelName}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <span className="text-muted mr-1 text-xs">成功</span>
                    {row.successCount}
                    <span className="text-muted mr-1 ml-3 text-xs">失敗</span>
                    {row.failureCount}
                  </span>
                </div>
                <dl className="text-muted mt-1 space-y-0.5 text-xs tabular-nums">
                  <div className="flex gap-1">
                    <dt>{COLUMNS[3]}</dt>
                    <dd className="text-foreground">{formatDateTime(row.lastSuccessAt)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>{COLUMNS[4]}</dt>
                    <dd className="text-foreground">{formatDateTime(row.lastFailureAt)}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="shrink-0">{COLUMNS[5]}</dt>
                    <dd className="text-foreground min-w-0 break-words whitespace-pre-wrap">
                      {row.lastFailureReason ?? '—'}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="bg-surface border-border hidden overflow-x-auto rounded-lg border sm:block">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-border text-muted border-b text-xs">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    {COLUMNS[0]}
                  </th>
                  <th scope="col" className="w-32 px-4 py-2.5 text-right font-medium">
                    {COLUMNS[1]}
                  </th>
                  <th scope="col" className="w-32 px-4 py-2.5 text-right font-medium">
                    {COLUMNS[2]}
                  </th>
                  <th scope="col" className="w-44 px-4 py-2.5 font-medium">
                    {COLUMNS[3]}
                  </th>
                  <th scope="col" className="w-44 px-4 py-2.5 font-medium">
                    {COLUMNS[4]}
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    {COLUMNS[5]}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {rows.map((row) => (
                  <tr key={row.modelId}>
                    <td className="px-4 py-3 font-medium break-words">{row.modelName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.successCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.failureCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      {formatDateTime(row.lastSuccessAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                      {formatDateTime(row.lastFailureAt)}
                    </td>
                    <td className="px-4 py-3 break-words whitespace-pre-wrap">
                      {row.lastFailureReason ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
