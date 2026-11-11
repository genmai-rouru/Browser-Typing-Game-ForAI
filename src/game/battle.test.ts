import { describe, expect, it } from 'vitest'
import {
  ATTACK_TIME_MS,
  DEFENSE_INTRO_MS,
  FATIGUE_START_TURN,
  MP_COST,
  RESUME_INPUT_LOCK_MS,
  defenseDamage,
  defenseTimeMs,
  effectiveDefense,
  expReward,
  fatigueStacks,
  keyUpgradeCost,
  playerStats,
} from './balance.ts'
import { Battle, type BattleEvent, type Loadout } from './battle.ts'
import { ENEMIES, REQUESTS, enemyById, patternIndex } from './enemies.ts'
import { applyBattle, upgradeKey } from './rewards.ts'
import { buildLoadout, createSave } from './save.ts'
import type { EnemyAction, EnemyDef, RequestDef } from './types.ts'

/** 再現性のある乱数。 */
function seeded(seed = 1): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x80000000
  }
}

/** 会心が出ない乱数。 */
const noCrit = () => 0.99

const IDLE: EnemyAction = { type: 'idle', name: '様子見' }
const ATTACK: EnemyAction = { type: 'attack', name: '攻撃', power: 1 }
const STRONG: EnemyAction = { type: 'strong', name: '強攻撃', power: 2 }

function enemy(id: string, hp: number, actions: EnemyAction[], extra: Partial<EnemyDef> = {}): EnemyDef {
  return { id, name: id, glyph: '的', flavor: '', hp, attack: 40, kpm: 300, patterns: [{ below: 1, actions }], ...extra }
}

interface Setup {
  enemies?: EnemyDef[]
  loadout?: Partial<Loadout>
  rng?: () => number
  difficulty?: RequestDef['difficulty']
}

function setup({ enemies = [enemy('a', 1e9, [IDLE])], loadout = {}, rng = noCrit, difficulty = 1 }: Setup = {}) {
  const request: RequestDef = { id: 1, title: 'テスト', difficulty, waves: enemies.map((e) => e.id) }
  const full: Loadout = { stats: playerStats(1), keyLevels: {}, prefs: {}, ...loadout }
  const battle = new Battle(request, full, 'school', rng, (id) => enemies.find((e) => e.id === id)!)
  battle.tick(0)
  return battle
}

/** ガイドどおりに count 打鍵します。 */
function typeGuide(battle: Battle, count: number, now: number): BattleEvent[] {
  const events: BattleEvent[] = []
  for (let i = 0; i < count; i++) {
    if (!battle.prompt || (battle.phase !== 'attack' && battle.phase !== 'defense')) break
    battle.type(battle.prompt.session.guide().rest[0], now)
    events.push(...battle.drainEvents())
  }
  return events
}

/** 攻撃フェーズを何もせずに終わらせ、防御フェーズの入力開始まで進めます。 */
function toDefense(battle: Battle, start: number): number {
  battle.proceed(start)
  battle.tick(start + ATTACK_TIME_MS)
  expect(battle.phase).toBe('defenseIntro')
  battle.tick(start + ATTACK_TIME_MS + DEFENSE_INTRO_MS)
  expect(battle.phase).toBe('defense')
  return start + ATTACK_TIME_MS + DEFENSE_INTRO_MS
}

describe('防御の計算式', () => {
  it('実効防御力 = 防御力% ×（校正力 ÷ 最大校正力）', () => {
    expect(effectiveDefense(20, 15, 30)).toBeCloseTo(0.1)
    expect(effectiveDefense(5, 30, 30)).toBeCloseTo(0.05)
    expect(effectiveDefense(5, 0, 30)).toBe(0)
  })

  it('通常攻撃: 打ち切れば 0、未完走は D×(1−n)×(1−d)', () => {
    expect(defenseDamage(100, false, true, 1, 0.1)).toBe(0)
    expect(defenseDamage(100, false, false, 0, 0)).toBe(100)
    expect(defenseDamage(100, false, false, 0.5, 0.1)).toBe(45)
  })

  it('強攻撃: 打ち切れば D×25%、未完走は D×(1−n/4) で防御力を無視', () => {
    expect(defenseDamage(100, true, true, 1, 0.5)).toBe(25)
    expect(defenseDamage(100, true, false, 0, 0.5)).toBe(100)
    expect(defenseDamage(100, true, false, 0.8, 0.5)).toBe(80)
  })

  it('制限時間 = 文字数 ÷ 敵の KPM × 60 秒。強攻撃は難易度ごとに緩和', () => {
    expect(defenseTimeMs(30, 600, false, 1)).toBe(3000)
    expect(defenseTimeMs(30, 600, true, 1)).toBe(4500)
    expect(defenseTimeMs(30, 600, true, 2)).toBeCloseTo(4200)
    expect(defenseTimeMs(30, 600, true, 3)).toBe(3750)
    expect(defenseTimeMs(30, 600, true, 4)).toBeCloseTo(3300)
  })
})

describe('ターンの流れ', () => {
  it('コマンドフェーズから始まり、進めると攻撃フェーズ（30 秒）になる', () => {
    const b = setup()
    expect(b.phase).toBe('command')
    expect(b.report.kind).toBe('start')
    expect(b.prompt).toBeNull()
    b.type('a', 0)
    expect(b.stats.strokes).toBe(0)
    expect(b.proceed(0)).toBe(true)
    expect(b.phase).toBe('attack')
    expect(b.turn).toBe(1)
    expect(b.timeLeftMs).toBe(ATTACK_TIME_MS)
    expect(b.prompt).not.toBeNull()
  })

  it('1 打鍵ごとに「攻撃力 × キー強化」のダメージ。打ち切ると追撃が入る', () => {
    const b = setup()
    b.proceed(0)
    const hits = typeGuide(b, 2, 10).filter((e) => e.type === 'hit')
    expect(hits.map((e) => e.amount)).toEqual([10, 10])
    const first = b.prompt
    const events: BattleEvent[] = []
    while (b.prompt === first) events.push(...typeGuide(b, 1, 20))
    expect(events.find((e) => e.type === 'burst')).toMatchObject({ noMiss: true })
    expect(b.prompt).not.toBe(first)
  })

  it('強化したキーはダメージが伸びる', () => {
    const b = setup({ loadout: { keyLevels: Object.fromEntries('abcdefghijklmnopqrstuvwxyz-'.split('').map((k) => [k, 5])) } })
    b.proceed(0)
    expect(typeGuide(b, 1, 10)[0]).toMatchObject({ type: 'hit', amount: 15 })
  })

  it('会心は 2 倍', () => {
    const b = setup({ loadout: { stats: { ...playerStats(1), crt: 100 } } })
    b.proceed(0)
    expect(typeGuide(b, 1, 10)[0]).toMatchObject({ amount: 20, crit: true })
  })

  it('非攻撃の行動なら、防御フェーズを飛ばしてコマンドフェーズに戻る', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [IDLE])] })
    b.proceed(0)
    typeGuide(b, 3, 100)
    b.tick(ATTACK_TIME_MS)
    expect(b.phase).toBe('command')
    expect(b.report).toMatchObject({ kind: 'turn', turn: 1, strokes: 3, damage: 30, action: IDLE, defense: null })
    b.proceed(ATTACK_TIME_MS + 5000)
    expect(b.turn).toBe(2)
    expect(b.timeLeftMs).toBe(ATTACK_TIME_MS)
  })

  it('残り 2 秒になると、敵の行動を予告する', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [ATTACK])] })
    b.proceed(0)
    b.tick(ATTACK_TIME_MS - 2001)
    expect(b.forecast).toBeNull()
    b.tick(ATTACK_TIME_MS - 2000)
    expect(b.forecast).toEqual(ATTACK)
  })

  it('行動は決まった順番で繰り返す', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [IDLE, ATTACK])] })
    b.proceed(0)
    b.tick(ATTACK_TIME_MS)
    expect(b.report.action).toEqual(IDLE)
    b.proceed(40000)
    b.tick(40000 + ATTACK_TIME_MS)
    expect(b.phase).toBe('defenseIntro')
    expect(b.forecast).toEqual(ATTACK)
  })

  it('HP が減ると行動パターンが変わる', () => {
    const target = enemy('a', 100, [IDLE], {
      patterns: [
        { below: 1, actions: [IDLE] },
        { below: 0.5, actions: [STRONG] },
      ],
    })
    expect(patternIndex(target, 1)).toBe(0)
    expect(patternIndex(target, 0.5)).toBe(1)
    const b = setup({ enemies: [target] })
    b.proceed(0)
    typeGuide(b, 5, 10)
    b.tick(ATTACK_TIME_MS)
    expect(b.forecast).toEqual(STRONG)
  })
})

describe('防御フェーズ', () => {
  it('攻撃行動のとき、防御お題と制限時間が出る', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [ATTACK])] })
    const start = toDefense(b, 0)
    const length = b.prompt!.session.shortestLength
    expect(length).toBeGreaterThanOrEqual(10)
    expect(length).toBeLessThanOrEqual(30)
    expect(b.timeLimitMs).toBeCloseTo((length / 300) * 60000)
    expect(b.defense).toMatchObject({ base: 40, strong: false })
    expect(start).toBe(ATTACK_TIME_MS + DEFENSE_INTRO_MS)
  })

  it('お題を出した直後の短い間は入力を受け付けない', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [ATTACK])] })
    b.proceed(0)
    b.tick(ATTACK_TIME_MS)
    b.type('1', ATTACK_TIME_MS + 100)
    expect(b.stats.misses).toBe(0)
    expect(b.prr).toBe(30)
  })

  it('通常攻撃を打ち切ると回避（ダメージ 0）', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [ATTACK])] })
    const start = toDefense(b, 0)
    const events = typeGuide(b, 100, start + 10)
    expect(events.at(-1)).toMatchObject({ type: 'playerDamage', amount: 0, result: { outcome: 'dodged', completed: true } })
    expect(b.hp).toBe(100)
    expect(b.phase).toBe('command')
    expect(b.report.defense).toMatchObject({ outcome: 'dodged', n: 1 })
  })

  it('時間切れは、打ち切り率と実効防御力で軽減したダメージを受ける', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [ATTACK])] })
    const start = toDefense(b, 0)
    const length = b.prompt!.session.shortestLength
    const typed = Math.floor(length / 2)
    typeGuide(b, typed, start + 10)
    const n = b.defenseProgress
    expect(n).toBeCloseTo(typed / length)
    b.tick(start + b.timeLimitMs + 1)
    // D=40、校正力は満タン（防御力 5%）。
    const expected = Math.round(40 * (1 - n) * (1 - 0.05))
    expect(b.hp).toBe(100 - expected)
    expect(b.report.defense).toMatchObject({ outcome: 'reduced', damage: expected, completed: false })
  })

  it('強攻撃は打ち切っても 25% を受け、未完走は D×(1−n/4)', () => {
    const done = setup({ enemies: [enemy('a', 1e9, [STRONG])] })
    let start = toDefense(done, 0)
    typeGuide(done, 100, start + 10)
    expect(done.hp).toBe(100 - 20) // D = 40×2 = 80、その 25%

    const none = setup({ enemies: [enemy('a', 1e9, [STRONG])] })
    start = toDefense(none, 0)
    none.tick(start + none.timeLimitMs + 1)
    expect(none.hp).toBe(100 - 80)
  })

  it('強攻撃の制限時間は難易度の緩和係数ぶん長い', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [STRONG])], difficulty: 3 })
    toDefense(b, 0)
    expect(b.timeLimitMs).toBeCloseTo((b.prompt!.session.shortestLength / 300) * 60000 * 1.25)
  })

  it('タイポで校正力が減り、実効防御力も下がる', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [ATTACK])] })
    const start = toDefense(b, 0)
    for (let i = 0; i < 15; i++) b.type('1', start + 10)
    expect(b.prr).toBe(15)
    expect(b.phase).toBe('defense')
    b.tick(start + b.timeLimitMs + 1)
    expect(b.hp).toBe(100 - Math.round(40 * (1 - 0.05 * 0.5)))
  })

  it('校正力 0 でミスすると、その時点の打ち切り率で確定する', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [ATTACK])] })
    const start = toDefense(b, 0)
    typeGuide(b, 3, start + 10)
    for (let i = 0; i < 30; i++) b.type('1', start + 20)
    expect(b.prr).toBe(0)
    expect(b.phase).toBe('defense')
    const n = b.defenseProgress
    b.type('1', start + 30)
    expect(b.phase).toBe('command')
    expect(b.report.defense).toMatchObject({ outcome: 'forced', n, damage: Math.round(40 * (1 - n)) })
  })

  it('HP が 0 になると敗北', () => {
    const b = setup({ enemies: [enemy('a', 1e9, [STRONG], { attack: 200 })] })
    const start = toDefense(b, 0)
    b.tick(start + b.timeLimitMs + 1)
    expect(b.hp).toBe(0)
    expect(b.phase).toBe('lost')
    expect(b.drainEvents()).toContainEqual({ type: 'end', status: 'lost' })
  })
})

describe('MP と校正力', () => {
  it('お題を打ち始めた瞬間に、ジャンルの MP を消費する', () => {
    const b = setup()
    b.proceed(0)
    expect(b.mp).toBe(50)
    b.type('1', 10) // ミスでは消費しない
    expect(b.mp).toBe(50)
    typeGuide(b, 2, 20)
    expect(b.mp).toBe(50 - MP_COST.school)
  })

  it('攻撃フェーズのタイポでも校正力が減る', () => {
    const b = setup()
    b.proceed(0)
    b.type('1', 10)
    b.type('1', 20)
    expect(b.prr).toBe(28)
    expect(b.stats.misses).toBe(2)
  })

  it('MP が足りないジャンルには切り替えられない', () => {
    const b = setup({ loadout: { stats: { ...playerStats(1), maxMp: 1 } } })
    expect(b.canUseGenre('school')).toBe(true)
    expect(b.canUseGenre('society')).toBe(false)
    expect(b.switchGenre('society')).toBe(false)
    expect(b.switchGenre('food')).toBe(true)
    b.cycleGenre(1)
    expect(b.genre).toBe('school')
  })

  it('どのジャンルも打てなくなると、消費 0 の通常攻撃になる', () => {
    const b = setup({ loadout: { stats: { ...playerStats(1), maxMp: 1 } } })
    b.proceed(0)
    const first = b.prompt
    expect(first!.genre).toBe('school')
    while (b.prompt === first) typeGuide(b, 1, 10)
    expect(b.mp).toBe(0)
    expect(b.outOfMp).toBe(true)
    expect(b.prompt!.genre).toBe('basic')
    const hp = b.enemyHp
    typeGuide(b, 1, 20)
    expect(b.enemyHp).toBe(hp - 10)
    expect(b.mp).toBe(0)
  })

  it('いまのジャンルだけ MP が足りないときは、切り替えるまで打てない', () => {
    const b = setup({ loadout: { stats: { ...playerStats(1), maxMp: 3 } } })
    b.switchGenre('society')
    b.proceed(0)
    const first = b.prompt
    while (b.prompt === first) typeGuide(b, 1, 10)
    expect(b.mp).toBe(1)
    expect(b.blocked).toBe(true)
    b.type(b.prompt!.session.guide().rest[0], 20)
    expect(b.drainEvents()).toContainEqual({ type: 'mpShort' })
    expect(b.prompt!.session.typedCount).toBe(0)
    expect(b.switchGenre('school')).toBe(true)
    expect(b.blocked).toBe(false)
  })
})

describe('ウェーブ', () => {
  it('敵を倒すと即座に次のウェーブへ。HP・MP は引き継ぎ、校正力と MP が少し回復する', () => {
    const b = setup({ enemies: [enemy('a', 30, [ATTACK]), enemy('b', 1e9, [IDLE])] })
    b.proceed(0)
    b.type('1', 5)
    b.hp = 60
    const events = typeGuide(b, 5, 10)
    expect(events).toContainEqual({ type: 'waveClear', defeated: 'a' })
    expect(b.phase).toBe('command')
    expect(b.waveIndex).toBe(1)
    expect(b.enemy.id).toBe('b')
    expect(b.turn).toBe(0)
    expect(b.report).toMatchObject({ kind: 'waveClear', defeated: 'a', damage: 30 })
    expect(b.hp).toBe(60)
    expect(b.mp).toBe(50) // 1 消費して 49、20% 回復して上限の 50
    expect(b.prr).toBe(30) // 1 減って 29、10% 回復して上限の 30
    b.proceed(5000)
    expect(b.timeLeftMs).toBe(ATTACK_TIME_MS)
    expect(b.turn).toBe(1)
  })

  it('最後の敵を倒すと勝利', () => {
    const b = setup({ enemies: [enemy('a', 25, [ATTACK])] })
    b.proceed(0)
    const events = typeGuide(b, 5, 10)
    expect(b.phase).toBe('won')
    expect(events).toContainEqual({ type: 'end', status: 'won' })
    expect(b.stats.damage).toBe(25)
  })
})

describe('疲労', () => {
  it('11 ターン目から付き、1 ターンごとに重くなる', () => {
    expect(fatigueStacks(FATIGUE_START_TURN - 1)).toBe(0)
    expect(fatigueStacks(FATIGUE_START_TURN)).toBe(1)
    expect(fatigueStacks(FATIGUE_START_TURN + 2)).toBe(3)
  })

  it('攻撃フェーズ中に HP が減り続け、攻撃力が下がる。ウェーブが変わると解除される', () => {
    const b = setup({ enemies: [enemy('a', 2000, [IDLE]), enemy('b', 1e9, [IDLE])] })
    let now = 0
    for (let turn = 1; turn <= 10; turn++) {
      b.proceed(now)
      now += ATTACK_TIME_MS
      b.tick(now)
    }
    expect(b.hp).toBe(100)
    b.proceed(now)
    expect(b.turn).toBe(11)
    expect(b.fatigue).toBe(1)
    expect(typeGuide(b, 1, now + 1)[0]).toMatchObject({ type: 'hit', amount: 9 })
    b.tick(now + 10_000)
    expect(b.hp).toBe(90) // 毎秒、最大 HP の 1%
    // 倒して次のウェーブへ進むと解除。
    while (b.waveIndex === 0) typeGuide(b, 1, now + 10_001)
    b.proceed(now + 20_000)
    expect(b.fatigue).toBe(0)
    b.tick(now + 30_000)
    expect(b.hp).toBe(90)
  })

  it('疲労で HP が尽きると敗北', () => {
    const b = setup()
    let now = 0
    for (let turn = 1; turn <= 20 && !b.ended; turn++) {
      b.proceed(now)
      now += ATTACK_TIME_MS
      b.tick(now)
    }
    expect(b.phase).toBe('lost')
  })
})

describe('一時停止', () => {
  it('止めている間は時間が進まず、入力も受け付けない', () => {
    const b = setup()
    b.proceed(0)
    b.pause(5000)
    b.tick(20000)
    expect(b.timeLeftMs).toBe(ATTACK_TIME_MS - 5000)
    b.type(b.prompt!.session.guide().rest[0], 20000)
    expect(b.stats.strokes).toBe(0)
    b.resume(60000)
    b.tick(61000)
    expect(b.timeLeftMs).toBe(ATTACK_TIME_MS - 6000)
  })

  it('再開後 0.5 秒は入力が無効で、ミスにも数えない', () => {
    const b = setup()
    b.proceed(0)
    b.pause(1000)
    b.resume(2000)
    b.type('1', 2000 + RESUME_INPUT_LOCK_MS - 1)
    expect(b.stats.misses).toBe(0)
    expect(b.isInputLocked(2000 + RESUME_INPUT_LOCK_MS - 1)).toBe(true)
    b.type(b.prompt!.session.guide().rest[0], 2000 + RESUME_INPUT_LOCK_MS)
    expect(b.stats.strokes).toBe(1)
  })
})

describe('報酬と記録', () => {
  it('勝利すると依頼が達成済みになり、経験値と欠片が入る', () => {
    const save = createSave()
    const b = new Battle(REQUESTS[0], buildLoadout(save), 'school', noCrit)
    b.tick(0)
    let now = 0
    while (!b.ended) {
      if (b.phase === 'command') b.proceed(now)
      now += 100
      if (b.phase === 'attack' || b.phase === 'defense') typeGuide(b, 1, now)
      else b.tick(now)
    }
    const { save: next, summary } = applyBattle(save, b)
    expect(summary).toMatchObject({ won: true, firstClear: true, misses: 0, accuracy: 1 })
    expect(summary.exp).toBe(expReward(enemyById('goji').hp, 1, true))
    expect(next.clearedRequest).toBe(1)
    expect(next.shards).toBe(summary.shards)
    expect(summary.shards).toBeGreaterThan(0)
    expect(next.battles).toBe(1)
  })

  it('敗北時は経験値のみ受け取れる', () => {
    const save = createSave()
    const b = setup({ enemies: [enemy('a', 1e9, [STRONG], { attack: 200 })] })
    b.proceed(0)
    typeGuide(b, 10, 100)
    const start = ATTACK_TIME_MS + DEFENSE_INTRO_MS
    b.tick(ATTACK_TIME_MS)
    b.tick(start)
    b.tick(start + b.timeLimitMs + 1)
    const { save: next, summary } = applyBattle(save, b)
    expect(summary.won).toBe(false)
    expect(summary.exp).toBe(expReward(b.stats.damage, 1, false))
    expect(summary.exp).toBeGreaterThan(0)
    expect(summary.shards).toBe(0)
    expect(next.clearedRequest).toBe(0)
  })

  it('kpm は入力できた時間で、rkpm は初速を除いた時間で計算する', () => {
    const save = createSave()
    const b = setup({ enemies: [enemy('a', 1e9, [IDLE])] })
    b.proceed(0)
    // 最初の 1 打鍵まで 10 秒待ち、残り 20 秒で 1 つのお題の途中まで 20 打鍵する。
    let typed = 0
    for (let t = 10_000; typed < 20 && b.phase === 'attack'; t += 1000) {
      const prompt = b.prompt!
      if (prompt.session.guide().rest.length > 1) {
        typeGuide(b, 1, t)
        typed++
      } else break
    }
    b.tick(ATTACK_TIME_MS)
    const { summary } = applyBattle(save, b)
    expect(summary.kpm).toBe(Math.round((typed / 30_000) * 60_000))
    expect(summary.rkpm).toBe(Math.round((typed / 20_000) * 60_000))
  })

  it('キー強化: 欠片を払ってレベルが上がる。足りなければ変化しない', () => {
    const poor = { ...createSave(), shards: keyUpgradeCost(0) - 1 }
    expect(upgradeKey(poor, 'a')).toBe(poor)
    const once = upgradeKey({ ...createSave(), shards: 100 }, 'a')
    expect(once.keyLevels.a).toBe(1)
    expect(once.shards).toBe(100 - keyUpgradeCost(0))
  })
})

describe('敵と依頼のデータ', () => {
  it('依頼に出てくる敵がすべて存在し、難易度が決まっている', () => {
    for (const request of REQUESTS) {
      expect(request.waves.length).toBeGreaterThanOrEqual(1)
      expect([1, 2, 3, 4]).toContain(request.difficulty)
      for (const id of request.waves) expect(enemyById(id).id).toBe(id)
    }
  })

  it('行動パターンは below: 1 から始まり、below の大きい順に並んでいる', () => {
    for (const e of ENEMIES) {
      expect(e.patterns[0].below, e.name).toBe(1)
      for (let i = 1; i < e.patterns.length; i++) {
        expect(e.patterns[i].below, e.name).toBeLessThan(e.patterns[i - 1].below)
      }
      for (const pattern of e.patterns) expect(pattern.actions.length, e.name).toBeGreaterThan(0)
    }
  })
})

describe('乱数を変えても進行が止まらない', () => {
  it('ランダムな操作で最後まで進む', () => {
    const rng = seeded(7)
    const b = new Battle(REQUESTS[2], buildLoadout(createSave()), 'school', rng)
    b.tick(0)
    let now = 0
    for (let guard = 0; guard < 200_000 && !b.ended; guard++) {
      now += 150
      if (b.phase === 'command') b.proceed(now)
      else if (rng() < 0.03) b.cycleGenre(1)
      else if (b.prompt && (b.phase === 'attack' || b.phase === 'defense')) {
        b.type(rng() < 0.05 ? '1' : b.prompt.session.guide().rest[0], now)
      } else b.tick(now)
    }
    expect(b.ended).toBe(true)
  })
})
