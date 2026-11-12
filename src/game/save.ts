import { MAX_GENRE_SLOTS, playerStats } from './balance.ts'
import type { Loadout } from './battle.ts'
import { GENRE_IDS } from './genres.ts'
import type { GenreId } from './types.ts'

/** ブラウザに保存するプレイデータ。 */
export interface SaveData {
  version: 2
  level: number
  exp: number
  /** キー強化に使う「欠片」（お金とアイテムが決まるまでの仮の報酬）。 */
  shards: number
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
  battles: number
}

const STORAGE_KEY = 'genei-toubatsu-save-v2'

export function createSave(): SaveData {
  return {
    version: 2,
    level: 1,
    exp: 0,
    shards: 0,
    keyLevels: {},
    keyStrokes: {},
    clearedRequest: 0,
    prefs: {},
    lastGenre: 'school',
    genreSet: [...GENRE_IDS],
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
    const data = JSON.parse(raw) as Partial<SaveData>
    if (typeof data !== 'object' || data === null || data.version !== 2) return fresh
    return {
      ...fresh,
      ...data,
      lastGenre: GENRE_IDS.includes(data.lastGenre as GenreId) ? data.lastGenre! : fresh.lastGenre,
      genreSet: sanitizeGenreSet(data.genreSet),
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
  }
}
