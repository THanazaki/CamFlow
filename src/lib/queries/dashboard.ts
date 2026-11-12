import { db } from '@/lib/db'
import type { LocalModel, LocalSession, LocalVenue } from '@/lib/db/types'
import { isSlotFinished, slotEndMs } from '@/lib/slot-time'

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
  /** クラウドの保存先（最大10件） */
  storageUrls: string[]
  backedUpAt: string | null
  rating: number | null
}

/**
 * リマインドが対象とする工程。
 *
 *   予約情報入力 ──[予約可否決定]── 撮影確定 ──[撮影]── 撮影データ登録 ── 完了
 *      └─ 予約リマインド ─┘        └ 撮影リマインド ┘
 */
export type ReminderStage =
  /** 予約を入れたが可否がまだ決まっていない */
  | 'awaiting_decision'
  /** 可否が決まらないまま予定日を過ぎた */
  | 'overdue_decision'
  /** 確定済みでまだ撮影が終わっていない */
  | 'before_shoot'

export interface ReminderItem {
  slotId: string
  sessionId: string
  title: string
  startAt: string
  slotNo: number
  label: string | null
  venueName: string | null
  modelNames: string[]
  sessionStatus: LocalSession['status']
  stage: ReminderStage
  /** 予約リマインドのみ。予約受付の開始日時。未設定なら null */
  bookingOpensAt: string | null
  /** 開始までの日数。負なら過ぎている。レンダー中に Date.now() を呼ばないためここで出す */
  daysUntil: number
}

/** 料金リマインドの1件。確定した撮影の撮影料（slots.booking_fee）を、支払方法に応じた期日で出す */
export interface FeeReminderItem {
  slotId: string
  title: string
  modelNames: string[]
  /** 当日 / 事前。支払済み・未選択は出さない */
  timing: 'on_the_day' | 'in_advance'
  /** 期日（YYYY-MM-DD）。当日は撮影日、事前は支払日。事前で支払日が未入力なら null */
  dueDate: string | null
  /** 当日のときの撮影開始時刻（ISO）。事前は null */
  dueAt: string | null
  /** 撮影料（円）。未入力は 0 */
  amount: number
  /** 期日までの日数（日付単位）。負なら過ぎている。支払日が未入力なら null */
  daysUntil: number | null
}

/** 本日の撮影の1件。確定した撮影のうち、今日が撮影日でまだ終わっていないもの */
export interface TodayShoot {
  slotId: string
  title: string
  /** 開始・終了の日時（ISO）。終了は開始 + 予定時間 + 延長 */
  startAt: string
  endAt: string
  venueName: string | null
  modelNames: string[]
}

export interface ReminderGroup {
  /** 表示する分（最大 LIMIT 件） */
  items: ReminderItem[]
  /** 条件に合う総数。カードのバッジはこちらを出す */
  totalCount: number
  /** うち期限を過ぎているもの */
  overdueCount: number
}

export interface DashboardData {
  /** 本日の撮影。開始時刻の早い順。終わった撮影は含まない（画面でも時刻の経過に合わせて外す） */
  today: TodayShoot[]
  reservations: ReminderGroup
  shoots: ReminderGroup
  fees: {
    items: FeeReminderItem[]
    totalAmount: number
    totalCount: number
    /** 期日を過ぎたもの、または支払日が未入力のもの */
    overdueCount: number
  }
  recent: ShootSummary[]
}

const LIMIT = 5
const RECENT_LIMIT = 10

/** YYYY-MM-DD（ローカル時刻基準） */
function toDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** from から to までの日数（YYYY-MM-DD どうし、日付単位） */
function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()
  return Math.round(ms / 86_400_000)
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
  // undefined も「未削除」として扱う。createRow は null を入れるが、
  // 古いローカル行や将来の経路で欠けても一覧から消えないようにする
  const notDeleted = <T extends { deleted_at: string | null }>(rows: T[]) =>
    rows.filter((r) => !r.deleted_at)

  const sessions = notDeleted(allSessions)
  const slots = notDeleted(allSlots)
  const histories = notDeleted(allHistories)

  const sessionMap = byId(sessions)
  const modelMap = byId(models)
  const venueMap = byId(venues)

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

  const toReminder = (
    slot: (typeof slots)[number],
    stage: ReminderStage,
  ): ReminderItem | null => {
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
      stage,
      bookingOpensAt: session.booking_opens_at ?? null,
      daysUntil: Math.ceil((new Date(slot.start_at).getTime() - now.getTime()) / 86_400_000),
    }
  }

  // 中止・不参加の枠はどちらのリマインドにも出さない
  const live = slots.filter(
    (s) => s.shoot_status !== 'cancelled' && s.shoot_status !== 'no_show',
  )

  /**
   * 予約日時（予約受付の開始日時）が近い順。これから始まるものを近い順に並べ、
   * 受付が始まっているものはその後ろに新しい順で並べる。予約日時が未設定のものは最後
   */
  const byBookingOpensAt = (nowIso: string) => (a: ReminderItem, b: ReminderItem) => {
    if (!a.bookingOpensAt || !b.bookingOpensAt) {
      return a.bookingOpensAt === b.bookingOpensAt ? 0 : a.bookingOpensAt ? -1 : 1
    }
    const aUpcoming = a.bookingOpensAt >= nowIso
    const bUpcoming = b.bookingOpensAt >= nowIso
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
    return aUpcoming
      ? a.bookingOpensAt.localeCompare(b.bookingOpensAt)
      : b.bookingOpensAt.localeCompare(a.bookingOpensAt)
  }

  const group = (items: ReminderItem[]): ReminderGroup => ({
    items: items.slice(0, LIMIT),
    totalCount: items.length,
    overdueCount: items.filter((i) => i.daysUntil < 0).length,
  })

  // 予約リマインド: 予約情報入力 〜 予約可否決定。
  // まだ可否が決まっていない（planned）ものは、日付が過ぎていても出す。
  // 可否が決まらないまま予定日を越えた予約こそ放置されている
  const reservations = live
    .map((slot) => {
      const session = sessionMap.get(slot.session_id)
      if (!session || session.status !== 'planned') return null
      return toReminder(slot, slot.start_at < nowIso ? 'overdue_decision' : 'awaiting_decision')
    })
    .filter((r): r is ReminderItem => r !== null)
    .sort(byBookingOpensAt(nowIso))

  // 撮影リマインド: 撮影確定（予約成功を含む）で、まだ撮影が終わっていない枠（確定撮影情報の「撮影前」タブと同じ）。
  // 撮影日時の近い順。撮影が終わったものは出さない（保存先の登録は確定撮影情報の「撮影後」タブで行う）
  const shoots = live
    .filter((slot) => !isSlotFinished(slot, now))
    .map((slot) => {
      const session = sessionMap.get(slot.session_id)
      if (!session || session.status !== 'confirmed') return null
      return toReminder(slot, 'before_shoot')
    })
    .filter((r): r is ReminderItem => r !== null)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))

  // 本日の撮影: 確定した撮影で、今日が撮影日、まだ終わっていない枠。開始時刻の早い順
  const todayKey = toDateKey(nowIso)
  const today: TodayShoot[] = live
    .filter((slot) => toDateKey(slot.start_at) === todayKey && !isSlotFinished(slot, now))
    .flatMap((slot) => {
      const session = sessionMap.get(slot.session_id)
      if (!session || (session.status !== 'confirmed' && session.status !== 'done')) return []
      return [
        {
          slotId: slot.id,
          title: session.title,
          startAt: slot.start_at,
          endAt: new Date(slotEndMs(slot)).toISOString(),
          venueName: resolveVenueName(session, venueMap),
          modelNames: modelNamesBySlot.get(slot.id) ?? [],
        },
      ]
    })
    .sort((a, b) => a.startAt.localeCompare(b.startAt))

  // 料金リマインド: 確定した撮影の撮影料を、支払方法に応じた期日で出す。
  //   当日 … 撮影日の撮影開始時刻
  //   事前 … 指定した支払日
  // 支払済み・未選択は出さない。支払いを記録する操作がまだ無いので、撮影が終わったら出さない
  // （残すと消す手段が無い）。期日の日付を過ぎたものも出さない（支払日が未入力のものは出す）
  const feeItems: FeeReminderItem[] = live.flatMap((slot) => {
    const session = sessionMap.get(slot.session_id)
    if (!session || (session.status !== 'confirmed' && session.status !== 'done')) return []
    const timing = slot.fee_payment_timing
    if (timing !== 'on_the_day' && timing !== 'in_advance') return []
    if (isSlotFinished(slot, now)) return []

    const dueDate = timing === 'on_the_day' ? session.session_date : (slot.fee_payment_date ?? null)
    const daysUntil = dueDate === null ? null : daysBetween(todayKey, dueDate)
    // 期日（支払日）を過ぎたものは出さない。支払日が未入力のものは期日が無いので出す
    if (daysUntil !== null && daysUntil < 0) return []
    return [
      {
        slotId: slot.id,
        title: session.title,
        modelNames: modelNamesBySlot.get(slot.id) ?? [],
        timing,
        dueDate,
        dueAt: timing === 'on_the_day' ? slot.start_at : null,
        amount: Number(slot.booking_fee ?? 0),
        daysUntil,
      },
    ]
  })

  // 期日の近い順（過ぎたものが先頭に来る）。支払日が未入力のものは最優先
  feeItems.sort((a, b) => {
    if (a.dueDate === null || b.dueDate === null) {
      return a.dueDate === b.dueDate ? 0 : a.dueDate === null ? -1 : 1
    }
    return (
      a.dueDate.localeCompare(b.dueDate) || (a.dueAt ?? '').localeCompare(b.dueAt ?? '')
    )
  })

  const fees = {
    items: feeItems.slice(0, LIMIT),
    totalAmount: feeItems.reduce((sum, f) => sum + f.amount, 0),
    totalCount: feeItems.length,
    overdueCount: feeItems.filter((f) => f.daysUntil === null || f.daysUntil < 0).length,
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
            storageUrls: slot.storage_urls ?? [],
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
      storageUrls: h.storage_urls ?? [],
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

  return { today, reservations: group(reservations), shoots: group(shoots), fees, recent }
}

export const dashboardInternals = { LIMIT, RECENT_LIMIT, toDateKey }
export type { LocalModel }
