"use client";

import type { ModelHistoryStat } from "@/lib/queries/stats";

/** 初撮影日が無い（撮影予定しか無い）モデルのグループ名 */
const NO_SHOOT = "撮影予定のみ";

/**
 * 初撮影年ごとにモデルをまとめて出す。年は新しい順。
 * 年の中は初撮影日の古い順（同じ日は50音順）。撮影予定しか無いモデルは最後にまとめる。
 */
export function FirstYearList({ models }: { models: ModelHistoryStat[] }) {
  const groups = new Map<string, ModelHistoryStat[]>();
  // models は50音順なので、安定ソートで同じ日の中の並びが50音になる
  const ordered = [...models].sort((a, b) =>
    (a.firstDate ?? "9").localeCompare(b.firstDate ?? "9"),
  );
  for (const m of ordered) {
    const key = m.firstDate ? `${m.firstDate.slice(0, 4)}年` : NO_SHOOT;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === NO_SHOOT || b === NO_SHOOT) return a === NO_SHOOT ? 1 : -1;
    return b.localeCompare(a);
  });

  if (keys.length === 0) {
    return (
      <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
        撮影実績・撮影予定のあるモデルはまだありません
      </div>
    );
  }

  return (
    <section aria-label="初撮影年" className="space-y-5">
      {keys.map((key) => (
        <div key={key} className="space-y-2">
          <h2 className="text-base font-semibold">
            {key}
            <span className="text-muted ml-2 text-xs font-normal tabular-nums">
              {groups.get(key)!.length}人
            </span>
          </h2>
          <ul className="bg-surface border-border divide-border divide-y rounded-lg border">
            {groups.get(key)!.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">
                    {m.name}
                  </span>
                  <span className="text-muted block text-xs tabular-nums">
                    初撮影 {m.firstDate ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-muted block text-xs">撮影回数</span>
                  <span className="block font-semibold tabular-nums">
                    {m.shootCount}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
