import { clearLocalData, getMeta, setMeta } from '@/lib/db'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'

/**
 * 認証の唯一の境界。アプリ内で `supabase.auth` を直接触るのはこのファイルだけ。
 *
 * サインイン・サインアップは `/api/auth` を経由する。reCAPTCHA の秘密鍵は
 * サーバにしか置けないため（詳細は src/app/api/auth/route.ts）。
 *
 * RLS は有効なまま維持する。外すと本番に戻し忘れたとき全データが公開される。
 */

/** 端末に覚えさせたユーザーID。オフライン時の書き込みに使う */
const USER_ID_KEY = 'auth:userId'

export interface AuthUser {
  id: string
  email: string | null
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  /** オンラインで検証できず、端末に残したIDで動いている */
  offlineFallback: boolean
}

let state: AuthState = { status: 'loading', user: null, offlineFallback: false }
const listeners = new Set<(s: AuthState) => void>()
let initialized = false

function emit(next: Partial<AuthState>): void {
  state = { ...state, ...next }
  for (const l of listeners) l(state)
}

export function getAuthState(): AuthState {
  return state
}

export function subscribeAuth(listener: (s: AuthState) => void): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

/**
 * 別のユーザーでサインインしたら手元のデータを捨てる。
 *
 * RLS が守るのはサーバだけで、IndexedDB の中身はブラウザを使う誰でも読める。
 * 消さないと前のユーザーの撮影履歴が次のユーザーに見えてしまう。
 */
async function switchUser(userId: string): Promise<void> {
  const remembered = await getMeta<string>(USER_ID_KEY)
  if (remembered && remembered !== userId) {
    await clearLocalData()
  }
  await setMeta(USER_ID_KEY, userId)
}

/** アプリ起動時に一度だけ呼ぶ。既存セッションを復元する */
export async function initAuth(): Promise<AuthState> {
  if (initialized) return state
  initialized = true

  if (isSupabaseConfigured()) {
    const supabase = getSupabase()

    // セッションが切れた / 他タブでサインアウトした場合に追従する
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        emit({ status: 'anonymous', user: null, offlineFallback: false })
        return
      }
      if (session?.user) {
        void switchUser(session.user.id)
        emit({
          status: 'authenticated',
          user: { id: session.user.id, email: session.user.email ?? null },
          offlineFallback: false,
        })
      }
    })

    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user) {
        await switchUser(data.session.user.id)
        emit({
          status: 'authenticated',
          user: { id: data.session.user.id, email: data.session.user.email ?? null },
          offlineFallback: false,
        })
        return state
      }
    } catch {
      // ネットワークが無いだけかもしれないので、下のフォールバックに進む
    }
  }

  // セッションを確認できない場合（オフライン、またはセッション切れ）は、
  // 前回サインインしたIDで続ける。これが無いと「完全オフライン」と言いながら
  // 電波が無いと何も読み書きできない。
  //
  // 認証の迂回には使えない: サーバのデータは RLS で守られており、
  // 有効なトークンが無ければ同期できない。ここで見えるのは、その端末に
  // すでに入っている（devtools で誰でも読める）ローカルデータだけ。
  const remembered = await getMeta<string>(USER_ID_KEY)
  if (remembered) {
    emit({
      status: 'authenticated',
      user: { id: remembered, email: null },
      offlineFallback: true,
    })
    return state
  }

  emit({ status: 'anonymous', user: null, offlineFallback: false })
  return state
}

/** サインイン / サインアップの結果をセッションに反映する */
export async function applySession(accessToken: string, refreshToken: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  if (error) throw new Error(error.message)
  if (!data.session?.user) throw new Error('セッションを復元できませんでした')

  await switchUser(data.session.user.id)
  emit({
    status: 'authenticated',
    user: { id: data.session.user.id, email: data.session.user.email ?? null },
    offlineFallback: false,
  })
}

/**
 * サインアウト。
 * 手元のデータも消す。同じ端末を別の人が使う可能性があるため。
 */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await getSupabase().auth.signOut()
    } catch {
      // オフラインでもローカルは落とす
    }
  }
  await clearLocalData()
  await setMeta(USER_ID_KEY, null)
  emit({ status: 'anonymous', user: null, offlineFallback: false })
}

/**
 * 書き込み・同期に使うユーザーID。
 * 未サインインなら null（その場合は何も書けない）。
 */
export async function getActiveUserId(): Promise<string | null> {
  if (state.status === 'loading') await initAuth()
  if (state.user) return state.user.id
  return (await getMeta<string>(USER_ID_KEY)) ?? null
}

/** テスト用 */
export function resetAuthForTest(): void {
  state = { status: 'loading', user: null, offlineFallback: false }
  listeners.clear()
  initialized = false
}
