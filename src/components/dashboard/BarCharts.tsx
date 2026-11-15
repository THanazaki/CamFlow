import type { DashboardCharts } from '@/lib/queries/stats'

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const monthLabel = (m: string) => `${Number(m.slice(5))}月`

function ChartCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface border-border rounded-lg border">
      <header className="border-border flex flex-wrap items-baseline justify-between gap-x-3 border-b px-4 py-3">
        <h2 className="text-sm font-medium whitespace-nowrap">{title}</h2>
        {note && <span className="text-muted text-xs">{note}</span>}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  )
}

/** 月別の縦棒グラフ（12本） */
function MonthlyBars({
  data,
  format,
}: {
  data: { month: string; value: number }[]
  format: (n: number) => string
}) {
  const max = Math.max(...data.map((d) => d.value), 0)
  if (max === 0) return <p className="text-muted py-6 text-center text-xs">この期間のデータはありません</p>
  return (
    <div className="flex h-44 items-end gap-1.5" role="img" aria-label="月別グラフ">
      {data.map((d) => (
        <div key={d.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-muted text-[10px] leading-none whitespace-nowrap">
            {d.value > 0 ? format(d.value) : ''}
          </span>
          <div
            className="bg-navy-600 dark:bg-navy-300 w-full rounded-t"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
            title={`${d.month}: ${format(d.value)}`}
          />
          <span className="text-muted text-[10px] leading-none">{monthLabel(d.month)}</span>
        </div>
      ))}
    </div>
  )
}

export function DashboardBarCharts({ charts }: { charts: DashboardCharts }) {
  const maxModel = Math.max(...charts.models.map((m) => m.shootCount), 1)
  const hidden = charts.modelTotal - charts.models.length
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="月別の撮影回数" note="過去12か月">
        <MonthlyBars data={charts.months.map((m) => ({ month: m.month, value: m.shootCount }))} format={(n) => `${n}`} />
      </ChartCard>

      <ChartCard title="撮影料" note="過去12か月 / 月ごとの合計">
        <MonthlyBars data={charts.months.map((m) => ({ month: m.month, value: m.fee }))} format={yen} />
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard
          title="モデルごとの撮影回数"
          note={hidden > 0 ? `過去12か月 / 上位${charts.models.length}人（他${hidden}人）` : '過去12か月'}
        >
          {charts.models.length === 0 ? (
            <p className="text-muted py-6 text-center text-xs">この期間のデータはありません</p>
          ) : (
            <ul className="space-y-2">
              {charts.models.map((m) => (
                <li key={m.id} className="flex items-center gap-3 text-xs">
                  <span className="w-28 shrink-0 truncate sm:w-40" title={m.name}>{m.name}</span>
                  <div className="bg-navy-50 dark:bg-navy-900 h-4 flex-1 rounded">
                    <div className="bg-navy-600 dark:bg-navy-300 h-full rounded" style={{ width: `${(m.shootCount / maxModel) * 100}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right tabular-nums">{m.shootCount}回</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
