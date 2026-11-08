/**
 * テストアカウント（test / test）。
 *
 * Supabase も reCAPTCHA も無しで画面を触れるようにするためのもの。
 * Supabase のユーザーではないので**同期はされず、データはその端末だけ**に残る。
 * RLS が守るサーバのデータには一切触れない。
 *
 * **本番（デプロイ先）でも有効にしている。** 無効にするときは環境変数
 * `NEXT_PUBLIC_DISABLE_TEST_ACCOUNT=true` を設定してビルドし直す
 * （NEXT_PUBLIC_ の値はビルド時に埋め込まれるため、設定だけ変えても反映されない）。
 * サーバ（/api/auth）と画面（ログイン画面の案内）の両方がこの値を見る。
 */
export const TEST_ACCOUNT_ENABLED = process.env.NEXT_PUBLIC_DISABLE_TEST_ACCOUNT !== 'true'

/** テストアカウントのユーザー ID。Supabase のユーザーとは重ならない固定値 */
export const TEST_ACCOUNT_USER_ID = '00000000-0000-4000-8000-000000000001'

/** デモアカウント（show / show）のユーザー ID。人に見せる用で、サンプルデータが最初から入る */
export const DEMO_ACCOUNT_USER_ID = '00000000-0000-4000-8000-000000000002'

/** Supabase を通さない、端末の中だけのアカウント */
export interface LocalAccount {
  id: string
  /** 画面に出すアカウント名 */
  email: string
  /** サインインしたときにサンプルデータを入れるか */
  demo: boolean
}

const LOCAL_ACCOUNTS: (LocalAccount & { password: string })[] = [
  { id: TEST_ACCOUNT_USER_ID, email: 'test', password: 'test', demo: false },
  { id: DEMO_ACCOUNT_USER_ID, email: 'show', password: 'show', demo: true },
]

/**
 * テストアカウント（test / test）かデモアカウント（show / show）でのサインインなら、そのアカウントを返す。
 * どちらも TEST_ACCOUNT_ENABLED で一緒に有効・無効が切り替わる
 */
export function findLocalAccount(
  email: string | undefined,
  password: string | undefined,
  enabled: boolean = TEST_ACCOUNT_ENABLED,
): LocalAccount | null {
  if (!enabled) return null
  const name = email?.trim().toLowerCase()
  const account = LOCAL_ACCOUNTS.find((a) => a.email === name && a.password === password)
  return account ? { id: account.id, email: account.email, demo: account.demo } : null
}

/**
 * 端末の中だけのアカウント（テスト / デモ）のユーザー ID か。
 * Supabase のユーザーではないので、同期しない（サーバに送っても RLS で弾かれ、取り込むものも無い）
 */
export function isLocalAccountId(userId: string | null | undefined): boolean {
  return LOCAL_ACCOUNTS.some((a) => a.id === userId)
}

/** テストアカウント（test / test）でのサインインか */
export function isTestAccountLogin(
  email: string | undefined,
  password: string | undefined,
  enabled: boolean = TEST_ACCOUNT_ENABLED,
): boolean {
  return findLocalAccount(email, password, enabled)?.id === TEST_ACCOUNT_USER_ID
}
