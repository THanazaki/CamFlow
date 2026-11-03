export interface NavItem {
  href: string
  label: string
  /** 未実装の画面（次フェーズで作る）はグレーアウトして出す */
  ready: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'ダッシュボード', ready: true },
  { href: '/reservations', label: '予約管理', ready: false },
  { href: '/shoots', label: '撮影管理', ready: false },
  { href: '/archives', label: '過去撮影データ管理', ready: false },
  { href: '/stats', label: '統計情報', ready: false },
  { href: '/settings', label: '設定', ready: false },
]
