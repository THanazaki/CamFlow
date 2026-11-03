import type { Metadata, Viewport } from 'next'

import { AppShell } from '@/components/layout/AppShell'
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker'

import './globals.css'

export const metadata: Metadata = {
  title: { default: 'CamFlow — 撮影管理', template: '%s | CamFlow' },
  description: '個人カメラマンのための撮影スケジュール・モデル・現場タイマー・納品管理',
  applicationName: 'CamFlow',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'CamFlow' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0A1128',
  width: 'device-width',
  initialScale: 1,
  // 現場で片手操作するときに誤ズームしないよう固定
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <RegisterServiceWorker />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
