import { db } from '@/lib/db'

/** 確定撮影情報入力で「予約から選ぶ」ための候補 */
export interface ConfirmableReservation {
  sessionId: string
  label: string
  eventName: string
  modelName: string
  modelX: string
  modelInstagram: string
  concept: string
  venueName: string
  shootDate: string
  /** 予約時は仮置きなので、時刻が入っていれば初期値に使う */
  startTime: string
  endTime: string
}

function asRecord(value: unknown): Record<string, string> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {}
}

/** ローカル時刻の HH:mm */
function toTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * 可否がまだ決まっていない予約を、確定フォームの初期値として使える形で返す。
 * 撮影日の近い順。
 */
export async function loadConfirmableReservations(): Promise<ConfirmableReservation[]> {
  const [sessions, slots, slotModels, models, venues] = await Promise.all([
    db.sessions.toArray(),
    db.slots.toArray(),
    db.slot_models.toArray(),
    db.models.toArray(),
    db.venues.toArray(),
  ])

  const modelMap = new Map(models.map((m) => [m.id, m]))
  const venueMap = new Map(venues.map((v) => [v.id, v]))
  const liveSlots = slots.filter((s) => !s.deleted_at)

  return sessions
    .filter((s) => !s.deleted_at && s.status === 'planned')
    .map((session) => {
      const slot = liveSlots
        .filter((s) => s.session_id === session.id)
        .sort((a, b) => a.slot_no - b.slot_no)[0]
      const model = slot
        ? modelMap.get(slotModels.find((sm) => sm.slot_id === slot.id)?.model_id ?? '')
        : undefined
      const sns = asRecord(model?.sns_links)

      // 予約時の start_at は撮影日の 0 時を仮置きしている。
      // 0:00 のままなら未入力扱いにして、確定時に入れてもらう
      const start = slot ? toTime(slot.start_at) : ''
      const hasRealTime = start !== '00:00'
      const end =
        slot && hasRealTime
          ? toTime(new Date(new Date(slot.start_at).getTime() + slot.planned_minutes * 60_000).toISOString())
          : ''

      return {
        sessionId: session.id,
        label: `${session.session_date} ${session.title}${model ? ` / ${model.name}` : ''}`,
        eventName: session.title,
        modelName: model?.name ?? '',
        modelX: sns.x ?? '',
        modelInstagram: sns.instagram ?? '',
        concept: session.concept ?? '',
        venueName: session.venue_id
          ? (venueMap.get(session.venue_id)?.name ?? session.venue_name ?? '')
          : (session.venue_name ?? ''),
        shootDate: session.session_date,
        startTime: hasRealTime ? start : '',
        endTime: end,
      }
    })
    .sort((a, b) => a.shootDate.localeCompare(b.shootDate))
}
