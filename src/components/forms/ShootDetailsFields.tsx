'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { useId } from 'react'

import { ChoicePicker } from '@/components/forms/ChoicePicker'
import { ShootCategoryPicker } from '@/components/forms/ShootCategoryPicker'
import type { ShootDetailsInput } from '@/lib/actions/shoots'
import {
  categoryHasMeetingPoint,
  DEFAULT_PLACE_CATEGORY,
  PLACE_CATEGORIES,
} from '@/lib/place-category'
import { loadSuggestions } from '@/lib/queries/reservations'
import { categoryHasModel, DEFAULT_SHOOT_CATEGORY } from '@/lib/shoot-category'

export const EMPTY_SHOOT_DETAILS: ShootDetailsInput = {
  eventName: '',
  shootCategory: DEFAULT_SHOOT_CATEGORY,
  modelName: '',
  modelX: '',
  modelInstagram: '',
  concept: '',
  placeCategory: DEFAULT_PLACE_CATEGORY,
  venueName: '',
  meetingPoint: '',
  shootDate: '',
}

/** 撮影会名から撮影日までの入力欄。確定撮影情報入力と過去撮影登録で共通 */
export function ShootDetailsFields({
  values,
  onChange,
  maxShootDate,
}: {
  values: ShootDetailsInput
  onChange: <K extends keyof ShootDetailsInput>(key: K, value: ShootDetailsInput[K]) => void
  /** 選べる撮影日の上限（YYYY-MM-DD） */
  maxShootDate?: string
}) {
  const suggestions = useLiveQuery(() => loadSuggestions(), [], {
    models: [],
    venues: [],
    events: [],
  })

  const eventListId = useId()
  const modelListId = useId()
  const venueListId = useId()

  const hasModel = categoryHasModel(values.shootCategory)
  const hasMeetingPoint = categoryHasMeetingPoint(values.placeCategory)

  return (
    <>
      <Field label="撮影会名">
        {(p) => (
          <>
            <input
              {...p}
              type="text"
              list={eventListId}
              value={values.eventName}
              onChange={(e) => onChange('eventName', e.target.value)}
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

      <Field label="撮影区分" required>
        {(p) => (
          <ShootCategoryPicker
            id={p.id}
            value={values.shootCategory}
            onChange={(v) => onChange('shootCategory', v)}
          />
        )}
      </Field>

      {hasModel && (
        <>
          <Field label="モデル名" required hint="マスタに無い名前はそのまま新規登録されます">
            {(p) => (
              <>
                <input
                  {...p}
                  type="text"
                  required
                  list={modelListId}
                  value={values.modelName}
                  onChange={(e) => onChange('modelName', e.target.value)}
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

          <Field
            label="モデルアカウント"
            hint="入力するとモデルマスタに保存します。空欄なら既存のリンクはそのまま残ります"
          >
            {(p) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  {...p}
                  type="text"
                  value={values.modelX}
                  onChange={(e) => onChange('modelX', e.target.value)}
                  placeholder="X: @example"
                  aria-label="X アカウント"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={values.modelInstagram}
                  onChange={(e) => onChange('modelInstagram', e.target.value)}
                  placeholder="Instagram: @example"
                  aria-label="Instagram アカウント"
                  className={inputClass}
                />
              </div>
            )}
          </Field>
        </>
      )}

      <Field label="撮影コンセプト">
        {(p) => (
          <input
            {...p}
            type="text"
            value={values.concept}
            onChange={(e) => onChange('concept', e.target.value)}
            placeholder="白ホリ・ナチュラル"
            className={inputClass}
          />
        )}
      </Field>

      <Field label="場所区分" required>
        {(p) => (
          <ChoicePicker
            id={p.id}
            name="placeCategory"
            label="場所区分"
            options={PLACE_CATEGORIES}
            value={values.placeCategory}
            onChange={(v) => onChange('placeCategory', v)}
          />
        )}
      </Field>

      <Field label="場所" hint="マスタに同名があれば紐づきます。無ければ名前だけ残ります">
        {(p) => (
          <>
            <input
              {...p}
              type="text"
              list={venueListId}
              value={values.venueName}
              onChange={(e) => onChange('venueName', e.target.value)}
              placeholder={hasMeetingPoint ? '代々木公園' : 'スタジオ ルミエール'}
              className={inputClass}
            />
            <datalist id={venueListId}>
              {suggestions.venues.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      {hasMeetingPoint && (
        <Field label="集合場所">
          {(p) => (
            <input
              {...p}
              type="text"
              value={values.meetingPoint}
              onChange={(e) => onChange('meetingPoint', e.target.value)}
              placeholder="原宿駅 表参道口"
              className={inputClass}
            />
          )}
        </Field>
      )}

      <Field label="撮影日" required>
        {(p) => (
          <input
            {...p}
            type="date"
            required
            max={maxShootDate}
            value={values.shootDate}
            onChange={(e) => onChange('shootDate', e.target.value)}
            className={inputClass}
          />
        )}
      </Field>
    </>
  )
}

export const inputClass =
  'bg-background border-border focus:border-navy-500 focus:ring-navy-500/30 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2'

interface FieldControlProps {
  id: string
  'aria-describedby'?: string
}

/** ヒントは label の外に出し aria-describedby で結びつける（読み上げ名を汚さない） */
export function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: (props: FieldControlProps) => React.ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">
        {label}
        {required && (
          <span className="text-red-600 dark:text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-muted mt-0.5 text-xs">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children({ id, 'aria-describedby': hint ? hintId : undefined })}</div>
    </div>
  )
}
