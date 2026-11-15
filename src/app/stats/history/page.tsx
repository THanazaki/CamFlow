"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { KanaRowTabs } from "@/components/KanaRowTabs";
import { kanaRowOf } from "@/lib/kana-row";
import { loadHistoryStats } from "@/lib/queries/stats";

type Tab = "models" | "organizers";

const TABS: { key: Tab; label: string }[] = [
  { key: "models", label: "モデル別情報" },
  { key: "organizers", label: "撮影会別情報" },
];

/** 全撮影データ。モデル別情報と撮影会別情報をタブで切り替えて表示する */
export default function HistoryStatsPage() {
  const stats = useLiveQuery(() => loadHistoryStats(), [], null);
  const [tab, setTab] = useState<Tab>("models");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">全撮影データ</h1>
        <p className="text-muted mt-1 text-sm">
          撮影日を過ぎた確定済みの撮影と、過去撮影登録で登録した撮影の実績です。撮影予定は、確定済みでまだ撮影日時になっていない撮影を数えます（予約中のものは含めません）。
        </p>
      </header>

      <div
        role="tablist"
        aria-label="集計の切り替え"
        className="border-border flex gap-1 border-b"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-navy-600 text-foreground"
                : "text-muted hover:text-foreground border-transparent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {stats === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : (
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "models" ? (
            <StatsTable
              title="モデル別情報"
              columns={[
                "モデル名",
                "撮影回数",
                "撮影予定回数",
                "初撮影日",
                "最新撮影日",
              ]}
              rows={stats.models.map((m) => ({
                id: m.id,
                name: m.name,
                nameKana: m.nameKana,
                counts: [m.shootCount, m.plannedCount],
                firstDate: m.firstDate,
                lastDate: m.lastDate,
              }))}
              emptyText="撮影実績・撮影予定のあるモデルはまだありません"
            />
          ) : (
            <StatsTable
              title="撮影会別情報"
              hint="撮影会名を入力した撮影だけを集計します"
              columns={[
                "撮影会名",
                "撮影モデル数",
                "撮影予定モデル数",
                "撮影会利用回数",
                "撮影会利用予定回数",
                "初利用日",
                "最新利用日",
              ]}
              rows={stats.organizers.map((o) => ({
                id: o.id,
                name: o.name,
                nameKana: o.nameKana,
                counts: [
                  o.modelCount,
                  o.plannedModelCount,
                  o.useCount,
                  o.plannedUseCount,
                ],
                firstDate: o.firstDate,
                lastDate: o.lastDate,
              }))}
              emptyText="撮影実績・撮影予定のある撮影会はまだありません"
            />
          )}
        </div>
      )}
    </div>
  );
}

function StatsTable({
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
