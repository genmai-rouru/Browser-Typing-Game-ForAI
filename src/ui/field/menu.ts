/**
 * 戦闘中のメニュー（コマンド・サポートスキル・アイテム・ポーズ）の共通の操作。
 *
 *   選択   ↑↓ または W / S
 *   決定   Z / Enter / Space
 *   戻る   Esc または X（いちばん上のメニューで Esc を押すとポーズ）
 */

export type MenuInput = 'up' | 'down' | 'confirm' | 'cancel' | 'escape'

/** キーをメニューの操作に変換します。メニューと関係ないキーは null です。 */
export function menuInputOf(key: string): MenuInput | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up'
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down'
    case 'z':
    case 'Z':
    case 'Enter':
    case ' ':
      return 'confirm'
    case 'x':
    case 'X':
      return 'cancel'
    case 'Escape':
      return 'escape'
    default:
      return null
  }
}

/** カーソルを dir（+1 / -1）方向に動かします。端まで行くと反対側に回ります。 */
export function moveCursor(index: number, dir: 1 | -1, length: number): number {
  if (length <= 0) return 0
  return (index + dir + length) % length
}

/** メニューの 1 行。 */
export interface MenuEntry {
  id: string
  label: string
  /** 右側に小さく添える文字（残りターン、個数など）。 */
  note?: string
  disabled?: boolean
}

/** 説明ウィンドウに出す内容。 */
export interface MenuInfo {
  title: string
  /** 見出しの横に小さく出す文字（レア度、役割など）。 */
  sub?: string
  lines: string[]
  /** 使えない理由など、目立たせたい注意書き。 */
  warn?: string
}
