'use client'

import { useState, type ReactNode } from 'react'

import { groupByKanaRow, OTHER_ROW, type KanaRow } from '@/lib/kana-row'

/**
 * マスタ一覧を50音の行（あ・か・さ…）ごとのタブに分ける。
 * 行が空のタブは出さない。選んだ行の行が無くなったら先頭のタブに戻る。
 */
export function KanaRowTabs<T>({
  rows,
  rowOf,
  children,
}: {
  rows: T[]
  rowOf: (row: T) => KanaRow
  children: (rows: T[]) => ReactNode
}) {
  const [picked, setPicked] = useState<KanaRow | null>(null)
  const groups = groupByKanaRow(rows, rowOf)
  const current = groups.find((g) => g.row === picked) ?? groups[0]
  if (!current) return null

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="50音の行の切り替え"
        className="border-border flex gap-1 overflow-x-auto border-b"
      >
        {groups.map((g) => (
          <button
            key={g.row}
            type="button"
            role="tab"
            id={`kana-tab-${g.row}`}
            aria-selected={current.row === g.row}
            aria-controls="kana-panel"
            onClick={() => setPicked(g.row)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
              current.row === g.row
                ? 'border-navy-600 text-foreground'
                : 'text-muted hover:text-foreground border-transparent'
            }`}
          >
            {g.row === OTHER_ROW ? '他' : `${g.row}行`}
            <span className="text-muted ml-1 text-xs font-normal tabular-nums">
              {g.items.length}
            </span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id="kana-panel" aria-labelledby={`kana-tab-${current.row}`}>
        {children(current.items)}
      </div>
    </div>
  )
}
