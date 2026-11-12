"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useId, useState } from "react";

import { Field, inputClass } from "@/components/forms/ShootDetailsFields";
import { ShootOptionTextFields } from "@/components/forms/ShootOptionsFields";
import {
  createWishlistModel,
  deleteWishlistModel,
  updateWishlistModel,
  type WishlistInput,
} from "@/lib/actions/wishlist";
import { getActiveUserId } from "@/lib/auth/session";
import { loadSuggestions } from "@/lib/queries/reservations";
import { loadWishlist, type WishlistRow } from "@/lib/queries/wishlist";

const EMPTY: WishlistInput = {
  modelName: "",
  eventName: "",
  costumeOptions: "",
  shootingMethodOptions: "",
};

/**
 * 撮影希望モデル登録。
 * いつか撮りたいモデルを控えておく画面。予約情報入力で、ここの控えから選んで入力できる。
 */
export default function WishlistPage() {
  const rows = useLiveQuery(() => loadWishlist(), [], null);
  const suggestions = useLiveQuery(() => loadSuggestions(), [], {
    models: [],
    venues: [],
    events: [],
  });

  const [form, setForm] = useState<WishlistInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const modelListId = useId();
  const eventListId = useId();

  const set = (key: keyof WishlistInput, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const userId = await getActiveUserId();
      if (!userId) {
        setError(
          "ユーザー情報を取得できませんでした。.env.local の設定を確認し、一度オンラインで開いてください。",
        );
        return;
      }
      if (editingId) {
        await updateWishlistModel(userId, editingId, form);
        setEditingId(null);
      } else {
        await createWishlistModel(userId, form);
      }
      setForm(EMPTY);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: WishlistRow) => {
    setEditingId(row.id);
    setForm({
      modelName: row.modelName,
      eventName: row.eventName ?? "",
      costumeOptions: row.costumeOptions ?? "",
      shootingMethodOptions: row.shootingMethodOptions ?? "",
    });
    setSaved(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
    setSaved(false);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          撮影希望モデル登録
        </h1>
        <p className="text-muted mt-1 text-sm">
          撮影してみたいモデルを登録して、控えておけます。
        </p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        className="bg-surface border-border space-y-5 rounded-lg border p-5"
      >
        <Field
          label="モデル名"
          required
          hint="マスタに無い名前はそのまま新規登録されます"
        >
          {(p) => (
            <>
              <input
                {...p}
                type="text"
                required
                list={modelListId}
                value={form.modelName}
                onChange={(e) => set("modelName", e.target.value)}
                placeholder="栞奈"
                className={inputClass}
              />
              <datalist id={modelListId}>
                {suggestions.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field label="撮影会名">
          {(p) => (
            <>
              <input
                {...p}
                type="text"
                list={eventListId}
                value={form.eventName}
                onChange={(e) => set("eventName", e.target.value)}
                placeholder="ポートレート撮影会 秋の回"
                className={inputClass}
              />
              <datalist id={eventListId}>
                {suggestions.events.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <ShootOptionTextFields values={form} onChange={set} />

        <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "保存中…" : editingId ? "変更を保存" : "撮影希望を登録"}
          </button>
          <button
            type="button"
            onClick={
              editingId
                ? cancelEdit
                : () => {
                    setForm(EMPTY);
                    setSaved(false);
                  }
            }
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            {editingId ? "編集をやめる" : "クリア"}
          </button>
          {saved && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              保存しました
            </span>
          )}
          {editingId && <span className="text-muted text-xs">編集中</span>}
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">登録済みの撮影希望</h2>
        {rows === null ? (
          <p className="text-muted text-sm">読み込み中…</p>
        ) : rows.length === 0 ? (
          <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
            撮影希望のモデルはまだ登録されていません
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <WishlistCard
                key={row.id}
                row={row}
                editing={row.id === editingId}
                onEdit={() => startEdit(row)}
                onDeleted={() => row.id === editingId && cancelEdit()}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function WishlistCard({
  row,
  editing,
  onEdit,
  onDeleted,
}: {
  row: WishlistRow;
  editing: boolean;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const onDelete = async () => {
    if (
      !confirm(
        `撮影希望「${row.modelName}」を削除します。よろしいですか？\nモデルマスタのモデルは残ります。`,
      )
    )
      return;
    try {
      await deleteWishlistModel(row.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <li className="bg-surface border-border rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium">
          <span className="min-w-0 break-words">{row.modelName}</span>
        </h3>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={editing}
            className="border-border hover:bg-navy-50 tap-target shrink-0 rounded-md border px-3 py-1 text-xs disabled:opacity-50 dark:hover:bg-white/5"
          >
            {editing ? "編集中" : "編集"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="tap-target shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            削除
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {(row.eventName || row.costumeOptions || row.shootingMethodOptions) && (
        <dl className="text-muted mt-2 space-y-1 text-sm">
          {row.eventName && <Row label="撮影会名">{row.eventName}</Row>}
          {row.costumeOptions && <Row label="衣装系">{row.costumeOptions}</Row>}
          {row.shootingMethodOptions && (
            <Row label="撮影方法">{row.shootingMethodOptions}</Row>
          )}
        </dl>
      )}
    </li>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-xs leading-5">{label}</dt>
      <dd className="text-foreground min-w-0 break-words">{children}</dd>
    </div>
  );
}
