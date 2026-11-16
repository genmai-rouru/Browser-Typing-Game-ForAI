import type { PartnerDef } from '../game/partners.ts'

interface Props {
  /** null なら空き枠として表示します。 */
  partner: PartnerDef | null
  size?: 'small' | 'medium' | 'large'
}

/**
 * パートナーの見た目。画像ができるまでは漢字 1 文字で表します。
 * 画像に差し替えるときは、この部品の中身だけを変えれば全画面に反映されます。
 */
export function PartnerPortrait({ partner, size = 'medium' }: Props) {
  return (
    <span
      className={`partner-portrait size-${size} ${partner ? `role-${partner.role}` : 'is-empty'}`}
      aria-hidden="true"
    >
      {partner ? partner.glyph : '空'}
    </span>
  )
}
