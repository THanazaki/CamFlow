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
  /**
   * 開発サーバーをスマホの実機から開くための許可。
   * 開発サーバーは localhost 以外から開発用リソースを取りに来ると拒否するので、
   * 画面が表示されない（本番ビルドには関係しない）。
   * - 家庭や社内の LAN（http://192.168.x.x:3000 など）
   * - VS Code のポート転送（Dev Tunnels。https://xxxx-3000.asse.devtunnels.ms など）
   */
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*', '**.devtunnels.ms'],
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
