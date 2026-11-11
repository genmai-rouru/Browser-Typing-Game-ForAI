import { playerStats } from './balance.ts'
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
    }
  } catch {
    return fresh
  }
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
  }
}
