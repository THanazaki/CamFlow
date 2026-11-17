"use client";

import { KanaRowTabs } from "@/components/KanaRowTabs";
import { kanaRowOf } from "@/lib/kana-row";

export function StatsTable({
  title,
  hint,
  columns,
  rows,
  emptyText,
}: {
  title: string;
  hint?: string;
  /** 名前 → 件数の列（counts と同じ数）→ 初日 → 最新日 の順 */
  columns: string[];
  rows: {
    id: string;
    name: string;
    nameKana: string | null;
    counts: number[];
    firstDate: string | null;
    lastDate: string | null;
  }[];
  emptyText: string;
}) {
  const countLabels = columns.slice(1, -2);
  const [firstLabel, lastLabel] = columns.slice(-2);
  return (
    <section aria-label={title} className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-muted mt-0.5 text-xs">{hint}</p>}
      </div>
      {rows.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          {emptyText}
        </div>
      ) : (
        <KanaRowTabs rows={rows} rowOf={(r) => kanaRowOf(r.name, r.nameKana)}>
          {(rows) => (
            <>
              {/* スマホではカード、それより広い画面では表 */}
              <ul className="space-y-2 sm:hidden">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="bg-surface border-border rounded-lg border px-4 py-3"
                  >
                    <span className="block font-medium break-words">
                      {row.name}
                    </span>
                    <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums">
                      {countLabels.map((label, i) => (
                        <div key={label} className="flex justify-between gap-2">
                          <dt className="text-muted">{label}</dt>
                          <dd className="text-foreground text-sm">
                            {row.counts[i]}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <dl className="text-muted mt-1 flex flex-wrap gap-x-4 text-xs tabular-nums">
                      <div className="flex gap-1">
                        <dt>{firstLabel}</dt>
                        <dd className="text-foreground">
                          {row.firstDate ?? "—"}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt>{lastLabel}</dt>
                        <dd className="text-foreground">
                          {row.lastDate ?? "—"}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
              <div className="bg-surface border-border hidden overflow-x-auto rounded-lg border sm:block">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="border-border text-muted border-b text-xs">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        {columns[0]}
                      </th>
                      {countLabels.map((label) => (
                        <th
                          key={label}
                          scope="col"
                          className="px-4 py-2.5 text-right font-medium whitespace-nowrap"
                        >
                          {label}
                        </th>
                      ))}
                      <th scope="col" className="w-32 px-4 py-2.5 font-medium">
                        {firstLabel}
                      </th>
                      <th scope="col" className="w-32 px-4 py-2.5 font-medium">
                        {lastLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 font-medium break-words">
                          {row.name}
                        </td>
                        {row.counts.map((n, i) => (
                          <td
                            key={i}
                            className="px-4 py-3 text-right tabular-nums"
                          >
                            {n}
                          </td>
                        ))}
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {row.firstDate ?? "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                          {row.lastDate ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </KanaRowTabs>
      )}
    </section>
  );
}
