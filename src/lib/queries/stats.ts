import { db } from '@/lib/db'

import { loadShootArchive } from './archives'

/** モデル別の過去撮影情報 */
export interface ModelHistoryStat {
  id: string
  name: string
  /** 撮影会数。撮影イベントの数で、同じイベントの枠は1回と数える */
  shootCount: number
  firstDate: string
  lastDate: string
}

/** 撮影会別の過去撮影情報 */
export interface OrganizerHistoryStat {
  id: string
  name: string
  /** 撮影したモデルの人数。同じモデルは1人と数える */
  modelCount: number
  firstDate: string
  lastDate: string
}

export interface HistoryStats {
  models: ModelHistoryStat[]
  organizers: OrganizerHistoryStat[]
}

interface Bucket {
  id: string
  name: string
  items: Set<string>
  firstDate: string
  lastDate: string
}

function addTo(
  buckets: Map<string, Bucket>,
  id: string,
  name: string,
  date: string,
  items: string[],
): void {
  const bucket = buckets.get(id)
  if (!bucket) {
    buckets.set(id, { id, name, items: new Set(items), firstDate: date, lastDate: date })
    return
  }
  for (const item of items) bucket.items.add(item)
  if (date < bucket.firstDate) bucket.firstDate = date
  if (date > bucket.lastDate) bucket.lastDate = date
}

/** 最新の日付の新しい順。同じ日なら名前の順 */
function sortBuckets(buckets: Map<string, Bucket>): Bucket[] {
  return [...buckets.values()].sort(
    (a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name, 'ja'),
  )
}

/**
 * 過去撮影情報。対象は撮影情報検索と同じ（loadShootArchive）で、数が画面ごとに食い違わない。
 * 撮影会別は撮影会マスタに紐づく撮影だけを数える。撮影会名が未入力の撮影のタイトルは
 * 「葵 撮影」のような自動のものなので、撮影会として扱えない。
 */
export async function loadHistoryStats(now: Date = new Date()): Promise<HistoryStats> {
  const [records, organizers] = await Promise.all([loadShootArchive(now), db.organizers.toArray()])
  const organizerNames = new Map(organizers.map((o) => [o.id, o.name]))

  const models = new Map<string, Bucket>()
  const orgs = new Map<string, Bucket>()

  for (const record of records) {
    record.modelIds.forEach((modelId, i) => {
      addTo(models, modelId, record.modelNames[i], record.shootDate, [record.eventKey])
    })
    const organizerName = record.organizerId && organizerNames.get(record.organizerId)
    if (record.organizerId && organizerName) {
      addTo(orgs, record.organizerId, organizerName, record.shootDate, record.modelIds)
    }
  }

  return {
    models: sortBuckets(models).map(({ id, name, items, firstDate, lastDate }) => ({
      id,
      name,
      shootCount: items.size,
      firstDate,
      lastDate,
    })),
    organizers: sortBuckets(orgs).map(({ id, name, items, firstDate, lastDate }) => ({
      id,
      name,
      modelCount: items.size,
      firstDate,
      lastDate,
    })),
  }
}
