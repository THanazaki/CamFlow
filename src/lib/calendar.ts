/** カレンダーの1日の予定 */
export interface CalendarEvent {
  kind: 'reservation' | 'confirmed' | 'past'
  /** YYYY-MM-DD */
  date: string
  title: string
  /** HH:mm。分からなければ null */
  time: string | null
  /** 予約失敗など、薄く出す予定 */
  muted?: boolean
  href: string
}

export interface CalendarCell {
  /** YYYY-MM-DD */
  date: string
  day: number
  /** 表示中の月か。前後の月の日は false */
  inMonth: boolean
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateString(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}

/** month は 1〜12。日曜始まりで、前後の月の日を足して7の倍数の日数にした一覧 */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1)
  const start = new Date(year, month - 1, 1 - first.getDay())
  const daysInMonth = new Date(year, month, 0).getDate()
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7)
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return {
      date: toDateString(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() === month - 1,
    }
  })
}

/** 月を n か月ずらす。month は 1〜12 */
export function shiftMonth(year: number, month: number, n: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + n, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** 日付ごとにまとめる。同じ日の中は、時刻が早い順（時刻なしは後ろ） */
export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const list = map.get(e.date)
    if (list) list.push(e)
    else map.set(e.date, [e])
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  }
  return map
}
