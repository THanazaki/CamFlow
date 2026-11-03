import { serwist } from '@serwist/next/config'

/**
 * Service Worker のビルド設定（Serwist の configurator モード）。
 *
 * なぜ next.config.ts のプラグイン（`withSerwistInit`）を使わないか:
 * Next.js 16 は dev / build とも Turbopack が既定だが、`@serwist/next` のプラグインは
 * webpack プラグインとして動くため Turbopack では**何も生成されない**。
 * 警告は出るがビルド自体は成功してしまうので、SW が無いことに気付きにくい。
 * configurator モードは `next build` の後段で SW を単体ビルドするため、
 * バンドラに依存せず Turbopack のまま使える。
 *
 * このファイルが .ts ではなく .mjs なのは、@serwist/cli が設定を素の
 * `import()` で読むため（Node 20 は TypeScript を直接読み込めない）。
 *
 * 実行: `npm run build:sw`
 *
 * @type {Promise<import('@serwist/cli').BuildOptions>}
 */
export default serwist.withNextConfig(() => ({
  swSrc: 'src/app/sw.ts',
  // public/ 配下は Next.js がそのまま配信するので /sw.js で取得できる
  swDest: 'public/sw.js',
  // プリレンダリング済みの HTML（アプリシェル）も precache する。
  // これが無いとオフラインの cold start で白画面になる
  precachePrerendered: true,
}))
