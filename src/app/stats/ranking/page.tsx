'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'

import { rankBy } from '@/lib/ranking'
import { loadHistoryStats } from '@/lib/queries/stats'

type Tab = 'models' | 'organizers'

const TABS: { key: Tab; label: string }[] = [
  { key: 'models', label: 'モデル' },
  { key: 'organizers', label: '撮影会' },
]

/** ランキング。撮影実績（予定は含めない）の多い順に、モデルと撮影会をタブで切り替えて表示する */
export default function RankingPage() {
  const stats = useLiveQuery(() => loadHistoryStats(), [], null)
  const [tab, setTab] = useState<Tab>('models')

  const rows =
    stats === null
      ? []
      : tab === 'models'
        ? rankBy(stats.models, (m) => m.shootCount).map((r) => ({
            id: r.item.id,
            rank: r.rank,
            name: r.item.name,
            count: r.item.shootCount,
            lastDate: r.item.lastDate,
          }))
        : rankBy(stats.organizers, (o) => o.modelCount).map((r) => ({
            id: r.item.id,
            rank: r.rank,
            name: r.item.name,
            count: r.item.modelCount,
            lastDate: r.item.lastDate,
          }))
  const unit = tab === 'models' ? '撮影回数' : '撮影モデル数'

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ランキング</h1>
        <p className="text-muted mt-1 text-sm">
          撮影実績の多い順に、上位20位までを表示します（撮影予定は含めません）。同じ数は同順位です。
        </p>
      </header>

      <div
        role="tablist"
        aria-label="ランキングの切り替え"
        className="border-border flex gap-1 border-b"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? 'border-navy-600 text-foreground'
                : 'text-muted hover:text-foreground border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {stats === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : (
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {rows.length === 0 ? (
            <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
              撮影実績のある{tab === 'models' ? 'モデル' : '撮影会'}はまだありません
            </div>
          ) : (
            <ol className="bg-surface border-border divide-border divide-y rounded-lg border">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span
                    className={`w-8 shrink-0 text-center text-base font-semibold tabular-nums ${
                      row.rank <= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-muted'
                    }`}
                  >
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{row.name}</span>
                    <span className="text-muted block text-xs tabular-nums">
                      最新 {row.lastDate ?? '—'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="text-muted block text-xs">{unit}</span>
                    <span className="block font-semibold tabular-nums">{row.count}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
