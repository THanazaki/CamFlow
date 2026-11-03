import { getMeta, setMeta } from '@/lib/db'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client'

/**
 * 認証の唯一の境界。
 *
 * アプリ内で `supabase.auth` を直接触るのはこのファイルだけにする。
 * 今はログイン画面を作らない方針なので、`.env.local` の開発用アカウントで
 * 自動サインインする。ログイン画面を足すときは `signIn()` の中身だけ
 * 差し替えればよく、RLS もスキーマも一切触らない。
 *
 * RLS は有効なまま維持する。外すと本番に戻し忘れたとき全データが公開される。
 */

const devEmail = process.env.NEXT_PUBLIC_DEV_USER_EMAIL
const devPassword = process.env.NEXT_PUBLIC_DEV_USER_PASSWORD

/** 端末に覚えさせたユーザーID。オフライン時の書き込みに使う */
const USER_ID_KEY = 'auth:userId'

let cachedUserId: string | null = null
let inflight: Promise<string | null> | null = null

/** 既存セッションがあれば使い、無ければ開発用アカウントでサインインする */
async function signIn(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null

  const supabase = getSupabase()

  const { data: existing } = await supabase.auth.getSession()
  if (existing.session) return existing.session.user.id

  // TODO: ログイン画面を作るときはここをフォーム入力に差し替える
  if (!devEmail || !devPassword) {
    console.warn(
      '[auth] NEXT_PUBLIC_DEV_USER_EMAIL / _PASSWORD が未設定です。オフライン専用モードで動作します。',
    )
    return null
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: devEmail,
    password: devPassword,
  })
  if (error) {
    console.warn('[auth] 開発用アカウントでのサインインに失敗しました:', error.message)
    return null
  }
  return data.user?.id ?? null
}

/**
 * 同期に使うユーザーID。オフラインや未設定時は null を返す。
 * 同時に複数回呼ばれても1回だけサインインするよう in-flight を共有する。
 */
export async function getActiveUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId

  // 成功だけキャッシュし、失敗（オフライン等）は次回の呼び出しで再試行させる
  inflight ??= signIn()
    .then(async (id) => {
      if (id) {
        cachedUserId = id
        // 次からオフラインでも書き込めるよう端末に残す
        await setMeta(USER_ID_KEY, id)
      }
      return id
    })
    .finally(() => {
      inflight = null
    })

  const id = await inflight
  if (id) return id

  // オフラインや Supabase 未設定でサインインできない場合は、
  // 前回サインインしたときのIDを使う。これが無いと「完全オフライン」と言いながら
  // 一度もオンラインにならない限り1行も書けないことになる
  const remembered = await getMeta<string>(USER_ID_KEY)
  if (remembered) {
    cachedUserId = remembered
    return remembered
  }
  return null
}

/** キャッシュしたセッションを捨てる（テスト・サインアウト用） */
export function resetSession(): void {
  cachedUserId = null
  inflight = null
}

/** サインアウト時は端末に残したIDも消す（他人のデータを書き込まないため） */
export async function forgetUser(): Promise<void> {
  resetSession()
  await setMeta(USER_ID_KEY, null)
}
