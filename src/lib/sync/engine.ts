import { getActiveUserId } from '@/lib/auth/session'
import { isSupabaseConfigured } from '@/lib/supabase/client'

import { pullAll } from './pull'
import { outboxCounts, pushOutbox } from './push'
import { createSupabaseTransport, type SyncTransport } from './transport'

/**
 * 同期エンジン。push → pull の順に回す。
 *
 * push を先にするのは、未送信のローカル変更がある行を pull が上書きしないため。
 * 先に押し出してから取り込めば、サーバの正規版（updated_at がサーバ時刻で付き直ったもの）が
 * そのまま入ってくる。
 */

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncState {
  phase: SyncPhase
  lastSyncedAt: string | null
  pending: number
  failed: number
  error: string | null
}

type Listener = (state: SyncState) => void

const BACKOFF_MS = [1_000, 5_000, 15_000, 60_000, 300_000]
/** 定期同期の間隔。現場で開いたままにしていても静かに追従させる */
const POLL_INTERVAL_MS = 60_000

let state: SyncState = {
  phase: 'idle',
  lastSyncedAt: null,
  pending: 0,
  failed: 0,
  error: null,
}

const listeners = new Set<Listener>()
let transport: SyncTransport | null = null
let running = false
let queued = false
let started = false
let consecutiveFailures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

function emit(patch: Partial<SyncState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener(state)
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

async function refreshCounts(): Promise<void> {
  const { pending, failed } = await outboxCounts()
  emit({ pending, failed })
}

/** テスト用にトランスポートを差し替える */
export function setTransport(next: SyncTransport | null): void {
  transport = next
}

function scheduleRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  const delay = BACKOFF_MS[Math.min(consecutiveFailures, BACKOFF_MS.length - 1)]
  retryTimer = setTimeout(() => {
    retryTimer = null
    void sync()
  }, delay)
}

/**
 * 1回の同期。実行中に呼ばれた場合は「もう1回やる」だけ覚えて多重実行しない。
 */
export async function sync(): Promise<SyncState> {
  if (running) {
    queued = true
    return state
  }

  if (!isSupabaseConfigured()) {
    emit({ phase: 'offline', error: null })
    await refreshCounts()
    return state
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emit({ phase: 'offline', error: null })
    await refreshCounts()
    return state
  }

  running = true
  emit({ phase: 'syncing', error: null })

  try {
    const userId = await getActiveUserId()
    if (!userId) {
      // セッションが取れない = オフラインか未設定。ローカルだけで動かす
      emit({ phase: 'offline', error: null })
      return state
    }

    transport ??= createSupabaseTransport()

    const pushResult = await pushOutbox(transport)
    await pullAll(transport)
    await refreshCounts()

    if (pushResult.interrupted) {
      consecutiveFailures += 1
      emit({ phase: 'offline', error: null })
      scheduleRetry()
    } else {
      consecutiveFailures = 0
      emit({ phase: 'idle', lastSyncedAt: new Date().toISOString(), error: null })
    }
  } catch (error) {
    consecutiveFailures += 1
    const message = error instanceof Error ? error.message : String(error)
    emit({ phase: 'error', error: message })
    scheduleRetry()
  } finally {
    running = false
    if (queued) {
      queued = false
      void sync()
    }
  }

  return state
}

/** オンライン復帰・タブ復帰・定期ポーリングで同期を起動する */
export function startSync(): () => void {
  if (started || typeof window === 'undefined') return () => {}
  started = true

  const onOnline = () => {
    consecutiveFailures = 0
    void sync()
  }
  const onOffline = () => emit({ phase: 'offline' })
  const onVisible = () => {
    if (document.visibilityState === 'visible') void sync()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  pollTimer = setInterval(() => void sync(), POLL_INTERVAL_MS)

  void sync()

  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    document.removeEventListener('visibilitychange', onVisible)
    if (pollTimer) clearInterval(pollTimer)
    if (retryTimer) clearTimeout(retryTimer)
    pollTimer = null
    retryTimer = null
    started = false
  }
}

/** テスト用にモジュール状態を初期化する */
export function resetSyncEngine(): void {
  state = { phase: 'idle', lastSyncedAt: null, pending: 0, failed: 0, error: null }
  listeners.clear()
  transport = null
  running = false
  queued = false
  started = false
  consecutiveFailures = 0
  if (retryTimer) clearTimeout(retryTimer)
  if (pollTimer) clearInterval(pollTimer)
  retryTimer = null
  pollTimer = null
}
