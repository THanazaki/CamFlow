export interface NavItem {
  href: string
  label: string
  /** 未実装の画面（次フェーズで作る）はグレーアウトして出す */
  ready: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'ダッシュボード', ready: true },
  { href: '/sessions', label: '撮影スケジュール', ready: false },
  { href: '/models', label: 'モデル', ready: false },
  { href: '/timer', label: '現場タイマー', ready: false },
  { href: '/deliveries', label: '納品管理', ready: false },
]
