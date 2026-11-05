/** DB の CHECK 制約と同じ値（slots / shoot_history 共通） */
export const MAX_STORAGE_URLS = 10

/** 前後の空白と空欄を除く。上限を超えていればエラーにする */
export function normalizeStorageUrls(urls: string[]): string[] {
  const normalized = urls.map((url) => url.trim()).filter(Boolean)
  if (normalized.length > MAX_STORAGE_URLS) {
    throw new Error(`保存先ストレージURLは${MAX_STORAGE_URLS}個までです`)
  }
  return normalized
}
