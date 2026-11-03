import { db } from '@/lib/db'
import type { LocalModel, LocalSession, LocalVenue } from '@/lib/db/types'

/**
 * ダッシュボード用のクエリ。
 *
 * **なぜここに置くか**: サーバ側には v_shoot_history_all / v_model_stats といった
 * ビューがあるが、ビューは Dexie に同期されないため画面からは引けない。
 * ローカルファーストでは「ビュー相当」をクライアント側に用意する必要がある。
 * 画面コンポーネントが db.slots などを直接組み立てると、同じ結合ロジックが
 * 散らばって必ずズレるので、読み取りはこのモジュールに集約する。
 */

export interface ShootSummary {
  /** 運用フロー（slots）由来か、遡及登録（shoot_history）由来か */
  source: 'slot' | 'history'
  sourceId: string
  /** 表示用の日付（YYYY-MM-DD） */
  shootDate: string
  /** 開始日時。遡及登録では未入力のことがある */
  startAt: string | null
  title: string
  venueName: string | null
  modelNames: string[]
  /** 枠番号。遡及登録では持たない */
  slotNo: number | null
  frameCount: number | null
  storagePath: string | null
  storageLabel: string | null
  backedUpAt: string | null
  rating: number | null
}

export interface ReminderItem {
  slotId: string
  sessionId: string
  title: string
  startAt: string
  slotNo: number
  label: string | null
  venueName: string | null
  modelNames: string[]
  /** 予約段階（未確定）か確定済みか */
  sessionStatus: LocalSession['status']
  /** 開始までの日数。0 以下は本日。レンダー中に Date.now() を呼ばないためここで出す */
  daysUntil: number
}

export interface FeeReminderItem {
  source: 'slot' | 'history'
  /** slot_models.id または shoot_history_models.id */
  id: string
  shootDate: string
  title: string
  modelName: string
  /** 延長料込みの未払い額 */
  amount: number
}

export interface DashboardData {
  reservations: ReminderItem[]
  shoots: ReminderItem[]
  fees: { items: FeeReminderItem[]; totalAmount: number; totalCount: number }
  recent: ShootSummary[]
}

const LIMIT = 5
const RECENT_LIMIT = 10

/** YYYY-MM-DD（ローカル時刻基準） */
function toDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 配列を id をキーにした Map にする */
function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]))
}

function resolveVenueName(
  session: Pick<LocalSession, 'venue_id' | 'venue_name'> | undefined,
  venues: Map<string, LocalVenue>,
): string | null {
  if (!session) return null
  // マスタ登録済みならそちらを優先（venue_name はフォールバック）
  if (session.venue_id) return venues.get(session.venue_id)?.name ?? session.venue_name
  return session.venue_name
}

/**
 * ダッシュボードが必要とするものを1回でまとめて読む。
 * useLiveQuery から呼ぶので、触ったテーブルが更新されれば自動で再実行される。
 */
export async function loadDashboard(now: Date = new Date()): Promise<DashboardData> {
  const nowIso = now.toISOString()

  const [allSessions, allSlots, slotModels, models, venues, allHistories, historyModels] =
    await Promise.all([
      db.sessions.toArray(),
      db.slots.toArray(),
      db.slot_models.toArray(),
      db.models.toArray(),
      db.venues.toArray(),
      db.shoot_history.toArray(),
      db.shoot_history_models.toArray(),
    ])

  // 論理削除した行は push が通るまで手元に残る（softDeleteRow は deleted_at を立てるだけ）。
  // 一覧に出さないようここで落とす
  const notDeleted = <T extends { deleted_at: string | null }>(rows: T[]) =>
    rows.filter((r) => r.deleted_at === null)

  const sessions = notDeleted(allSessions)
  const slots = notDeleted(allSlots)
  const histories = notDeleted(allHistories)

  const sessionMap = byId(sessions)
  const slotMap = byId(slots)
  const modelMap = byId(models)
  const venueMap = byId(venues)
  const historyMap = byId(histories)

  // 枠 → モデル名
  const modelNamesBySlot = new Map<string, string[]>()
  for (const sm of slotModels) {
    const name = modelMap.get(sm.model_id)?.name
    if (!name) continue
    const list = modelNamesBySlot.get(sm.slot_id) ?? []
    list.push(name)
    modelNamesBySlot.set(sm.slot_id, list)
  }

  const modelNamesByHistory = new Map<string, string[]>()
  for (const hm of historyModels) {
    const name = modelMap.get(hm.model_id)?.name
    if (!name) continue
    const list = modelNamesByHistory.get(hm.shoot_history_id) ?? []
    list.push(name)
    modelNamesByHistory.set(hm.shoot_history_id, list)
  }

  const toReminder = (slot: (typeof slots)[number]): ReminderItem | null => {
    const session = sessionMap.get(slot.session_id)
    if (!session) return null
    return {
      slotId: slot.id,
      sessionId: slot.session_id,
      title: session.title,
      startAt: slot.start_at,
      slotNo: slot.slot_no,
      label: slot.label,
      venueName: resolveVenueName(session, venueMap),
      modelNames: modelNamesBySlot.get(slot.id) ?? [],
      sessionStatus: session.status,
      daysUntil: Math.ceil((new Date(slot.start_at).getTime() - now.getTime()) / 86_400_000),
    }
  }

  // これから来る枠。中止したものは出さない
  const upcoming = slots
    .filter((s) => s.start_at >= nowIso && s.shoot_status !== 'cancelled')
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map(toReminder)
    .filter((r): r is ReminderItem => r !== null)
    .filter((r) => r.sessionStatus !== 'cancelled')

  // 予約リマインド: まだ「確定撮影情報入力」を通していないもの
  const reservations = upcoming.filter((r) => r.sessionStatus === 'planned').slice(0, LIMIT)

  // 撮影リマインド: 「確定撮影情報入力」を通したもの
  const shoots = upcoming.filter((r) => r.sessionStatus === 'confirmed').slice(0, LIMIT)

  // 料金リマインド: 未払いのモデル料。運用フロー分と遡及登録分の両方
  const feeItems: FeeReminderItem[] = []

  for (const sm of slotModels) {
    if (sm.payment_status !== 'unpaid') continue
    const slot = slotMap.get(sm.slot_id)
    const session = slot ? sessionMap.get(slot.session_id) : undefined
    if (!slot || !session) continue
    feeItems.push({
      source: 'slot',
      id: sm.id,
      shootDate: session.session_date,
      title: session.title,
      modelName: modelMap.get(sm.model_id)?.name ?? '(不明なモデル)',
      amount: Number(sm.fee) + Number(sm.extension_fee),
    })
  }

  for (const hm of historyModels) {
    if (hm.payment_status !== 'unpaid') continue
    const history = historyMap.get(hm.shoot_history_id)
    if (!history) continue
    feeItems.push({
      source: 'history',
      id: hm.id,
      shootDate: history.shoot_date,
      title: history.title,
      modelName: modelMap.get(hm.model_id)?.name ?? '(不明なモデル)',
      amount: Number(hm.fee),
    })
  }

  // 古い未払いほど気づきたいので昇順
  feeItems.sort((a, b) => a.shootDate.localeCompare(b.shootDate))

  const fees = {
    items: feeItems.slice(0, LIMIT),
    totalAmount: feeItems.reduce((sum, f) => sum + f.amount, 0),
    totalCount: feeItems.length,
  }

  // 直近の撮影済み: v_shoot_history_all のクライアント版
  const recent: ShootSummary[] = [
    ...slots
      .filter((s) => s.shoot_status === 'shot')
      .flatMap((slot) => {
        const session = sessionMap.get(slot.session_id)
        if (!session) return []
        return [
          {
            source: 'slot' as const,
            sourceId: slot.id,
            shootDate: session.session_date,
            startAt: slot.start_at,
            title: session.title,
            venueName: resolveVenueName(session, venueMap),
            modelNames: modelNamesBySlot.get(slot.id) ?? [],
            slotNo: slot.slot_no,
            frameCount: slot.frame_count,
            storagePath: slot.storage_path,
            storageLabel: slot.storage_label,
            backedUpAt: slot.backed_up_at,
            rating: slot.rating,
          },
        ]
      }),
    ...histories.map((h) => ({
      source: 'history' as const,
      sourceId: h.id,
      shootDate: h.shoot_date,
      startAt: h.start_at,
      title: h.title,
      venueName: h.venue_id ? (venueMap.get(h.venue_id)?.name ?? h.venue_name) : h.venue_name,
      modelNames: modelNamesByHistory.get(h.id) ?? [],
      slotNo: null,
      frameCount: h.frame_count,
      storagePath: h.storage_path,
      storageLabel: h.storage_label,
      backedUpAt: h.backed_up_at,
      rating: h.rating,
    })),
  ]
    .sort((a, b) => {
      const byDate = b.shootDate.localeCompare(a.shootDate)
      if (byDate !== 0) return byDate
      return (b.startAt ?? '').localeCompare(a.startAt ?? '')
    })
    .slice(0, RECENT_LIMIT)

  return { reservations, shoots, fees, recent }
}

export const dashboardInternals = { LIMIT, RECENT_LIMIT, toDateKey }
export type { LocalModel }
