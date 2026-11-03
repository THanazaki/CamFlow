'use client'

import { useSync } from '@/lib/sync/useSync'

/**
 * 同期状態の表示。
 *
 * オフラインファーストでは、手元の編集がサーバに届いているかが画面から分からないと
 * ユーザーは「保存できたのか」を確認できない。未送信件数と失敗を常に出す。
 */
export function SyncIndicator({ className = '' }: { className?: string }) {
  const { phase, pending, failed, lastSyncedAt, syncNow, retry } = useSync()

  const { dot, label } = describe(phase, pending, failed, lastSyncedAt)

  return (
    <div className={`flex items-center gap-2 text-xs ${className}`}>
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span className="text-navy-100/80">{label}</span>
      {failed > 0 ? (
        <button
          type="button"
          onClick={retry}
          className="rounded border border-amber-400/50 px-1.5 py-0.5 text-amber-200 hover:bg-amber-400/10"
        >
          再送
        </button>
      ) : (
        <button
          type="button"
          onClick={syncNow}
          className="rounded border border-white/20 px-1.5 py-0.5 text-navy-100/80 hover:bg-white/10"
        >
          同期
        </button>
      )}
    </div>
  )
}

function describe(
  phase: ReturnType<typeof useSync>['phase'],
  pending: number,
  failed: number,
  lastSyncedAt: string | null,
): { dot: string; label: string } {
  if (failed > 0) {
    return { dot: 'bg-amber-400', label: `送信失敗 ${failed}件` }
  }
  if (phase === 'error') {
    return { dot: 'bg-red-400', label: '同期エラー' }
  }
  if (phase === 'syncing') {
    return { dot: 'bg-sky-400 animate-pulse', label: '同期中…' }
  }
  if (phase === 'offline') {
    return {
      dot: 'bg-slate-400',
      label: pending > 0 ? `オフライン・未送信 ${pending}件` : 'オフライン',
    }
  }
  if (pending > 0) {
    return { dot: 'bg-sky-400', label: `未送信 ${pending}件` }
  }
  return { dot: 'bg-emerald-400', label: lastSyncedAt ? `同期済み ${timeOf(lastSyncedAt)}` : '同期済み' }
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}
