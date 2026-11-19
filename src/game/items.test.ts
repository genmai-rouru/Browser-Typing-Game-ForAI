import { describe, expect, it } from 'vitest'
import { ATTACK_TIME_MS, DEFENSE_INTRO_MS, SURPRISED_TIME_FACTOR, playerStats } from './balance.ts'
import { Battle, type Loadout } from './battle.ts'
import { ENEMIES, REQUESTS } from './enemies.ts'
import {
  BAG_SLOTS,
  ITEMS,
  STACK_MAX,
  STORAGE_SLOTS,
  addToSlots,
  consumeItems,
  countOf,
  createBag,
  createStorage,
  depositSlot,
  itemById,
  receiveItems,
  removeFromSlots,
  withdrawSlot,
  type Holdings,
  type Stack,
} from './items.ts'
import { partnerById } from './partners.ts'
import { applyBattle, applyRetreat } from './rewards.ts'
import { buildLoadout, createSave, loadSave } from './save.ts'
import type { EnemyAction, EnemyDef, RequestDef } from './types.ts'

/** 攻撃フェーズに入り、最初の正しい打鍵でタイマーを動かします。 */
function begin(battle: Battle, now: number): void {
  battle.proceed(now)
  if (battle.prompt) battle.type(battle.prompt.session.guide().rest[0], now)
  battle.drainEvents()
}

const IDLE: EnemyAction = { type: 'idle', name: '様子見' }
const ATTACK: EnemyAction = { type: 'attack', name: '攻撃', power: 1 }

function enemy(id: string, hp: number, actions: EnemyAction[], extra: Partial<EnemyDef> = {}): EnemyDef {
  return { id, name: id, glyph: '的', flavor: '', hp, attack: 40, kpm: 300, patterns: [{ below: 1, actions }], ...extra }
}

function setup(enemies: EnemyDef[], extra: Partial<Loadout> = {}, rewards: RequestDef['rewards'] = { first: [], repeat: [] }) {
  const request: RequestDef = { id: 1, title: 'テスト', difficulty: 1, waves: enemies.map((e) => e.id), rewards }
  const loadout: Loadout = {
    stats: playerStats(1),
    keyLevels: {},
    prefs: {},
    genres: ['school'],
    party: [],
    items: { pan: 2, sports: 1, eraser: 1 },
    ...extra,
  }
  const find = (id: string) => enemies.find((e) => e.id === id)!
  const battle = new Battle(request, loadout, 'school', () => 0.99, find)
  battle.tick(0)
  return { battle, find }
}

const holdings = (): Holdings => ({ bag: createBag(), storage: createStorage() })
const full = (id: string, slots: number): Stack[] => Array.from({ length: slots }, () => ({ id, count: STACK_MAX }))

describe('アイテムのデータ', () => {
  it('id の重複がなく、レア度は ☆1〜6', () => {
    const ids = ITEMS.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const item of ITEMS) {
      expect(item.rarity).toBeGreaterThanOrEqual(1)
      expect(item.rarity).toBeLessThanOrEqual(6)
    }
  })

  it('敵のドロップと依頼の報酬は、存在するアイテムを指している', () => {
    for (const e of ENEMIES) {
      for (const drop of e.drops ?? []) {
        expect(itemById(drop.itemId), `${e.name}: ${drop.itemId}`).toBeDefined()
        expect(drop.rate).toBeGreaterThan(0)
        expect(drop.rate).toBeLessThanOrEqual(1)
      }
    }
    for (const r of REQUESTS) {
      for (const reward of [...r.rewards.first, ...r.rewards.repeat]) {
        if (reward.type === 'item') expect(itemById(reward.itemId), `依頼 ${r.id}`).toBeDefined()
      }
    }
  })
})

describe('スロット', () => {
  it('1 スロットは 999 個まで。超えた分は別のスロットを使う', () => {
    const { slots, rest } = addToSlots([], 'pan', 1001, BAG_SLOTS)
    expect(slots).toEqual([
      { id: 'pan', count: 999 },
      { id: 'pan', count: 2 },
    ])
    expect(rest).toBe(0)
  })

  it('同じアイテムの空きがあるスロットに先に重ねる', () => {
    const start = [
      { id: 'pan', count: 998 },
      { id: 'bento', count: 1 },
    ]
    const { slots } = addToSlots(start, 'pan', 3, BAG_SLOTS)
    expect(slots).toEqual([
      { id: 'pan', count: 999 },
      { id: 'bento', count: 1 },
      { id: 'pan', count: 2 },
    ])
    expect(start[0].count).toBe(998) // 元のデータは変えない
  })

  it('スロットが埋まると、入りきらない数を返す', () => {
    const { slots, rest } = addToSlots(full('pan', BAG_SLOTS - 1), 'bento', 1000, BAG_SLOTS)
    expect(slots).toHaveLength(BAG_SLOTS)
    expect(rest).toBe(1)
  })

  it('減らすと、空になったスロットは詰められる', () => {
    const slots = removeFromSlots(
      [
        { id: 'pan', count: 999 },
        { id: 'pan', count: 2 },
      ],
      'pan',
      3,
    )
    expect(slots).toEqual([{ id: 'pan', count: 998 }])
    expect(countOf(slots, 'pan')).toBe(998)
  })
})

describe('かばんと部室準備室', () => {
  it('かばんは種類ごとに 64 スロット、準備室は種類ごとに 512 スロット', () => {
    expect(BAG_SLOTS).toBe(64)
    expect(STORAGE_SLOTS).toBe(512)
  })

  it('受け取ったアイテムは、まずかばんに入る', () => {
    const { holdings: h, received } = receiveItems(holdings(), [
      { id: 'pan', count: 2 },
      { id: 'pan', count: 1 },
    ])
    expect(h.bag.item).toEqual([{ id: 'pan', count: 3 }])
    expect(received).toEqual([{ id: 'pan', bag: 3, storage: 0, lost: 0 }])
  })

  it('かばんが満杯なら、部室準備室に送られる', () => {
    const start = { ...holdings(), bag: { ...createBag(), item: full('pan', BAG_SLOTS) } }
    const { holdings: h, received } = receiveItems(start, [{ id: 'bento', count: 5 }])
    expect(h.bag.item).toHaveLength(BAG_SLOTS)
    expect(h.storage.item).toEqual([{ id: 'bento', count: 5 }])
    expect(received).toEqual([{ id: 'bento', bag: 0, storage: 5, lost: 0 }])
  })

  it('準備室も満杯なら受け取れない', () => {
    const start = {
      bag: { ...createBag(), item: full('pan', BAG_SLOTS) },
      storage: { ...createStorage(), item: full('pan', STORAGE_SLOTS) },
    }
    const { received } = receiveItems(start, [{ id: 'bento', count: 5 }])
    expect(received).toEqual([{ id: 'bento', bag: 0, storage: 0, lost: 5 }])
  })

  it('預ける・取り出すは、スロット単位で行う', () => {
    let h = receiveItems(holdings(), [
      { id: 'pan', count: 3 },
      { id: 'sports', count: 1 },
    ]).holdings
    h = depositSlot(h, 'item', 0)
    expect(h.bag.item).toEqual([{ id: 'sports', count: 1 }])
    expect(h.storage.item).toEqual([{ id: 'pan', count: 3 }])
    h = withdrawSlot(h, 'item', 0)
    expect(h.storage.item).toEqual([])
    expect(h.bag.item).toEqual([
      { id: 'sports', count: 1 },
      { id: 'pan', count: 3 },
    ])
    expect(depositSlot(h, 'item', 9)).toBe(h) // 無いスロットは何もしない
  })

  it('かばんが満杯のときに取り出そうとしても、入る分だけ動く', () => {
    const start = {
      bag: { ...createBag(), item: [...full('pan', BAG_SLOTS - 1), { id: 'bento', count: 998 }] },
      storage: { ...createStorage(), item: [{ id: 'bento', count: 5 }] },
    }
    const h = withdrawSlot(start, 'item', 0)
    expect(countOf(h.bag.item, 'bento')).toBe(999)
    expect(h.storage.item).toEqual([{ id: 'bento', count: 4 }])
  })
})

describe('戦闘でのアイテム使用', () => {
  it('コマンドフェーズで使うと効果が出て、攻撃フェーズを飛ばして敵の行動に移る', () => {
    const { battle: b } = setup([enemy('a', 1e9, [IDLE])])
    b.hp = 40
    b.drainEvents()
    expect(b.useItem('pan', 0)).toBe(true)
    expect(b.hp).toBe(70)
    expect(b.items.pan).toBe(1)
    expect(b.stats.usedItems).toEqual({ pan: 1 })
    expect(b.drainEvents()).toContainEqual({ type: 'itemUsed', name: '購買のパン', text: 'HP が 30 回復' })
    // 敵は非攻撃なので、そのまま次のコマンドフェーズへ。1 ターン経過している。
    expect(b.phase).toBe('command')
    expect(b.turn).toBe(1)
    expect(b.stats.turns).toBe(1)
    expect(b.report).toMatchObject({ kind: 'turn', turn: 1, strokes: 0, damage: 0, usedItem: '購買のパン', action: IDLE })
  })

  it('MP と校正力も回復できる（上限まで）', () => {
    const { battle: b } = setup([enemy('a', 1e9, [IDLE])])
    b.mp = 45
    b.prr = 5
    b.useItem('sports', 0)
    expect(b.mp).toBe(50)
    b.useItem('eraser', 0)
    expect(b.prr).toBe(15)
  })

  it('敵が攻撃なら、予告なしで防御フェーズに入り、お題タイマーが 10% 短い', () => {
    const { battle: b } = setup([enemy('a', 1e9, [ATTACK])])
    b.useItem('pan', 0)
    expect(b.phase).toBe('defenseIntro')
    expect(b.defense).toMatchObject({ surprised: true, strong: false })
    b.tick(DEFENSE_INTRO_MS)
    expect(b.phase).toBe('defense')
    const base = (b.prompt!.session.shortestLength / 300) * 60000
    expect(SURPRISED_TIME_FACTOR).toBe(0.9)
    expect(b.timeLimitMs).toBeCloseTo(base * 0.9)
  })

  it('攻撃フェーズのあとの防御は、お題タイマーが短くならない', () => {
    const { battle: b } = setup([enemy('a', 1e9, [ATTACK])])
    begin(b, 0)
    b.tick(ATTACK_TIME_MS)
    b.tick(ATTACK_TIME_MS + DEFENSE_INTRO_MS)
    expect(b.defense!.surprised).toBe(false)
    expect(b.timeLimitMs).toBeCloseTo((b.prompt!.session.shortestLength / 300) * 60000)
  })

  it('持っていないアイテムや、攻撃フェーズ中は使えない', () => {
    const { battle: b } = setup([enemy('a', 1e9, [IDLE])])
    expect(b.useItem('bento', 0)).toBe(false)
    begin(b, 0)
    expect(b.useItem('pan', 10)).toBe(false)
    expect(b.items.pan).toBe(2)
  })

  it('1 ターンに使えるのは 1 個（使うとターンが終わる）。次のターンにはまた使える', () => {
    const { battle: b } = setup([enemy('a', 1e9, [IDLE])])
    b.useItem('pan', 0)
    expect(b.turn).toBe(1)
    b.useItem('pan', 0)
    expect(b.turn).toBe(2)
    expect(b.items.pan).toBe(0)
    expect(b.useItem('pan', 0)).toBe(false)
  })

  it('パートナーの固有スキルを使ったターンは、アイテムを使えない', () => {
    const konomi = partnerById('konomi')!
    const { battle: b } = setup([enemy('a', 1e9, [IDLE])], { party: [{ def: konomi, passiveLv: 0, uniqueLv: 0 }] })
    // アイテムを使ったターンも 1 ターンとして数え、クールダウンが減る。
    b.useItem('pan', 0)
    expect(b.partyMember('front')!.cooldown).toBe(2)
    let now = 0
    for (let i = 0; i < 2; i++) {
      begin(b, now)
      now += ATTACK_TIME_MS
      b.tick(now)
    }
    expect(b.useSkill('front', now)).toBe(true)
    expect(b.canUseItem('pan')).toBe(false)
    expect(b.useItem('pan', now)).toBe(false)
    // 次のターンになれば使える。
    begin(b, now)
    b.tick(now + ATTACK_TIME_MS)
    expect(b.canUseItem('pan')).toBe(true)
  })

  it('アイテムを使ったターンにも、パッシブの回復が入る', () => {
    const konomi = partnerById('konomi')!
    const { battle: b } = setup([enemy('a', 1e9, [IDLE])], { party: [{ def: konomi, passiveLv: 0, uniqueLv: 0 }] })
    b.hp = 10
    b.useItem('pan', 0)
    expect(b.hp).toBe(42) // +30（パン）、+2（パッシブ）
    expect(b.report.heal).toBe(2)
  })
})

describe('報酬（お金とアイテム）', () => {
  const win = (b: Battle) => {
    begin(b, 0)
    while (!b.ended) b.type(b.prompt!.session.guide().rest[0], 10)
  }
  const rewards: RequestDef['rewards'] = {
    first: [{ type: 'item', itemId: 'bento', count: 1 }],
    repeat: [
      { type: 'money', amount: 300 },
      { type: 'item', itemId: 'eraser', count: 2 },
    ],
  }
  const dropper = () => enemy('a', 20, [IDLE], { drops: [{ itemId: 'pan', rate: 0.5 }] })

  it('初めての達成では、初回限りの報酬と毎回の報酬の両方が入る', () => {
    const { battle: b, find } = setup([dropper()], {}, rewards)
    win(b)
    const { save, summary } = applyBattle(createSave(), b, () => 0.99, find)
    expect(summary.money).toBe(300)
    expect(save.money).toBe(300)
    expect(summary.items).toEqual([
      { id: 'eraser', bag: 2, storage: 0, lost: 0 },
      { id: 'bento', bag: 1, storage: 0, lost: 0 },
    ])
    expect(save.bag.item).toEqual([
      { id: 'eraser', count: 2 },
      { id: 'bento', count: 1 },
    ])
  })

  it('2 回目以降は、毎回の報酬だけが入る', () => {
    const { battle: b, find } = setup([dropper()], {}, rewards)
    win(b)
    const cleared = { ...createSave(), clearedRequest: 1 }
    const { summary } = applyBattle(cleared, b, () => 0.99, find)
    expect(summary.money).toBe(300)
    expect(summary.items).toEqual([{ id: 'eraser', bag: 2, storage: 0, lost: 0 }])
  })

  it('倒した敵のドロップは、確率で手に入る', () => {
    const { battle: b, find } = setup([dropper()])
    win(b)
    expect(applyBattle(createSave(), b, () => 0.49, find).summary.items).toEqual([{ id: 'pan', bag: 1, storage: 0, lost: 0 }])
    expect(applyBattle(createSave(), b, () => 0.5, find).summary.items).toEqual([])
  })

  it('敗北時は、倒した敵のドロップも報酬も受け取れない。使ったアイテムは減る', () => {
    const strong: EnemyAction = { type: 'strong', name: '強攻撃', power: 10 }
    const { battle: b, find } = setup([dropper(), enemy('b', 1e9, [strong])], {}, rewards)
    begin(b, 0)
    while (b.waveIndex === 0) b.type(b.prompt!.session.guide().rest[0], 10)
    b.useItem('pan', 20)
    b.tick(20 + DEFENSE_INTRO_MS)
    b.tick(20 + DEFENSE_INTRO_MS + b.timeLimitMs + 1)
    expect(b.phase).toBe('lost')
    const start = { ...createSave(), bag: { ...createBag(), item: [{ id: 'pan', count: 2 }] } }
    const { save, summary } = applyBattle(start, b, () => 0, find)
    expect(summary).toMatchObject({ won: false, money: 0, items: [] })
    expect(save.bag.item).toEqual([{ id: 'pan', count: 1 }])
  })

  it('退却時は、使ったアイテムだけが減る', () => {
    const { battle: b } = setup([enemy('a', 1e9, [IDLE])])
    b.useItem('pan', 0)
    const start = { ...createSave(), money: 500, bag: { ...createBag(), item: [{ id: 'pan', count: 2 }] } }
    const after = applyRetreat(start, b)
    expect(after.bag.item).toEqual([{ id: 'pan', count: 1 }])
    expect(after.money).toBe(500)
    expect(after.battles).toBe(0)
  })

  it('戦闘に持ち込めるのは、かばんの中の「使えるアイテム」だけ', () => {
    const save = {
      ...createSave(),
      bag: { ...createBag(), item: [{ id: 'pan', count: 999 }, { id: 'pan', count: 2 }, { id: 'sports', count: 1 }] },
      storage: { ...createStorage(), item: [{ id: 'bento', count: 5 }] },
    }
    expect(buildLoadout(save).items).toEqual({ pan: 1001, sports: 1 })
    expect(consumeItems(save, { pan: 3 }).bag.item).toEqual([
      { id: 'pan', count: 998 },
      { id: 'sports', count: 1 },
    ])
  })
})

describe('保存データの移行', () => {
  it('以前の「欠片」は 1 個 10 円として所持金になり、持ち物は空で始まる', () => {
    const store = new Map<string, string>()
    const original = globalThis.localStorage
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage
    try {
      const { money: _m, bag: _b, storage: _s, ...old } = createSave()
      store.set('genei-toubatsu-save-v2', JSON.stringify({ ...old, shards: 284 }))
      const loaded = loadSave()
      expect(loaded.money).toBe(2840)
      expect('shards' in loaded).toBe(false)
      expect(loaded.bag).toEqual(createBag())
      expect(loaded.storage).toEqual(createStorage())
      // 壊れたスロットは取り除く。
      store.set(
        'genei-toubatsu-save-v2',
        JSON.stringify({ ...old, money: 50, bag: { item: [{ id: 'pan', count: 3 }, { id: 'x', count: 1 }, { id: 'pan', count: -1 }] } }),
      )
      const again = loadSave()
      expect(again.money).toBe(50)
      expect(again.bag.item).toEqual([{ id: 'pan', count: 3 }])
    } finally {
      globalThis.localStorage = original
    }
  })
})
