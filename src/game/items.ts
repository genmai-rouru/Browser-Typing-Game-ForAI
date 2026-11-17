/**
 * アイテムのデータと、持ち物（かばん・部室準備室）の出し入れ。
 * 持ち物は「アイテム・装備・貴重品」の 3 種類に分かれます。
 * いま入っているアイテムの名前・効果・数値はすべて仮のものです。
 */

export type ItemCategory = 'item' | 'equipment' | 'valuable'

export const ITEM_CATEGORIES: readonly ItemCategory[] = ['item', 'equipment', 'valuable']

export const CATEGORY_NAMES: Readonly<Record<ItemCategory, string>> = {
  item: 'アイテム',
  equipment: '装備',
  valuable: '貴重品',
}

/** 部室準備室に入れられる種類（貴重品は入れられません）。 */
export const STORAGE_CATEGORIES: readonly StorageCategory[] = ['item', 'equipment']
export type StorageCategory = 'item' | 'equipment'

/** 1 スロットに重ねられる数。超えた分は別のスロットを使います。 */
export const STACK_MAX = 999
/** かばんのスロット数（種類ごと）。 */
export const BAG_SLOTS = 64
/** 部室準備室のスロット数（種類ごと）。 */
export const STORAGE_SLOTS = 512

/** 戦闘中（コマンドフェーズ）に使ったときの効果。 */
export type ItemEffect =
  | { type: 'healHp'; amount: number }
  | { type: 'healMp'; amount: number }
  | { type: 'healPrr'; amount: number }

export type Rarity = 1 | 2 | 3 | 4 | 5 | 6

export interface ItemDef {
  id: string
  name: string
  category: ItemCategory
  rarity: Rarity
  description: string
  /** 無ければ、戦闘中には使えません。 */
  effect?: ItemEffect
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'pan', name: '購買のパン', category: 'item', rarity: 1, description: 'HP を 30 回復する。', effect: { type: 'healHp', amount: 30 } },
  { id: 'bento', name: '特製弁当', category: 'item', rarity: 2, description: 'HP を 80 回復する。', effect: { type: 'healHp', amount: 80 } },
  { id: 'sports', name: 'スポーツドリンク', category: 'item', rarity: 1, description: 'MP を 15 回復する。', effect: { type: 'healMp', amount: 15 } },
  { id: 'energy', name: 'エナジードリンク', category: 'item', rarity: 2, description: 'MP を 40 回復する。', effect: { type: 'healMp', amount: 40 } },
  { id: 'eraser', name: '新品の消しゴム', category: 'item', rarity: 1, description: '校正力を 10 回復する。', effect: { type: 'healPrr', amount: 10 } },
]

export function itemById(id: string): ItemDef | undefined {
  return ITEMS.find((item) => item.id === id)
}

export function rarityStars(rarity: Rarity): string {
  return '☆'.repeat(rarity)
}

// ---- スロットの操作 ----

/** 1 スロットの中身。 */
export interface Stack {
  id: string
  count: number
}

export type Bag = Record<ItemCategory, Stack[]>
export type Storage = Record<StorageCategory, Stack[]>

export function createBag(): Bag {
  return { item: [], equipment: [], valuable: [] }
}

export function createStorage(): Storage {
  return { item: [], equipment: [] }
}

/** そのアイテムを合計でいくつ持っているか。 */
export function countOf(slots: readonly Stack[], id: string): number {
  return slots.reduce((sum, stack) => sum + (stack.id === id ? stack.count : 0), 0)
}

/**
 * スロットにアイテムを入れます。先に同じアイテムの空きに重ね、足りなければ新しいスロットを使います。
 * 入りきらなかった数を rest で返します。
 */
export function addToSlots(
  slots: readonly Stack[],
  id: string,
  count: number,
  maxSlots: number,
): { slots: Stack[]; rest: number } {
  const next = slots.map((stack) => ({ ...stack }))
  let rest = Math.max(0, Math.floor(count))
  for (const stack of next) {
    if (rest <= 0) break
    if (stack.id !== id || stack.count >= STACK_MAX) continue
    const add = Math.min(rest, STACK_MAX - stack.count)
    stack.count += add
    rest -= add
  }
  while (rest > 0 && next.length < maxSlots) {
    const add = Math.min(rest, STACK_MAX)
    next.push({ id, count: add })
    rest -= add
  }
  return { slots: next, rest }
}

/** スロットからアイテムを減らします（後ろのスロットから）。足りなければ、あるだけ減らします。 */
export function removeFromSlots(slots: readonly Stack[], id: string, count: number): Stack[] {
  const next = slots.map((stack) => ({ ...stack }))
  let rest = count
  for (let i = next.length - 1; i >= 0 && rest > 0; i--) {
    if (next[i].id !== id) continue
    const take = Math.min(rest, next[i].count)
    next[i].count -= take
    rest -= take
  }
  return next.filter((stack) => stack.count > 0)
}

// ---- かばんと部室準備室 ----

/** かばんと部室準備室を持つもの（保存データ）。 */
export interface Holdings {
  bag: Bag
  storage: Storage
}

/** アイテムを受け取ったときの行き先。lost は、準備室も満杯で受け取れなかった分です。 */
export interface Received {
  id: string
  bag: number
  storage: number
  lost: number
}

/**
 * アイテムを受け取ります。まずかばんに入れ、入りきらない分は部室準備室に送ります。
 * 貴重品は準備室に入れられないため、かばんに入らなければ受け取れません。
 */
export function receiveItems<T extends Holdings>(
  holdings: T,
  gains: ReadonlyArray<{ id: string; count: number }>,
): { holdings: T; received: Received[] } {
  const bag = { ...holdings.bag }
  const storage = { ...holdings.storage }
  const received: Received[] = []
  for (const gain of gains) {
    const def = itemById(gain.id)
    if (!def || gain.count <= 0) continue
    const toBag = addToSlots(bag[def.category], def.id, gain.count, BAG_SLOTS)
    bag[def.category] = toBag.slots
    let rest = toBag.rest
    let stored = 0
    if (rest > 0 && def.category !== 'valuable') {
      const toStorage = addToSlots(storage[def.category], def.id, rest, STORAGE_SLOTS)
      storage[def.category] = toStorage.slots
      stored = rest - toStorage.rest
      rest = toStorage.rest
    }
    const entry = received.find((r) => r.id === def.id)
    const result = { id: def.id, bag: gain.count - toBag.rest, storage: stored, lost: rest }
    if (entry) {
      entry.bag += result.bag
      entry.storage += result.storage
      entry.lost += result.lost
    } else {
      received.push(result)
    }
  }
  return { holdings: { ...holdings, bag, storage }, received }
}

/** かばんからアイテムを減らします（戦闘で使った分など）。 */
export function consumeItems<T extends Holdings>(holdings: T, used: Readonly<Record<string, number>>): T {
  const bag = { ...holdings.bag }
  for (const [id, count] of Object.entries(used)) {
    const def = itemById(id)
    if (def && count > 0) bag[def.category] = removeFromSlots(bag[def.category], id, count)
  }
  return { ...holdings, bag }
}

/**
 * かばんのスロット 1 つを、部室準備室に預けます。
 * 準備室に入りきらない分は、かばんに残ります。
 */
export function depositSlot<T extends Holdings>(holdings: T, category: StorageCategory, index: number): T {
  const stack = holdings.bag[category][index]
  if (!stack) return holdings
  const moved = addToSlots(holdings.storage[category], stack.id, stack.count, STORAGE_SLOTS)
  if (moved.rest === stack.count) return holdings
  const bagSlots = holdings.bag[category]
    .map((s, i) => (i === index ? { ...s, count: moved.rest } : s))
    .filter((s) => s.count > 0)
  return {
    ...holdings,
    bag: { ...holdings.bag, [category]: bagSlots },
    storage: { ...holdings.storage, [category]: moved.slots },
  }
}

/**
 * 部室準備室のスロット 1 つを、かばんに取り出します。
 * かばんに入りきらない分は、準備室に残ります。
 */
export function withdrawSlot<T extends Holdings>(holdings: T, category: StorageCategory, index: number): T {
  const stack = holdings.storage[category][index]
  if (!stack) return holdings
  const moved = addToSlots(holdings.bag[category], stack.id, stack.count, BAG_SLOTS)
  if (moved.rest === stack.count) return holdings
  const storageSlots = holdings.storage[category]
    .map((s, i) => (i === index ? { ...s, count: moved.rest } : s))
    .filter((s) => s.count > 0)
  return {
    ...holdings,
    bag: { ...holdings.bag, [category]: moved.slots },
    storage: { ...holdings.storage, [category]: storageSlots },
  }
}

/** 保存データから読んだスロットを正しい形に整えます。 */
export function sanitizeSlots(value: unknown, category: ItemCategory, maxSlots: number): Stack[] {
  if (!Array.isArray(value)) return []
  const result: Stack[] = []
  for (const raw of value) {
    const stack = raw as Partial<Stack> | null
    const def = stack && typeof stack.id === 'string' ? itemById(stack.id) : undefined
    const count = Math.floor(Number(stack?.count))
    if (!def || def.category !== category || !(count > 0)) continue
    result.push({ id: def.id, count: Math.min(count, STACK_MAX) })
    if (result.length >= maxSlots) break
  }
  return result
}
