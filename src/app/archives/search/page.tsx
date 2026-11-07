'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useSearchParams } from 'next/navigation'
import { Suspense, useId, useMemo, useState } from 'react'

import { Field, inputClass } from '@/components/forms/ShootDetailsFields'
import { ShootRecordTable } from '@/components/ShootRecordTable'
import {
  EMPTY_SHOOT_SEARCH,
  filterShootArchive,
  loadShootArchive,
  type ShootSearchConditions,
} from '@/lib/queries/archives'
import { loadSuggestions } from '@/lib/queries/reservations'

/** 検索したことを示すクエリ。条件が空のまま検索した状態も、戻ったときに復元するため */
const SEARCHED_PARAM = 'searched'

/** 条件と URL のクエリの対応。詳細から戻っても検索結果が残るよう URL に持つ */
const PARAMS: Record<keyof ShootSearchConditions, string> = {
  eventName: 'event',
  modelName: 'model',
  dateFrom: 'from',
  dateTo: 'to',
  venueName: 'venue',
}

function readConditions(params: Pick<URLSearchParams, 'get'>): ShootSearchConditions {
  const conditions = { ...EMPTY_SHOOT_SEARCH }
  for (const key of Object.keys(PARAMS) as (keyof ShootSearchConditions)[]) {
    conditions[key] = params.get(PARAMS[key]) ?? ''
  }
  return conditions
}

/** 検索した条件を URL に残す。null は未検索 */
function writeConditions(conditions: ShootSearchConditions | null): void {
  const params = new URLSearchParams()
  if (conditions) {
    params.set(SEARCHED_PARAM, '1')
    for (const key of Object.keys(PARAMS) as (keyof ShootSearchConditions)[]) {
      if (conditions[key]) params.set(PARAMS[key], conditions[key])
    }
  }
  const query = params.toString()
  // router.replace はサーバに取りに行くので、オフラインで失敗する
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
}

export default function ShootSearchPage() {
  // useSearchParams を使う部分だけ切り出す。これが無いとページが事前レンダリングされない
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <ShootSearch />
    </Suspense>
  )
}

/**
 * 撮影情報検索。
 * 運用フローと過去撮影登録の両方から、撮影済みの撮影を探す。
 * 「検索」を押したときの条件で結果を出し、入力の途中では結果を変えない。
 */
function ShootSearch() {
  const params = useSearchParams()
  const [conditions, setConditions] = useState<ShootSearchConditions>(() => readConditions(params))
  /** 検索に使った条件。null は未検索 */
  const [applied, setApplied] = useState<ShootSearchConditions | null>(() =>
    params.has(SEARCHED_PARAM) ? readConditions(params) : null,
  )

  const records = useLiveQuery(() => loadShootArchive(), [], null)
  const suggestions = useLiveQuery(() => loadSuggestions(), [], {
    models: [],
    venues: [],
    events: [],
  })
  const results = useMemo(
    () => (records && applied ? filterShootArchive(records, applied) : null),
    [records, applied],
  )

  const eventListId = useId()
  const modelListId = useId()
  const venueListId = useId()

  const set = (key: keyof ShootSearchConditions, value: string) =>
    setConditions((c) => ({ ...c, [key]: value }))

  const reversedDates =
    conditions.dateFrom && conditions.dateTo && conditions.dateFrom > conditions.dateTo

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    if (reversedDates) return
    setApplied(conditions)
    writeConditions(conditions)
  }

  const clear = () => {
    setConditions(EMPTY_SHOOT_SEARCH)
    setApplied(null)
    writeConditions(null)
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">撮影情報検索</h1>
        <p className="text-muted mt-1 text-sm">
          撮影日を過ぎた確定済みの撮影と、過去撮影登録で登録した撮影を検索できます。
        </p>
      </header>

      <form
        role="search"
        aria-label="撮影情報の検索条件"
        onSubmit={search}
        className="bg-surface border-border space-y-4 rounded-lg border p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="撮影会名">
            {(p) => (
              <>
                <input
                  {...p}
                  type="search"
                  list={eventListId}
                  value={conditions.eventName}
                  onChange={(e) => set('eventName', e.target.value)}
                  className={inputClass}
                />
                <datalist id={eventListId}>
                  {suggestions.events.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label="モデル名">
            {(p) => (
              <>
                <input
                  {...p}
                  type="search"
                  list={modelListId}
                  value={conditions.modelName}
                  onChange={(e) => set('modelName', e.target.value)}
                  className={inputClass}
                />
                <datalist id={modelListId}>
                  {suggestions.models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="撮影日（いつから）">
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={conditions.dateFrom}
                  onChange={(e) => set('dateFrom', e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="撮影日（いつまで）">
              {(p) => (
                <input
                  {...p}
                  type="date"
                  value={conditions.dateTo}
                  onChange={(e) => set('dateTo', e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
          <Field label="撮影場所">
            {(p) => (
              <>
                <input
                  {...p}
                  type="search"
                  list={venueListId}
                  value={conditions.venueName}
                  onChange={(e) => set('venueName', e.target.value)}
                  className={inputClass}
                />
                <datalist id={venueListId}>
                  {suggestions.venues.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        </div>

        {reversedDates && (
          <p className="text-xs text-red-700 dark:text-red-400">
            「いつから」は「いつまで」以前の日付にしてください
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white"
          >
            検索
          </button>
          <button
            type="button"
            onClick={clear}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            条件をクリア
          </button>
        </div>
      </form>

      <section aria-label="検索結果" className="space-y-3">
        {applied === null ? (
          <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
            条件を入力して「検索」を押してください。条件が空なら、すべての撮影を表示します
          </div>
        ) : results === null ? (
          <p className="text-muted text-sm">読み込み中…</p>
        ) : (
          <>
            <p className="text-sm font-medium" role="status">
              {results.length} 件
            </p>
            {results.length === 0 ? (
              <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
                {records?.length === 0
                  ? '検索できる撮影はまだありません'
                  : '条件に合う撮影はありません'}
              </div>
            ) : (
              <ShootRecordTable rows={results} />
            )}
          </>
        )}
      </section>
    </div>
  )
}

