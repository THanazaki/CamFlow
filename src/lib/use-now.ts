'use client'

import { useSyncExternalStore } from 'react'

/**
 * 1秒ごとに進む現在時刻（ミリ秒）。カウントダウン表示に使う。
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

export function useNow(): number | null {
  const now = useSyncExternalStore(subscribeClock, getClock, getServerClock)
  return now === 0 ? null : now
}

/** ミリ秒を 日・時・分・秒 に分ける（端数の秒は切り捨て） */
export function splitDuration(ms: number) {
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

export const pad2 = (n: number) => String(n).padStart(2, '0')
