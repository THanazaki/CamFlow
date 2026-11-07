import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist } from 'serwist'

/**
 * Service Worker。
 *
 * 肝は `fallbacks`。データは全て IndexedDB にあるので通信が無くても画面は作れるが、
 * **アプリシェル自体がキャッシュから出せないと cold start（オフラインのまま再起動）で
 * 白画面になる**。navigation のフォールバックを用意して初めて PWA としてオフラインで使える。
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: {
    // 詳細・編集の画面は /masters/models/edit?id=… のようにクエリで対象を渡す。
    // 画面自体は同じ HTML（id はクライアントで読む）なので、precache の照合ではクエリを全て無視する。
    // 既定（utm_* と fbclid だけ無視）のままだと、オフラインでこれらの画面が「オフラインです」になる
    ignoreURLParametersMatching: [/.*/],
  },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: '/~offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()
