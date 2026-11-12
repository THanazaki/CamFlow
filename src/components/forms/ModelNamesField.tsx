import { useId } from "react";

import { Field, inputClass } from "@/components/forms/ShootDetailsFields";
import { MAX_MODELS } from "@/lib/shoot-category";

/**
 * モデル名の入力欄。1人目は必須で、2人目以降は最大 MAX_MODELS 人まで追加できる。
 * 予約情報入力・確定撮影情報入力・過去撮影登録・各編集画面で共通
 */
export function ModelNamesField({
  modelName,
  extraModelNames,
  suggestions,
  onChange,
}: {
  modelName: string;
  extraModelNames: string[];
  suggestions: string[];
  onChange: (modelName: string, extraModelNames: string[]) => void;
}) {
  const listId = useId();
  const count = 1 + extraModelNames.length;

  const setExtra = (index: number, value: string) =>
    onChange(
      modelName,
      extraModelNames.map((n, i) => (i === index ? value : n)),
    );

  return (
    <Field
      label="モデル名"
      required
      hint="マスタに無い名前はそのまま新規登録されます"
    >
      {(p) => (
        <div className="space-y-2">
          <input
            {...p}
            type="text"
            required
            list={listId}
            value={modelName}
            onChange={(e) => onChange(e.target.value, extraModelNames)}
            placeholder="栞奈"
            className={inputClass}
          />
          {extraModelNames.map((name, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                list={listId}
                value={name}
                onChange={(e) => setExtra(i, e.target.value)}
                aria-label={`モデル名（${i + 2}人目）`}
                placeholder={`${i + 2}人目のモデル名`}
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  onChange(
                    modelName,
                    extraModelNames.filter((_, j) => j !== i),
                  )
                }
                className="border-border hover:bg-navy-50 tap-target shrink-0 rounded-md border px-3 text-xs dark:hover:bg-white/5"
              >
                削除
              </button>
            </div>
          ))}
          <datalist id={listId}>
            {suggestions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {count < MAX_MODELS && (
            <button
              type="button"
              onClick={() => onChange(modelName, [...extraModelNames, ""])}
              className="border-border hover:bg-navy-50 rounded-md border px-3 py-1.5 text-xs dark:hover:bg-white/5"
            >
              ＋ モデルを追加（{count}/{MAX_MODELS}人）
            </button>
          )}
        </div>
      )}
    </Field>
  );
}
