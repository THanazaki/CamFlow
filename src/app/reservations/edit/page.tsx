'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

import { ReservationForm } from '@/components/forms/ReservationForm'
import { updateReservation } from '@/lib/actions/reservations'
import { affiliationConfirmMessage, findAffiliationConflict } from '@/lib/actions/shoots'
import { nextPathAfterSave } from '@/lib/new-model-prompt'
import { loadReservationInput } from '@/lib/queries/reservations'
import { categoryHasModel } from '@/lib/shoot-category'

const SCHEDULE = '/reservations/schedule'

export default function ReservationEditPage() {
  return (
    <Suspense fallback={<p className="text-muted text-sm">読み込み中…</p>}>
      <ReservationEdit />
    </Suspense>
  )
}

function ReservationEdit() {
  const router = useRouter()
  const id = useSearchParams().get('id') ?? ''
  const initial = useLiveQuery(() => loadReservationInput(id), [id], 'loading' as const)

  if (initial === 'loading') {
    return <p className="text-muted text-sm">読み込み中…</p>
  }
  if (!initial) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">予約の編集</h1>
        <p className="text-muted text-sm">
          予約が見つかりませんでした。可否が決まった予約は編集できません。
        </p>
        <Link
          href={SCHEDULE}
          className="text-navy-600 dark:text-navy-200 text-sm underline underline-offset-2"
        >
          予約スケジュールへ
        </Link>
      </div>
    )
  }

  return (
    <ReservationForm
      key={id}
      initial={initial}
      submitLabel="変更を保存"
      secondary={{ label: 'キャンセル', href: SCHEDULE }}
      header={
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">予約の編集</h1>
          <p className="text-muted mt-1 text-sm">登録した予約の内容を変更します。</p>
        </header>
      }
      onSubmit={async (form) => {
        let addAffiliation = false
        const conflict = categoryHasModel(form.shootCategory)
          ? await findAffiliationConflict(form.modelName, form.eventName, id)
          : null
        if (conflict) {
          // キャンセルなら登録は続け、同名の別モデルとして登録する
          addAffiliation = confirm(affiliationConfirmMessage(conflict))
        }
        const { newModelId } = await updateReservation(id, {
          ...form,
          addAffiliation,
        })
        // 「戻る」で編集画面に戻らないよう、履歴を置き換える
        router.replace(nextPathAfterSave(newModelId, SCHEDULE))
      }}
    />
  )
}
