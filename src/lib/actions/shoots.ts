import { db } from '@/lib/db'
import { feePaymentHasDate, type FeePaymentTiming } from '@/lib/fee-payment'
import { categoryHasMeetingPoint, type PlaceCategory } from '@/lib/place-category'
import { categoryHasModel, fallbackShootTitle, type ShootCategory } from '@/lib/shoot-category'
import { isSlotFinished } from '@/lib/slot-time'
import { normalizeStorageUrls } from '@/lib/storage-urls'
import { createRow, deleteRow, updateRow } from '@/lib/sync/mutations'

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
  /** モデルを指定しない撮影区分では無視する */
  modelName: string
  concept: string
  placeCategory: PlaceCategory
  venueName: string
  /** 屋外以外では無視する */
  meetingPoint: string
  /** 撮影日（YYYY-MM-DD） */
  shootDate: string
  /** メモ。省略時は空 */
  memo?: string
}

/** 撮影料とオプション。確定撮影情報入力と確定撮影情報で共通 */
export interface ShootOptionsInput {
  /** 撮影料（円）。入力欄の値のまま。空欄は0円 */
  shootFee: string
  costumeOptions: string
  shootingMethodOptions: string
}

/** slots.booking_fee（numeric(10,0)）に入る上限 */
const MAX_SHOOT_FEE = 9_999_999_999

/** 撮影料の支払方法。予約情報入力と確定撮影情報入力で共通 */
export interface ShootPaymentInput {
  /** null は未選択 */
  paymentTiming: FeePaymentTiming | null
  /** 支払日（YYYY-MM-DD）。事前以外では無視する */
  paymentDate: string
}

const STORAGE_URLS_LOCKED_MESSAGE = '保存先ストレージURLは撮影が終わるまで登録できません'

/** 確定撮影情報入力と、確定した撮影の編集で共通の入力 */
export interface ShootFormInput extends ShootDetailsInput, ShootOptionsInput, ShootPaymentInput {
  /** 集合時刻（HH:mm）。空欄可 */
  meetingTime: string
  /** 開始・終了時刻（HH:mm） */
  startTime: string
  endTime: string
}

export interface ShootConfirmInput extends ShootFormInput {
  /** 予約から確定する場合はその session.id。新規なら空 */
  fromSessionId: string
}

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

/** 日付 + 時刻（ローカル）を ISO に */
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

/** 入力を slots のカラムに変換する。撮影料が不正ならエラー */
export function toShootOptionColumns(input: ShootOptionsInput) {
  const fee = input.shootFee.trim()
  if (fee && !/^\d+$/.test(fee)) {
    throw new Error('撮影料は0以上の整数で入力してください')
  }
  const bookingFee = Number(fee || 0)
  if (bookingFee > MAX_SHOOT_FEE) {
    throw new Error('撮影料が大きすぎます')
  }
  return {
    booking_fee: bookingFee,
    costume_options: input.costumeOptions.trim() || null,
    shooting_method_options: input.shootingMethodOptions.trim() || null,
  }
}

export function toFeePaymentColumns(input: ShootPaymentInput) {
  return {
    fee_payment_timing: input.paymentTiming,
    // 欄を隠す前に入力した日付が残っていても、事前以外では使わない
    fee_payment_date: feePaymentHasDate(input.paymentTiming) ? input.paymentDate || null : null,
  }
}

/** 確定時に枠へ保存する、時刻以外の項目 */
function toSlotDetailColumns(input: ShootFormInput) {
  return {
    ...toShootOptionColumns(input),
    ...toFeePaymentColumns(input),
    meeting_at: input.meetingTime ? toIso(input.shootDate, input.meetingTime) : null,
  }
}

export function minutesBetween(date: string, start: string, end: string): number {
  const ms = new Date(`${date}T${end}:00`).getTime() - new Date(`${date}T${start}:00`).getTime()
  return Math.round(ms / 60_000)
}

/**
 * 確定と編集で共通の処理。入力を検証してカラムに変換し、モデルと撮影会をマスタと突き合わせる。
 * current は更新する既存の session。
 */
async function prepareShoot(
  userId: string,
  input: ShootFormInput,
  current?: EventOrganizerRow,
  currentModelIds: string[] = [],
) {
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

  // モデルなどを作る前に検証する。途中で失敗して行だけ残らないように
  const options = toSlotDetailColumns(input)

  // ── モデル・撮影会 ───────────────────────────────────────
  const event = await resolveShootEvent(userId, eventName, current)
  const model = hasModel
    ? await resolveShootModel(userId, modelName, event, currentModelIds)
    : null

  // ── 場所 ─────────────────────────────────────────────────
  const venue = await findVenue(venueName)

  const sessionValues = {
    title: eventName || concept || fallbackShootTitle(input.shootCategory, modelName),
    organizer_id: event.organizerId,
    session_date: input.shootDate,
    shoot_category: input.shootCategory,
    concept: concept || null,
    venue_id: venue?.id ?? null,
    venue_name: venueName || null,
    place_category: input.placeCategory,
    meeting_point: meetingPoint || null,
    memo: input.memo?.trim() || null,
  }

  return {
    modelId: model?.id ?? null,
    newModelId: model?.created ? model.id : null,
    sessionValues,
    startAt: toIso(input.shootDate, input.startTime),
    minutes,
    options,
  }
}

export async function confirmShoot(
  userId: string,
  input: ShootConfirmInput,
): Promise<{ sessionId: string; slotId: string; newModelId: string | null }> {
  const reservation = input.fromSessionId ? await db.sessions.get(input.fromSessionId) : undefined
  const reservationSlot = reservation
    ? (await db.slots.where('session_id').equals(reservation.id).toArray())
        .filter((s) => !s.deleted_at)
        .sort((a, b) => a.slot_no - b.slot_no)[0]
    : undefined
  const prepared = await prepareShoot(
    userId,
    input,
    reservation,
    reservationSlot ? await slotModelIds(reservationSlot.id) : [],
  )
  const { modelId, newModelId, startAt, minutes, options } = prepared
  const sessionValues = {
    ...prepared.sessionValues,
    // 予約が通った、または予約を通さず確定した撮影
    status: 'confirmed' as const,
  }

  // ── 予約から確定する ─────────────────────────────────────
  if (input.fromSessionId) {
    const sessionId = input.fromSessionId
    await updateRow('sessions', sessionId, sessionValues)

    // 予約時に仮置きした枠を実際の時刻に直す
    const slot = reservationSlot

    if (!slot) {
      const slotId = await createSlot(userId, sessionId, startAt, minutes, options)
      if (modelId) await ensureSlotModel(userId, slotId, modelId)
      return { sessionId, slotId, newModelId }
    }

    await updateRow('slots', slot.id, {
      start_at: startAt,
      planned_minutes: minutes,
      ...options,
    })
    // 予約時のモデルから変えた場合は付け替える。モデルなしの区分に変えた場合は外す
    await linkSlotModel(userId, slot.id, modelId)
    return { sessionId, slotId: slot.id, newModelId }
  }

  // ── 予約を通さず直接登録する ─────────────────────────────
  const sessionId = await createRow('sessions', { user_id: userId, ...sessionValues })
  const slotId = await createSlot(userId, sessionId, startAt, minutes, options)
  if (modelId) await ensureSlotModel(userId, slotId, modelId)
  return { sessionId, slotId, newModelId }
}

async function slotModelIds(slotId: string): Promise<string[]> {
  return (await db.slot_models.where('slot_id').equals(slotId).toArray()).map((l) => l.model_id)
}

/**
 * 枠のモデルを指定のモデルにする。
 * 1人だけ紐づいていれば付け替える（作り直すとモデル料や納品の記録が消える）。
 * 複数紐づいていて、そのどれでもなければ追加する。null なら全て外す。
 */
async function linkSlotModel(userId: string, slotId: string, modelId: string | null): Promise<void> {
  const links = await db.slot_models.where('slot_id').equals(slotId).toArray()
  if (!modelId) {
    await removeSlotModels(slotId)
  } else if (links.some((l) => l.model_id === modelId)) {
    return
  } else if (links.length === 1) {
    await updateRow('slot_models', links[0].id, { model_id: modelId })
  } else {
    await ensureSlotModel(userId, slotId, modelId)
  }
}

/** 同名の場所マスタを探す。無ければ名前だけのテキストとして残す */
export async function findVenue(venueName: string) {
  const venues = await db.venues.toArray()
  return venues.find((v) => !v.deleted_at && normalize(v.name) === normalize(venueName))
}

/** 撮影会名が空のまま登録したモデルの所属 */
export const FREE_AFFILIATION = 'フリー'

/**
 * モデルマスタの行を、モデル名と撮影会名の組み合わせで探す。無ければ作る。
 *
 * 撮影会ごとに同じ名前の別人がいるので、組み合わせでモデルを見分ける。
 * 新しく作るときは撮影会名を所属（affiliation）に入れる。撮影会名が空なら「フリー」にする。
 * 撮影会名が空のときは、所属が「フリー」か未設定（この仕組みの前に作った行）の同名モデルを使う。
 *
 * anyAffiliation は名前だけで照合する（撮影希望）。同名が複数あれば「フリー」、所属なし、その他の順。
 */
export async function resolveModel(
  userId: string,
  modelName: string,
  eventName: string,
  { anyAffiliation = false }: { anyAffiliation?: boolean } = {},
): Promise<{ id: string; created: boolean }> {
  const models = (await db.models.toArray()).filter(
    (m) => !m.deleted_at && normalize(m.name) === normalize(modelName),
  )
  const affiliation = eventName.trim() || FREE_AFFILIATION
  const isFree = !eventName.trim()

  // メインの所属に加えて、追加した所属のどれかと一致すれば同じモデル
  const sameAffiliation = models.find((m) =>
    [m.affiliation ?? '', ...(m.sub_affiliations ?? [])].some(
      (a) => normalize(a) === normalize(affiliation),
    ),
  )
  const unset = models.find((m) => !m.affiliation)
  const existing = anyAffiliation
    ? (sameAffiliation ?? unset ?? models[0])
    : (sameAffiliation ?? (isFree ? unset : undefined))
  if (existing) return { id: existing.id, created: false }

  const id = await createRow('models', {
    user_id: userId,
    name: modelName,
    affiliation,
    // サーバ側の既定は '{}'。ローカルで省くと pull で入るサーバ行と形が食い違う
    sub_affiliations: [],
    sns_links: {},
  })
  return { id, created: true }
}

/** 撮影の入力から見た撮影会。モデルの照合と撮影会マスタの紐づけに使う */
export interface ShootEvent {
  /** モデルの照合に使う撮影会名。撮影会名が未入力なら空 */
  name: string
  organizerId: string | null
  /** 既存の撮影の撮影会名を変えていないか */
  unchanged: boolean
}

/**
 * 撮影の入力に対応する撮影会を返す。
 *
 * 予約の選択や編集ではフォームに既存のタイトルが入る。撮影会名が未入力の撮影は
 * 「葵 撮影」のような自動のタイトルなので、変更が無いときはマスタに登録せず、今の紐づけを保つ。
 */
export async function resolveShootEvent(
  userId: string,
  eventName: string,
  current?: EventOrganizerRow,
): Promise<ShootEvent> {
  if (current && eventName === current.title) {
    const organizer = current.organizer_id ? await db.organizers.get(current.organizer_id) : undefined
    return { name: organizer?.name ?? '', organizerId: current.organizer_id ?? null, unchanged: true }
  }
  return {
    name: eventName,
    organizerId: await resolveOrganizer(userId, eventName),
    unchanged: false,
  }
}

/**
 * 撮影のモデルを返す。撮影会名を変えていない更新で、今のモデルと同じ名前なら今のモデルを使う。
 * 所属を手で変えたモデルが、更新のたびに別のモデルとして作られるのを防ぐため。
 */
export async function resolveShootModel(
  userId: string,
  modelName: string,
  event: ShootEvent,
  currentModelIds: string[],
): Promise<{ id: string; created: boolean }> {
  if (event.unchanged) {
    const current = (await db.models.bulkGet(currentModelIds)).find(
      (m) => m && !m.deleted_at && normalize(m.name) === normalize(modelName),
    )
    if (current) return { id: current.id, created: false }
  }
  return resolveModel(userId, modelName, event.name)
}

/** 撮影会マスタの行を返す。空なら null。同名が無ければ作る */
export async function resolveOrganizer(userId: string, name: string): Promise<string | null> {
  const organizerName = name.trim()
  if (!organizerName) return null

  const organizers = await db.organizers.toArray()
  const existing = organizers.find(
    (o) => !o.deleted_at && normalize(o.name) === normalize(organizerName),
  )
  if (existing) return existing.id

  return createRow('organizers', { user_id: userId, name: organizerName, is_favorite: false })
}

/** 撮影会名を持つ既存の行（sessions / shoot_history） */
export interface EventOrganizerRow {
  title: string
  organizer_id: string | null
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
  options: ReturnType<typeof toSlotDetailColumns>,
): Promise<string> {
  return createRow('slots', {
    user_id: userId,
    session_id: sessionId,
    slot_no: 1,
    start_at: startAt,
    planned_minutes: minutes,
    ...options,
    // サーバ側の既定は '{}'。ローカルで省くと undefined になり、
    // pull で入るサーバ行と形が食い違う（deleted_at と同じ罠）
    storage_urls: [],
  })
}

/** 保存先ストレージURL の登録。確定撮影情報画面から撮影後に呼ぶ */
export async function saveStorageUrls(
  slotId: string,
  urls: string[],
  now: Date = new Date(),
): Promise<void> {
  const slot = await db.slots.get(slotId)
  if (!slot) {
    throw new Error('撮影が見つかりませんでした')
  }
  if (!isSlotFinished(slot, now)) {
    throw new Error(STORAGE_URLS_LOCKED_MESSAGE)
  }
  await updateRow('slots', slotId, {
    storage_urls: normalizeStorageUrls(urls),
  })
}

/**
 * 確定した撮影の編集。撮影情報検索の編集画面から呼ぶ。
 * status は変えない。session の項目は同じ session の他の枠にも効く。
 */
export async function updateConfirmedShoot(
  userId: string,
  slotId: string,
  input: ShootFormInput & { storageUrls: string[] },
): Promise<void> {
  const slot = await db.slots.get(slotId)
  if (!slot) {
    throw new Error('撮影が見つかりませんでした')
  }
  // モデルなどを作る前に検証する
  const storageUrls = normalizeStorageUrls(input.storageUrls)
  const urlsChanged = JSON.stringify(storageUrls) !== JSON.stringify(slot.storage_urls ?? [])
  if (urlsChanged && !isSlotFinished(slot)) {
    throw new Error(STORAGE_URLS_LOCKED_MESSAGE)
  }
  const session = await db.sessions.get(slot.session_id)
  const { modelId, sessionValues, startAt, minutes, options } = await prepareShoot(
    userId,
    input,
    session,
    await slotModelIds(slotId),
  )

  await updateRow('sessions', slot.session_id, sessionValues)
  await updateRow('slots', slotId, {
    start_at: startAt,
    planned_minutes: minutes,
    storage_urls: storageUrls,
    ...options,
  })

  await linkSlotModel(userId, slotId, modelId)
}

/** 撮影料とオプションの更新。確定撮影情報画面から呼ぶ */
export async function saveShootOptions(slotId: string, input: ShootOptionsInput): Promise<void> {
  await updateRow('slots', slotId, toShootOptionColumns(input))
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
