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
      { href: '/reservations/wishlist', label: '撮影希望モデル登録', ready: true },
      { href: '/reservations/analysis', label: '予約成否分析', ready: false },
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
      { href: '/archives/new', label: '過去撮影登録', ready: true },
      { href: '/archives/list', label: '過去撮影一覧', ready: true },
      { href: '/archives/search', label: '撮影情報検索', ready: true },
    ],
  },
  {
    href: '/stats',
    label: '統計情報',
    ready: false,
    children: [
      { href: '/stats/availability', label: '予約可否情報', ready: false },
      { href: '/stats/history', label: '過去撮影情報', ready: true },
      { href: '/stats/fees', label: '撮影料積算', ready: false },
    ],
  },
  {
    href: '/masters',
    label: 'マスタ管理',
    ready: false,
    children: [
      { href: '/masters/models', label: 'モデルマスタ', ready: true },
      { href: '/masters/organizers', label: '撮影会マスタ', ready: true },
      { href: '/masters/venues', label: 'ロケ地・スタジオマスタ', ready: false },
    ],
  },
  {
    href: '/settings',
    label: '設定',
    ready: false,
    children: [
      { href: '/settings/notifications', label: '通知設定', ready: false },
      { href: '/settings/account', label: 'アカウント設定', ready: false },
      { href: '/settings/guide', label: '使い方ガイド', ready: true },
    ],
  },
]
