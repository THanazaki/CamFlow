import { db } from '@/lib/db'
import { categoryHasMeetingPoint, type PlaceCategory } from '@/lib/place-category'
import { categoryHasModel, fallbackShootTitle, type ShootCategory } from '@/lib/shoot-category'
import { normalizeStorageUrls } from '@/lib/storage-urls'
import { createRow, deleteRow, updateRow } from '@/lib/sync/mutations'
import type { Json } from '@/types/database'

/**
 * 確定撮影情報入力の書き込み。
 *
 * 予約（status='planned'）から確定させる場合と、予約を通していない撮影を
 * 直接登録する場合の両方を扱う。どちらも最終的に status='confirmed' の
 * session + slot + slot_models になる
 * （モデルを指定しない撮影区分では slot_models を持たない）。
 */

/** 撮影会名から撮影日まで。確定撮影情報入力と過去撮影登録で共通 */
export interface ShootDetailsInput {
  eventName: string
  shootCategory: ShootCategory
  /** モデルを指定しない撮影区分では、モデル名と SNS を無視する */
  modelName: string
  /** モデルの SNS。入力があればモデルマスタを更新する */
  modelX: string
  modelInstagram: string
  concept: string
  placeCategory: PlaceCategory
  venueName: string
  /** 屋外以外では無視する */
  meetingPoint: string
  /** 撮影日（YYYY-MM-DD） */
  shootDate: string
}

export interface ShootConfirmInput extends ShootDetailsInput {
  /** 予約から確定する場合はその session.id。新規なら空 */
  fromSessionId: string
  /** 開始・終了時刻（HH:mm） */
  startTime: string
  endTime: string
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
  const hasModel = categoryHasModel(input.shootCategory)
  // 欄を隠す前に入力した名前が残っていても、モデルを指定しない区分では使わない
  const modelName = hasModel ? input.modelName.trim() : ''
  const venueName = input.venueName.trim()
  const concept = input.concept.trim()
  const eventName = input.eventName.trim()
  // モデル名と同じく、欄を隠す前の入力が残っていても屋外以外では使わない
  const meetingPoint = categoryHasMeetingPoint(input.placeCategory)
    ? input.meetingPoint.trim()
    : ''

  if (hasModel && !modelName) {
    throw new Error('モデル名を入力してください')
  }

  const minutes = minutesBetween(input.shootDate, input.startTime, input.endTime)
  if (minutes <= 0) {
    throw new Error('終了時刻は開始時刻より後にしてください')
  }

  // ── モデル ───────────────────────────────────────────────
  const modelId = hasModel ? await resolveModel(userId, modelName, input) : null

  // ── 場所 ─────────────────────────────────────────────────
  const venue = await findVenue(venueName)

  const sessionValues = {
    title: eventName || concept || fallbackShootTitle(input.shootCategory, modelName),
    session_date: input.shootDate,
    shoot_category: input.shootCategory,
    // 予約が通った、または予約を通さず確定した撮影
    status: 'confirmed' as const,
    concept: concept || null,
    venue_id: venue?.id ?? null,
    venue_name: venueName || null,
    place_category: input.placeCategory,
    meeting_point: meetingPoint || null,
  }

  const startAt = toIso(input.shootDate, input.startTime)

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
      const slotId = await createSlot(userId, sessionId, startAt, minutes)
      if (modelId) await ensureSlotModel(userId, slotId, modelId)
      return { sessionId, slotId }
    }

    await updateRow('slots', slot.id, {
      start_at: startAt,
      planned_minutes: minutes,
    })
    if (modelId) {
      await ensureSlotModel(userId, slot.id, modelId)
    } else {
      // 予約時はモデルありの区分だったものを、確定時に変更した場合
      await removeSlotModels(slot.id)
    }
    return { sessionId, slotId: slot.id }
  }

  // ── 予約を通さず直接登録する ─────────────────────────────
  const sessionId = await createRow('sessions', { user_id: userId, ...sessionValues })
  const slotId = await createSlot(userId, sessionId, startAt, minutes)
  if (modelId) await ensureSlotModel(userId, slotId, modelId)
  return { sessionId, slotId }
}

/** 同名の場所マスタを探す。無ければ名前だけのテキストとして残す */
export async function findVenue(venueName: string) {
  const venues = await db.venues.toArray()
  return venues.find((v) => !v.deleted_at && normalize(v.name) === normalize(venueName))
}

/** モデルマスタの行を返す。同名が無ければ作り、あれば入力された SNS を反映する */
export async function resolveModel(
  userId: string,
  modelName: string,
  input: Pick<ShootDetailsInput, 'modelX' | 'modelInstagram'>,
): Promise<string> {
  const models = await db.models.toArray()
  const existingModel = models.find(
    (m) => !m.deleted_at && normalize(m.name) === normalize(modelName),
  )
  if (!existingModel) {
    return createRow('models', {
      user_id: userId,
      name: modelName,
      sns_links: buildSnsLinks({}, input),
    })
  }

  // 既存モデルの SNS は、入力があったものだけ上書きする。
  // 空欄で既存のリンクを消さないため
  const current = asRecord(existingModel.sns_links)
  const merged = buildSnsLinks(current, input)
  if (JSON.stringify(merged) !== JSON.stringify(current)) {
    await updateRow('models', existingModel.id, { sns_links: merged as Json })
  }
  return existingModel.id
}

async function removeSlotModels(slotId: string): Promise<void> {
  const rows = await db.slot_models.where('slot_id').equals(slotId).toArray()
  for (const row of rows) {
    await deleteRow('slot_models', row.id)
  }
}

async function createSlot(
  userId: string,
  sessionId: string,
  startAt: string,
  minutes: number,
): Promise<string> {
  return createRow('slots', {
    user_id: userId,
    session_id: sessionId,
    slot_no: 1,
    start_at: startAt,
    planned_minutes: minutes,
    // サーバ側の既定は '{}'。ローカルで省くと undefined になり、
    // pull で入るサーバ行と形が食い違う（deleted_at と同じ罠）
    storage_urls: [],
  })
}

/** 保存先ストレージURL の登録。確定撮影情報画面から撮影後に呼ぶ */
export async function saveStorageUrls(slotId: string, urls: string[]): Promise<void> {
  await updateRow('slots', slotId, {
    storage_urls: normalizeStorageUrls(urls),
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
  input: Pick<ShootDetailsInput, 'modelX' | 'modelInstagram'>,
): Record<string, string> {
  const next = { ...current }
  const x = input.modelX.trim()
  const instagram = input.modelInstagram.trim()
  if (x) next.x = x
  if (instagram) next.instagram = instagram
  return next
}
