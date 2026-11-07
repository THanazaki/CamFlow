/** ストレージのURL一覧。http(s) だけリンクにする（入力欄は javascript: なども通すため） */
export function StorageUrlList({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return <span className="text-amber-600 dark:text-amber-400">未登録</span>
  }
  return (
    <ul className="space-y-0.5">
      {urls.map((url, i) => (
        <li key={`${url}-${i}`} className="max-w-full">
          {/^https?:\/\//i.test(url) ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={url}
              className="text-navy-600 dark:text-navy-200 block truncate text-xs underline underline-offset-2"
            >
              {url}
            </a>
          ) : (
            <span className="text-muted block truncate text-xs" title={url}>
              {url}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
