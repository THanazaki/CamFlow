'use client'

import Link from 'next/link'

import { layoutTimeline, type TimelineEntry } from '@/lib/timeline'

const LANE_HEIGHT = 44
const KIND_STYLE: Record<TimelineEntry['kind'], string> = {
  confirmed:
    'bg-navy-100 text-navy-900 border-navy-300 dark:bg-navy-500/30 dark:text-navy-50 dark:border-navy-400/40',
  past: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-white/10 dark:text-zinc-300 dark:border-white/20',
}

/**
 * 1日の撮影を時間軸に並べたタイムチャート。重なる撮影は段を分ける。
 * nowMinutes を渡すと、その時刻に現在線を引く（その日が今日のときだけ渡す）。
 * 狭い画面では横にスクロールする。
 */
export function DayTimeline({
  entries,
  nowMinutes,
  emptyText = '撮影はありません',
}: {
  entries: TimelineEntry[]
  nowMinutes?: number | null
  emptyText?: string
}) {
  const { placed, unscheduled, rangeStart, rangeEnd, laneCount } = layoutTimeline(entries)
  if (entries.length === 0) {
    return <p className="text-muted py-4 text-center text-xs">{emptyText}</p>
  }

  const span = rangeEnd - rangeStart
  const pct = (m: number) => `${((m - rangeStart) / span) * 100}%`
  const hours: number[] = []
  for (let h = rangeStart / 60; h <= rangeEnd / 60; h++) hours.push(h)
  const showNow = nowMinutes != null && nowMinutes >= rangeStart && nowMinutes <= rangeEnd

  return (
    <div className="space-y-3">
      {placed.length > 0 && (
        <div className="overflow-x-auto">
          <div className="relative min-w-[36rem]">
            {/* 時刻の目盛り */}
            <div className="text-muted relative h-5 text-[10px] tabular-nums">
              {hours.map((h) => (
                <span key={h} className="absolute -translate-x-1/2" style={{ left: pct(h * 60) }}>
                  {h}:00
                </span>
              ))}
            </div>
            <div
              className="border-border relative border-y"
              style={{ height: Math.max(1, laneCount) * LANE_HEIGHT + 8 }}
            >
              {hours.map((h) => (
                <span
                  key={h}
                  aria-hidden
                  className="bg-border absolute top-0 bottom-0 w-px"
                  style={{ left: pct(h * 60) }}
                />
              ))}
              {placed.map((p) => (
                <Link
                  key={p.entry.id}
                  href={p.entry.href}
                  title={`${p.entry.startTime}〜${p.entry.endTime ?? ''} ${p.entry.title}`}
                  className={`absolute block overflow-hidden rounded border px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95 ${KIND_STYLE[p.entry.kind]}`}
                  style={{
                    left: pct(p.start),
                    width: `${((p.end - p.start) / span) * 100}%`,
                    top: p.lane * LANE_HEIGHT + 4,
                    height: LANE_HEIGHT - 4,
                  }}
                >
                  <span className="block truncate font-medium">{p.entry.title}</span>
                  <span className="block truncate tabular-nums opacity-80">
                    {p.entry.startTime}〜{p.entry.endTime ?? ''}
                  </span>
                </Link>
              ))}
              {showNow && (
                <span
                  aria-label="現在時刻"
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500"
                  style={{ left: pct(nowMinutes) }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {unscheduled.length > 0 && (
        <ul className="text-xs">
          {unscheduled.map((e) => (
            <li key={e.id} className="flex gap-2 py-1">
              <span className="text-muted shrink-0">時刻未設定</span>
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
    </div>
  )
}
