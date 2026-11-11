import { describe, expect, it } from 'vitest'

import { buildMonthGrid, groupEventsByDate, shiftMonth, type CalendarEvent } from '../calendar'

describe('buildMonthGrid', () => {
  it('日曜始まりで、前後の月の日を足して週の単位にする', () => {
    const grid = buildMonthGrid(2026, 11) // 2026-11-01 は日曜、30日は月曜
    expect(grid).toHaveLength(35)
    expect(grid[0]).toEqual({ date: '2026-11-01', day: 1, inMonth: true })
    expect(grid[34]).toEqual({ date: '2026-12-05', day: 5, inMonth: false })
  })

  it('月初が日曜でなければ前の月の日から始まる', () => {
    const grid = buildMonthGrid(2026, 12) // 2026-12-01 は火曜
    expect(grid[0]).toEqual({ date: '2026-11-29', day: 29, inMonth: false })
    expect(grid.filter((c) => c.inMonth)).toHaveLength(31)
    expect(grid.length % 7).toBe(0)
  })
})

describe('shiftMonth', () => {
  it('年をまたぐ', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('groupEventsByDate', () => {
  it('日付ごとにまとめ、時刻が早い順に並べる。時刻なしは後ろ', () => {
    const e = (date: string, time: string | null, title: string): CalendarEvent => ({
      kind: 'confirmed',
      date,
      title,
      time,
      href: '/',
    })
    const map = groupEventsByDate([e('2026-11-02', null, 'c'), e('2026-11-02', '15:00', 'b'), e('2026-11-02', '09:00', 'a'), e('2026-11-03', null, 'd')])
    expect(map.get('2026-11-02')?.map((x) => x.title)).toEqual(['a', 'b', 'c'])
    expect(map.get('2026-11-03')).toHaveLength(1)
  })
})
