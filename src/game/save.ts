import { MAX_GENRE_SLOTS, playerStats } from './balance.ts'
import type { Loadout } from './battle.ts'
import { GENRE_IDS } from './genres.ts'
import {
  BAG_SLOTS,
  ITEM_CATEGORIES,
  STORAGE_CATEGORIES,
  STORAGE_SLOTS,
  countOf,
  createBag,
  createStorage,
  itemById,
  sanitizeSlots,
  type Bag,
  type Storage,
} from './items.ts'
import {
  INITIAL_PARTNER,
  createProgress,
  partnerById,
  type PartnerProgress,
  type PartnerRole,
} from './partners.ts'
import type { GenreId } from './types.ts'

/** ブラウザに保存するプレイデータ。 */
export interface SaveData {
  version: 2
  level: number
  exp: number
  /** 所持金（円）。 */
  money: number
  /** かばんの中（戦闘に持ち込む持ち物）。 */
  bag: Bag
  /** 部室準備室（かばんに入りきらない持ち物の置き場）。 */
  storage: Storage
  keyLevels: Record<string, number>
  /** キーごとの累計打鍵数（強化するキーを選ぶ目安）。 */
  keyStrokes: Record<string, number>
  /** 達成済みの依頼のうち、最も番号が大きいもの。 */
  clearedRequest: number
  /** ガイドに表示する綴りの好み。 */
  prefs: Record<string, string>
  lastGenre: GenreId
  /** 戦闘に持ち込むジャンルのセット（図書室で編集します）。 */
  genreSet: GenreId[]
  /** 所持しているパートナーと、その成長の記録。 */
  partners: Record<string, PartnerProgress>
  /** 戦闘に同行するパートナー（前衛支援・後方支援）。 */
  party: Record<PartnerRole, string | null>
  battles: number
}

const STORAGE_KEY = 'genei-toubatsu-save-v2'
/** 以前の仮の通貨「欠片」1 個あたりの換算額（円）。 */
const SHARD_TO_YEN = 10

export function createSave(): SaveData {
  return {
    version: 2,
    level: 1,
    exp: 0,
    money: 0,
    bag: createBag(),
    storage: createStorage(),
    keyLevels: {},
    keyStrokes: {},
    clearedRequest: 0,
    prefs: {},
    lastGenre: 'school',
    genreSet: [...GENRE_IDS],
    partners: { [INITIAL_PARTNER]: createProgress() },
    party: { front: INITIAL_PARTNER, back: null },
    battles: 0,
  }
}

/**
 * 保存データを読み込みます。壊れていたり、プライベートブラウズなどで
 * localStorage が使えなかったりする場合は、新規データで始めます。
 */
export function loadSave(): SaveData {
  const fresh = createSave()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fresh
    const data = JSON.parse(raw) as Partial<SaveData> & { shards?: number }
    if (typeof data !== 'object' || data === null || data.version !== 2) return fresh
    // 以前の仮の通貨「欠片」は、1 個 10 円として所持金に換算します。
    const { shards, ...rest } = data
    const money = Math.max(0, Math.floor(Number(rest.money ?? 0) + Number(shards ?? 0) * SHARD_TO_YEN)) || 0
    const bagData = (rest.bag ?? {}) as Partial<Bag>
    const storageData = (rest.storage ?? {}) as Partial<Storage>
    return {
      ...fresh,
      ...rest,
      money,
      bag: Object.fromEntries(ITEM_CATEGORIES.map((c) => [c, sanitizeSlots(bagData[c], c, BAG_SLOTS)])) as Bag,
      storage: Object.fromEntries(
        STORAGE_CATEGORIES.map((c) => [c, sanitizeSlots(storageData[c], c, STORAGE_SLOTS)]),
      ) as Storage,
      lastGenre: GENRE_IDS.includes(data.lastGenre as GenreId) ? data.lastGenre! : fresh.lastGenre,
      genreSet: sanitizeGenreSet(data.genreSet),
      ...sanitizePartners(data.partners, data.party),
    }
  } catch {
    return fresh
  }
}

/** 所持しているジャンル。入荷（購入）の仕組みができるまでは、全ジャンルを所持している扱いです。 */
export function ownedGenres(_save: SaveData): readonly GenreId[] {
  return GENRE_IDS
}

/** セットを正しい形に整えます（知らないジャンルや重複を除き、最大数まで。空なら初期値）。 */
export function sanitizeGenreSet(value: unknown): GenreId[] {
  const result: GenreId[] = []
  if (Array.isArray(value)) {
    for (const item of value) {
      if (GENRE_IDS.includes(item as GenreId) && !result.includes(item as GenreId)) result.push(item as GenreId)
    }
  }
  return result.length > 0 ? result.slice(0, MAX_GENRE_SLOTS) : [...GENRE_IDS]
}

/** パートナーの記録を正しい形に整えます。古いデータには初期パートナーを加えます。 */
function sanitizePartners(
  partners: unknown,
  party: unknown,
): Pick<SaveData, 'partners' | 'party'> {
  const result: Record<string, PartnerProgress> = {}
  if (partners && typeof partners === 'object') {
    for (const [id, value] of Object.entries(partners as Record<string, Partial<PartnerProgress>>)) {
      if (!partnerById(id) || !value || typeof value !== 'object') continue
      result[id] = { ...createProgress(), ...value }
    }
  }
  if (Object.keys(result).length === 0) {
    return { partners: { [INITIAL_PARTNER]: createProgress() }, party: { front: INITIAL_PARTNER, back: null } }
  }
  const slots = (party ?? {}) as Partial<Record<PartnerRole, string | null>>
  const valid = (role: PartnerRole) => {
    const id = slots[role]
    return id && result[id] && partnerById(id)?.role === role ? id : null
  }
  return { partners: result, party: { front: valid('front'), back: valid('back') } }
}

// ---- 部室机での操作（パートナーの編成） ----

/** パートナーを同行させます（役割に合った枠に入ります）。id が null なら、その枠を空けます。 */
export function setPartyMember(save: SaveData, role: PartnerRole, id: string | null): SaveData {
  if (id !== null && (!save.partners[id] || partnerById(id)?.role !== role)) return save
  if (save.party[role] === id) return save
  return { ...save, party: { ...save.party, [role]: id } }
}

// ---- 図書室での操作（ジャンルのセットの編集） ----

/** ジャンルをセットの末尾に加えます。すでに入っている・満杯のときは変化しません。 */
export function addToGenreSet(save: SaveData, genre: GenreId): SaveData {
  if (save.genreSet.includes(genre) || save.genreSet.length >= MAX_GENRE_SLOTS) return save
  if (!ownedGenres(save).includes(genre)) return save
  return { ...save, genreSet: [...save.genreSet, genre] }
}

/** ジャンルをセットから外します。最後の 1 つは外せません。 */
export function removeFromGenreSet(save: SaveData, genre: GenreId): SaveData {
  if (!save.genreSet.includes(genre) || save.genreSet.length <= 1) return save
  return { ...save, genreSet: save.genreSet.filter((g) => g !== genre) }
}

/** セットの中で、ジャンルを 1 つ前（dir = -1）か後ろ（dir = 1）に動かします。 */
export function moveInGenreSet(save: SaveData, genre: GenreId, dir: 1 | -1): SaveData {
  const from = save.genreSet.indexOf(genre)
  const to = from + dir
  if (from < 0 || to < 0 || to >= save.genreSet.length) return save
  const genreSet = [...save.genreSet]
  ;[genreSet[from], genreSet[to]] = [genreSet[to], genreSet[from]]
  return { ...save, genreSet }
}

export function storeSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  } catch {
    // 保存できなくてもゲームは続けられるようにします。
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 何もしません。
  }
}

/** 保存データから、戦闘に持ち込む能力を組み立てます。 */
export function buildLoadout(save: SaveData): Loadout {
  return {
    stats: playerStats(save.level),
    keyLevels: save.keyLevels,
    prefs: save.prefs,
    genres: save.genreSet,
    // 戦闘中に使えるのは、かばんの中の「使うと効果があるアイテム」です。
    items: Object.fromEntries(
      [...new Set(save.bag.item.map((stack) => stack.id))]
        .filter((id) => itemById(id)?.effect)
        .map((id) => [id, countOf(save.bag.item, id)]),
    ),
    party: (['front', 'back'] as const).flatMap((role) => {
      const id = save.party[role]
      const def = id ? partnerById(id) : undefined
      const progress = id ? save.partners[id] : undefined
      return def && progress ? [{ def, passiveLv: progress.passiveLv, uniqueLv: progress.uniqueLv }] : []
    }),
  }
}
