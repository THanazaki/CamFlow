'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { getAuthState, initAuth, subscribeAuth, type AuthState } from './session'

/** 認証状態の購読。React の外にある store なので useSyncExternalStore で読む */
export function useAuth(): AuthState {
  const state = useSyncExternalStore(subscribeAuth, getAuthState, getServerSnapshot)

  // 起動時に一度だけセッションを復元する
  useEffect(() => {
    void initAuth()
  }, [])

  return state
}

const SERVER_STATE: AuthState = { status: 'loading', user: null, offlineFallback: false }
const getServerSnapshot = () => SERVER_STATE
