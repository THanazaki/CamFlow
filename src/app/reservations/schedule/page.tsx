'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'

import { markReservationFailed } from '@/lib/actions/reservations'

import { reservationFeePaymentTimingLabel } from '@/lib/fee-payment'
import { loadReservationSchedule, type ReservationRow } from '@/lib/queries/reservations'

/**
 * 予約スケジュール。
 * 受付開始が早い順に並べ、開始時刻までの残り時間を出す。
 */
export default function ReservationSchedulePage() {
  const rows = useLiveQuery(() => loadReservationSchedule(), [], null)
  const nowMs = useNow()

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">予約スケジュール</h1>
          <p className="text-muted mt-1 text-sm">
            可否がまだ決まっていない予約を、受付開始が早い順に並べています。
          </p>
        </div>
        <Link
          href="/reservations/new"
          className="tap-target bg-navy-900 hover:bg-navy-800 shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white"
        >
          予約を追加
        </Link>
      </header>

      {rows === null ? (
        <p className="text-muted text-sm">読み込み中…</p>
      ) : rows.length === 0 ? (
        <div className="border-border text-muted rounded-lg border border-dashed p-8 text-center text-sm">
          <p className="text-foreground font-medium">予約がまだありません</p>
          <p className="mt-1">「予約を追加」から登録してください。</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <ReservationCard key={row.sessionId} row={row} nowMs={nowMs} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ReservationCard({ row, nowMs }: { row: ReservationRow; nowMs: number | null }) {
  const router = useRouter()
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const opensMs = row.bookingOpensAt ? new Date(row.bookingOpensAt).getTime() : null
  // nowMs は初回レンダーでは null（サーバとクライアントで値がずれるのを避ける）
  const remainMs = opensMs !== null && nowMs !== null ? opensMs - nowMs : null
  const open = remainMs !== null && remainMs <= 0

  const onSuccess = () =>
    router.push(`/shoots/confirm?session=${encodeURIComponent(row.sessionId)}`)
  const onFailure = async () => {
    if (
      !confirm(`「${row.title}」を予約失敗にします。予約スケジュールから外れます。よろしいですか？`)
    ) {
      return
    }
    try {
      await markReservationFailed(row.sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <li
      className={`bg-surface rounded-lg border p-4 ${
        open ? 'border-emerald-400 dark:border-emerald-500/50' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{row.title}</h2>
          {row.concept && row.concept !== row.title && (
            <p className="text-muted mt-0.5 truncate text-xs">{row.concept}</p>
          )}
          <dl className="text-muted mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Row label="モデル" value={row.modelNames.join('・') || '—'} />
            <Row label="撮影日" value={row.shootDate} />
            <Row label="場所" value={row.venueName ?? '—'} />
            <Row
              label="予約受付"
              value={row.bookingOpensAt ? formatDateTime(row.bookingOpensAt) : '未設定'}
            />
            {row.shootFee > 0 && (
              <Row label="撮影料" value={`${row.shootFee.toLocaleString('ja-JP')}円`} />
            )}
            {row.paymentTiming && (
              <Row
                label="支払方法"
                value={`${reservationFeePaymentTimingLabel(row.paymentTiming)}${
                  row.paymentDate ? `（支払日 ${row.paymentDate}）` : ''
                }`}
              />
            )}
            {row.costumeOptions && <Row label="衣装系" value={row.costumeOptions} />}
            {row.shootingMethodOptions && (
              <Row label="撮影方法" value={row.shootingMethodOptions} />
            )}
          </dl>
          {row.memo && (
            <p className="text-muted mt-2 text-xs whitespace-pre-wrap">
              <span className="mr-2">メモ</span>
              <span className="text-foreground">{row.memo}</span>
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <BookingContact method={row.bookingMethod} contact={row.bookingContact} />
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <Countdown remainMs={remainMs} hasSchedule={opensMs !== null} />
          <Link
            href={`/reservations/edit?id=${encodeURIComponent(row.sessionId)}`}
            className="border-border hover:bg-navy-50 tap-target rounded-md border px-3 py-1 text-xs dark:hover:bg-white/5"
          >
            編集
          </Link>
          {open && !deciding && (
            <button
              type="button"
              onClick={() => setDeciding(true)}
              className="bg-navy-900 hover:bg-navy-800 tap-target rounded-md px-3 py-1 text-xs font-medium text-white"
            >
              予約可否入力
            </button>
          )}
          {open && deciding && (
            <span className="flex gap-2">
              <button
                type="button"
                onClick={onSuccess}
                className="tap-target rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              >
                予約成功
              </button>
              <button
                type="button"
                onClick={onFailure}
                className="tap-target rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                予約失敗
              </button>
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function Countdown({ remainMs, hasSchedule }: { remainMs: number | null; hasSchedule: boolean }) {
  if (!hasSchedule) {
    return <span className="text-muted text-xs">受付日時 未設定</span>
  }
  if (remainMs === null) {
    // 初回レンダー。サーバとクライアントで表示が食い違わないよう空けておく
    return <span className="text-muted text-sm tabular-nums">—</span>
  }
  if (remainMs <= 0) {
    return (
      <span className="inline-block rounded-md bg-emerald-100 px-2.5 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
        受付中
      </span>
    )
  }

  const { days, hours, minutes, seconds } = splitDuration(remainMs)
  const soon = remainMs < 60 * 60 * 1000

  return (
    <span className="block">
      <span className="text-muted block text-[10px]">受付開始まで</span>
      <span
        className={`block text-lg font-semibold tabular-nums ${
          soon ? 'text-amber-600 dark:text-amber-400' : ''
        }`}
      >
        {days > 0 && `${days}日 `}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    </span>
  )
}

/**
 * 申込先。予約種類によって中身が URL / メール / DM アカウントと変わるので、
 * リンクにできるものだけリンクにする。
 */
function BookingContact({
  method,
  contact,
}: {
  method: ReservationRow['bookingMethod']
  contact: string | null
}) {
  if (!contact) return null

  const linkClass =
    'text-navy-600 dark:text-navy-200 mt-2 inline-block max-w-full truncate text-xs underline underline-offset-2'

  if (method === 'page') {
    return (
      <a href={contact} target="_blank" rel="noopener noreferrer" className={linkClass}>
        予約ページを開く
      </a>
    )
  }
  if (method === 'email') {
    return (
      <a href={`mailto:${contact}`} className={linkClass}>
        メールで申込（{contact}）
      </a>
    )
  }
  return <p className="text-muted mt-2 truncate text-xs">DM: {contact}</p>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex gap-2">
      <dt className="shrink-0 text-xs">{label}</dt>
      <dd className="text-foreground min-w-0 truncate">{value}</dd>
    </span>
  )
}

/**
 * 1秒ごとの現在時刻。
 *
 * 時計は React の外にある可変の値なので useSyncExternalStore で購読する。
 * サーバ側のスナップショットは 0（= null 扱い）にしてあり、時刻の表示は
 * マウント後に始まる。サーバ描画と初回クライアント描画で値が食い違うと
 * ハイドレーションが壊れるため。
 */
let clockNow = 0

function subscribeClock(onChange: () => void): () => void {
  clockNow = Date.now()
  const id = setInterval(() => {
    clockNow = Date.now()
    onChange()
  }, 1000)
  return () => clearInterval(id)
}

const getClock = () => clockNow
const getServerClock = () => 0

function useNow(): number | null {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock)
  return now === 0 ? null : now
}

function splitDuration(ms: number) {
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
