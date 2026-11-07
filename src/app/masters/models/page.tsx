'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'

import { loadModelList } from '@/lib/queries/models'

const BUTTON_CLASS =
  'border-border hover:bg-navy-50 inline-block rounded-md border px-3 py-1 text-xs whitespace-nowrap dark:hover:bg-white/5'

/**
 * モデルマスタ。
 * 登録済みのモデルの一覧。各行から詳細と編集の画面へ進む。
 * モデルは各画面の入力で自動で登録されるので、ここからの新規登録はまだ無い。
 */
export default function ModelMasterPage() {
  const rows = useLiveQuery(() => loadModelList(), [], null)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">モデルマスタ</h1>
        <p className="text-muted mt-1 text-sm">登録されているモデルの一覧です。</p>
      </header>

      {rows === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : rows.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          <p className="text-foreground font-medium">モデルがまだ登録されていません</p>
          <p className="mt-1">予約や撮影の登録時に入力したモデルがここに表示されます。</p>
        </div>
      ) : (
        // relative が無いと sr-only（絶対配置）の見出しがこの外に出て、ページごと横に広がる
        <div className="bg-surface border-border relative overflow-hidden rounded-lg border">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-border text-muted border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  モデル名
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  所属
                </th>
                <th scope="col" className="w-36 px-4 py-2.5 font-medium">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium break-words">{row.name}</td>
                  <td className="px-4 py-3 break-words">
                    {row.affiliation || <span className="text-muted">—</span>}
                    {row.otherAffiliationCount > 0 && (
                      <span className="text-muted ml-1 text-xs">
                        ほか{row.otherAffiliationCount}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/masters/models/detail?id=${encodeURIComponent(row.id)}`}
                        aria-label={`${row.name} の詳細`}
                        className={BUTTON_CLASS}
                      >
                        詳細
                      </Link>
                      <Link
                        href={`/masters/models/edit?id=${encodeURIComponent(row.id)}`}
                        aria-label={`${row.name} を編集`}
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
      )}
    </div>
  )
}
