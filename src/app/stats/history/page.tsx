'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { loadHistoryStats } from '@/lib/queries/stats'

/** 過去撮影情報。モデル別と撮影会別の撮影実績を表示する */
export default function HistoryStatsPage() {
  const stats = useLiveQuery(() => loadHistoryStats(), [], null)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">過去撮影情報</h1>
        <p className="text-muted mt-1 text-sm">
          撮影日を過ぎた確定済みの撮影と、過去撮影登録で登録した撮影の実績です。
        </p>
      </header>

      {stats === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : (
        <>
          <StatsTable
            title="モデル別情報"
            columns={['モデル名', '撮影回数', '初撮影日', '最新撮影日']}
            rows={stats.models.map((m) => ({
              id: m.id,
              name: m.name,
              count: m.shootCount,
              firstDate: m.firstDate,
              lastDate: m.lastDate,
            }))}
            emptyText="撮影実績のあるモデルはまだありません"
          />
          <StatsTable
            title="撮影会別情報"
            hint="撮影会名を入力した撮影だけを集計します"
            columns={['撮影会名', '撮影モデル数', '初利用日', '最新利用日']}
            rows={stats.organizers.map((o) => ({
              id: o.id,
              name: o.name,
              count: o.modelCount,
              firstDate: o.firstDate,
              lastDate: o.lastDate,
            }))}
            emptyText="撮影実績のある撮影会はまだありません"
          />
        </>
      )}
    </div>
  )
}

function StatsTable({
  title,
  hint,
  columns,
  rows,
  emptyText,
}: {
  title: string
  hint?: string
  columns: [string, string, string, string]
  rows: { id: string; name: string; count: number; firstDate: string; lastDate: string }[]
  emptyText: string
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-muted mt-0.5 text-xs">{hint}</p>}
      </div>
      {rows.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          {emptyText}
        </div>
      ) : (
        <>
          {/* スマホではカード、それより広い画面では表 */}
          <ul className="space-y-2 sm:hidden">
            {rows.map((row) => (
              <li key={row.id} className="bg-surface border-border rounded-lg border px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 font-medium break-words">{row.name}</span>
                  <span className="shrink-0 text-sm tabular-nums">
                    <span className="text-muted mr-1 text-xs">{columns[1]}</span>
                    {row.count}
                  </span>
                </div>
                <dl className="text-muted mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums">
                  <div className="flex gap-1">
                    <dt>{columns[2]}</dt>
                    <dd className="text-foreground">{row.firstDate}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>{columns[3]}</dt>
                    <dd className="text-foreground">{row.lastDate}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        <div className="bg-surface border-border hidden overflow-x-auto rounded-lg border sm:block">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-border text-muted border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  {columns[0]}
                </th>
                <th scope="col" className="w-28 px-4 py-2.5 text-right font-medium">
                  {columns[1]}
                </th>
                <th scope="col" className="w-32 px-4 py-2.5 font-medium">
                  {columns[2]}
                </th>
                <th scope="col" className="w-32 px-4 py-2.5 font-medium">
                  {columns[3]}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium break-words">{row.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.count}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{row.firstDate}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">{row.lastDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  )
}
