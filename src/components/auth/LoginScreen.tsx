'use client'

import { useId, useState } from 'react'

import { getRecaptchaToken, isRecaptchaConfigured, RECAPTCHA_ENABLED } from '@/lib/auth/recaptcha'
import { applyLocalSession, applySession } from '@/lib/auth/session'
import { Logo } from '@/components/layout/Logo'

type Mode = 'signin' | 'signup'

/** ビルド時に固定される。本番バンドルではテスト用の導線ごと落ちる */
const IS_DEV = process.env.NODE_ENV !== 'production'

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const emailId = useId()
  const passwordId = useId()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      // reCAPTCHA の秘密鍵はサーバにしか置けないので /api/auth を経由する
      const captchaToken = await getRecaptchaToken(mode)
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode, email, password, captchaToken }),
      })
      const json = (await res.json()) as {
        error?: string
        message?: string
        session?: { access_token: string; refresh_token: string } | null
        localUser?: { id: string; email: string }
      }

      if (!res.ok) {
        setError(json.error ?? '処理に失敗しました')
        return
      }
      // 開発用テストアカウント。Supabase を通さずローカルだけで入る
      if (json.localUser) {
        await applyLocalSession(json.localUser.id, json.localUser.email)
        return
      }
      if (!json.session) {
        // メール確認が必要な設定
        setNotice(json.message ?? '確認メールを送信しました')
        return
      }
      await applySession(json.session.access_token, json.session.refresh_token)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'サインインに失敗しました。通信状態を確認してください',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="bg-navy-900 mb-6 flex items-center justify-center rounded-lg px-5 py-4">
          <Logo />
        </div>

        <div className="bg-surface border-border rounded-lg border p-6">
          <div className="flex gap-1" role="tablist" aria-label="サインイン / 新規登録">
            {(['signin', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                  setNotice(null)
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
                  mode === m
                    ? 'bg-navy-900 font-medium text-white'
                    : 'text-muted hover:bg-navy-50 dark:hover:bg-white/5'
                }`}
              >
                {m === 'signin' ? 'サインイン' : '新規登録'}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
              {error}
            </p>
          )}
          {notice && (
            <p className="mt-4 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-300">
              {notice}
            </p>
          )}

          <form onSubmit={submit} className="mt-4 space-y-4">
            <div>
              <label htmlFor={emailId} className="text-sm font-medium">
                メールアドレス
              </label>
              <input
                id={emailId}
                // 開発ではテストアカウント（test）を打てるよう text にする。
                // 本番はブラウザ側の形式チェックを効かせる
                type={IS_DEV ? 'text' : 'email'}
                inputMode="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor={passwordId} className="text-sm font-medium">
                パスワード
              </label>
              <input
                id={passwordId}
                type="password"
                required
                minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
              {mode === 'signup' && (
                <p className="text-muted mt-1 text-xs">8文字以上</p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="bg-navy-900 hover:bg-navy-800 w-full rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? '処理中…' : mode === 'signin' ? 'サインイン' : '登録する'}
            </button>
          </form>

          {IS_DEV && (
            <div className="border-border mt-5 rounded-md border border-dashed p-3">
              <p className="text-muted text-xs">
                開発用のテストアカウントで入れます（<code className="font-mono">test</code> /{' '}
                <code className="font-mono">test</code>）。
                Supabase を通さないため<strong>同期はされず</strong>、データはこの端末にのみ残ります。
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEmail('test')
                  setPassword('test')
                }}
                className="border-border hover:bg-navy-50 mt-2 w-full rounded-md border px-3 py-1.5 text-xs disabled:opacity-50 dark:hover:bg-white/5"
              >
                テストアカウントを入力
              </button>
            </div>
          )}

          {/* 一時的に外している間（RECAPTCHA_ENABLED = false）は出さない */}
          <p
            hidden={!RECAPTCHA_ENABLED}
            className="text-muted mt-4 text-center text-[11px] leading-relaxed"
          >
            {isRecaptchaConfigured() ? (
              <>
                このサイトは reCAPTCHA で保護されています。Google の{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  プライバシーポリシー
                </a>
                と{' '}
                <a
                  href="https://policies.google.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2"
                >
                  利用規約
                </a>
                が適用されます。
              </>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">
                reCAPTCHA が未設定です（NEXT_PUBLIC_RECAPTCHA_SITE_KEY）
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

const inputClass =
  'bg-background border-border focus:border-navy-500 focus:ring-navy-500/30 mt-1.5 w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2'
