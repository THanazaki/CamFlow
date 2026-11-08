'use client'

import { useRouter } from 'next/navigation'

import { EMPTY_RESERVATION, ReservationForm } from '@/components/forms/ReservationForm'
import { createReservation } from '@/lib/actions/reservations'
import { affiliationConfirmMessage, findAffiliationConflict } from '@/lib/actions/shoots'
import { getActiveUserId } from '@/lib/auth/session'
import { nextPathAfterSave } from '@/lib/new-model-prompt'
import { categoryHasModel } from '@/lib/shoot-category'

export default function ReservationNewPage() {
  const router = useRouter()

  return (
    <ReservationForm
      initial={EMPTY_RESERVATION}
      submitLabel="予約を登録"
      secondary="clear"
      header={
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">予約情報入力</h1>
          <p className="text-muted mt-1 text-sm">
            撮影会の予約受付を押さえるための情報を登録します。登録後は予約スケジュールに
            受付開始が早い順で並びます。
          </p>
        </header>
      }
      onSubmit={async (form) => {
        // ログイン画面が無いので、同期と同じ経路でユーザーIDを取る
        const userId = await getActiveUserId()
        if (!userId) {
          throw new Error(
            'ユーザー情報を取得できませんでした。.env.local の設定を確認し、一度オンラインで開いてください。',
          )
        }
        let addAffiliation = false
        const conflict = categoryHasModel(form.shootCategory)
          ? await findAffiliationConflict(form.modelName, form.eventName)
          : null
        if (conflict) {
          // キャンセルなら登録は続け、同名の別モデルとして登録する
          addAffiliation = confirm(affiliationConfirmMessage(conflict))
        }
        const { newModelId } = await createReservation(userId, {
          ...form,
          addAffiliation,
        })
        router.push(nextPathAfterSave(newModelId, '/reservations/schedule'))
      }}
    />
  )
}
