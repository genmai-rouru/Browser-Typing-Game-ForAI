import type { EnemyAction } from '../../game/types.ts'

/** 敵の上に浮かぶダメージ表示。x, y は敵の中心からのずれ（px）。 */
export interface Pop {
  id: number
  text: string
  tone: 'hit' | 'crit' | 'burst' | 'whiff'
  x: number
  y: number
}

export const ACTION_LABEL: Record<EnemyAction['type'], string> = {
  attack: '通常攻撃',
  strong: '強攻撃',
  idle: '非攻撃',
}

/** 敵の数に応じた並び（画面上の中心の x 座標）。最大 3 体。 */
export function enemyPositions(count: number): number[] {
  if (count <= 1) return [960]
  if (count === 2) return [720, 1200]
  return [520, 960, 1400]
}
