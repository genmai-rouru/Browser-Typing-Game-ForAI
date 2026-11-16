import { SKILL_MAX_LEVEL, skillExpThreshold } from './balance.ts'
import { enemyById, requestById } from './enemies.ts'

/**
 * パートナー（幻影討伐部の部員）のデータと、スキルの成長の計算。
 * 戦闘に連れていけるのは「前衛支援 1 人＋後方支援 1 人」です。
 */

export type PartnerRole = 'front' | 'back'

export const ROLE_NAMES: Readonly<Record<PartnerRole, string>> = {
  front: '前衛支援',
  back: '後方支援',
}

/** パッシブスキルの効果。healPerTurn = コマンドフェーズの開始時に、最大 HP の割合だけ回復。 */
export type PassiveEffect = { type: 'healPerTurn'; base: number; perLevel: number }

/** 固有スキルの効果。strokeDamage = 攻撃力 ×（base + perLevel × Lv）のダメージ。 */
export type UniqueEffect = { type: 'strokeDamage'; base: number; perLevel: number }

/** スキルレベルアップの条件。戦闘の結果が確定したあとに判定します。 */
export type LevelCondition =
  /** そのパートナーを同行して、指定の敵を倒す。 */
  | { type: 'defeat'; enemyId: string }
  /** そのパートナーを同行して、指定の依頼を達成する。 */
  | { type: 'clearRequest'; requestId: number }

export interface PartnerSkill<E> {
  name: string
  effect: E
  /** レベルごとの条件（キーは上がった後のレベル）。書かれていないレベルは条件なしです。 */
  conditions?: Partial<Record<number, LevelCondition>>
}

export interface PartnerDef {
  id: string
  name: string
  role: PartnerRole
  /** 画像ができるまでの仮表示に使う漢字 1 文字。 */
  glyph: string
  passive: PartnerSkill<PassiveEffect>
  unique: PartnerSkill<UniqueEffect> & {
    /** クールダウン（ターン数）。 */
    cooldown: number
  }
}

export type SkillKind = 'passive' | 'unique'

export const PARTNERS: readonly PartnerDef[] = [
  {
    id: 'konomi',
    name: '甘井 このみ',
    role: 'front',
    glyph: '甘',
    passive: {
      name: 'ポケットキャンディ',
      effect: { type: 'healPerTurn', base: 0.02, perLevel: 0.002 },
    },
    unique: {
      name: 'スイーツトルネード',
      effect: { type: 'strokeDamage', base: 300, perLevel: 30 },
      cooldown: 3,
    },
  },
]

/** 最初から所持しているパートナー。 */
export const INITIAL_PARTNER = 'konomi'

export function partnerById(id: string): PartnerDef | undefined {
  return PARTNERS.find((p) => p.id === id)
}

// ---- 効果の数値 ----

/** パッシブの回復割合（最大 HP に対して）。 */
export function passiveHealRate(def: PartnerDef, level: number): number {
  return def.passive.effect.base + def.passive.effect.perLevel * level
}

/** 固有スキルが何打鍵分のダメージになるか。 */
export function uniqueStrokes(def: PartnerDef, level: number): number {
  return def.unique.effect.base + def.unique.effect.perLevel * level
}

export function describePassive(def: PartnerDef, level: number): string {
  const rate = passiveHealRate(def, level) * 100
  return `毎ターン、最大 HP の ${Number(rate.toFixed(1))}% を回復`
}

export function describeUnique(def: PartnerDef, level: number): string {
  return `敵に ${uniqueStrokes(def, level)} 打鍵分（攻撃力 × ${uniqueStrokes(def, level)}）のダメージ`
}

export function describeCondition(condition: LevelCondition | undefined): string {
  if (!condition) return '条件なし'
  if (condition.type === 'defeat') return `同行して「${enemyById(condition.enemyId).name}」を討伐する`
  return `同行して依頼 ${condition.requestId}「${requestById(condition.requestId).title}」を達成する`
}

// ---- 成長 ----

/** パートナーごとの成長の記録（保存データ）。 */
export interface PartnerProgress {
  /** 累計経験値。消費はしません。 */
  exp: number
  passiveLv: number
  uniqueLv: number
  /** 達成済みの条件（"unique:3" のように、スキルと上がった後のレベルで表します）。 */
  achieved: string[]
}

export function createProgress(): PartnerProgress {
  return { exp: 0, passiveLv: 0, uniqueLv: 0, achieved: [] }
}

/** 条件の判定に使う、1 回の戦闘の記録。 */
export interface BattleRecord {
  won: boolean
  requestId: number
  /** 倒した敵の id。 */
  defeated: readonly string[]
}

function conditionKey(skill: SkillKind, level: number): string {
  return `${skill}:${level}`
}

function satisfies(condition: LevelCondition, record: BattleRecord): boolean {
  if (condition.type === 'defeat') return record.defeated.includes(condition.enemyId)
  return record.won && record.requestId === condition.requestId
}

/** スキルの次のレベルの条件を満たしているか（条件が無ければ true）。 */
export function conditionMet(def: PartnerDef, progress: PartnerProgress, skill: SkillKind, level: number): boolean {
  const condition = def[skill].conditions?.[level]
  return !condition || progress.achieved.includes(conditionKey(skill, level))
}

export interface SkillLevelUp {
  skill: SkillKind
  from: number
  to: number
}

/**
 * 戦闘の結果を、同行したパートナーの成長に反映します。
 * 1. 経験値を加える
 * 2. この戦闘で満たした条件を「達成済み」として記録する（経験値が足りなくても残ります）
 * 3. 各スキルについて「累計経験値が基準に達し、条件も達成済み」の間、レベルを上げる
 */
export function growPartner(
  def: PartnerDef,
  progress: PartnerProgress,
  gainedExp: number,
  record: BattleRecord,
): { progress: PartnerProgress; levelUps: SkillLevelUp[] } {
  const achieved = new Set(progress.achieved)
  for (const skill of ['passive', 'unique'] as const) {
    for (const [level, condition] of Object.entries(def[skill].conditions ?? {})) {
      if (condition && satisfies(condition, record)) achieved.add(conditionKey(skill, Number(level)))
    }
  }
  const next: PartnerProgress = { ...progress, exp: progress.exp + gainedExp, achieved: [...achieved] }
  const levelUps: SkillLevelUp[] = []
  for (const skill of ['passive', 'unique'] as const) {
    const field = skill === 'passive' ? 'passiveLv' : 'uniqueLv'
    const from = next[field]
    let level = from
    while (
      level < SKILL_MAX_LEVEL &&
      next.exp >= skillExpThreshold(level + 1) &&
      conditionMet(def, next, skill, level + 1)
    ) {
      level++
    }
    next[field] = level
    if (level > from) levelUps.push({ skill, from, to: level })
  }
  return { progress: next, levelUps }
}
