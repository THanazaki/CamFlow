'use client'

import { useEffect } from 'react'

/**
 * Service Worker の登録。
 *
 * `@serwist/next` のプラグインを使っていれば自動で入るコードだが、
 * Turbopack 互換のため configurator モードにした結果、登録は自分で行う必要がある。
 *
 * 開発中は `serwist build` を走らせないので /sw.js は存在しない。登録を試みない。
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
        console.warn('[pwa] Service Worker の登録に失敗しました:', error)
      })
    }

    // 初回表示を Service Worker の取得と競合させない
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })

    return () => window.removeEventListener('load', register)
  }, [])

  return null
}
