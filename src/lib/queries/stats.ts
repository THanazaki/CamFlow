import { db } from '@/lib/db'

import { loadShootArchive, loadUpcomingShoots, type ShootRecord } from './archives'

/** モデル別の過去撮影情報 */
export interface ModelHistoryStat {
  id: string
  name: string
  /** 撮影回数。撮影イベントの数で、同じイベントの枠は1回と数える */
  shootCount: number
  /** 撮影予定回数。確定済みでまだ撮影日時になっていない撮影イベントの数（数え方は撮影回数と同じ） */
  plannedCount: number
  /** 撮影予定しか無いモデルは null */
  firstDate: string | null
  lastDate: string | null
}

/** 撮影会別の過去撮影情報 */
export interface OrganizerHistoryStat {
  id: string
  name: string
  /** 撮影したモデルの人数。同じモデルは1人と数える */
  modelCount: number
  /** 撮影予定のモデルの人数。同じモデルは1人と数える */
  plannedModelCount: number
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
  firstDate: string | null
  lastDate: string | null
}

function bucketOf(buckets: Map<string, Bucket>, id: string, name: string): Bucket {
  let bucket = buckets.get(id)
  if (!bucket) {
    bucket = { id, name, items: new Set(), planned: new Set(), firstDate: null, lastDate: null }
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
 * 過去撮影情報。対象は撮影情報検索と同じ（loadShootArchive）で、数が画面ごとに食い違わない。
 * 撮影予定は確定済みでまだ撮影日時になっていない撮影（loadUpcomingShoots）。予約段階のものは含めない。
 * 撮影会別は撮影会マスタに紐づく撮影だけを数える。撮影会名が未入力の撮影のタイトルは
 * 「葵 撮影」のような自動のものなので、撮影会として扱えない。
 */
export async function loadHistoryStats(now: Date = new Date()): Promise<HistoryStats> {
  const [records, upcoming, organizers] = await Promise.all([
    loadShootArchive(now),
    loadUpcomingShoots(now),
    db.organizers.toArray(),
  ])
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
    if (org) addPast(org, record.shootDate, record.modelIds)
  }

  for (const record of upcoming) {
    record.modelIds.forEach((modelId, i) => {
      bucketOf(models, modelId, record.modelNames[i]).planned.add(record.eventKey)
    })
    const org = organizerBucket(record)
    if (org) for (const modelId of record.modelIds) org.planned.add(modelId)
  }

  return {
    models: sortBuckets(models).map(({ id, name, items, planned, firstDate, lastDate }) => ({
      id,
      name,
      shootCount: items.size,
      plannedCount: planned.size,
      firstDate,
      lastDate,
    })),
    organizers: sortBuckets(orgs).map(({ id, name, items, planned, firstDate, lastDate }) => ({
      id,
      name,
      modelCount: items.size,
      plannedModelCount: planned.size,
      firstDate,
      lastDate,
    })),
  }
}
