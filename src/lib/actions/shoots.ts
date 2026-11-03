import { db } from '@/lib/db'
import { createRow, updateRow } from '@/lib/sync/mutations'
import type { Json } from '@/types/database'

/**
 * 確定撮影情報入力の書き込み。
 *
 * 予約（status='planned'）から確定させる場合と、予約を通していない撮影を
 * 直接登録する場合の両方を扱う。どちらも最終的に status='confirmed' の
 * session + slot + slot_models になる。
 */

export interface ShootConfirmInput {
  /** 予約から確定する場合はその session.id。新規なら空 */
  fromSessionId: string
  eventName: string
  modelName: string
  /** モデルの SNS。入力があればモデルマスタを更新する */
  modelX: string
  modelInstagram: string
  concept: string
  venueName: string
  /** 撮影日（YYYY-MM-DD） */
  shootDate: string
  /** 開始・終了時刻（HH:mm） */
  startTime: string
  endTime: string
  /** 撮影後に登録する保存先。空文字は捨てる */
  storageUrls: string[]
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

/** 日付 + 時刻（ローカル）を ISO に */
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

export function minutesBetween(date: string, start: string, end: string): number {
  const ms = new Date(`${date}T${end}:00`).getTime() - new Date(`${date}T${start}:00`).getTime()
  return Math.round(ms / 60_000)
}

export async function confirmShoot(
  userId: string,
  input: ShootConfirmInput,
): Promise<{ sessionId: string; slotId: string }> {
  const modelName = input.modelName.trim()
  const venueName = input.venueName.trim()
  const concept = input.concept.trim()
  const eventName = input.eventName.trim()

  const minutes = minutesBetween(input.shootDate, input.startTime, input.endTime)
  if (minutes <= 0) {
    throw new Error('終了時刻は開始時刻より後にしてください')
  }

  // ── モデル ───────────────────────────────────────────────
  const models = await db.models.toArray()
  const existingModel = models.find(
    (m) => !m.deleted_at && normalize(m.name) === normalize(modelName),
  )
  let modelId = existingModel?.id
  if (!modelId) {
    modelId = await createRow('models', {
      user_id: userId,
      name: modelName,
      sns_links: buildSnsLinks({}, input),
    })
  } else {
    // 既存モデルの SNS は、入力があったものだけ上書きする。
    // 空欄で既存のリンクを消さないため
    const merged = buildSnsLinks(asRecord(existingModel?.sns_links), input)
    if (JSON.stringify(merged) !== JSON.stringify(asRecord(existingModel?.sns_links))) {
      await updateRow('models', modelId, { sns_links: merged as Json })
    }
  }

  // ── 場所 ─────────────────────────────────────────────────
  const venues = await db.venues.toArray()
  const venue = venues.find((v) => !v.deleted_at && normalize(v.name) === normalize(venueName))

  const sessionValues = {
    title: eventName || concept || `${modelName} 撮影`,
    session_date: input.shootDate,
    // 予約が通った、または予約を通さず確定した撮影
    status: 'confirmed' as const,
    concept: concept || null,
    venue_id: venue?.id ?? null,
    venue_name: venueName || null,
  }

  const startAt = toIso(input.shootDate, input.startTime)
  const storageUrls = input.storageUrls.map((u) => u.trim()).filter(Boolean)

  // ── 予約から確定する ─────────────────────────────────────
  if (input.fromSessionId) {
    const sessionId = input.fromSessionId
    await updateRow('sessions', sessionId, sessionValues)

    // 予約時に仮置きした枠を実際の時刻に直す
    const slots = await db.slots.toArray()
    const slot = slots
      .filter((s) => !s.deleted_at && s.session_id === sessionId)
      .sort((a, b) => a.slot_no - b.slot_no)[0]

    if (!slot) {
      const slotId = await createSlot(userId, sessionId, startAt, minutes, storageUrls)
      await ensureSlotModel(userId, slotId, modelId)
      return { sessionId, slotId }
    }

    await updateRow('slots', slot.id, {
      start_at: startAt,
      planned_minutes: minutes,
      storage_urls: storageUrls,
    })
    await ensureSlotModel(userId, slot.id, modelId)
    return { sessionId, slotId: slot.id }
  }

  // ── 予約を通さず直接登録する ─────────────────────────────
  const sessionId = await createRow('sessions', { user_id: userId, ...sessionValues })
  const slotId = await createSlot(userId, sessionId, startAt, minutes, storageUrls)
  await ensureSlotModel(userId, slotId, modelId)
  return { sessionId, slotId }
}

async function createSlot(
  userId: string,
  sessionId: string,
  startAt: string,
  minutes: number,
  storageUrls: string[],
): Promise<string> {
  return createRow('slots', {
    user_id: userId,
    session_id: sessionId,
    slot_no: 1,
    start_at: startAt,
    planned_minutes: minutes,
    storage_urls: storageUrls,
  })
}

/** 同じモデルが既に紐づいていれば何もしない（unique(slot_id, model_id) 違反を避ける） */
async function ensureSlotModel(userId: string, slotId: string, modelId: string): Promise<void> {
  const existing = await db.slot_models
    .where('slot_id')
    .equals(slotId)
    .filter((sm) => sm.model_id === modelId)
    .first()
  if (existing) return
  await createRow('slot_models', { user_id: userId, slot_id: slotId, model_id: modelId })
}

function asRecord(value: unknown): Record<string, string> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {}
}

function buildSnsLinks(
  current: Record<string, string>,
  input: Pick<ShootConfirmInput, 'modelX' | 'modelInstagram'>,
): Record<string, string> {
  const next = { ...current }
  const x = input.modelX.trim()
  const instagram = input.modelInstagram.trim()
  if (x) next.x = x
  if (instagram) next.instagram = instagram
  return next
}
