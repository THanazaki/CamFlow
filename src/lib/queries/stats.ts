import { db } from '@/lib/db'

import { loadShootArchive, loadUpcomingShoots, type ShootRecord } from './archives'

/** モデル別の全撮影データ */
export interface ModelHistoryStat {
  id: string
  name: string
  /** 読み（50音のタブ分けに使う）。マスタに無い・未入力なら null */
  nameKana: string | null
  /** 撮影回数。撮影イベントの数で、同じイベントの枠は1回と数える */
  shootCount: number
  /** 撮影予定回数。確定済みでまだ撮影日時になっていない撮影イベントの数（数え方は撮影回数と同じ） */
  plannedCount: number
  /** 撮影予定しか無いモデルは null */
  firstDate: string | null
  lastDate: string | null
}

/** 撮影会別の全撮影データ */
export interface OrganizerHistoryStat {
  id: string
  name: string
  /** 読み（50音のタブ分けに使う）。未入力なら null */
  nameKana: string | null
  /** 撮影したモデルの人数。同じモデルは1人と数える */
  modelCount: number
  /** 撮影予定のモデルの人数。同じモデルは1人と数える */
  plannedModelCount: number
  /** 撮影会利用回数。その撮影会の撮影イベントの数（同じイベントの枠は1回、モデルなしの撮影も数える） */
  useCount: number
  /** 撮影会利用予定回数。確定済みでまだ撮影日時になっていない撮影イベントの数 */
  plannedUseCount: number
  /** 撮影予定しか無い撮影会は null */
  firstDate: string | null
  lastDate: string | null
}

export interface HistoryStats {
  models: ModelHistoryStat[]
  organizers: OrganizerHistoryStat[]
}

interface Bucket {
  id: string
  name: string
  /** 過去の撮影で数えるもの */
  items: Set<string>
  /** 撮影予定で数えるもの */
  planned: Set<string>
  /** 撮影会の利用回数用。撮影イベント（eventKey）の集合 */
  events: Set<string>
  plannedEvents: Set<string>
  firstDate: string | null
  lastDate: string | null
}

function bucketOf(buckets: Map<string, Bucket>, id: string, name: string): Bucket {
  let bucket = buckets.get(id)
  if (!bucket) {
    bucket = {
      id,
      name,
      items: new Set(),
      planned: new Set(),
      events: new Set(),
      plannedEvents: new Set(),
      firstDate: null,
      lastDate: null,
    }
    buckets.set(id, bucket)
  }
  return bucket
}

function addPast(bucket: Bucket, date: string, items: string[]): void {
  for (const item of items) bucket.items.add(item)
  if (!bucket.firstDate || date < bucket.firstDate) bucket.firstDate = date
  if (!bucket.lastDate || date > bucket.lastDate) bucket.lastDate = date
}

/** 最新の日付の新しい順。撮影予定しか無いものは最後。同じなら名前の順 */
function sortBuckets(buckets: Map<string, Bucket>): Bucket[] {
  return [...buckets.values()].sort(
    (a, b) =>
      (b.lastDate ?? '').localeCompare(a.lastDate ?? '') || a.name.localeCompare(b.name, 'ja'),
  )
}

/**
 * 全撮影データ。対象は撮影情報検索と同じ（loadShootArchive）で、数が画面ごとに食い違わない。
 * 撮影予定は確定済みでまだ撮影日時になっていない撮影（loadUpcomingShoots）。予約段階のものは含めない。
 * 撮影会別は撮影会マスタに紐づく撮影だけを数える。撮影会名が未入力の撮影のタイトルは
 * 「葵 撮影」のような自動のものなので、撮影会として扱えない。
 */
export async function loadHistoryStats(now: Date = new Date()): Promise<HistoryStats> {
  const [records, upcoming, organizers, modelRows] = await Promise.all([
    loadShootArchive(now),
    loadUpcomingShoots(now),
    db.organizers.toArray(),
    db.models.toArray(),
  ])
  const modelKana = new Map(modelRows.map((m) => [m.id, m.name_kana ?? null]))
  const organizerKana = new Map(organizers.map((o) => [o.id, o.name_kana ?? null]))
  const organizerNames = new Map(organizers.map((o) => [o.id, o.name]))

  const models = new Map<string, Bucket>()
  const orgs = new Map<string, Bucket>()
  const organizerBucket = (record: ShootRecord) => {
    const name = record.organizerId && organizerNames.get(record.organizerId)
    return record.organizerId && name ? bucketOf(orgs, record.organizerId, name) : null
  }

  for (const record of records) {
    record.modelIds.forEach((modelId, i) => {
      addPast(bucketOf(models, modelId, record.modelNames[i]), record.shootDate, [record.eventKey])
    })
    const org = organizerBucket(record)
    if (org) {
      addPast(org, record.shootDate, record.modelIds)
      org.events.add(record.eventKey)
    }
  }

  for (const record of upcoming) {
    record.modelIds.forEach((modelId, i) => {
      bucketOf(models, modelId, record.modelNames[i]).planned.add(record.eventKey)
    })
    const org = organizerBucket(record)
    if (org) {
      for (const modelId of record.modelIds) org.planned.add(modelId)
      org.plannedEvents.add(record.eventKey)
    }
  }

  return {
    models: sortBuckets(models).map(({ id, name, items, planned, firstDate, lastDate }) => ({
      id,
      name,
      nameKana: modelKana.get(id) ?? null,
      shootCount: items.size,
      plannedCount: planned.size,
      firstDate,
      lastDate,
    })),
    organizers: sortBuckets(orgs).map(
      ({ id, name, items, planned, events, plannedEvents, firstDate, lastDate }) => ({
        id,
        name,
        nameKana: organizerKana.get(id) ?? null,
        modelCount: items.size,
        plannedModelCount: planned.size,
        useCount: events.size,
        plannedUseCount: plannedEvents.size,
        firstDate,
        lastDate,
      }),
    ),
  }
}

/** ダッシュボードのグラフ用。過去12か月（今月を含む）の集計 */
export interface MonthlyStat {
  /** YYYY-MM */
  month: string
  /** 撮影回数。撮影イベントの数で、同じイベントの枠は1回と数える */
  shootCount: number
  /** 撮影料の合計 */
  fee: number
}

export interface ModelCountStat {
  id: string
  name: string
  shootCount: number
}

export interface DashboardCharts {
  months: MonthlyStat[]
  /** 撮影回数の多い順（最大 MODEL_CHART_LIMIT 人）。同じ回数なら名前の順 */
  models: ModelCountStat[]
  /** 12か月の撮影に出たモデルの人数（上位に入りきらない分を含む） */
  modelTotal: number
}

export const MODEL_CHART_LIMIT = 10

/** now を含む直近 count か月の YYYY-MM（古い順） */
export function recentMonths(now: Date, count = 12): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

/** 撮影情報検索と同じ対象（loadShootArchive）を数えるので、画面ごとに数がずれない */
export async function loadDashboardCharts(now: Date = new Date()): Promise<DashboardCharts> {
  const records = await loadShootArchive(now)
  return buildDashboardCharts(records, now)
}

export function buildDashboardCharts(records: ShootRecord[], now: Date): DashboardCharts {
  const keys = recentMonths(now)
  const buckets = new Map(keys.map((m) => [m, { events: new Set<string>(), fee: 0 }]))
  const models = new Map<string, { name: string; events: Set<string> }>()

  for (const record of records) {
    const bucket = buckets.get(record.shootDate.slice(0, 7))
    if (!bucket) continue
    bucket.events.add(record.eventKey)
    bucket.fee += record.shootFee
    record.modelIds.forEach((id, i) => {
      let m = models.get(id)
      if (!m) {
        m = { name: record.modelNames[i], events: new Set() }
        models.set(id, m)
      }
      m.events.add(record.eventKey)
    })
  }

  const ranked = [...models].map(([id, m]) => ({ id, name: m.name, shootCount: m.events.size }))
  ranked.sort((a, b) => b.shootCount - a.shootCount || a.name.localeCompare(b.name, 'ja'))

  return {
    months: keys.map((month) => {
      const b = buckets.get(month)!
      return { month, shootCount: b.events.size, fee: b.fee }
    }),
    models: ranked.slice(0, MODEL_CHART_LIMIT),
    modelTotal: ranked.length,
  }
}
