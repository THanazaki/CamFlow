import type { Enums } from '@/types/database'

export type FeePaymentTiming = Enums<'fee_payment_timing'>

/** 表示順もこの順 */
export const FEE_PAYMENT_TIMINGS: { value: FeePaymentTiming; label: string }[] = [
  { value: 'on_the_day', label: '当日' },
  { value: 'in_advance', label: '事前' },
  { value: 'paid', label: '支払済み' },
]

/**
 * 予約の段階での呼び方。値は同じで、paid だけ「予約時」と出す。
 * 予約時に払った分は確定の時点で支払済みなので、確定撮影情報入力へは「支払済み」として引き継ぐ。
 */
export const RESERVATION_FEE_PAYMENT_TIMINGS: { value: FeePaymentTiming; label: string }[] =
  FEE_PAYMENT_TIMINGS.map((t) => (t.value === 'paid' ? { ...t, label: '予約時' } : t))

/** この支払方法で支払日を入力するか */
export function feePaymentHasDate(timing: FeePaymentTiming | null): boolean {
  return timing === 'in_advance'
}

export function feePaymentTimingLabel(timing: FeePaymentTiming): string {
  return FEE_PAYMENT_TIMINGS.find((t) => t.value === timing)!.label
}

export function reservationFeePaymentTimingLabel(timing: FeePaymentTiming): string {
  return RESERVATION_FEE_PAYMENT_TIMINGS.find((t) => t.value === timing)!.label
}
