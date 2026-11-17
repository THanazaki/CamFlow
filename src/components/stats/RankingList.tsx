"use client";

import type { HistoryStats } from "@/lib/queries/stats";
import { rankBy } from "@/lib/ranking";

export type StatsKind = "models" | "organizers";

/** ランキング。撮影実績（予定は含めない）の多い順に上位20位まで */
export function RankingList({
  kind,
  stats,
}: {
  kind: StatsKind;
  stats: HistoryStats;
}) {
  const rows =
    kind === "models"
      ? rankBy(stats.models, (m) => m.soloCount, Infinity).map((r) => ({
          id: r.item.id,
          rank: r.rank,
          name: r.item.name,
          count: r.item.soloCount,
          lastDate: r.item.lastDate,
          extras: [] as { label: string; value: number }[],
        }))
      : rankBy(stats.organizers, (o) => o.modelCount).map((r) => ({
          id: r.item.id,
          rank: r.rank,
          name: r.item.name,
          count: r.item.modelCount,
          lastDate: r.item.lastDate,
          extras: [
            { label: "撮影会利用回数", value: r.item.useCount },
            { label: "撮影会利用予定回数", value: r.item.plannedUseCount },
          ],
        }));
  const unit = kind === "models" ? "個撮回数" : "撮影モデル数";

  return (
    <section aria-label="ランキング" className="space-y-3">
      <p className="text-muted text-xs">
        {kind === "models"
          ? "個撮の回数が多い順に、個撮の実績があるモデルをすべて表示します（撮影予定は含めません）。同じ数は同順位です。"
          : "撮影実績の多い順に、上位20位までを表示します（撮影予定は含めません）。同じ数は同順位です。"}
      </p>
      {rows.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          {kind === "models"
            ? "個撮の実績のあるモデル"
            : "撮影実績のある撮影会"}
          はまだありません
        </div>
      ) : (
        <ol className="bg-surface border-border divide-border divide-y rounded-lg border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
            >
              <span
                className={`w-8 shrink-0 text-center text-base font-semibold tabular-nums ${
                  row.rank <= 3
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted"
                }`}
              >
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium break-words sm:truncate">
                  {row.name}
                </span>
                <span className="text-muted block text-xs tabular-nums">
                  最新 {row.lastDate ?? "—"}
                </span>
              </span>
              <span className="flex w-full shrink-0 gap-4 pl-11 sm:w-auto sm:pl-0 sm:text-right">
                {row.extras.map((x) => (
                  <span key={x.label}>
                    <span className="text-muted block text-xs">{x.label}</span>
                    <span className="block tabular-nums">{x.value}</span>
                  </span>
                ))}
                <span>
                  <span className="text-muted block text-xs">{unit}</span>
                  <span className="block font-semibold tabular-nums">
                    {row.count}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
