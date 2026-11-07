import type { Enums } from '@/types/database'

export type ModelStatus = Enums<'model_status'>

/** 画面で選べるステータス。DB の enum に残っている ng（今後撮影しない）は使わない */
export type SelectableModelStatus = Exclude<ModelStatus, 'ng'>

export const DEFAULT_MODEL_STATUS: SelectableModelStatus = 'active'

/** 表示順もこの順 */
export const MODEL_STATUSES: { value: SelectableModelStatus; label: string }[] = [
  { value: 'active', label: '活動中' },
  { value: 'inactive', label: '休止・引退' },
]

/**
 * 画面で扱うステータスにそろえる。
 * 選択肢から外した ng（今後撮影しない）の行は、休止・引退として扱う。
 */
export function toSelectableModelStatus(status: ModelStatus | null | undefined): SelectableModelStatus {
  if (status === 'ng') return 'inactive'
  return status ?? DEFAULT_MODEL_STATUS
}

export function modelStatusLabel(status: ModelStatus): string {
  const selectable = toSelectableModelStatus(status)
  return MODEL_STATUSES.find((s) => s.value === selectable)!.label
}
