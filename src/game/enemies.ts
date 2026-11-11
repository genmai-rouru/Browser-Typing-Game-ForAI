import type { EnemyDef } from './types.ts'

/**
 * 敵は「文章を乱す言葉の魔物」です。姿は 1 文字の漢字で表します。
 * phases が複数ある敵は、HP が減るたびに弱点ジャンルが切り替わります。
 */
export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'goji',
    name: '誤字スライム',
    glyph: '誤',
    flavor: '打ち間違いから生まれた、ぷるぷるの魔物。',
    hp: 900,
    phases: [{ weak: 'school' }],
  },
  {
    id: 'datsuji',
    name: '脱字コウモリ',
    glyph: '脱',
    flavor: '文字をくわえて飛び去る。抜けた一文字は戻らない。',
    hp: 1400,
    phases: [{ weak: 'nature', resist: 'society' }],
  },
  {
    id: 'ranpitsu',
    name: '乱筆ゴブリン',
    glyph: '乱',
    flavor: '読めない字を書き散らす、いたずら者。',
    hp: 2100,
    phases: [{ weak: 'food', resist: 'school' }],
  },
  {
    id: 'bouyomi',
    name: '棒読みゴーレム',
    glyph: '棒',
    flavor: '抑揚を失った言葉が固まってできた巨体。',
    hp: 3000,
    phases: [{ weak: 'society', resist: 'nature' }],
  },
  {
    id: 'shimekiri',
    name: '締切の番人',
    glyph: '締',
    flavor: '時が迫るほど強くなる。弱点を次々と変えてくる。',
    hp: 4200,
    boss: true,
    phases: [
      { weak: 'society', resist: 'food' },
      { weak: 'school', resist: 'society' },
      { weak: 'food', resist: 'school' },
    ],
  },
  {
    id: 'hayakuchi',
    name: '早口の妖精',
    glyph: '速',
    flavor: '聞き取れない速さでまくし立てる。',
    hp: 6000,
    phases: [{ weak: 'nature', resist: 'food' }],
  },
  {
    id: 'jouchou',
    name: '冗長オーガ',
    glyph: '冗',
    flavor: '同じ話を何度でも繰り返す、回りくどい大鬼。',
    hp: 8200,
    phases: [
      { weak: 'school', resist: 'society' },
      { weak: 'nature', resist: 'school' },
    ],
  },
  {
    id: 'nandoku',
    name: '難読ドラゴン',
    glyph: '難',
    flavor: '誰にも読めない名を持つ古い竜。',
    hp: 11000,
    phases: [
      { weak: 'food', resist: 'nature' },
      { weak: 'society', resist: 'food' },
    ],
  },
  {
    id: 'chinmoku',
    name: '沈黙の騎士',
    glyph: '黙',
    flavor: '言葉を封じる鎧をまとう。届くのは強い言霊だけ。',
    hp: 15000,
    phases: [
      { weak: 'society', resist: 'school' },
      { weak: 'nature', resist: 'society' },
      { weak: 'school', resist: 'nature' },
    ],
  },
  {
    id: 'hakushi',
    name: '白紙の魔王',
    glyph: '白',
    flavor: 'すべての文章を白紙に戻そうとする、言葉の敵の王。',
    hp: 24000,
    boss: true,
    phases: [
      { weak: 'nature', resist: 'society' },
      { weak: 'food', resist: 'nature' },
      { weak: 'school', resist: 'food' },
      { weak: 'society', resist: 'school' },
    ],
  },
]

export const STAGE_COUNT = ENEMIES.length

/**
 * 階層に対応する敵を返します。
 * 最後の敵を倒したあとは「深層」として、同じ敵が強くなって繰り返し現れます。
 */
export function enemyForStage(stage: number): EnemyDef {
  if (stage <= STAGE_COUNT) return ENEMIES[stage - 1]
  const base = ENEMIES[(stage - 1) % STAGE_COUNT]
  const top = ENEMIES[STAGE_COUNT - 1].hp
  return {
    ...base,
    name: `深層の${base.name}`,
    hp: Math.round((top * Math.pow(1.22, stage - STAGE_COUNT)) / 100) * 100,
  }
}

/** 残り HP から、いまの形態の番号を求めます。 */
export function phaseIndex(enemy: EnemyDef, hp: number, maxHp: number): number {
  const lost = 1 - hp / maxHp
  return Math.min(enemy.phases.length - 1, Math.floor(lost * enemy.phases.length))
}
