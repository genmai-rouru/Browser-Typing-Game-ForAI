import { describe, expect, it } from 'vitest'
import { ATTACK_TIME_MS, SKILL_MAX_LEVEL, playerStats, skillExpThreshold } from './balance.ts'
import { Battle, type Loadout } from './battle.ts'
import { REQUESTS } from './enemies.ts'
import {
  PARTNERS,
  createProgress,
  growPartner,
  partnerById,
  passiveHealRate,
  uniqueStrokes,
  type PartnerDef,
} from './partners.ts'
import { applyBattle } from './rewards.ts'
import { buildLoadout, createSave, loadSave, setPartyMember, storeSave } from './save.ts'
import type { EnemyAction, EnemyDef, RequestDef } from './types.ts'

const KONOMI = partnerById('konomi')!
const IDLE: EnemyAction = { type: 'idle', name: '様子見' }
const STRONG: EnemyAction = { type: 'strong', name: '強攻撃', power: 1 }

function enemy(id: string, hp: number, actions: EnemyAction[], extra: Partial<EnemyDef> = {}): EnemyDef {
  return { id, name: id, glyph: '的', flavor: '', hp, attack: 40, kpm: 300, patterns: [{ below: 1, actions }], ...extra }
}

function setup(enemies: EnemyDef[], party: Loadout['party'] = [{ def: KONOMI, passiveLv: 0, uniqueLv: 0 }]) {
  const request: RequestDef = {
    id: 1,
    title: 'テスト',
    difficulty: 1,
    waves: enemies.map((e) => e.id),
    rewards: { first: [], repeat: [] },
  }
  const loadout: Loadout = { stats: playerStats(1), keyLevels: {}, prefs: {}, genres: ['school'], party, items: {} }
  const battle = new Battle(request, loadout, 'school', () => 0.99, (id) => enemies.find((e) => e.id === id)!)
  battle.tick(0)
  return battle
}

/** 何もせずにターンを 1 つ終えます（敵は非攻撃の想定）。 */
function passTurn(battle: Battle, now: number): number {
  battle.proceed(now)
  battle.tick(now + ATTACK_TIME_MS)
  return now + ATTACK_TIME_MS
}

describe('甘井 このみ のデータ', () => {
  it('前衛支援で、効果の数値が仕様どおり', () => {
    expect(KONOMI.role).toBe('front')
    expect(KONOMI.unique.cooldown).toBe(3)
    expect(uniqueStrokes(KONOMI, 0)).toBe(300)
    expect(uniqueStrokes(KONOMI, 1)).toBe(330)
    expect(uniqueStrokes(KONOMI, 10)).toBe(600)
    expect(passiveHealRate(KONOMI, 0)).toBeCloseTo(0.02)
    expect(passiveHealRate(KONOMI, 10)).toBeCloseTo(0.04)
  })

  it('id の重複がなく、役割が正しい', () => {
    const ids = PARTNERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PARTNERS) expect(['front', 'back']).toContain(p.role)
  })
})

describe('固有スキル', () => {
  it('開始時はクールダウン中で、ターンが 3 つ終わると 4 ターン目のコマンドフェーズで使える', () => {
    const b = setup([enemy('a', 1e9, [IDLE])])
    expect(b.partyMember('front')!.cooldown).toBe(3)
    expect(b.useSkill('front', 0)).toBe(false)
    let now = 0
    for (let turn = 1; turn <= 2; turn++) now = passTurn(b, now)
    expect(b.partyMember('front')!.cooldown).toBe(1)
    expect(b.canUseSkill('front')).toBe(false)
    now = passTurn(b, now)
    expect(b.turn).toBe(3)
    expect(b.canUseSkill('front')).toBe(true)
    expect(b.useSkill('front', now)).toBe(true)
    expect(b.partyMember('front')!.cooldown).toBe(3)
    expect(b.phase).toBe('command') // 使ってもコマンドフェーズは続く
  })

  it('攻撃力 ×（300 + 30 × Lv）のダメージを与える', () => {
    const b = setup([enemy('a', 1e9, [IDLE])], [{ def: KONOMI, passiveLv: 0, uniqueLv: 2 }])
    let now = 0
    for (let turn = 1; turn <= 3; turn++) now = passTurn(b, now)
    b.drainEvents()
    b.useSkill('front', now)
    expect(b.drainEvents()).toContainEqual({ type: 'partnerSkill', partner: KONOMI.name, skill: 'スイーツトルネード', amount: 3600 })
    expect(b.enemyHp).toBe(1e9 - 3600)
  })

  it('攻撃フェーズ中は使えない', () => {
    const b = setup([enemy('a', 1e9, [IDLE])])
    let now = 0
    for (let turn = 1; turn <= 3; turn++) now = passTurn(b, now)
    b.proceed(now)
    expect(b.useSkill('front', now)).toBe(false)
  })

  it('スキルで倒すと次のウェーブへ。ターンは経過せず、クールダウンは引き継ぐ', () => {
    const b = setup([enemy('a', 100, [IDLE]), enemy('b', 1e9, [IDLE])])
    let now = 0
    for (let turn = 1; turn <= 3; turn++) now = passTurn(b, now)
    b.hp = 50
    b.useSkill('front', now)
    expect(b.waveIndex).toBe(1)
    expect(b.phase).toBe('command')
    expect(b.report).toMatchObject({ kind: 'waveClear', damage: 100, strokes: 0 })
    expect(b.partyMember('front')!.cooldown).toBe(3) // 減らない
    expect(b.hp).toBe(50) // 回復もしない
    now = passTurn(b, now)
    expect(b.partyMember('front')!.cooldown).toBe(2) // ウェーブをまたいで引き継ぐ
  })

  it('最後の敵をスキルで倒すと勝利', () => {
    const b = setup([enemy('a', 100, [IDLE])])
    let now = 0
    for (let turn = 1; turn <= 3; turn++) now = passTurn(b, now)
    b.useSkill('front', now)
    expect(b.phase).toBe('won')
  })
})

describe('パッシブスキル', () => {
  it('ターンが終わってコマンドフェーズに入るとき、最大 HP の割合だけ回復する', () => {
    const b = setup([enemy('a', 1e9, [STRONG], { attack: 30 })], [{ def: KONOMI, passiveLv: 10, uniqueLv: 0 }])
    b.proceed(0)
    b.tick(ATTACK_TIME_MS)
    b.tick(ATTACK_TIME_MS + 1000)
    b.tick(ATTACK_TIME_MS + 1000 + b.timeLimitMs + 1)
    // 強攻撃 30 を受けて 70、Lv10 で最大 HP の 4% 回復。
    expect(b.phase).toBe('command')
    expect(b.hp).toBe(74)
    expect(b.report.heal).toBe(4)
  })

  it('HP が満タンなら回復量は 0', () => {
    const b = setup([enemy('a', 1e9, [IDLE])])
    passTurn(b, 0)
    expect(b.report.heal).toBe(0)
  })

  it('攻撃フェーズで倒して次のウェーブに入るときも回復し、クールダウンが減る', () => {
    const b = setup([enemy('a', 20, [IDLE]), enemy('b', 1e9, [IDLE])])
    b.hp = 50
    b.proceed(0)
    while (b.waveIndex === 0) b.type(b.prompt!.session.guide().rest[0], 10)
    expect(b.hp).toBe(52)
    expect(b.report.heal).toBe(2)
    expect(b.partyMember('front')!.cooldown).toBe(2)
  })

  it('パートナーがいなければ何も起きない', () => {
    const b = setup([enemy('a', 1e9, [IDLE])], [])
    expect(b.party).toEqual([])
    expect(b.useSkill('front', 0)).toBe(false)
  })
})

describe('スキルの成長', () => {
  const withConditions: PartnerDef = {
    ...KONOMI,
    unique: { ...KONOMI.unique, conditions: { 2: { type: 'defeat', enemyId: 'goji' } } },
  }
  const record = (defeated: string[] = []) => ({ won: true, requestId: 1, defeated })

  it('累計経験値が基準に達するとレベルが上がる（経験値は消費しない）', () => {
    const { progress, levelUps } = growPartner(KONOMI, createProgress(), skillExpThreshold(2), record())
    expect(progress).toMatchObject({ exp: 600, passiveLv: 2, uniqueLv: 2 })
    expect(levelUps).toEqual([
      { skill: 'passive', from: 0, to: 2 },
      { skill: 'unique', from: 0, to: 2 },
    ])
  })

  it('最大レベルは 10', () => {
    const { progress } = growPartner(KONOMI, createProgress(), 1e9, record())
    expect(progress.passiveLv).toBe(SKILL_MAX_LEVEL)
    expect(progress.uniqueLv).toBe(SKILL_MAX_LEVEL)
  })

  it('条件のあるレベルは、条件を達成するまで上がらない', () => {
    const first = growPartner(withConditions, createProgress(), 5000, record())
    expect(first.progress.uniqueLv).toBe(1)
    expect(first.progress.passiveLv).toBe(6)
    // 条件を達成すると、たまっていた経験値のぶんまで一気に上がる。
    const second = growPartner(withConditions, first.progress, 0, record(['goji']))
    expect(second.progress.uniqueLv).toBe(6)
    expect(second.levelUps).toEqual([{ skill: 'unique', from: 1, to: 6 }])
  })

  it('経験値が足りなくても、達成した条件は記録に残る', () => {
    const first = growPartner(withConditions, createProgress(), 0, record(['goji']))
    expect(first.progress.achieved).toContain('unique:2')
    const second = growPartner(withConditions, first.progress, 600, record())
    expect(second.progress.uniqueLv).toBe(2)
  })
})

describe('編成と保存', () => {
  it('初期状態は、甘井 このみ を所持して前衛に同行。後衛は空き', () => {
    const save = createSave()
    expect(Object.keys(save.partners)).toEqual(['konomi'])
    expect(save.party).toEqual({ front: 'konomi', back: null })
    expect(buildLoadout(save).party.map((m) => m.def.id)).toEqual(['konomi'])
  })

  it('役割に合わない枠や、所持していないパートナーは同行させられない', () => {
    const save = createSave()
    expect(setPartyMember(save, 'back', 'konomi')).toBe(save)
    expect(setPartyMember(save, 'front', 'nobody')).toBe(save)
    const empty = setPartyMember(save, 'front', null)
    expect(empty.party.front).toBeNull()
    expect(buildLoadout(empty).party).toEqual([])
    expect(setPartyMember(empty, 'front', 'konomi').party.front).toBe('konomi')
  })

  it('パートナー情報の無い古い保存データには、初期パートナーが加わる', () => {
    const store = new Map<string, string>()
    const original = globalThis.localStorage
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage
    try {
      const { partners: _p, party: _q, ...old } = createSave()
      store.set('genei-toubatsu-save-v2', JSON.stringify(old))
      const loaded = loadSave()
      expect(loaded.party).toEqual({ front: 'konomi', back: null })
      expect(loaded.partners.konomi).toEqual(createProgress())
      storeSave({ ...loaded, partners: { konomi: { ...createProgress(), uniqueLv: 4 } } })
      expect(loadSave().partners.konomi.uniqueLv).toBe(4)
    } finally {
      globalThis.localStorage = original
    }
  })

  it('戦闘の結果、同行したパートナーに経験値が入り、スキルが成長する', () => {
    const save = createSave()
    const b = new Battle(REQUESTS[0], buildLoadout(save), 'school', () => 0.99)
    b.tick(0)
    let now = 0
    while (!b.ended) {
      now += 100
      if (b.phase === 'command') b.proceed(now)
      else if (b.prompt && (b.phase === 'attack' || b.phase === 'defense')) b.type(b.prompt.session.guide().rest[0], now)
      else b.tick(now)
    }
    const { save: next, summary } = applyBattle(save, b)
    expect(summary.partners).toHaveLength(1)
    expect(summary.partners[0]).toMatchObject({ id: 'konomi', exp: summary.exp })
    expect(next.partners.konomi.exp).toBe(summary.exp)
    const expected = growPartner(KONOMI, createProgress(), summary.exp, { won: true, requestId: 1, defeated: ['goji'] })
    expect(next.partners.konomi).toEqual(expected.progress)
    expect(summary.partners[0].levelUps).toEqual(expected.levelUps)
  })
})
