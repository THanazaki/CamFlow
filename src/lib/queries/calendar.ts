import type { CalendarEvent } from '@/lib/calendar'

import { loadShootArchive, loadUpcomingShoots, shootRecordHref, type ShootRecord } from './archives'
import { loadReservationSchedule } from './reservations'

function fromRecord(r: ShootRecord, kind: 'confirmed' | 'past'): CalendarEvent {
  return {
    kind,
    date: r.shootDate,
    title: r.modelNames.length > 0 ? `${r.modelNames.join('・')}（${r.title}）` : r.title,
    time: r.startTime,
    href: shootRecordHref('detail', r),
  }
}

/**
 * カレンダーに載せる予定。
 * 予約（可否が未決定・予約失敗）は撮影日に、確定した撮影と過去の撮影も撮影日に出す。
 * 過去の撮影は撮影情報検索と同じ範囲（`loadShootArchive`）なので、遡及登録も含む。
 */
export async function loadCalendarEvents(now: Date = new Date()): Promise<CalendarEvent[]> {
  const [reservations, upcoming, archive] = await Promise.all([
    loadReservationSchedule(),
    loadUpcomingShoots(now),
    loadShootArchive(now),
  ])
  return [
    ...reservations.map(
      (r): CalendarEvent => ({
        kind: 'reservation',
        date: r.shootDate,
        title: r.modelNames.length > 0 ? `${r.modelNames.join('・')}（${r.title}）` : r.title,
        time: null,
        muted: r.failed,
        href: `/reservations/edit?id=${encodeURIComponent(r.sessionId)}`,
      }),
    ),
    ...upcoming.map((r) => fromRecord(r, 'confirmed')),
    ...archive.map((r) => fromRecord(r, 'past')),
  ]
}
