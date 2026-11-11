import { describe, expect, it } from 'vitest'
import {
  BATTLE_TIME_MS,
  GAUGE_MAX,
  GAUGE_PER_BAR,
  RESUME_INPUT_LOCK_MS,
  expReward,
  keyUpgradeCost,
} from './balance.ts'
import { Battle, type BattleEvent, type Loadout } from './battle.ts'
import { ENEMIES, enemyForStage, phaseIndex } from './enemies.ts'
import { applyBattle, placeRune, upgradeKey } from './rewards.ts'
import { buildLoadout, createSave, type SaveData } from './save.ts'
import type { EnemyDef } from './types.ts'

/** 再現性のある乱数。 */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x80000000
  }
}

const baseLoadout: Loadout = {
  attack: 10,
  keyLevels: {},
  runeByKey: {},
  masteryLevels: { school: 0, society: 0, nature: 0, food: 0 },
  prefs: {},
}

function dummy(hp: number, extra: Partial<EnemyDef> = {}): EnemyDef {
  return { id: 'dummy', name: '的', glyph: '的', flavor: '', hp, phases: [{ weak: 'food' }], ...extra }
}

/** ガイドどおりに count 打鍵します。 */
function typeGuide(battle: Battle, count: number, now = 0): BattleEvent[] {
  const events: BattleEvent[] = []
  for (let i = 0; i < count && battle.status === 'running'; i++) {
    battle.type(battle.prompt.session.guide().rest[0], now)
    events.push(...battle.drainEvents())
  }
  return events
}

/** いまのお題を打ち切ります。 */
function finishPrompt(battle: Battle, now = 0): BattleEvent[] {
  const events: BattleEvent[] = []
  const prompt = battle.prompt
  while (battle.prompt === prompt && battle.status === 'running') {
    events.push(...typeGuide(battle, 1, now))
  }
  return events
}

/** 会心が出ない乱数（常に 0.99）。お題の抽選は末尾の候補に固定されます。 */
const noCrit = () => 0.99

describe('Battle: 打鍵とダメージ', () => {
  it('開始前の打鍵は無視される', () => {
    const b = new Battle(dummy(1000), 1, baseLoadout, 'school', noCrit)
    b.type(b.prompt.session.guide().rest[0], 0)
    expect(b.stats.strokes).toBe(0)
    expect(b.hp).toBe(1000)
  })

  it('1 打鍵ごとにダメージが入り、コンボで増えていく', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', noCrit)
    b.start(0)
    const hits = typeGuide(b, 3).filter((e) => e.type === 'hit')
    // 攻撃力 10 × コンボ倍率 (1 + 0.005 × コンボ数)
    expect(hits.map((e) => e.amount)).toEqual([10, 10, 10])
    expect(b.combo).toBe(3)
    expect(b.hp).toBe(100000 - 30)
    expect(b.stats.damage).toBe(30)
  })

  it('ミスするとコンボが切れ、ダメージは入らない', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', noCrit)
    b.start(0)
    typeGuide(b, 5)
    b.type('1', 0)
    expect(b.drainEvents()).toEqual([{ type: 'miss' }])
    expect(b.combo).toBe(0)
    expect(b.stats.misses).toBe(1)
    expect(b.hp).toBe(100000 - 50)
  })

  it('弱点ジャンルは 1.5 倍、耐性ジャンルは 0.6 倍', () => {
    const enemy = dummy(100000, { phases: [{ weak: 'food', resist: 'school' }] })
    const weak = new Battle(enemy, 1, baseLoadout, 'food', noCrit)
    weak.start(0)
    expect(typeGuide(weak, 1)[0]).toMatchObject({ type: 'hit', amount: 15, affinity: 'weak' })
    const resist = new Battle(enemy, 1, baseLoadout, 'school', noCrit)
    resist.start(0)
    expect(typeGuide(resist, 1)[0]).toMatchObject({ type: 'hit', amount: 6, affinity: 'resist' })
  })

  it('鍛えたキーはダメージが伸び、別綴りでそのキーを通せる', () => {
    const loadout = { ...baseLoadout, keyLevels: { c: 5 } }
    const b = new Battle(dummy(100000), 1, loadout, 'school', noCrit)
    b.start(0)
    // 「か」「く」「こ」「し」「せ」のどれかが出るまで進め、c で打つ。
    for (let guard = 0; guard < 500; guard++) {
      if (b.prompt.session.nextKeys().includes('c')) break
      typeGuide(b, 1)
    }
    b.drainEvents()
    b.type('c', 0)
    const hit = b.drainEvents().find((e) => e.type === 'hit')!
    expect(hit.key).toBe('c')
    // キー Lv5 で 1.5 倍。
    expect(hit.amount).toBeGreaterThanOrEqual(15)
  })

  it('ジャンル熟練度でダメージが伸びる', () => {
    const loadout = { ...baseLoadout, masteryLevels: { ...baseLoadout.masteryLevels, school: 10 } }
    const b = new Battle(dummy(100000), 1, loadout, 'school', noCrit)
    b.start(0)
    expect(typeGuide(b, 1)[0]).toMatchObject({ amount: 13 })
  })

  it('会心は 2 倍', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', () => 0)
    b.start(0)
    expect(typeGuide(b, 1)[0]).toMatchObject({ amount: 20, crit: true })
  })

  it('お題を打ち切ると追撃が入り、次のお題に進む', () => {
    const b = new Battle(dummy(1000000), 1, baseLoadout, 'school', noCrit)
    b.start(0)
    const upcoming = b.next.entry
    const events = finishPrompt(b)
    const burst = events.find((e) => e.type === 'burst')
    expect(burst).toMatchObject({ mode: 'normal', noMiss: true })
    expect(b.prompt.entry).toBe(upcoming)
    expect(b.stats.promptsCompleted).toBe(1)
  })
})

describe('Battle: ジャンル切替', () => {
  it('入力の途中でも切り替えられ、お題が新しいジャンルになる', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', seeded())
    b.start(0)
    typeGuide(b, 2)
    expect(b.switchGenre('society')).toBe(true)
    expect(b.genre).toBe('society')
    expect(b.prompt.genre).toBe('society')
    expect(b.prompt.session.typedCount).toBe(0)
    expect(b.combo).toBe(2)
    expect(b.drainEvents()).toContainEqual({ type: 'genre', genre: 'society' })
  })

  it('同じジャンルへの切替は何もしない', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', seeded())
    b.start(0)
    const prompt = b.prompt
    expect(b.switchGenre('school')).toBe(false)
    expect(b.prompt).toBe(prompt)
  })

  it('cycleGenre で順送り・逆送りができる', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', seeded())
    b.start(0)
    b.cycleGenre(1)
    expect(b.genre).toBe('society')
    b.cycleGenre(-1)
    b.cycleGenre(-1)
    expect(b.genre).toBe('food')
  })

  it('ジャンルごとの打鍵数が別々に数えられる', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', seeded())
    b.start(0)
    typeGuide(b, 3)
    b.switchGenre('nature')
    typeGuide(b, 4)
    expect(b.stats.genreStrokes).toMatchObject({ school: 3, nature: 4, society: 0, food: 0 })
  })
})

describe('Battle: 大技と奥義', () => {
  it('ゲージが 1 本たまると大技（短文）を使える', () => {
    const b = new Battle(dummy(10000000), 1, baseLoadout, 'school', seeded(3))
    b.start(0)
    expect(b.activate('skill')).toBe(false)
    while (b.gauge < GAUGE_PER_BAR) typeGuide(b, 1)
    expect(b.canUse('skill')).toBe(true)
    expect(b.canUse('ultimate')).toBe(false)
    const gauge = b.gauge
    expect(b.activate('skill')).toBe(true)
    expect(b.gauge).toBe(gauge - GAUGE_PER_BAR)
    expect(b.mode).toBe('skill')
    expect(b.prompt.kind).toBe('short')
    // 大技の最中はジャンル切替も重ねがけもできない。
    expect(b.switchGenre('food')).toBe(false)
    expect(b.activate('skill')).toBe(false)
    const events = finishPrompt(b)
    expect(events.find((e) => e.type === 'burst')).toMatchObject({ mode: 'skill' })
    expect(b.mode).toBe('normal')
    expect(b.stats.bigMovesCompleted).toBe(1)
  })

  it('ゲージが 2 本たまると奥義（長文）を使える', () => {
    const b = new Battle(dummy(10000000), 1, baseLoadout, 'school', seeded(5))
    b.start(0)
    while (b.gauge < GAUGE_MAX) typeGuide(b, 1)
    expect(b.activate('ultimate')).toBe(true)
    expect(b.gauge).toBe(0)
    expect(b.prompt.kind).toBe('long')
    b.drainEvents()
    // 奥義の最中は 1 打鍵のダメージが 2 倍（さらにコンボ倍率が乗る）。
    const hit = typeGuide(b, 1)[0]
    expect(hit.type).toBe('hit')
    expect(hit).toMatchObject({ amount: Math.round(10 * (1 + 0.005 * Math.min(b.combo, 100)) * 2) })
  })

  it('大技の最中に倒すとトドメになる', () => {
    const b = new Battle(dummy(10000000), 1, baseLoadout, 'school', seeded(7))
    b.start(0)
    while (b.gauge < GAUGE_PER_BAR) typeGuide(b, 1)
    b.hp = 5
    b.activate('skill')
    const events = typeGuide(b, 1)
    expect(b.status).toBe('won')
    expect(b.finisher).toBe(true)
    expect(events).toContainEqual({ type: 'end', status: 'won', finisher: true })
  })

  it('刻印: 蓄積はゲージ、連鎖はコンボを余分に伸ばす', () => {
    const first = (rune: 'charge' | 'chain') => {
      const b = new Battle(dummy(100000), 1, baseLoadout, 'school', noCrit)
      const key = b.prompt.session.guide().rest[0]
      const runed = new Battle(dummy(100000), 1, { ...baseLoadout, runeByKey: { [key]: rune } }, 'school', noCrit)
      runed.start(0)
      typeGuide(runed, 1)
      return runed
    }
    expect(first('charge').gauge).toBe(3)
    expect(first('chain').combo).toBe(3)
  })
})

describe('Battle: 時間と決着', () => {
  it('30 秒で時間切れになる', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', noCrit)
    b.start(1000)
    b.tick(1000 + BATTLE_TIME_MS - 1)
    expect(b.status).toBe('running')
    b.tick(1000 + BATTLE_TIME_MS)
    expect(b.status).toBe('timeup')
    expect(b.drainEvents()).toContainEqual({ type: 'end', status: 'timeup', finisher: false })
    b.type('a', 1000 + BATTLE_TIME_MS + 1)
    expect(b.stats.strokes).toBe(0)
  })

  it('HP を削り切ると勝利し、与ダメージは最大 HP を超えない', () => {
    const b = new Battle(dummy(25), 1, baseLoadout, 'school', noCrit)
    b.start(0)
    typeGuide(b, 10)
    expect(b.status).toBe('won')
    expect(b.finisher).toBe(false)
    expect(b.stats.damage).toBe(25)
    expect(b.stats.strokes).toBe(3)
  })

  it('HP が減ると形態が変わり、弱点が切り替わる', () => {
    const enemy = dummy(100, { phases: [{ weak: 'school' }, { weak: 'food' }] })
    const b = new Battle(enemy, 1, baseLoadout, 'school', noCrit)
    b.start(0)
    expect(b.affinityOf('school')).toBe('weak')
    const events = typeGuide(b, 4)
    expect(events).toContainEqual({ type: 'phase', phase: { weak: 'food' } })
    expect(b.affinityOf('school')).toBe('normal')
    expect(b.affinityOf('food')).toBe('weak')
  })
})

describe('Battle: 一時停止', () => {
  it('止めている間は残り時間が減らず、入力も受け付けない', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', noCrit)
    b.start(0)
    b.pause(5000)
    expect(b.paused).toBe(true)
    b.tick(20000)
    expect(b.timeLeftMs).toBe(BATTLE_TIME_MS - 5000)
    b.type(b.prompt.session.guide().rest[0], 20000)
    expect(b.stats.strokes).toBe(0)
    b.resume(60000)
    expect(b.paused).toBe(false)
    b.tick(61000)
    expect(b.timeLeftMs).toBe(BATTLE_TIME_MS - 6000)
  })

  it('再開後 0.5 秒は入力が無効で、ミスにも数えない', () => {
    const b = new Battle(dummy(100000), 1, baseLoadout, 'school', noCrit)
    b.start(0)
    b.pause(1000)
    b.resume(2000)
    expect(b.isInputLocked(2000 + RESUME_INPUT_LOCK_MS - 1)).toBe(true)
    b.type('1', 2000 + RESUME_INPUT_LOCK_MS - 1)
    b.type(b.prompt.session.guide().rest[0], 2000 + RESUME_INPUT_LOCK_MS - 1)
    expect(b.stats.strokes).toBe(0)
    expect(b.stats.misses).toBe(0)
    expect(b.isInputLocked(2000 + RESUME_INPUT_LOCK_MS)).toBe(false)
    b.type(b.prompt.session.guide().rest[0], 2000 + RESUME_INPUT_LOCK_MS)
    expect(b.stats.strokes).toBe(1)
  })
})

describe('敵データ', () => {
  it('階層が進むほど HP が増える（深層も含む）', () => {
    for (let stage = 2; stage <= 25; stage++) {
      expect(enemyForStage(stage).hp).toBeGreaterThan(enemyForStage(stage - 1).hp)
    }
  })

  it('形態の境目は HP を等分した位置', () => {
    const boss = ENEMIES[4]
    expect(phaseIndex(boss, boss.hp, boss.hp)).toBe(0)
    expect(phaseIndex(boss, boss.hp * 0.5, boss.hp)).toBe(1)
    expect(phaseIndex(boss, 1, boss.hp)).toBe(2)
  })
})

describe('報酬と鍛冶', () => {
  it('勝利すると階層が進み、経験値と欠片が入る', () => {
    const save = createSave()
    const b = new Battle(enemyForStage(1), 1, buildLoadout(save), 'school', noCrit)
    b.start(0)
    while (b.status === 'running') typeGuide(b, 1, 5000)
    const { save: next, summary } = applyBattle(save, b)
    expect(summary.won).toBe(true)
    expect(summary.firstClear).toBe(true)
    expect(summary.damage).toBe(enemyForStage(1).hp)
    expect(next.clearedStage).toBe(1)
    expect(next.shards).toBe(summary.shards)
    // 与ダメージぶん + 討伐 + 残り時間 + 初突破
    expect(summary.shards).toBe(Math.floor(summary.damage / 30) + 8 + 25 + 20)
    expect(next.level).toBeGreaterThanOrEqual(2)
    expect(next.masteryStrokes.school).toBe(b.stats.strokes)
    expect(next.battles).toBe(1)
    expect(summary.accuracy).toBe(1)
  })

  it('時間切れでも与えたダメージぶんの報酬は入るが、階層は進まない', () => {
    const save = createSave()
    const b = new Battle(enemyForStage(10), 10, buildLoadout(save), 'school', noCrit)
    b.start(0)
    typeGuide(b, 60, 100)
    b.tick(BATTLE_TIME_MS)
    const { save: next, summary } = applyBattle(save, b)
    expect(summary.won).toBe(false)
    expect(next.clearedStage).toBe(0)
    expect(summary.shards).toBe(Math.floor(b.stats.damage / 30))
    expect(summary.exp).toBe(expReward(b.stats.damage, 10, false))
  })

  it('決まった階層の初突破で刻印が手に入る', () => {
    const save = { ...createSave(), clearedStage: 1 }
    const b = new Battle(dummy(10), 2, buildLoadout(save), 'school', noCrit)
    b.start(0)
    typeGuide(b, 5)
    const { save: next, summary } = applyBattle(save, b)
    expect(summary.newRune).toBe('crit')
    expect(next.runes).toEqual([{ type: 'crit', key: null }])
    // 2 回目の突破ではもらえない。
    const again = new Battle(dummy(10), 2, buildLoadout(next), 'school', noCrit)
    again.start(0)
    typeGuide(again, 5)
    expect(applyBattle(next, again).summary.newRune).toBeNull()
  })

  it('使った綴りがガイドの好みとして保存される', () => {
    const save = createSave()
    const b = new Battle(dummy(100000), 1, buildLoadout(save), 'school', seeded(11))
    b.start(0)
    for (let i = 0; i < 300; i++) {
      const keys = b.prompt.session.nextKeys()
      b.type(keys.includes('c') ? 'c' : b.prompt.session.guide().rest[0], 0)
    }
    b.tick(BATTLE_TIME_MS)
    const { save: next } = applyBattle(save, b)
    expect(Object.values(next.prefs).some((r) => r.startsWith('c'))).toBe(true)
  })

  it('キー鍛錬: 欠片を払ってレベルが上がる。足りなければ変化しない', () => {
    const poor = { ...createSave(), shards: keyUpgradeCost(0) - 1 }
    expect(upgradeKey(poor, 'a')).toBe(poor)
    const rich = { ...createSave(), shards: 100 }
    const once = upgradeKey(rich, 'a')
    expect(once.keyLevels.a).toBe(1)
    expect(once.shards).toBe(100 - keyUpgradeCost(0))
    const twice = upgradeKey(once, 'a')
    expect(twice.keyLevels.a).toBe(2)
    expect(twice.shards).toBe(100 - keyUpgradeCost(0) - keyUpgradeCost(1))
  })

  it('刻印: 1 つのキーに刻めるのは 1 つ。付け替えると前のものは外れる', () => {
    let save: SaveData = {
      ...createSave(),
      runes: [
        { type: 'crit', key: null },
        { type: 'chain', key: null },
      ],
    }
    save = placeRune(save, 0, 'a')
    expect(buildLoadout(save).runeByKey).toEqual({ a: 'crit' })
    save = placeRune(save, 1, 'a')
    expect(save.runes).toEqual([
      { type: 'crit', key: null },
      { type: 'chain', key: 'a' },
    ])
    save = placeRune(save, 1, null)
    expect(buildLoadout(save).runeByKey).toEqual({})
  })
})
