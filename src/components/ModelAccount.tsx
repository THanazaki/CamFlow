import { accountLabel, type ModelAccountEntry } from '@/lib/model-accounts'

/** モデルのアカウント。URL ならリンク、@ハンドルだけならテキストで出す */
export function ModelAccount({ href, label }: { href: string; label: string }) {
  const isUrl = /^https?:\/\//.test(href)
  if (!isUrl) {
    return <span className="text-muted text-xs">{label}: {href}</span>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-navy-600 dark:text-navy-200 text-xs underline underline-offset-2"
    >
      {label}
    </a>
  )
}

/** モデルのアカウントを全部並べる（一覧・カード用の短い表記） */
export function ModelAccounts({ accounts }: { accounts: ModelAccountEntry[] }) {
  return (
    <>
      {accounts.map((a, i) => (
        <ModelAccount key={`${a.service}-${i}`} href={a.value} label={accountLabel(a.service, true)} />
      ))}
    </>
  )
}
