import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CamFlow — 撮影管理',
    short_name: 'CamFlow',
    description: '個人カメラマンのための撮影スケジュール・モデル・現場タイマー・納品管理',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // ロゴ定義: 背景はダークネイビー
    background_color: '#0A1128',
    theme_color: '#0A1128',
    lang: 'ja',
    dir: 'ltr',
    categories: ['productivity', 'photo'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
