export interface NavItem {
  href: string
  label: string
  /** 未実装の画面（次フェーズで作る）はグレーアウトして出す */
  ready: boolean
  /** サブメニュー。持つ場合、親はリンクではなく開閉のトグルになる */
  children?: NavItem[]
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'ダッシュボード', ready: true },
  {
    href: '/reservations',
    label: '予約管理',
    ready: false,
    children: [
      { href: '/reservations/new', label: '予約情報入力', ready: true },
      { href: '/reservations/schedule', label: '予約スケジュール', ready: true },
    ],
  },
  {
    href: '/shoots',
    label: '撮影管理',
    ready: false,
    children: [
      { href: '/shoots/confirm', label: '確定撮影情報入力', ready: true },
      { href: '/shoots/info', label: '確定撮影情報', ready: true },
    ],
  },
  {
    href: '/archives',
    label: '過去撮影データ管理',
    ready: false,
    children: [
      { href: '/archives/new', label: '撮影情報登録', ready: false },
      { href: '/archives/search', label: '撮影情報検索', ready: false },
    ],
  },
  {
    href: '/stats',
    label: '統計情報',
    ready: false,
    children: [
      { href: '/stats/availability', label: '予約可否情報', ready: false },
      { href: '/stats/history', label: '過去撮影情報', ready: false },
      { href: '/stats/fees', label: '撮影料積算', ready: false },
    ],
  },
  { href: '/masters', label: 'マスタ管理', ready: false },
  { href: '/settings', label: '設定', ready: false },
]
