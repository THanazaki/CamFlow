'use client'

/**
 * 上段の3つの窓の共通枠。
 * 件数・中身・空のときの文言をそろえ、カードごとに見た目がばらけないようにする。
 */
export function ReminderCard({
  title,
  count,
  tone = 'neutral',
  summary,
  emptyText,
  children,
}: {
  title: string
  count: number
  /** 注意を引きたいカード（未払いなど）は 'alert' */
  tone?: 'neutral' | 'alert'
  /** 件数の横に出す補足（未払い総額など） */
  summary?: string
  emptyText: string
  children: React.ReactNode
}) {
  const alert = tone === 'alert' && count > 0

  return (
    <section className="bg-surface border-border flex flex-col rounded-lg border">
      <header className="border-border flex items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="flex items-baseline gap-2">
          {summary && <span className="text-muted text-xs tabular-nums">{summary}</span>}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
              alert
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                : 'bg-navy-100 text-navy-700 dark:bg-white/10 dark:text-navy-100'
            }`}
          >
            {count}
          </span>
        </span>
      </header>

      {count === 0 ? (
        <p className="text-muted flex-1 px-4 py-6 text-center text-xs">{emptyText}</p>
      ) : (
        <ul className="divide-border flex-1 divide-y">{children}</ul>
      )}
    </section>
  )
}

export function ReminderRow({
  primary,
  secondary,
  trailing,
}: {
  primary: React.ReactNode
  secondary?: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-sm">{primary}</div>
        {secondary && <div className="text-muted mt-0.5 truncate text-xs">{secondary}</div>}
      </div>
      {trailing && <div className="shrink-0 text-xs tabular-nums">{trailing}</div>}
    </li>
  )
}
