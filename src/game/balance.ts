import type { PromptKind, RuneType } from './types.ts'

/**
 * ゲームバランスに関わる数値と計算式をここに集めています。
 * 手触りを調整したいときは、まずこのファイルを見てください。
 */

/** 1 戦の制限時間（ミリ秒）。 */
export const BATTLE_TIME_MS = 30_000

// --- 大技ゲージ ---
/** ゲージ 1 本ぶんの量。1 本で「大技」、2 本で「奥義」。 */
export const GAUGE_PER_BAR = 30
export const GAUGE_MAX = GAUGE_PER_BAR * 2
/** お題を打ち切ったときのゲージ加算。 */
export const GAUGE_ON_COMPLETE = 3

// --- プレイヤーの成長 ---
/** 攻撃力はレベルごとに約 10% ずつ伸びます。10, 11, 12, 13, 15, 16 … */
export function attackForLevel(level: number): number {
  return Math.round(10 * Math.pow(1.1, level - 1))
}

/** level から次のレベルに上がるのに必要な経験値。 */
export function expToNext(level: number): number {
  return Math.round(80 * Math.pow(level, 1.5))
}

// --- キー鍛錬 ---
/** 鍛えられるキー（画面のキーボードの並び順）。 */
export const FORGE_ROWS: readonly string[] = ['qwertyuiop', 'asdfghjkl-', 'zxcvbnm']
export const FORGE_KEYS: readonly string[] = FORGE_ROWS.join('').split('')
export const KEY_MAX_LEVEL = 10
/** キー 1 レベルあたりのダメージ上昇率。 */
export const KEY_BONUS_PER_LEVEL = 0.1

/** キーを level から 1 つ上げるのに必要な欠片。10, 20, 40, 70, 110 … */
export function keyUpgradeCost(level: number): number {
  return 10 + 5 * level * (level + 1)
}

export function keyMultiplier(level: number): number {
  return 1 + KEY_BONUS_PER_LEVEL * level
}

// --- ジャンル熟練度 ---
export const MASTERY_MAX_LEVEL = 20
export const MASTERY_BONUS_PER_LEVEL = 0.03

/** 熟練度レベル level に到達するのに必要な累計打鍵数。80, 240, 480, 800 … */
export function masteryThreshold(level: number): number {
  return (80 * level * (level + 1)) / 2
}

export function masteryLevel(strokes: number): number {
  let level = 0
  while (level < MASTERY_MAX_LEVEL && strokes >= masteryThreshold(level + 1)) level++
  return level
}

export function masteryMultiplier(level: number): number {
  return 1 + MASTERY_BONUS_PER_LEVEL * level
}

// --- 打鍵ダメージ ---
export const COMBO_CAP = 100
export const COMBO_BONUS_PER_HIT = 0.005

export function comboMultiplier(combo: number): number {
  return 1 + Math.min(combo, COMBO_CAP) * COMBO_BONUS_PER_HIT
}

export const WEAK_MULTIPLIER = 1.5
export const RESIST_MULTIPLIER = 0.6
export const CRIT_CHANCE = 0.05
export const CRIT_MULTIPLIER = 2

/** 大技・奥義を打っている間の、1 打鍵あたりの倍率。 */
export const MODE_STROKE_MULTIPLIER = { normal: 1, skill: 1.5, ultimate: 2 } as const

/** お題を打ち切ったときの追撃倍率（攻撃力 × 打鍵数 × この値）。 */
export const COMPLETE_FACTOR: Record<PromptKind, number> = {
  word: 0.25,
  sentence: 0.4,
  short: 0.6,
  long: 0.6,
}
export const SKILL_BURST_FACTOR = 2
export const ULTIMATE_BURST_FACTOR = 3
/** ミスなしで打ち切ったときの追撃倍率。 */
export const NO_MISS_MULTIPLIER = 1.5

// --- 刻印 ---
export interface RuneInfo {
  name: string
  glyph: string
  description: string
}

export const RUNE_CRIT_BONUS = 0.3
export const RUNE_CHARGE_BONUS = 2
export const RUNE_CHAIN_BONUS = 2

export const RUNES: Readonly<Record<RuneType, RuneInfo>> = {
  crit: {
    name: '会心の刻印',
    glyph: '心',
    description: 'このキーの打鍵は会心率が +30%（会心はダメージ 2 倍）',
  },
  charge: {
    name: '蓄積の刻印',
    glyph: '蓄',
    description: 'このキーの打鍵で大技ゲージがさらに +2 たまる',
  },
  chain: {
    name: '連鎖の刻印',
    glyph: '連',
    description: 'このキーの打鍵でコンボがさらに +2 伸びる',
  },
}

/** その階層を初めて突破したときに手に入る刻印。 */
export const RUNE_REWARDS: Readonly<Record<number, RuneType>> = {
  2: 'crit',
  4: 'charge',
  5: 'chain',
  7: 'crit',
  8: 'charge',
  10: 'chain',
}

// --- 報酬 ---
export const FINISHER_SHARD_MULTIPLIER = 1.5

export function expReward(damage: number, stage: number, won: boolean): number {
  return Math.floor(damage / 12) + (won ? stage * 30 : 0)
}
