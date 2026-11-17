"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { RankingList, type StatsKind } from "@/components/stats/RankingList";
import { StatsTable } from "@/components/stats/StatsTable";
import { loadHistoryStats } from "@/lib/queries/stats";

type Tab = "ranking" | "history";

const TABS: { key: Tab; label: string }[] = [
  { key: "ranking", label: "ランキング" },
  { key: "history", label: "全撮影データ" },
];

const TITLES: Record<StatsKind, string> = {
  models: "モデル別情報",
  organizers: "撮影会別情報",
};

/** モデル別情報・撮影会別情報。「ランキング」と「全撮影データ」をタブで切り替えて表示する */
export function EntityStats({ kind }: { kind: StatsKind }) {
  const stats = useLiveQuery(() => loadHistoryStats(), [], null);
  const [tab, setTab] = useState<Tab>("ranking");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {TITLES[kind]}
        </h1>
        <p className="text-muted mt-1 text-sm">
          撮影日を過ぎた確定済みの撮影と、過去撮影登録で登録した撮影の実績です。撮影予定は、確定済みでまだ撮影日時になっていない撮影を数えます（予約中のものは含めません）。
        </p>
      </header>

      <div
        role="tablist"
        aria-label="表示の切り替え"
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
          {tab === "ranking" ? (
            <RankingList kind={kind} stats={stats} />
          ) : kind === "models" ? (
            <StatsTable
              title="全撮影データ"
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
              title="全撮影データ"
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
