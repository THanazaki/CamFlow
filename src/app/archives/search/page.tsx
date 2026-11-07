'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useId, useMemo, useState } from 'react'

import { Field, inputClass } from '@/components/forms/ShootDetailsFields'
import { StorageUrlList } from '@/components/StorageUrlList'
import {
  EMPTY_SHOOT_SEARCH,
  filterShootArchive,
  loadShootArchive,
  shootRecordHref,
  type ShootRecord,
  type ShootSearchConditions,
} from '@/lib/queries/archives'
import { loadSuggestions } from '@/lib/queries/reservations'

/** 条件と URL のクエリの対応。詳細から戻っても条件が残るよう URL に持つ */
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

function writeConditions(conditions: ShootSearchConditions): void {
  const params = new URLSearchParams()
  for (const key of Object.keys(PARAMS) as (keyof ShootSearchConditions)[]) {
    if (conditions[key]) params.set(PARAMS[key], conditions[key])
  }
  const query = params.toString()
  // router.replace はサーバに取りに行くので、入力のたびに通信が走りオフラインで失敗する
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
 * 運用フローと過去撮影登録の両方から、撮影済みの撮影を探す。入力すると結果がすぐ変わる。
 */
function ShootSearch() {
  const params = useSearchParams()
  const [conditions, setConditions] = useState<ShootSearchConditions>(() => readConditions(params))

  const records = useLiveQuery(() => loadShootArchive(), [], null)
  const suggestions = useLiveQuery(() => loadSuggestions(), [], {
    models: [],
    venues: [],
    events: [],
  })
  const results = useMemo(
    () => (records ? filterShootArchive(records, conditions) : null),
    [records, conditions],
  )

  const eventListId = useId()
  const modelListId = useId()
  const venueListId = useId()

  const update = (next: ShootSearchConditions) => {
    setConditions(next)
    writeConditions(next)
  }
  const set = (key: keyof ShootSearchConditions, value: string) =>
    update({ ...conditions, [key]: value })

  const reversedDates =
    conditions.dateFrom && conditions.dateTo && conditions.dateFrom > conditions.dateTo

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
        onSubmit={(e) => e.preventDefault()}
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

        <div>
          <button
            type="button"
            onClick={() => update(EMPTY_SHOOT_SEARCH)}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            条件をクリア
          </button>
        </div>
      </form>

      <section aria-label="検索結果" className="space-y-3">
        {results === null ? (
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
              <ResultTable rows={results} />
            )}
          </>
        )}
      </section>
    </div>
  )
}

function ResultTable({ rows }: { rows: ShootRecord[] }) {
  const buttonClass =
    'border-border hover:bg-navy-50 inline-block rounded-md border px-3 py-1 text-xs whitespace-nowrap dark:hover:bg-white/5'

  return (
    // 横に広いので、狭い画面ではこの中だけ横スクロールさせる。
    // relative が無いと sr-only（絶対配置）の見出しがこの外に出て、ページごと横に広がる
    <div className="bg-surface border-border relative overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[48rem] table-fixed text-left text-sm">
        <thead className="border-border text-muted border-b text-xs">
          <tr>
            <th scope="col" className="w-32 px-4 py-2.5 font-medium">
              撮影日
            </th>
            <th scope="col" className="w-36 px-4 py-2.5 font-medium">
              モデル
            </th>
            <th scope="col" className="w-48 px-4 py-2.5 font-medium">
              撮影会名
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              ストレージのURL
            </th>
            <th scope="col" className="w-36 px-4 py-2.5 font-medium">
              <span className="sr-only">操作</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((row) => (
            <tr key={`${row.source}:${row.id}`} className="align-top">
              <td className="px-4 py-3 whitespace-nowrap tabular-nums">{row.shootDate}</td>
              <td className="px-4 py-3 break-words">{row.modelNames.join('・') || '—'}</td>
              <td className="px-4 py-3 break-words">{row.title}</td>
              <td className="px-4 py-3">
                <StorageUrlList urls={row.storageUrls} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Link
                    href={shootRecordHref('detail', row)}
                    aria-label={`${row.title} の詳細`}
                    className={buttonClass}
                  >
                    詳細
                  </Link>
                  <Link
                    href={shootRecordHref('edit', row)}
                    aria-label={`${row.title} を編集`}
                    className={buttonClass}
                  >
                    編集
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
