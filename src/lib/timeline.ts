/** タイムチャートの1本の枠（1日の中の撮影1件） */
export interface TimelineEntry {
  id: string
  /** 確定済みでこれから / 撮影済み */
  kind: 'confirmed' | 'past'
  title: string
  /** HH:mm。時刻が未入力なら null（チャートには載せず、一覧に出す） */
  startTime: string | null
  /** HH:mm。未入力なら開始 + 60分で描く */
  endTime: string | null
  /** 会場・モデルなどの補足 */
  sub?: string
  href: string
}

export interface PlacedEntry {
  entry: TimelineEntry
  /** 0:00 からの分 */
  start: number
  end: number
  /** 重なりを避けた段（0 始まり） */
  lane: number
}

export interface TimelineLayout {
  placed: PlacedEntry[]
  /** 時刻が無く、チャートに載せられない撮影 */
  unscheduled: TimelineEntry[]
  /** 軸の範囲（分、時の境目） */
  rangeStart: number
  rangeEnd: number
  laneCount: number
}

/** 時刻の描けない撮影に仮で当てる長さ（分） */
const DEFAULT_MINUTES = 60
/** 軸の最小の長さ（時間）。1件だけでも目盛りが読めるようにする */
const MIN_SPAN_HOURS = 6

export function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * 1日分の撮影を、時間軸に置く位置と段に直す。
 * 重なる撮影は別の段に分ける。軸は撮影の前後に1時間の余白を取った範囲（最小6時間）。
 * 日をまたぐ撮影は 24:00 で切る。
 */
export function layoutTimeline(entries: TimelineEntry[]): TimelineLayout {
  const unscheduled: TimelineEntry[] = []
  const items: Omit<PlacedEntry, 'lane'>[] = []
  for (const entry of entries) {
    const start = toMinutes(entry.startTime)
    if (start === null) {
      unscheduled.push(entry)
      continue
    }
    const rawEnd = toMinutes(entry.endTime)
    const end = Math.min(
      24 * 60,
      rawEnd !== null && rawEnd > start ? rawEnd : start + DEFAULT_MINUTES,
    )
    items.push({ entry, start, end })
  }
  items.sort((a, b) => a.start - b.start || a.end - b.end)

  const laneEnds: number[] = []
  const placed: PlacedEntry[] = items.map((it) => {
    let lane = laneEnds.findIndex((e) => e <= it.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(it.end)
    } else {
      laneEnds[lane] = it.end
    }
    return { ...it, lane }
  })

  let rangeStart = 9 * 60
  let rangeEnd = 18 * 60
  if (placed.length > 0) {
    rangeStart = Math.max(0, Math.floor(Math.min(...placed.map((p) => p.start)) / 60 - 1)) * 60
    rangeEnd = Math.min(24, Math.ceil(Math.max(...placed.map((p) => p.end)) / 60 + 1)) * 60
  }
  if (rangeEnd - rangeStart < MIN_SPAN_HOURS * 60) {
    rangeEnd = Math.min(24 * 60, rangeStart + MIN_SPAN_HOURS * 60)
    rangeStart = Math.max(0, rangeEnd - MIN_SPAN_HOURS * 60)
  }
  return { placed, unscheduled, rangeStart, rangeEnd, laneCount: laneEnds.length }
}
