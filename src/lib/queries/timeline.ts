import type { TimelineEntry } from '@/lib/timeline'

import { loadShootArchive, loadUpcomingShoots, shootRecordHref, type ShootRecord } from './archives'

function toEntry(r: ShootRecord, kind: TimelineEntry['kind']): TimelineEntry {
  return {
    id: `${r.source}:${r.id}`,
    kind,
    title: r.title,
    startTime: r.startTime,
    endTime: r.endTime,
    sub: [r.venueName, r.modelNames.join('・')].filter(Boolean).join(' / ') || undefined,
    href: shootRecordHref('detail', r),
  }
}

/**
 * 指定した日（YYYY-MM-DD）の撮影。タイムチャート用。
 * 確定済みでこれからの撮影（loadUpcomingShoots）と撮影済み・遡及登録（loadShootArchive）を合わせる。
 * 予約段階の撮影は、撮影の時刻がまだ決まっていないので含めない。
 */
export async function loadDayTimeline(
  date: string,
  now: Date = new Date(),
): Promise<TimelineEntry[]> {
  const [upcoming, archive] = await Promise.all([loadUpcomingShoots(now), loadShootArchive(now)])
  return [
    ...upcoming.filter((r) => r.shootDate === date).map((r) => toEntry(r, 'confirmed')),
    ...archive.filter((r) => r.shootDate === date).map((r) => toEntry(r, 'past')),
  ]
}
