import type { Difficulty, GenreId, PlayerStats, PromptKind } from './types.ts'

/**
 * ゲームバランスに関わる数値と計算式をここに集めています。
 * 手触りを調整したいときは、まずこのファイルを見てください。
 * 「仮」と書いた値は、仕様が決まるまでの置き値です。
 */

// --- ターンの時間 ---
/** 攻撃フェーズ 1 回の基本の制限時間（ミリ秒）。環境効果で変動させる予定です。 */
export const ATTACK_TIME_MS = 10_000
/** 攻撃フェーズの残りがこの時間になったら、敵の次の行動を予告します。 */
export const FORECAST_MS = 2_000
/** 防御お題を出してから入力を受け付けるまでの間（ミリ秒）。攻撃フェーズの打鍵の勢いでミスにならないための間です。仮。 */
export const DEFENSE_INTRO_MS = 800
/** 一時停止から再開した直後に、入力を受け付けない時間（ミリ秒）。 */
export const RESUME_INPUT_LOCK_MS = 500

// --- プレイヤーの能力値 ---
/** 校正力の上限（装備やバフで増えても、これを超えません）。 */
export const PRR_CAP = 500

/** レベルごとの能力値。レベル 1 の値は指定どおり、伸び方は仮。 */
export function playerStats(level: number): PlayerStats {
  const up = level - 1
  return {
    maxHp: 100 + 10 * up,
    maxMp: 50 + 3 * up,
    atk: Math.round(10 * Math.pow(1.1, up)),
    def: 5,
    hit: 100,
    luk: 10,
    prr: 30,
    crt: 0.1,
  }
}

/** level から次のレベルに上がるのに必要な経験値。 */
export function expToNext(level: number): number {
  return Math.round(80 * Math.pow(level, 1.5))
}

// --- MP ---
/** ジャンルごとの、お題 1 つあたりの消費 MP。仮。 */
export const MP_COST: Readonly<Record<GenreId, number>> = {
  school: 1,
  society: 2,
  nature: 2,
  food: 1,
}
/** 戦闘に持ち込めるジャンルの最大数。 */
export const MAX_GENRE_SLOTS = 8

// --- 校正力 ---
/** ウェーブが変わるときに回復する校正力の割合（最大値に対して）。 */
export const PRR_RECOVER_PER_WAVE = 0.1
/** タイポ 1 回で減る校正力。 */
export const PRR_LOSS_PER_TYPO = 1

// --- キー強化 ---
/** 強化できるキー（画面のキーボードの並び順）。 */
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

// --- 攻撃フェーズ ---
export const CRIT_MULTIPLIER = 2

/** お題を打ち切ったときの追撃倍率（攻撃力 × 打鍵数 × この値）。 */
export const COMPLETE_FACTOR: Record<PromptKind, number> = {
  word: 0.25,
  sentence: 0.4,
  short: 0.6,
  long: 0.6,
}
/** ミスなしで打ち切ったときの追撃倍率。 */
export const NO_MISS_MULTIPLIER = 1.5

// --- 防御フェーズ ---
/** 防御お題の長さの範囲（最短の綴りでの打鍵数）。 */
export const DEFENSE_LENGTH_MIN = 10
export const DEFENSE_LENGTH_MAX = 30
/** 強攻撃を打ち切ったときに受ける割合。 */
export const STRONG_COMPLETE_RATE = 0.25
/** 強攻撃の制限時間の緩和係数（難易度ごと）。 */
export const STRONG_TIME_FACTOR: Readonly<Record<Difficulty, number>> = {
  1: 1.5,
  2: 1.4,
  3: 1.25,
  4: 1.1,
}

/** 防御お題の制限時間（ミリ秒）。文字数 ÷ 敵の KPM × 60 秒。強攻撃は緩和係数を掛けます。 */
export function defenseTimeMs(length: number, kpm: number, strong: boolean, difficulty: Difficulty): number {
  const base = (length / kpm) * 60_000
  return strong ? base * STRONG_TIME_FACTOR[difficulty] : base
}

/** 校正力由来の実効防御力（0〜1）。防御力% ×（校正力 ÷ 最大校正力）。 */
export function effectiveDefense(defPercent: number, prr: number, maxPrr: number): number {
  if (maxPrr <= 0) return 0
  return (defPercent / 100) * (prr / maxPrr)
}

/**
 * 防御フェーズの最終ダメージ。
 * @param base 元ダメージ D
 * @param n 打ち切り率（0〜1）
 * @param d 実効防御力（0〜1）
 */
export function defenseDamage(base: number, strong: boolean, completed: boolean, n: number, d: number): number {
  if (strong) {
    // 強攻撃は防御力を無視。打ち切れば「致命傷を避けた」として 25% まで下がります。
    return Math.round(completed ? base * STRONG_COMPLETE_RATE : base * (1 - n / 4))
  }
  return completed ? 0 : Math.round(base * (1 - n) * (1 - d))
}

// --- 疲労 ---
/** このターンから疲労が付きます。 */
export const FATIGUE_START_TURN = 31
/** 疲労 1 段階あたり、毎秒減る HP の割合（最大 HP に対して）。 */
export const FATIGUE_HP_DRAIN_PER_SEC = 0.01
/** 疲労 1 段階あたりの攻撃力低下。 */
export const FATIGUE_ATK_DOWN = 0.1
/** 疲労でも攻撃力はこの割合までしか下がりません。 */
export const FATIGUE_ATK_FLOOR = 0.1

/** そのターンの疲労の段階（0 なら疲労なし）。 */
export function fatigueStacks(turn: number): number {
  return Math.max(0, turn - FATIGUE_START_TURN + 1)
}

export function fatigueAttackMultiplier(stacks: number): number {
  return Math.max(FATIGUE_ATK_FLOOR, 1 - FATIGUE_ATK_DOWN * stacks)
}

// --- 報酬（お金とアイテムが決まるまでの仮） ---
export function expReward(damage: number, requestId: number, won: boolean): number {
  return Math.floor(damage / 12) + (won ? requestId * 30 : 0)
}

export function shardReward(damage: number, requestId: number, firstClear: boolean): number {
  return Math.floor(damage / 30) + requestId * 8 + (firstClear ? requestId * 20 : 0)
}
