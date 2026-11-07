'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

import { LoginScreen } from '@/components/auth/LoginScreen'
import { useAuth } from '@/lib/auth/useAuth'
import { signOut } from '@/lib/auth/session'
import { useSyncEngine } from '@/lib/sync/useSync'

import { Logo } from './Logo'
import { NAV_ITEMS, type NavItem } from './nav-items'
import { SyncIndicator } from './SyncIndicator'

/**
 * アプリ全体の枠。
 * CLAUDE.md のレイアウトルール: PC / タブレットは左固定サイドバー、SP はヘッダー + ハンバーガー。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const auth = useAuth()

  // 同期ループはここで一度だけ立ち上げる
  useSyncEngine()

  // 画面遷移したらメニューを閉じる。
  // pathname を見る useEffect でも書けるが、それだと遷移のたびに再レンダリングが
  // 連鎖するため、リンクを押した時点で直接閉じる
  const closeMenu = () => setMenuOpen(false)

  // サインインするまでアプリの中身は出さない。
  // IndexedDB にはサインインしたユーザーのデータが入るので、
  // 誰のものか確定するまで読み書きさせない
  if (auth.status === 'loading') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center">
        <p className="text-muted text-sm">読み込み中…</p>
      </div>
    )
  }
  if (auth.status === 'anonymous') {
    return <LoginScreen />
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* PC / タブレット: 左固定サイドバー */}
      <aside className="bg-navy-900 hidden w-60 shrink-0 flex-col lg:fixed lg:inset-y-0 lg:flex">
        <div className="px-5 py-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3">
          <NavList pathname={pathname} />
        </nav>
        <div className="space-y-2 border-t border-white/10 px-4 py-3">
          <SyncIndicator />
          <AccountRow
            email={auth.user?.email}
            offlineFallback={auth.offlineFallback}
          />
        </div>
      </aside>

      {/* SP: ヘッダー + ハンバーガー */}
      {/* ホーム画面から起動したとき（standalone）にステータスバーと重ならないよう、上端のセーフエリアを空ける */}
      {/* 画面の高さを超えないよう max-h-dvh。メニューを開いたときはメニュー部分だけがスクロールする */}
      <header className="bg-navy-900 sticky top-0 z-30 flex max-h-dvh flex-col pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
            className="rounded-md p-2 text-white hover:bg-white/10"
          >
            <HamburgerIcon open={menuOpen} />
          </button>
        </div>
        <div className="space-y-2 border-t border-white/10 px-4 py-2">
          <SyncIndicator />
          <AccountRow email={auth.user?.email} offlineFallback={auth.offlineFallback} />
        </div>
        {menuOpen && (
          // ヘッダーは画面上部に固定なので、メニューが画面より長いと下の項目に届かない。メニューの中でスクロールさせる
          <nav
            id="mobile-nav"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-3 pb-3"
          >
            <NavList pathname={pathname} onNavigate={closeMenu} />
          </nav>
        )}
      </header>

      <main className="flex-1 lg:ml-60">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-10">{children}</div>
      </main>
    </div>
  )
}

/** アカウント表示とサインアウト。サインアウト時は手元のデータも消える */
function AccountRow({
  email,
  offlineFallback,
}: {
  email?: string | null
  offlineFallback: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="min-w-0 truncate text-white/60" title={email ?? undefined}>
        {email ?? (offlineFallback ? 'オフライン（前回のアカウント）' : 'サインイン済み')}
      </span>
      <button
        type="button"
        onClick={() => {
          if (confirm('サインアウトすると、この端末に保存されたデータも削除されます。よろしいですか？')) {
            void signOut()
          }
        }}
        className="shrink-0 rounded border border-white/20 px-1.5 py-0.5 text-white/70 hover:bg-white/10"
      >
        サインアウト
      </button>
    </div>
  )
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1 py-2">
      {NAV_ITEMS.map((item) => (
        <li key={item.href}>
          {item.children ? (
            <NavSection item={item} pathname={pathname} onNavigate={onNavigate} />
          ) : (
            <NavLink item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * サブメニューを持つ項目。親自体はページを持たず、開閉のトグルとして振る舞う。
 * 初期状態は開いた状態にしている（画面が未実装で、どこもアクティブにならないため）。
 */
function NavSection({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem
  pathname: string
  onNavigate?: () => void
}) {
  const containsActive = item.children?.some((c) => isActive(pathname, c.href)) ?? false
  const [open, setOpen] = useState(true)
  const panelId = `nav-${item.href.replace(/\//g, '-')}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
          containsActive ? 'font-medium text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span>{item.label}</span>
        <ChevronIcon open={open} />
      </button>
      {/* インデントは控えめにする。深くすると「撮影スケジュール確認」のような
          長いラベルが「準備中」バッジと競合して折り返す */}
      {open && (
        <ul id={panelId} className="mt-0.5 ml-2 space-y-0.5 border-l border-white/10 pl-2">
          {item.children?.map((child) => (
            <li key={child.href}>
              <NavLink
                item={child}
                active={isActive(pathname, child.href)}
                onNavigate={onNavigate}
                nested
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function NavLink({
  item,
  active,
  onNavigate,
  nested = false,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
  nested?: boolean
}) {
  const size = nested ? 'px-2 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'

  if (!item.ready) {
    return (
      <span
        className={`flex items-center justify-between gap-2 rounded-md text-white/35 ${size}`}
        aria-disabled="true"
      >
        <span className="truncate">{item.label}</span>
        <span className="shrink-0 text-[10px] text-white/30">準備中</span>
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`block rounded-md transition-colors ${size} ${
        active ? 'bg-white/15 font-medium text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
      }`}
    >
      {item.label}
    </Link>
  )
}

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-4 shrink-0 text-white/40 transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
      )}
    </svg>
  )
}
