'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { localToday } from '@/lib/actions/archives'
import {
  buildMonthGrid,
  groupEventsByDate,
  shiftMonth,
  type CalendarEvent,
} from '@/lib/calendar'
import { loadCalendarEvents } from '@/lib/queries/calendar'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']
/** セルに並べる予定の数。超えた分は「他n件」にして、日をタップすると下に全部出す */
const CELL_LIMIT = 2

const KIND_LABEL: Record<CalendarEvent['kind'], string> = {
  reservation: '予約',
  confirmed: '確定',
  past: '撮影済',
}
const KIND_STYLE: Record<CalendarEvent['kind'], string> = {
  reservation: 'bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200',
  confirmed: 'bg-navy-100 text-navy-900 dark:bg-navy-500/30 dark:text-navy-50',
  past: 'bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-300',
}

/**
 * カレンダー。予約・確定した撮影・過去の撮影を、撮影日の欄に月表示で並べる。
 * 日付をタップするとその日の予定が下に出て、そこから各画面を開ける。
 */
export default function CalendarPage() {
  const today = localToday()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7)))
  const [selected, setSelected] = useState(today)

  const events = useLiveQuery(() => loadCalendarEvents(), [], null)
  const byDate = useMemo(() => groupEventsByDate(events ?? []), [events])
  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const selectedEvents = byDate.get(selected) ?? []

  const go = (n: number) => {
    const next = shiftMonth(year, month, n)
    setYear(next.year)
    setMonth(next.month)
  }
  const goToday = () => {
    setYear(Number(today.slice(0, 4)))
    setMonth(Number(today.slice(5, 7)))
    setSelected(today)
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">カレンダー</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="前の月"
            className="border-border hover:bg-navy-50 tap-target rounded-md border px-3 py-1.5 text-sm dark:hover:bg-white/5"
          >
            ‹
          </button>
          <span className="min-w-28 text-center text-base font-medium tabular-nums">
            {year}年{month}月
          </span>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="次の月"
            className="border-border hover:bg-navy-50 tap-target rounded-md border px-3 py-1.5 text-sm dark:hover:bg-white/5"
          >
            ›
          </button>
          <button
            type="button"
            onClick={goToday}
            className="border-border hover:bg-navy-50 tap-target rounded-md border px-3 py-1.5 text-sm dark:hover:bg-white/5"
          >
            今日
          </button>
        </div>
      </header>

      <p className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(KIND_LABEL) as CalendarEvent['kind'][]).map((k) => (
          <span key={k} className={`rounded px-2 py-0.5 ${KIND_STYLE[k]}`}>
            {KIND_LABEL[k]}
          </span>
        ))}
      </p>

      {events === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <div className="bg-navy-50 grid grid-cols-7 text-center text-xs dark:bg-white/5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className={`py-1.5 ${i === 0 ? 'text-red-600 dark:text-red-400' : i === 6 ? 'text-blue-600 dark:text-blue-400' : ''}`}
              >
                {w}
              </div>
            ))}
          </div>
          <div className="border-border divide-border grid grid-cols-7 divide-x divide-y border-t">
            {grid.map((cell) => {
              const list = byDate.get(cell.date) ?? []
              const isToday = cell.date === today
              const isSelected = cell.date === selected
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelected(cell.date)}
                  aria-label={`${cell.date} 予定${list.length}件`}
                  aria-pressed={isSelected}
                  className={`flex min-h-20 min-w-0 flex-col gap-0.5 p-1 text-left align-top sm:min-h-24 ${
                    cell.inMonth ? '' : 'opacity-40'
                  } ${isSelected ? 'bg-navy-50 dark:bg-white/10' : 'hover:bg-navy-50/60 dark:hover:bg-white/5'}`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs tabular-nums ${
                      isToday ? 'bg-navy-900 font-semibold text-white' : ''
                    }`}
                  >
                    {cell.day}
                  </span>
                  {list.slice(0, CELL_LIMIT).map((e, i) => (
                    <span
                      key={i}
                      className={`block truncate rounded px-1 text-[10px] leading-4 ${KIND_STYLE[e.kind]} ${e.muted ? 'opacity-50' : ''}`}
                    >
                      {e.title}
                    </span>
                  ))}
                  {list.length > CELL_LIMIT && (
                    <span className="text-muted text-[10px]">他{list.length - CELL_LIMIT}件</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <section className="bg-surface border-border rounded-lg border p-4">
        <h2 className="text-sm font-semibold tabular-nums">{selected} の予定</h2>
        {selectedEvents.length === 0 ? (
          <p className="text-muted mt-2 text-sm">予定はありません。</p>
        ) : (
          <ul className="divide-border mt-2 divide-y text-sm">
            {selectedEvents.map((e, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${KIND_STYLE[e.kind]}`}>
                  {e.muted ? '予約失敗' : KIND_LABEL[e.kind]}
                </span>
                {e.time && <span className="text-muted tabular-nums">{e.time}</span>}
                <Link
                  href={e.href}
                  className="text-navy-600 dark:text-navy-200 min-w-0 truncate underline underline-offset-2"
                >
                  {e.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
