'use client'

import { useEffect, useState } from 'react'

import { getSyncState, startSync, subscribeSync, sync, type SyncState } from './engine'
import { discardFailed, retryFailed } from './push'

/**
 * 同期状態を UI に出すための hook。
 * オフラインファーストでは「今どこまで同期できているか」が見えないとユーザーが不安になる。
 */
export function useSync(): SyncState & {
  syncNow: () => void
  retry: () => void
  discard: () => void
} {
  const [state, setState] = useState<SyncState>(getSyncState)

  useEffect(() => subscribeSync(setState), [])

  return {
    ...state,
    syncNow: () => void sync(),
    retry: () => void retryFailed().then(() => sync()),
    discard: () => void discardFailed().then(() => sync()),
  }
}

/** アプリ起動時に1度だけ同期ループを立ち上げる */
export function useSyncEngine(): void {
  useEffect(() => startSync(), [])
}
