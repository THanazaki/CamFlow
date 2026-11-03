import type { NextConfig } from 'next'

/**
 * Service Worker は next.config のプラグインではなく `serwist.config.ts` +
 * `serwist build` で生成している（Turbopack との互換のため。理由は serwist.config.ts を参照）。
 *
 * スカフォード既定の `cacheComponents` / `partialPrefetching` は外している。
 * どちらもサーバ側のレンダリング／データ取得を最適化する機能だが、このアプリは
 * 全データが IndexedDB 由来のクライアント描画なので効く場面が無く、
 * ビルド時の制約だけが増えるため。
 */
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
