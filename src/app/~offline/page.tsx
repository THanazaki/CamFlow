import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'オフライン',
}

/**
 * Service Worker の navigation fallback 先。
 *
 * オフラインのままアプリを再起動したとき、キャッシュに無いルートへ行くとここが出る。
 * これが無いと白画面になり、PWA としてオフラインで使えない。
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">オフラインです</h1>
      <p className="text-muted mt-3 text-sm leading-relaxed">
        この画面はまだ端末に保存されていません。
        <br />
        一度オンラインで開いたページは、オフラインでもそのまま使えます。
      </p>
      <p className="text-muted mt-4 text-sm">
        記録した内容は端末に残っており、通信が戻ると自動で送信されます。
      </p>
      <Link
        href="/"
        className="bg-navy-900 hover:bg-navy-800 mt-8 inline-block rounded-md px-4 py-2 text-sm font-medium text-white"
      >
        ダッシュボードへ
      </Link>
    </div>
  )
}
