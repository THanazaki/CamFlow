'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { loadOrganizerList } from '@/lib/queries/organizers'

/**
 * 撮影会マスタ。
 * 暫定版として、登録済みの撮影会を表示するだけ。編集はまだできない。
 */
export default function OrganizerMasterPage() {
  const rows = useLiveQuery(() => loadOrganizerList(), [], null)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">撮影会マスタ</h1>
        <p className="text-muted mt-1 text-sm">登録されている撮影会の一覧です。</p>
      </header>

      {rows === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : rows.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          <p className="text-foreground font-medium">撮影会がまだ登録されていません</p>
          <p className="mt-1">予約や撮影の登録時に入力した撮影会名がここに表示されます。</p>
        </div>
      ) : (
        <div className="bg-surface border-border overflow-hidden rounded-lg border">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-border text-muted border-b text-xs">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  撮影会名
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  拠点
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium break-words">{row.name}</td>
                  <td className="px-4 py-3 break-words">
                    {row.baseLocation || <span className="text-muted">—</span>}
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
