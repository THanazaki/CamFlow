'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useId, useRef, useState } from 'react'

import { AccountsField, toAccountRows } from '@/components/forms/AccountsField'
import { ChoicePicker } from '@/components/forms/ChoicePicker'
import { Field, inputClass } from '@/components/forms/ShootDetailsFields'
import {
  findMergeCandidates,
  mergeModelInto,
  updateModel,
  type MergeCandidate,
  type ModelInput,
} from '@/lib/actions/models'
import { MODEL_STATUSES } from '@/lib/model-status'
import { loadModelDetail, type ModelDetail } from '@/lib/queries/models'

const SMALL_BUTTON =
  'border-border hover:bg-navy-50 shrink-0 rounded-md border px-3 py-2 text-sm dark:hover:bg-white/5'

export default function ModelEditPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <ModelEdit />
    </Suspense>
  )
}

function ModelEdit() {
  const id = useSearchParams().get('id') ?? ''
  const model = useLiveQuery(() => loadModelDetail(id), [id], 'loading' as const)

  if (model === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!model) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">モデルの編集</h1>
        <p className="text-muted text-sm">モデルが見つかりませんでした。</p>
        <Link
          href="/masters/models"
          className="text-navy-600 dark:text-navy-200 text-sm underline underline-offset-2"
        >
          モデルマスタへ
        </Link>
      </div>
    )
  }
  return <ModelEditForm key={model.id} model={model} />
}

function toFormValues(model: ModelDetail): ModelInput {
  const affiliations = [model.affiliation, ...model.subAffiliations].filter(
    (a): a is string => Boolean(a),
  )
  return {
    name: model.name,
    nameKana: model.nameKana ?? '',
    accounts: toAccountRows(model.accounts),
    contactMethod: model.contactMethod ?? '',
    contactValue: model.contactValue ?? '',
    // 欄が1つも無いと入力できないので、空なら空欄を1つ出す
    affiliations: affiliations.length > 0 ? affiliations : [''],
    mainAffiliation: 0,
    aliases: model.aliases.map((a) => ({ name: a.name, kana: a.kana ?? '' })),
    isFavorite: model.isFavorite,
    status: model.status,
    notes: model.notes ?? '',
  }
}

function ModelEditForm({ model }: { model: ModelDetail }) {
  const router = useRouter()
  const [form, setForm] = useState<ModelInput>(() => toFormValues(model))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 統合するか確認中のモデルと、答えを返す関数 */
  const [asking, setAsking] = useState<MergeCandidate | null>(null)
  const answerRef = useRef<((ok: boolean) => void) | null>(null)

  const askMerge = (candidate: MergeCandidate) =>
    new Promise<boolean>((resolve) => {
      answerRef.current = resolve
      setAsking(candidate)
    })
  const answer = (ok: boolean) => {
    answerRef.current?.(ok)
    answerRef.current = null
    setAsking(null)
  }

  const set = <K extends keyof ModelInput>(key: K, value: ModelInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const setAffiliation = (index: number, value: string) =>
    setForm((f) => ({ ...f, affiliations: f.affiliations.map((a, i) => (i === index ? value : a)) }))

  /** 消した欄より後ろにあるメインは、位置が1つ前にずれる */
  const removeAffiliation = (index: number) =>
    setForm((f) => ({
      ...f,
      affiliations: f.affiliations.filter((_, i) => i !== index),
      mainAffiliation:
        index === f.mainAffiliation ? 0 : index < f.mainAffiliation ? f.mainAffiliation - 1 : f.mainAffiliation,
    }))

  const setAlias = (index: number, patch: Partial<ModelInput['aliases'][number]>) =>
    setForm((f) => ({
      ...f,
      aliases: f.aliases.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      // 新しく追加した別名義と同じ名前のモデルがあれば、1件ずつ統合するか聞く
      const candidates = await findMergeCandidates(model.id, form.aliases)
      const merging: MergeCandidate[] = []
      for (const candidate of candidates) {
        if (await askMerge(candidate)) merging.push(candidate)
      }

      const { createdOrganizers } = await updateModel(model.id, form)
      for (const candidate of merging) {
        await mergeModelInto(model.id, candidate.id)
      }
      if (createdOrganizers.length > 0) {
        alert(
          `撮影会マスタに${createdOrganizers.map((n) => `「${n}」`).join('')}を登録しました`,
        )
      }
      // 「戻る」で編集画面に戻らないよう、履歴を置き換える
      router.replace(`/masters/models/detail?id=${encodeURIComponent(model.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">モデルの編集</h1>
        <p className="text-muted mt-1 text-sm">モデルマスタの内容を変更します。</p>
      </header>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <section className="bg-surface border-border space-y-5 rounded-lg border p-5">
          <Field label="ID" hint="変更できません">
            {(p) => (
              <input
                {...p}
                type="text"
                value={model.id}
                readOnly
                className={`${inputClass} text-muted font-mono`}
              />
            )}
          </Field>

          <Field label="モデル名" required>
            {(p) => (
              <input
                {...p}
                type="text"
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="読み" hint="入力すると、一覧はこの読みの順に並びます">
            {(p) => (
              <input
                {...p}
                type="text"
                value={form.nameKana}
                onChange={(e) => set('nameKana', e.target.value)}
                placeholder="かんな"
                className={inputClass}
              />
            )}
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">別名義</legend>
            <p className="text-muted mt-0.5 text-xs">
              改名前の名前や、別の活動名を登録します。読みは省略できます
            </p>
            <div className="mt-1.5 space-y-2">
              {form.aliases.map((alias, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={alias.name}
                      onChange={(e) => setAlias(i, { name: e.target.value })}
                      placeholder="別名義"
                      aria-label={`別名義 ${i + 1}`}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={alias.kana}
                      onChange={(e) => setAlias(i, { kana: e.target.value })}
                      placeholder="読み（かんな）"
                      aria-label={`別名義 ${i + 1} の読み`}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => set('aliases', form.aliases.filter((_, j) => j !== i))}
                    aria-label={`別名義 ${i + 1} を削除`}
                    className={SMALL_BUTTON}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => set('aliases', [...form.aliases, { name: '', kana: '' }])}
              className={`${SMALL_BUTTON} mt-2 py-1.5`}
            >
              別名義を追加
            </button>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">所属</legend>
            <p className="text-muted mt-0.5 text-xs">
              予約などの入力では、撮影会名がどれかの所属と一致すれば、このモデルとして扱います。メインの所属は一覧に表示されます。撮影会マスタに無い所属は、保存すると撮影会として登録します（「フリー」は除く）
            </p>
            <div className="mt-1.5 space-y-2" role="radiogroup" aria-label="メインの所属">
              {form.affiliations.map((affiliation, i) => (
                <div key={i} className="flex items-center gap-2">
                  <label className="tap-target flex shrink-0 items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="radio"
                      name="mainAffiliation"
                      checked={form.mainAffiliation === i}
                      onChange={() => set('mainAffiliation', i)}
                      aria-label={`所属 ${i + 1} をメインにする`}
                    />
                    メイン
                  </label>
                  <input
                    type="text"
                    value={affiliation}
                    onChange={(e) => setAffiliation(i, e.target.value)}
                    placeholder="撮影会名、フリー"
                    aria-label={`所属 ${i + 1}`}
                    className={inputClass}
                  />
                  {form.affiliations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAffiliation(i)}
                      aria-label={`所属 ${i + 1} を削除`}
                      className={SMALL_BUTTON}
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => set('affiliations', [...form.affiliations, ''])}
              className={`${SMALL_BUTTON} mt-2 py-1.5`}
            >
              所属を追加
            </button>
          </fieldset>

          <AccountsField
            label="モデルアカウント"
            accounts={form.accounts}
            onChange={(accounts) => set('accounts', accounts)}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="連絡手段">
              {(p) => (
                <input
                  {...p}
                  type="text"
                  value={form.contactMethod}
                  onChange={(e) => set('contactMethod', e.target.value)}
                  placeholder="DM、LINE、メール"
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="連絡先">
              {(p) => (
                <input
                  {...p}
                  type="text"
                  value={form.contactValue}
                  onChange={(e) => set('contactValue', e.target.value)}
                  className={inputClass}
                />
              )}
            </Field>
          </div>

          <div>
            <p className="text-sm font-medium">お気に入り</p>
            <label className="tap-target mt-1.5 flex items-center gap-2 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.isFavorite}
                onChange={(e) => set('isFavorite', e.target.checked)}
                className="size-4"
              />
              お気に入りにする
            </label>
          </div>

          <Field label="ステータス" required>
            {(p) => (
              <ChoicePicker
                id={p.id}
                name="modelStatus"
                label="ステータス"
                options={MODEL_STATUSES}
                value={form.status}
                onChange={(v) => set('status', v)}
              />
            )}
          </Field>

          <Field label="メモ">
            {(p) => (
              <textarea
                {...p}
                rows={4}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                className={inputClass}
              />
            )}
          </Field>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '変更を保存'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-2 text-sm dark:hover:bg-white/5"
          >
            キャンセル
          </button>
          <span className="text-muted text-xs">
            オフラインでも保存できます。通信が戻ると自動で送信されます
          </span>
        </div>
      </form>

      {asking && <MergeDialog candidate={asking} onAnswer={answer} />}
    </div>
  )
}

/**
 * 別名義と同名のモデルを統合するかの確認。
 * OK で、そのモデルの撮影実績などを編集中のモデルに移し、モデルマスタから削除する。
 */
function MergeDialog({
  candidate,
  onAnswer,
}: {
  candidate: MergeCandidate
  onAnswer: (ok: boolean) => void
}) {
  const titleId = useId()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAnswer(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onAnswer])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={() => onAnswer(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface border-border w-full max-w-sm rounded-lg border p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-base font-semibold">
          同名のモデルが存在します。統合しますか？
        </h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted w-12 shrink-0 text-xs leading-5">名前</dt>
            <dd className="font-medium">{candidate.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted w-12 shrink-0 text-xs leading-5">所属</dt>
            <dd>{candidate.affiliations.length > 0 ? candidate.affiliations.join('、') : 'なし'}</dd>
          </div>
        </dl>
        <p className="text-muted mt-3 text-xs">
          OK を押すと、このモデルをモデルマスタから削除し、撮影実績や撮影希望、所属は編集中のモデルに移します。キャンセルすると統合せずに別名義だけ保存します。
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="border-border hover:bg-navy-50 rounded-md border px-4 py-1.5 text-sm dark:hover:bg-white/5"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onAnswer(true)}
            autoFocus
            className="bg-navy-900 hover:bg-navy-800 rounded-md px-4 py-1.5 text-sm font-medium text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
