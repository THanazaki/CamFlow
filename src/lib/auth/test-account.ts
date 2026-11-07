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

/** テストアカウントでのサインインか */
export function isTestAccountLogin(
  email: string | undefined,
  password: string | undefined,
  enabled: boolean = TEST_ACCOUNT_ENABLED,
): boolean {
  if (!enabled) return false
  return email?.trim().toLowerCase() === 'test' && password === 'test'
}
