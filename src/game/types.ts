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

/** キーに刻める刻印の種類。 */
export type RuneType = 'crit' | 'charge' | 'chain'

/** 所持している刻印 1 つ。key が null なら未装着。 */
export interface RuneInstance {
  type: RuneType
  key: string | null
}

/** 敵の形態。HP が減ると次の形態に移り、弱点が変わります。 */
export interface EnemyPhase {
  weak: GenreId
  resist?: GenreId
}

export interface EnemyDef {
  id: string
  name: string
  /** 敵の姿として大きく表示する 1 文字。 */
  glyph: string
  flavor: string
  hp: number
  boss?: boolean
  phases: EnemyPhase[]
}
