import Image from 'next/image'

/**
 * CamFlow のロゴ。
 *
 * CLAUDE.md のロゴ定義に従う:
 *   背景 = ダークネイビー #0A1128 / カメラアイコン + 斜体（イタリック）の白文字「CamFlow」
 * 確定したアイコン形状とロゴデザインは勝手に変更しないこと。
 *
 * アイコンの元データは resource/icon.png。背景が薄グレーで塗られていて透過していないため、
 * タイル部分を切り出して角を透過させたものを public/logo-mark.png に置いている
 * （そのまま使うとネイビーのサイドバー上に白い四角が出る）。
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark alt={compact ? 'CamFlow' : ''} />
      {!compact && (
        <span className="text-lg font-semibold italic tracking-tight text-white">CamFlow</span>
      )}
    </span>
  )
}

export function LogoMark({
  size = 28,
  alt = '',
  className = '',
}: {
  size?: number
  alt?: string
  className?: string
}) {
  return (
    <Image
      src="/logo-mark.png"
      alt={alt}
      width={size}
      height={size}
      // ヘッダーは最初の描画で見えるので遅延させない
      priority
      className={`shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
