/** 枠の時刻の判定に使う項目 */
interface SlotTime {
  start_at: string
  planned_minutes: number
  extended_minutes: number
  shoot_status: string
}

/** 撮影の終了時刻（ms）。開始 + 予定時間 + 延長。欠けている値はサーバの既定値で補う */
export function slotEndMs(slot: SlotTime): number {
  const minutes = (slot.planned_minutes ?? 30) + (slot.extended_minutes ?? 0)
  return new Date(slot.start_at).getTime() + minutes * 60_000
}

/** 撮影が終わったか。撮影済みの枠は、予定の終了時刻より前でも終わったものとして扱う */
export function isSlotFinished(slot: SlotTime, now: Date = new Date()): boolean {
  return slot.shoot_status === 'shot' || slotEndMs(slot) <= now.getTime()
}
