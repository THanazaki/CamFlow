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
