import type { Enums } from '@/types/database'

export type FeePaymentTiming = Enums<'fee_payment_timing'>

/** 表示順もこの順 */
export const FEE_PAYMENT_TIMINGS: { value: FeePaymentTiming; label: string }[] = [
  { value: 'on_the_day', label: '当日' },
  { value: 'in_advance', label: '事前' },
  { value: 'paid', label: '支払済み' },
]

/** この支払方法で支払日を入力するか */
export function feePaymentHasDate(timing: FeePaymentTiming | null): boolean {
  return timing === 'in_advance'
}

export function feePaymentTimingLabel(timing: FeePaymentTiming): string {
  return FEE_PAYMENT_TIMINGS.find((t) => t.value === timing)!.label
}
