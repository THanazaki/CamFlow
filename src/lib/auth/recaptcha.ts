/**
 * reCAPTCHA v3（透明・スコア方式）のトークン取得。
 *
 * スクリプトは必要になった時点で読み込む。ログイン画面でしか使わないので、
 * アプリ全体の初期表示を重くしないため。
 */

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY

interface Grecaptcha {
  ready: (cb: () => void) => void
  execute: (siteKey: string, options: { action: string }) => Promise<string>
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha
  }
}

let loader: Promise<Grecaptcha | null> | null = null

export function isRecaptchaConfigured(): boolean {
  return Boolean(SITE_KEY)
}

function loadScript(): Promise<Grecaptcha | null> {
  if (!SITE_KEY) return Promise.resolve(null)
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha)

  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`
    script.async = true
    script.onload = () => resolve(window.grecaptcha ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
}

/**
 * アクションごとのトークンを取る。
 * 未設定・読み込み失敗なら null を返し、サーバ側の判断（開発ならスキップ、
 * 本番なら拒否）に委ねる。
 */
export async function getRecaptchaToken(action: string): Promise<string | null> {
  if (!SITE_KEY) return null
  loader ??= loadScript()
  const grecaptcha = await loader
  if (!grecaptcha) return null

  return new Promise((resolve) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(SITE_KEY, { action }).then(resolve).catch(() => resolve(null))
    })
  })
}
