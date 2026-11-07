import type { Enums } from '@/types/database'

export type ModelStatus = Enums<'model_status'>

export const DEFAULT_MODEL_STATUS: ModelStatus = 'active'

/** 表示順もこの順 */
export const MODEL_STATUSES: { value: ModelStatus; label: string }[] = [
  { value: 'active', label: '稼働中' },
  { value: 'inactive', label: '休止・引退' },
  { value: 'ng', label: '今後撮影しない' },
]

export function modelStatusLabel(status: ModelStatus): string {
  return MODEL_STATUSES.find((s) => s.value === status)!.label
}
