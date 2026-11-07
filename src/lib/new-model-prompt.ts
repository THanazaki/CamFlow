/** 予約・確定・過去撮影の登録で新しいモデルを作ったときの確認 */
export const NEW_MODEL_MESSAGE = '新規モデルが登録されました。モデルマスタを編集しますか？'

/**
 * 登録後の遷移先。新しいモデルを作っていて「はい」ならモデルマスタの編集画面、そうでなければ通常の遷移先。
 * confirm は差し替えられるよう引数にする。
 */
export function nextPathAfterSave(
  newModelId: string | null,
  defaultPath: string,
  confirm: (message: string) => boolean = (message) => window.confirm(message),
): string {
  if (newModelId && confirm(NEW_MODEL_MESSAGE)) {
    return `/masters/models/edit?id=${encodeURIComponent(newModelId)}`
  }
  return defaultPath
}
