import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * サインイン / サインアップ。
 *
 * **なぜサーバを経由するか**
 * Supabase Auth の CAPTCHA 連携は hCaptcha と Cloudflare Turnstile のみで、
 * reCAPTCHA は選べない。reCAPTCHA を使うには自分で検証するしかなく、
 * 秘密鍵をクライアントに置けないのでここで行う。
 *
 * **限界**
 * この経路は「このフォーム」を守るだけで、Supabase の認証エンドポイント自体は
 * 守れない。anon キーは公開前提なので、攻撃者は Supabase を直接叩いて
 * reCAPTCHA を飛ばせる。Supabase 側で強制したい場合は、対応している
 * hCaptcha か Turnstile に替える必要がある。
 */

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
/** v3 のスコアしきい値。これ未満は人間らしくないと判断する */
const SCORE_THRESHOLD = Number(process.env.RECAPTCHA_SCORE_THRESHOLD ?? '0.5')

type Action = 'signin' | 'signup'

interface Body {
  action?: Action
  email?: string
  password?: string
  captchaToken?: string
}

interface VerifyResult {
  success: boolean
  score?: number
  action?: string
  'error-codes'?: string[]
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function verifyCaptcha(token: string | undefined): Promise<string | null> {
  const secret = process.env.RECAPTCHA_SECRET_KEY

  if (!secret) {
    // 本番で鍵が無いまま動かすと CAPTCHA が素通りになる。開発だけ許す
    if (process.env.NODE_ENV === 'production') {
      return 'reCAPTCHA が設定されていません（RECAPTCHA_SECRET_KEY）'
    }
    console.warn('[auth] RECAPTCHA_SECRET_KEY が未設定のため検証をスキップします（開発時のみ）')
    return null
  }

  if (!token) return 'reCAPTCHA の確認が取れませんでした'

  let result: VerifyResult
  try {
    const res = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      cache: 'no-store',
    })
    result = (await res.json()) as VerifyResult
  } catch {
    return 'reCAPTCHA の検証に失敗しました（通信エラー）'
  }

  if (!result.success) {
    return 'reCAPTCHA の確認に失敗しました'
  }
  // v2 にはスコアが無いので、ある場合だけ見る
  if (typeof result.score === 'number' && result.score < SCORE_THRESHOLD) {
    return '自動化された操作と判定されました。しばらくしてからお試しください'
  }
  return null
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return bad('リクエストの形式が不正です')
  }

  // 入力の検証を先に行う。サーバの設定不備より利用者の入力ミスのほうが
  // ずっと多く、設定チェックを先に置くと入力エラーが 500 に埋もれる
  const { action, email, password } = body
  if (action !== 'signin' && action !== 'signup') return bad('action が不正です')
  if (!email || !password) return bad('メールアドレスとパスワードを入力してください')
  if (action === 'signup' && password.length < 8) {
    return bad('パスワードは8文字以上にしてください')
  }

  const captchaError = await verifyCaptcha(body.captchaToken)
  if (captchaError) return bad(captchaError)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return bad('Supabase の接続情報が設定されていません', 500)
  }

  // 認証はサーバ側で行い、セッションだけクライアントに返す
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } =
    action === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

  if (error) {
    // Supabase のメッセージをそのまま出すと英語で不親切なので主要なものだけ訳す
    return bad(translateAuthError(error.message), 400)
  }

  if (!data.session) {
    // メール確認が必要な設定だとここに来る
    return NextResponse.json({
      session: null,
      message: '確認メールを送信しました。メール内のリンクを開いてからサインインしてください。',
    })
  }

  return NextResponse.json({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  })
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'メールアドレスまたはパスワードが違います'
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'このメールアドレスは登録済みです'
  }
  if (m.includes('email not confirmed')) {
    return 'メールアドレスが未確認です。確認メールのリンクを開いてください'
  }
  if (m.includes('password should be at least')) {
    return 'パスワードが短すぎます'
  }
  return message
}
