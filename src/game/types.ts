/** お題のジャンル。 */
export type GenreId = 'school' | 'society' | 'nature' | 'food'

/** お題の長さの区分。 */
export type PromptKind = 'word' | 'sentence' | 'short' | 'long'

/** お題 1 件。text が画面に出す表記、kana が打つ読み。 */
export interface TextEntry {
  text: string
  kana: string
}

export type GenreTexts = Record<PromptKind, TextEntry[]>

/** 敵の行動の種類。attack = 通常攻撃、strong = 強攻撃（貫通）、idle = 非攻撃。 */
export type EnemyActionType = 'attack' | 'strong' | 'idle'

export interface EnemyAction {
  type: EnemyActionType
  /** 画面に出す行動名。 */
  name: string
  /** 元ダメージの倍率（敵の攻撃力 × power）。非攻撃では使いません。 */
  power?: number
}

/**
 * 敵の行動パターン。actions を先頭から順に繰り返します。
 * 残り HP の割合が below 以下になると、そのパターンに切り替わります。
 */
export interface EnemyPattern {
  below: number
  actions: EnemyAction[]
}

export interface EnemyDef {
  id: string
  name: string
  /** 敵の姿として大きく表示する 1 文字。 */
  glyph: string
  flavor: string
  hp: number
  /** 攻撃の元ダメージの基準値。 */
  attack: number
  /** 防御お題の制限時間を決める、敵の打鍵速度（打/分）。 */
  kpm: number
  boss?: boolean
  /** below の大きい順に並べます。先頭は below: 1（最初のパターン）。 */
  patterns: EnemyPattern[]
}

/** 難易度。1 が最も簡単です。 */
export type Difficulty = 1 | 2 | 3 | 4

/** 討伐依頼。waves の順に敵が 1 体ずつ現れます。 */
export interface RequestDef {
  id: number
  title: string
  difficulty: Difficulty
  /** 敵の id。 */
  waves: string[]
}

/** プレイヤーの能力値。 */
export interface PlayerStats {
  maxHp: number
  maxMp: number
  /** 攻撃力。 */
  atk: number
  /** 防御力（%）。校正力が満タンのときに軽減できる割合。 */
  def: number
  /** 命中率（%）。 */
  hit: number
  /** 幸運。バフ・デバフの判定に使う予定の値。 */
  luk: number
  /** 校正力の最大値。 */
  prr: number
  /** 会心率（%）。 */
  crt: number
}
