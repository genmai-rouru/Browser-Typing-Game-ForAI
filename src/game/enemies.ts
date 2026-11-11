import type { EnemyAction, EnemyDef, RequestDef } from './types.ts'

/**
 * 敵と討伐依頼のデータ。
 * 名前・能力・行動はすべて仮のもので、依頼の中身を決めるときに差し替えます。
 */

const idle = (name: string): EnemyAction => ({ type: 'idle', name })
const attack = (name: string, power = 1): EnemyAction => ({ type: 'attack', name, power })
const strong = (name: string, power = 1.6): EnemyAction => ({ type: 'strong', name, power })

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'goji',
    name: '誤字スライム',
    glyph: '誤',
    flavor: '打ち間違いから生まれた、ぷるぷるの魔物。',
    hp: 1600,
    attack: 18,
    kpm: 150,
    patterns: [
      { below: 1, actions: [idle('様子を見ている'), attack('体当たり')] },
      { below: 0.4, actions: [attack('体当たり')] },
    ],
  },
  {
    id: 'datsuji',
    name: '脱字コウモリ',
    glyph: '脱',
    flavor: '文字をくわえて飛び去る。抜けた一文字は戻らない。',
    hp: 2400,
    attack: 22,
    kpm: 170,
    patterns: [
      { below: 1, actions: [attack('かみつき'), idle('飛び回っている')] },
      { below: 0.5, actions: [attack('かみつき'), attack('かみつき'), idle('飛び回っている')] },
    ],
  },
  {
    id: 'ranpitsu',
    name: '乱筆ゴブリン',
    glyph: '乱',
    flavor: '読めない字を書き散らす、いたずら者。',
    hp: 3200,
    attack: 26,
    kpm: 190,
    patterns: [
      { below: 1, actions: [attack('なぐり書き'), attack('なぐり書き'), idle('力をためている'), strong('大なぐり書き')] },
    ],
  },
  {
    id: 'bouyomi',
    name: '棒読みゴーレム',
    glyph: '棒',
    flavor: '抑揚を失った言葉が固まってできた巨体。',
    hp: 4400,
    attack: 32,
    kpm: 200,
    patterns: [
      { below: 1, actions: [idle('ゆっくり動き出す'), attack('叩きつけ')] },
      { below: 0.5, actions: [attack('叩きつけ'), idle('力をためている'), strong('地ならし')] },
    ],
  },
  {
    id: 'shimekiri',
    name: '締切の番人',
    glyph: '締',
    flavor: '時が迫るほど強くなる。',
    hp: 6000,
    attack: 36,
    kpm: 230,
    boss: true,
    patterns: [
      { below: 1, actions: [attack('催促'), idle('時計を見ている'), attack('催促')] },
      { below: 0.6, actions: [attack('催促'), attack('催促'), strong('最終通告')] },
      { below: 0.25, actions: [attack('催促', 1.2), strong('最終通告')] },
    ],
  },
  {
    id: 'hayakuchi',
    name: '早口の妖精',
    glyph: '速',
    flavor: '聞き取れない速さでまくし立てる。',
    hp: 7000,
    attack: 34,
    kpm: 300,
    patterns: [
      { below: 1, actions: [attack('早口'), attack('早口'), idle('息つぎをしている')] },
      { below: 0.4, actions: [attack('早口'), attack('早口'), strong('まくし立て', 1.4)] },
    ],
  },
  {
    id: 'jouchou',
    name: '冗長オーガ',
    glyph: '冗',
    flavor: '同じ話を何度でも繰り返す、回りくどい大鬼。',
    hp: 9500,
    attack: 46,
    kpm: 240,
    patterns: [
      { below: 1, actions: [idle('長話をしている'), attack('ふり回し'), idle('長話をしている'), strong('大ふり回し')] },
      { below: 0.5, actions: [attack('ふり回し'), idle('力をためている'), strong('大ふり回し')] },
    ],
  },
  {
    id: 'nandoku',
    name: '難読ドラゴン',
    glyph: '難',
    flavor: '誰にも読めない名を持つ古い竜。',
    hp: 12000,
    attack: 54,
    kpm: 280,
    patterns: [
      { below: 1, actions: [attack('かぎ爪'), attack('かぎ爪'), idle('息を吸いこんでいる'), strong('ブレス')] },
      { below: 0.5, actions: [attack('かぎ爪', 1.2), idle('息を吸いこんでいる'), strong('ブレス', 1.8)] },
    ],
  },
  {
    id: 'chinmoku',
    name: '沈黙の騎士',
    glyph: '黙',
    flavor: '言葉を封じる鎧をまとう。',
    hp: 15000,
    attack: 62,
    kpm: 360,
    patterns: [
      { below: 1, actions: [attack('斬撃'), attack('斬撃'), idle('構えている'), strong('一閃')] },
      { below: 0.5, actions: [attack('斬撃'), strong('一閃'), attack('斬撃', 1.2), idle('構えている')] },
    ],
  },
  {
    id: 'hakushi',
    name: '白紙の魔王',
    glyph: '白',
    flavor: 'すべての文章を白紙に戻そうとする王。',
    hp: 22000,
    attack: 72,
    kpm: 440,
    boss: true,
    patterns: [
      { below: 1, actions: [attack('消去'), idle('こちらを見下ろしている'), attack('消去'), strong('白紙化')] },
      { below: 0.6, actions: [attack('消去'), attack('消去'), strong('白紙化')] },
      { below: 0.25, actions: [attack('消去', 1.2), strong('白紙化', 1.8)] },
    ],
  },
]

export function enemyById(id: string): EnemyDef {
  const enemy = ENEMIES.find((e) => e.id === id)
  if (!enemy) throw new Error(`敵が見つかりません: ${id}`)
  return enemy
}

export const REQUESTS: readonly RequestDef[] = [
  { id: 1, title: '運動場に迷い込んだ魔物', difficulty: 1, waves: ['goji'] },
  { id: 2, title: '夕方の校舎裏の物音', difficulty: 1, waves: ['datsuji'] },
  { id: 3, title: '落書き騒ぎの調査', difficulty: 1, waves: ['goji', 'ranpitsu'] },
  { id: 4, title: '体育倉庫の見回り', difficulty: 2, waves: ['datsuji', 'bouyomi'] },
  { id: 5, title: 'ゲートの番人の討伐', difficulty: 2, waves: ['ranpitsu', 'bouyomi', 'shimekiri'] },
  { id: 6, title: '放送室を荒らす声', difficulty: 2, waves: ['hayakuchi'] },
  { id: 7, title: '偵察部隊の迎撃', difficulty: 3, waves: ['hayakuchi', 'jouchou'] },
  { id: 8, title: '古い竜の足止め', difficulty: 3, waves: ['jouchou', 'nandoku'] },
  { id: 9, title: '侵攻部隊の迎撃', difficulty: 3, waves: ['hayakuchi', 'nandoku', 'chinmoku'] },
  { id: 10, title: '魔王の討伐', difficulty: 4, waves: ['chinmoku', 'nandoku', 'hakushi'] },
]

export function requestById(id: number): RequestDef {
  const request = REQUESTS.find((r) => r.id === id)
  if (!request) throw new Error(`依頼が見つかりません: ${id}`)
  return request
}

/** 残り HP の割合から、いまの行動パターンの番号を求めます。 */
export function patternIndex(enemy: EnemyDef, hpRatio: number): number {
  let index = 0
  enemy.patterns.forEach((pattern, i) => {
    if (hpRatio <= pattern.below) index = i
  })
  return index
}
