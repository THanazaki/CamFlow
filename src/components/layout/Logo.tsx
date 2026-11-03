/**
 * CamFlow のロゴ。
 *
 * CLAUDE.md のロゴ定義に従う:
 *   背景 = ダークネイビー #0A1128 / カメラアイコン + 斜体（イタリック）の白文字「CamFlow」
 * 確定したアイコン形状とロゴデザインは勝手に変更しないこと。
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <CameraMark />
      {!compact && (
        <span className="text-lg font-semibold italic tracking-tight text-white">CamFlow</span>
      )}
    </span>
  )
}

export function CameraMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={30}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M96 192h40l28-40h88l28 40h136a24 24 0 0 1 24 24v152a24 24 0 0 1-24 24H96a24 24 0 0 1-24-24V216a24 24 0 0 1 24-24z" />
      <circle cx="256" cy="288" r="62" />
      <circle cx="388" cy="228" r="4" fill="currentColor" strokeWidth={18} />
    </svg>
  )
}
