import Link from 'next/link'

import { StorageUrlList } from '@/components/StorageUrlList'
import { shootRecordHref, type ShootRecord } from '@/lib/queries/archives'

const BUTTON_CLASS =
  'tap-target border-border hover:bg-navy-50 inline-block rounded-md border px-3 py-1 text-xs whitespace-nowrap dark:hover:bg-white/5'

/**
 * 過去の撮影の一覧。撮影情報検索の結果と過去撮影一覧で共通。並び順は渡された順のまま。
 * スマホではカード、それより広い画面では表で出す（表は横に広く、スマホでは横スクロールになるため）。
 */
export function ShootRecordTable({ rows }: { rows: ShootRecord[] }) {
  return (
    <>
      <ShootRecordCards rows={rows} />
      <ShootRecordGrid rows={rows} />
    </>
  )
}

function ShootRecordCards({ rows }: { rows: ShootRecord[] }) {
  return (
    <ul className="space-y-3 sm:hidden">
      {rows.map((row) => (
        <li key={`${row.source}:${row.id}`} className="bg-surface border-border rounded-lg border p-4">
          <p className="text-muted text-xs tabular-nums">{row.shootDate}</p>
          <h3 className="mt-0.5 font-medium break-words">{row.eventName ?? '—'}</h3>
          <p className="text-muted mt-0.5 text-sm break-words">
            {row.modelNames.join('・') || 'モデルなし'}
          </p>
          {row.concept && <p className="mt-0.5 text-sm break-words">{row.concept}</p>}
          <div className="mt-2 min-w-0">
            <StorageUrlList urls={row.storageUrls} />
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              href={shootRecordHref('detail', row)}
              aria-label={`${row.title} の詳細`}
              className={`${BUTTON_CLASS} flex-1 text-center`}
            >
              詳細
            </Link>
            <Link
              href={shootRecordHref('edit', row)}
              aria-label={`${row.title} を編集`}
              className={`${BUTTON_CLASS} flex-1 text-center`}
            >
              編集
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}

function ShootRecordGrid({ rows }: { rows: ShootRecord[] }) {
  return (
    // relative が無いと sr-only（絶対配置）の見出しがこの外に出て、ページごと横に広がる
    <div className="bg-surface border-border relative hidden overflow-x-auto rounded-lg border sm:block">
      <table className="w-full min-w-[60rem] table-fixed text-left text-sm">
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
            <th scope="col" className="w-48 px-4 py-2.5 font-medium">
              撮影コンセプト
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
              <td className="px-4 py-3 break-words">{row.eventName ?? '—'}</td>
              <td className="px-4 py-3 break-words">{row.concept ?? '—'}</td>
              <td className="px-4 py-3">
                <StorageUrlList urls={row.storageUrls} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2">
                  <Link
                    href={shootRecordHref('detail', row)}
                    aria-label={`${row.title} の詳細`}
                    className={BUTTON_CLASS}
                  >
                    詳細
                  </Link>
                  <Link
                    href={shootRecordHref('edit', row)}
                    aria-label={`${row.title} を編集`}
                    className={BUTTON_CLASS}
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
