import { describe, expect, it } from 'vitest'

import { layoutTimeline, toMinutes, type TimelineEntry } from '../timeline'

const e = (id: string, s: string | null, en: string | null): TimelineEntry => ({
  id,
  kind: 'confirmed',
  title: id,
  startTime: s,
  endTime: en,
  href: '/',
})

describe('layoutTimeline', () => {
  it('時刻を分に直す', () => {
    expect(toMinutes('09:30')).toBe(570)
    expect(toMinutes(null)).toBeNull()
  })
  it('重なる撮影は別の段、重ならなければ同じ段', () => {
    const l = layoutTimeline([
      e('a', '10:00', '11:00'),
      e('b', '10:30', '12:00'),
      e('c', '11:00', '12:00'),
    ])
    expect(l.placed.map((p) => [p.entry.id, p.lane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ])
    expect(l.laneCount).toBe(2)
  })
  it('軸は前後1時間の余白。最小6時間', () => {
    const l = layoutTimeline([e('a', '10:00', '11:00')])
    expect([l.rangeStart, l.rangeEnd]).toEqual([9 * 60, 15 * 60])
    const m = layoutTimeline([e('a', '10:00', '16:00')])
    expect([m.rangeStart, m.rangeEnd]).toEqual([9 * 60, 17 * 60])
  })
  it('終了が無い・開始以前なら60分。日またぎは24時で切る。開始なしは別扱い', () => {
    const l = layoutTimeline([e('a', '10:00', null), e('b', '23:00', '01:00'), e('c', null, null)])
    expect(l.placed[0].end).toBe(11 * 60)
    expect(l.placed[1].end).toBe(24 * 60)
    expect(l.unscheduled.map((x) => x.id)).toEqual(['c'])
  })
  it('撮影が無ければ空', () => {
    expect(layoutTimeline([]).placed).toEqual([])
  })
})
