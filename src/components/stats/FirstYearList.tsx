"use client";

/** 初撮影年・初利用年の一覧の1行 */
export interface FirstYearItem {
  id: string;
  name: string;
  /** 撮影予定しか無いものは null */
  firstDate: string | null;
  /** 右側に出す件数 */
  count: number;
}

/** 初日が無い（撮影予定しか無い）もののグループ名 */
const NO_SHOOT = "撮影予定のみ";

/**
 * 初撮影日（初利用日）の年ごとにまとめて出す。年は新しい順。
 * 年の中は初日の古い順（同じ日は渡された順＝50音順）。撮影予定しか無いものは最後にまとめる。
 */
export function FirstYearList({
  items,
  dateLabel,
  countLabel,
  emptyText,
  title,
}: {
  items: FirstYearItem[];
  /** 「初撮影」「初利用」 */
  dateLabel: string;
  countLabel: string;
  emptyText: string;
  title: string;
}) {
  const groups = new Map<string, FirstYearItem[]>();
  // 安定ソート。同じ日の中は渡された順（50音順）のまま
  const ordered = [...items].sort((a, b) =>
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
        {emptyText}
      </div>
    );
  }

  return (
    <section aria-label={title} className="space-y-5">
      {keys.map((key) => (
        <div key={key} className="space-y-2">
          <h2 className="text-base font-semibold">
            {key}
            <span className="text-muted ml-2 text-xs font-normal tabular-nums">
              {groups.get(key)!.length}件
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
                    {dateLabel} {m.firstDate ?? "—"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-muted block text-xs">{countLabel}</span>
                  <span className="block font-semibold tabular-nums">
                    {m.count}
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
