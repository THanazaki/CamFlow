import type { Json } from '@/types/database'

/**
 * モデルアカウント（models.sns_accounts の1件）。
 * service は 'x' / 'instagram' / 'threads' / 'tiktok' / 'other'。移行前の sns_links にあった種類もそのまま入りうる。
 */
export interface ModelAccountEntry {
  service: string
  /** URL か @ハンドル */
  value: string
}

/** 編集画面で選べる種類 */
export const ACCOUNT_SERVICES = [
  { value: 'x', label: 'X' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'threads', label: 'Threads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'other', label: 'その他' },
] as const

const LABELS: Record<string, string> = {
  x: 'X',
  instagram: 'Instagram',
  threads: 'Threads',
  tiktok: 'TikTok',
  other: 'その他',
}
/** 一覧などの狭い場所で使う短い表記 */
const SHORT_LABELS: Record<string, string> = {
  x: 'X',
  instagram: 'IG',
  threads: 'Threads',
  tiktok: 'TikTok',
  other: 'SNS',
}

export function accountLabel(service: string, short = false): string {
  return (short ? SHORT_LABELS[service] : LABELS[service]) ?? service
}

function isEntry(v: unknown): v is ModelAccountEntry {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ModelAccountEntry).service === 'string' &&
    typeof (v as ModelAccountEntry).value === 'string'
  )
}

/**
 * モデルのアカウントを登録順に返す。
 * sns_accounts が無い行（このカラムを足す前に端末で作った行）は sns_links から作る。
 * sns_accounts が空配列なら、アカウントを全部消したという意味なので sns_links は見ない。
 */
export function readModelAccounts(model: {
  sns_accounts?: Json | null
  sns_links?: Json | null
}): ModelAccountEntry[] {
  if (Array.isArray(model.sns_accounts)) {
    return (model.sns_accounts as unknown[])
      .filter(isEntry)
      .filter((a) => a.value.trim() !== '')
  }
  const links = model.sns_links
  if (!links || typeof links !== 'object' || Array.isArray(links)) return []
  const order = (key: string) => (key === 'x' ? 0 : key === 'instagram' ? 1 : 2)
  return Object.entries(links)
    .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '')
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([service, value]) => ({ service, value: value.trim() }))
}

/** 前後の空白、空欄、重複（同じ種類で同じ値。大文字小文字は区別しない）を除く。順番は保つ */
export function cleanAccounts(accounts: ModelAccountEntry[]): ModelAccountEntry[] {
  const seen = new Set<string>()
  const result: ModelAccountEntry[] = []
  for (const a of accounts) {
    const value = a.value.trim()
    const key = `${a.service}\u0000${value.toLowerCase()}`
    if (!value || seen.has(key)) continue
    seen.add(key)
    result.push({ service: a.service, value })
  }
  return result
}
