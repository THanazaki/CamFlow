'use client'

import { Field, inputClass } from '@/components/forms/ShootDetailsFields'
import type { ShootOptionsInput } from '@/lib/actions/shoots'

export const EMPTY_SHOOT_OPTIONS: ShootOptionsInput = {
  shootFee: '',
  costumeOptions: '',
  shootingMethodOptions: '',
}

/** 撮影料とオプションの入力欄。確定撮影情報入力と確定撮影情報で共通 */
export function ShootOptionsFields({
  values,
  onChange,
  feeAside,
}: {
  values: ShootOptionsInput
  onChange: <K extends keyof ShootOptionsInput>(key: K, value: ShootOptionsInput[K]) => void
  /** 撮影料の隣に並べる欄。確定撮影情報入力の支払方法 */
  feeAside?: React.ReactNode
}) {
  return (
    <>
      <div className={feeAside ? 'grid items-start gap-4 sm:grid-cols-2' : undefined}>
        <Field label="撮影料（円）">
          {(p) => (
            <input
              {...p}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={values.shootFee}
              onChange={(e) => onChange('shootFee', e.target.value)}
              placeholder="15000"
              className={inputClass}
            />
          )}
        </Field>
        {feeAside}
      </div>

      <Field label="衣装系オプション">
        {(p) => (
          <input
            {...p}
            type="text"
            value={values.costumeOptions}
            onChange={(e) => onChange('costumeOptions', e.target.value)}
            placeholder="浴衣、私服"
            className={inputClass}
          />
        )}
      </Field>

      <Field label="撮影方法オプション">
        {(p) => (
          <input
            {...p}
            type="text"
            value={values.shootingMethodOptions}
            onChange={(e) => onChange('shootingMethodOptions', e.target.value)}
            placeholder="動画撮影、ストロボ使用"
            className={inputClass}
          />
        )}
      </Field>
    </>
  )
}
